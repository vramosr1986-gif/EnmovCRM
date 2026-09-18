function responderBotWeb(token, pregunta) {
  // 1) Validar sesion igual que el resto de la app
  const sesion = requireSession(token != '' ? token : '');
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
          for (var c = 0; c < gridFiltrado.headers.length && c < 12; c++) {
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

  // 3) Llamar a GROQ con la informacion real del usuario
  const apiKey = PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY');
  if (!apiKey) {
    return 'El asistente no esta configurado: falta la clave API.';
  }

  const conocimientos = fragmentos.join('\n');

  // Definir el modelo preguntando a GROQ que tiene ACTIVO (no adivinar)
  const modelos = ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'gemma2-9b-it'];
  var ultimoError = '';

  function llamar(modeloAA) {
    const payload = {
      model: modeloAA,
      messages: [
        {
          role: 'system',
          content: 'Eres un asistente de la web EnmovCRM.\n' +
                   'Responde SOLO segun la informacion que te doy.\n' +
                   'Si no esta en la informacion, responde: "No aparece en la web".\n' +
                   'Se breve y claro. Responde en espanol.\n\n' +
                   'Informacion:\n' + conocimientos
        },
        {
          role: 'user',
          content: pregunta
        }
      ],
      temperature: 0.5,
      max_tokens: 300
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

    return data;
  }

  for (var m = 0; m < modelos.length; m++) {
    const data = llamar(modelos[m]);
    if (data.error) {
      ultimoError = data.error.message || JSON.stringify(data.error);
      Logger.log('GROQ ' + modelos[m] + ': ' + ultimoError);
      continue;
    }
    return data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
      ? data.choices[0].message.content
      : 'No pude generar una respuesta.';
  }

  return 'No se pudo conectar con GROQ. Error de la API: ' + ultimoError;
}
