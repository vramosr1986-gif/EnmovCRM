function responderBotWeb(token, pregunta) {
  // 1) Validar sesion igual que el resto de la app
  const sesion = requireSession(token != '' ? token : '');

  // Que el asistente sepa quien es y que puede ver
  const esAdmin = String(sesion.rol || '').toLowerCase() === 'admin';
  const nombreSesion = sesion.nombre || sesion.username || '';

  // 2) Construir la informacion SOLO con los modulos que este usuario puede ver
  const modulosPermitidos = Array.isArray(sesion.modules) ? sesion.modules : [];
  var fragmentos = [];

  fragmentos.push('El usuario actual es "' + nombreSesion + '" y su rol es ' + (esAdmin ? 'administrador' : 'fisio') + '.');

  for (var i = 0; i < modulosPermitidos.length && i < 4; i++) {
    var modulo = modulosPermitidos[i];
    var nombreModulo = '';

    // Nombre legible del modulo
    if (MODULOS.ENMOV === modulo) {
      nombreModulo = 'En Movimiento Sano (Enmov)';
    } else if (MODULOS.NAVTA === modulo) {
      nombreModulo = 'Navta';
    } else if (MODULOS.DOMICILIACIONES === modulo) {
      nombreModulo = 'Domiciliaciones';
    }

    try {
      var grid = getGridDataByModulo(modulo);
      var gridFiltrado = filtrarGridPorFisio(grid, sesion.fisioFiltro);

      fragmentos.push('\nMODULO: ' + nombreModulo);
      fragmentos.push('Columnas: ' + (gridFiltrado.headers || []).join(' | '));

      var filas = gridFiltrado.rows || [];
      if (filas.length === 0) {
        fragmentos.push('No hay registros.');
      } else {
        fragmentos.push('Hay ' + filas.length + ' registros. Ultimos hasta 8:');

        var fin = Math.min(8, filas.length);
        for (var j = filas.length - fin; j < filas.length; j++) {
          var detalle = [];
          for (var c = 0; c < gridFiltrado.headers.length && c < 14; c++) {
            var nombreCol = gridFiltrado.headers[c];
            var valor = filas[j][c];
            if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
              detalle.push(nombreCol + '=' + String(valor).trim());
            }
          }
          fragmentos.push((j + 1) + '.- ' + detalle.join(', '));
        }
      }
    } catch (e) {
      fragmentos.push(nombreModulo + ': no se pudo leer (' + e + ')');
    }
  }

  // 3) GROQ usa SOLO la informacion que el rol le permite
  const apiKey = PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY');
  if (!apiKey) {
    return 'El asistente no esta configurado. Falta la clave API.';
  }

  const payload = {
    model: 'llama-3.1-8b-instant',
    messages: [
      {
        role: 'system',
        content: 'Eres el asistente de la web EnmovCRM.\n' +
                 'Responde SOLO segun la informacion que te doy.\n' +
                 (esAdmin ? '' : 'El usuario NO es administrador. JAMAS menciones modulos o registros que no esten en la informacion.\n') +
                 'Si no esta en la informacion, responde: "No aparece en la web".\n' +
                 'Se breve y claro. Responde en espanol.\n\n' +
                 'Informacion:\n' + fragmentos.join('\n')
      },
      {
        role: 'user',
        content: pregunta
      }
    ],
    temperature: 0.5,
    max_tokens: 500
  };

  const url = 'https://api.groq.com/openai/v1/chat/completions';

  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  const data = JSON.parse(response.getContentText());

  if (data.error) {
    Logger.log('GROQ error: ' + JSON.stringify(data.error));
    return 'Error de API: ' + (data.error.message || JSON.stringify(data.error));
  }

  return data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
    ? data.choices[0].message.content
    : 'No pude generar una respuesta.';
}

// ------------------------------------------------------------------
// ACCIONES (crear / editar / eliminar) - SOLO ADMINISTRADOR
// El usuario debe CONFIRMAR la accion ANTES de ejecutarse.
// Reutiliza las funciones reales de la app (auth + auditoria incluidas).
// ------------------------------------------------------------------

function ejecutarAccionAsistenteWeb(token, modulo, accion, indiceFila, datosFila) {
  const sesion = requireSession(token != '' ? token : '');

  if (String(sesion.rol || '').toLowerCase() !== 'admin') {
    return {
      ok: false,
      mensaje: 'Solo los administradores pueden crear, editar o eliminar registros con el asistente.'
    };
  }

  if (!MODULOS || MODULOS[modulo] === undefined) {
    return { ok: false, mensaje: 'Modulo no valido.' };
  }

  try {
    var resultado;
    if (accion === 'crear') {
      resultado = crearRegistro(token, modulo, datosFila);
    } else if (accion === 'editar') {
      resultado = actualizarRegistro(token, modulo, indiceFila, datosFila);
    } else if (accion === 'eliminar') {
      resultado = eliminarRegistro(token, modulo, indiceFila);
    } else {
      return { ok: false, mensaje: 'Accion no reconocida.' };
    }
    return { ok: true, resultado: resultado, accion: accion };
  } catch (e) {
    return { ok: false, mensaje: 'No se pudo completar la accion: ' + e };
  }
}
