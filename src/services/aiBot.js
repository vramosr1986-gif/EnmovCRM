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
      var headers = (gridFiltrado.headers || []);
      var filas = gridFiltrado.rows || [];

      fragmentos.push('\nMODULO: ' + nombreModulo);
      fragmentos.push('Columnas: ' + headers.join(' | '));

      var fechaIdx = getColumnaFechaIdx(headers);
      var clienteIdx = getColumnaClienteIdx(headers);
      var hoy = Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy');

      var sesionesHoy = 0;
      var clientesHoy = [];
      for (var f = 0; f < filas.length; f++) {
        var filaHoy = filas[f];
        var valFecha = filaHoy[fechaIdx];
        if (fechaIdx >= 0 && normalizarFechaClave(String(valFecha == null ? '' : valFecha)) === normalizarFechaClave(hoy)) {
          sesionesHoy++;
          if (clienteIdx >= 0) {
            var nomCliente = String(filaHoy[clienteIdx] || '').trim();
            if (nomCliente && clientesHoy.indexOf(nomCliente) === -1) {
              clientesHoy.push(nomCliente);
            }
          }
        }
      }

      fragmentos.push('Resumen: ' + filas.length + ' registros en total. Hoy (' + hoy + '): ' + sesionesHoy + ' sesiones y ' + clientesHoy.length + ' pacientes distintos: ' + (clientesHoy.length ? clientesHoy.join(', ') : 'ninguno') + '.');

      var filasHoy = [];
      for (var f2 = 0; f2 < filas.length; f2++) {
        var valFechaHoy = filas[f2][fechaIdx];
        if (fechaIdx < 0 || normalizarFechaClave(String(valFechaHoy == null ? '' : valFechaHoy)) === normalizarFechaClave(hoy)) {
          filasHoy.push(filas[f2]);
        }
      }

      if (filasHoy.length === 0) {
        fragmentos.push('No hay sesiones hoy.');
      } else {
        var fisioIdx = getColumnaFisioIdx(headers);
        var cantidadIdx = getColumnaCantidadIdx(headers);
        var pagoIdx = -1;
        for (var ci = 0; ci < headers.length; ci++) {
          if (normalizarTexto(headers[ci]).indexOf('como_paga') !== -1 || normalizarTexto(headers[ci]).indexOf('como paga') !== -1) {
            pagoIdx = ci; break;
          }
        }
        var horaIdx = getColumnaHoraIdx(headers);
        var maxFilas = Math.min(10, filasHoy.length);
        fragmentos.push('Sesiones de hoy (mostrando ' + maxFilas + ' de ' + filasHoy.length + '):');
        for (var j = 0; j < maxFilas; j++) {
          var detalle = [];
          if (clienteIdx >= 0) { var v = filasHoy[j][clienteIdx]; if (v !== undefined && v !== null && String(v).trim() !== '') detalle.push('Cliente=' + String(v).trim()); }
          if (fisioIdx >= 0) { v = filasHoy[j][fisioIdx]; if (v !== undefined && v !== null && String(v).trim() !== '') detalle.push('Fisio=' + String(v).trim()); }
          if (cantidadIdx >= 0) { v = filasHoy[j][cantidadIdx]; if (v !== undefined && v !== null && String(v).trim() !== '') detalle.push('Cant=' + String(v).trim()); }
          if (pagoIdx >= 0) { v = filasHoy[j][pagoIdx]; if (v !== undefined && v !== null && String(v).trim() !== '') detalle.push('Pago=' + String(v).trim()); }
          if (horaIdx >= 0) { v = filasHoy[j][horaIdx]; if (v !== undefined && v !== null && String(v).trim() !== '') detalle.push('Hora=' + String(v).trim()); }
          if (detalle.length === 0) { for (var c = 0; c < headers.length && c < 6; c++) { var nomCol = headers[c]; var valor = filasHoy[j][c]; if (valor !== undefined && valor !== null && String(valor).trim() !== '') { detalle.push(nomCol + '=' + String(valor).trim()); } } }
          fragmentos.push((j + 1) + '.- ' + detalle.join(', '));
        }
        if (filasHoy.length > maxFilas) {
          fragmentos.push('... y ' + (filasHoy.length - maxFilas) + ' más.');
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

  // Modelos a probar en orden (compound-mini primero, luego los mejores disponibles)
  var modelos = ['groq/compound-mini', 'llama-3.1-8b-instant', 'llama-3.3-70b-versatile', 'gemma2-9b-it'];

  var ultimoError = '';

  function obtenerHistorial() {
    var raw = CacheService.getScriptCache().get('chat_' + token);
    if (!raw) return [];
    try { return JSON.parse(raw); } catch (e) { return []; }
  }

  function guardarHistorial(messages) {
    CacheService.getScriptCache().put('chat_' + token, JSON.stringify(messages), 1800);
  }

  function llamarGroq(modelo) {
    var historial = obtenerHistorial().slice(-8);
    var messages = [
      { role: 'system', content: 'Eres el asistente de EnmovCRM. Responde SOLO con la informacion dada abajo. Si el dato no aparece, responde "No aparece en la web". Se breve, claro y en espanol. Si te piden crear, editar o borrar, NO lo hagas: di que eso requiere confirmacion del administrador.\n\nInformacion:\n' + conocimientos }
    ].concat(historial).concat([{ role: 'user', content: pregunta }]);

    var payload = {
      model: modelo,
      messages: messages,
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
        var respuesta = data.choices[0].message.content;
        guardarHistorial(obtenerHistorial().concat([
          { role: 'user', content: pregunta },
          { role: 'assistant', content: respuesta }
        ]));
        return respuesta;
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