function responderBotWeb(token, pregunta) {
  // ================= 1) SESION Y ROL =================
  var sesion = requireSession(token != '' ? token : '');
  var esAdmin = String(sesion.rol || '').toLowerCase() === 'admin';
  var nombreSesion = sesion.nombre || sesion.username || '';
  var rolSesion = esAdmin ? 'administrador' : 'fisioterapeuta';

  // ================= 2) DATOS: SOLO los modulos que el usuario puede ver =================
  var modulosPermitidos = Array.isArray(sesion.modules) ? sesion.modules : [];
  var fragmentos = [];
  fragmentos.push('El usuario actual es "' + nombreSesion + '" con rol ' + rolSesion + '.');
  fragmentos.push('\nCATALOGO DE PRECIOS:');
  fragmentos.push('Sesion de Fisio = 45€ (se puede pagar con Tarjeta, Efectivo o Bono ya comprado).');
  fragmentos.push('Sesion de Fisio Respi = 50€ (se puede pagar con Tarjeta, Efectivo o Bono ya comprado).');
  fragmentos.push('Sesion de Pilates = 25€ (se puede pagar con Tarjeta, Efectivo o Bono ya comprado).');
  fragmentos.push('Bono de Fisio = 200€ (compra unica con Tarjeta o Efectivo).');
  fragmentos.push('Bono de Respi = 240€ (compra unica con Tarjeta o Efectivo).');
  fragmentos.push('Bono de Pilates = 75€ (compra unica con Tarjeta o Efectivo).');

  var nombreModulo = '';
  for (var i = 0; i < modulosPermitidos.length && i < 4; i++) {
    var modulo = modulosPermitidos[i];
    if (MODULOS.ENMOV === modulo) { nombreModulo = 'En Movimiento Sano (Enmov)'; }
    else if (MODULOS.NAVTA === modulo) { nombreModulo = 'Navta'; }
    else if (MODULOS.DOMICILIACIONES === modulo) { nombreModulo = 'Domiciliaciones'; }

    try {
      var grid = getGridDataByModulo(modulo);
      var gridFiltrado = esAdmin ? grid : filtrarGridPorFisio(grid, sesion.fisioFiltro || '');

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
          for (var c = 0; c < (gridFiltrado.headers || []).length && c < 12; c++) {
            var nomCol = gridFiltrado.headers[c];
            var valor = filas[j][c];
            if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
              detalle.push(nomCol + '=' + String(valor).trim());
            }
          }
          fragmentos.push((j + 1) + '.- ' + detalle.join(', '));
        }
      }
    } catch (e) {
      fragmentos.push(nombreModulo + ': no se pudo leer (' + e + ')');
    }
  }

  // ================= 3) GROQ =================
  var apiKey = PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY');
  if (!apiKey) { return 'El asistente no esta configurado: falta la clave API.'; }

  var conocimientos = fragmentos.join('\n');
  var baseGroq = 'https://api.groq.com/openai/v1';

  // 3.1) Pedir a GROQ la LISTA REAL de modelos activos para esta clave (no adivinar)
  var modelos = ['groq/compound-mini'];
  try {
    var resModelos = UrlFetchApp.fetch(baseGroq + '/models', {
      method: 'get',
      headers: { 'Authorization': 'Bearer ' + apiKey },
      muteHttpExceptions: true
    });
    var idsReal = JSON.parse(resModelos.getContentText()).data || [];
    var disponibles = [];
    for (var qi = 0; qi < idsReal.length; qi++) {
      var idModelo = String(idsReal[qi].id || '');
      var idL = idModelo.toLowerCase();
      if (idL.indexOf('compound') !== -1 || idL.indexOf('llama') !== -1 || idL.indexOf('gemma') !== -1 || idL.indexOf('gpt-') !== -1) {
        disponibles.push(idModelo);
      }
    }
    // Orden: compound-mini primero (el que responde en tu otra web), luego el resto
    var orden = [];
    for (var di = 0; di < disponibles.length; di++) {
      if (disponibles[di].toLowerCase().indexOf('compound-mini') !== -1) { orden.push(disponibles[di]); }
    }
    for (var d2 = 0; d2 < disponibles.length; d2++) {
      if (orden.indexOf(disponibles[d2]) === -1) { orden.push(disponibles[d2]); }
    }
    if (orden.length > 0) { modelos = orden; }
  } catch (e) {
    Logger.log('no se pudo listar modelos GROQ: ' + e);
  }

  var ultimoError = '';
  function llamarGroq(modelo) {
    var payload = {
      model: modelo,
      messages: [
        { role: 'system', content: 'Eres el asistente de EnmovCRM. Responde SOLO con la informacion dada. Si el dato no aparece, responde "No aparece en la web". Se breve, claro y en espanol. Si te piden crear, editar o borrar, NO lo hagas: di que eso requiere confirmacion del administrador.\n\nInformacion:\n' + conocimientos },
        { role: 'user', content: pregunta }
      ],
      temperature: 0.5,
      max_tokens: 300
    };
    var resp = UrlFetchApp.fetch(baseGroq + '/chat/completions', {
      method: 'post',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    return JSON.parse(resp.getContentText());
  }

  for (var m = 0; m < modelos.length; m++) {
    try {
      var data = llamarGroq(modelos[m]);
      if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
        return data.choices[0].message.content;
      }
      ultimoError = data.error ? (data.error.message || JSON.stringify(data.error)) : 'respuesta vacia';
    } catch (e2) {
      ultimoError = String(e2);
    }
    Logger.log('GROQ ' + modelos[m] + ': ' + ultimoError);
  }

  return 'No se pudo conectar con GROQ. Error de la API: ' + ultimoError + ' Modelos probados: ' + modelos.join(', ');
}

function ejecutarAccionAsistenteWeb(token, modulo, accion, indiceFila, datosFila) {
  var sesion = requireSession(token != '' ? token : '');
  var esAdmin = String(sesion.rol || '').toLowerCase() === 'admin';
  if (!esAdmin) {
    return 'Solo el administrador puede ejecutar acciones.';
  }
  var permiso = sesion.modules || [];
  if (permiso.indexOf(modulo) === -1) {
    return 'No tienes acceso a este modulo.';
  }

  var accionL = String(accion || '').toLowerCase();
  if (accionL === 'crear') {
    return crearRegistro(token, modulo, datosFila);
  } else if (accionL === 'editar') {
    return actualizarRegistro(token, modulo, indiceFila, datosFila);
  } else if (accionL === 'eliminar') {
    return eliminarRegistro(token, modulo, indiceFila);
  }
  return 'Accion no reconocida: ' + accion;
}