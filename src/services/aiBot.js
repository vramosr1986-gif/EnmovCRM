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
      var cantidadIdx = getColumnaCantidadIdx(headers);
      var pagoIdx = -1;
      for (var ci = 0; ci < headers.length; ci++) {
        if (normalizarTexto(headers[ci]).indexOf('como_paga') !== -1 || normalizarTexto(headers[ci]).indexOf('como paga') !== -1) {
          pagoIdx = ci; break;
        }
      }
      var fisioIdx = getColumnaFisioIdx(headers);
      var horaIdx = getColumnaHoraIdx(headers);

      var hoy = Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy');
      var ayerDate = new Date(); ayerDate.setDate(ayerDate.getDate() - 1);
      var ayer = Utilities.formatDate(ayerDate, 'Europe/Madrid', 'dd/MM/yyyy');
      var inicioMes = Utilities.formatDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'Europe/Madrid', 'dd/MM/yyyy');

      var sesionesHoy = 0, clientesHoy = [], dineroHoy = 0, dineroHoyEfectivo = 0, dineroHoyTarjeta = 0, dineroHoyBono = 0;
      var sesionesAyer = 0, clientesAyer = [], dineroAyer = 0;
      var sesionesMes = 0, clientesMes = [], dineroMes = 0, dineroMesEfectivo = 0, dineroMesTarjeta = 0, dineroMesBono = 0;
      var totalRegistros = filas.length, totalDinero = 0, totalEfectivo = 0, totalTarjeta = 0, totalBono = 0;
      var clientesTotales = [];

      for (var f = 0; f < filas.length; f++) {
        var fila = filas[f];
        var valFecha = fila[fechaIdx];
        var fechaNorm = fechaIdx >= 0 ? normalizarFechaClave(String(valFecha == null ? '' : valFecha)) : '';
        var esHoy = fechaIdx >= 0 && fechaNorm === normalizarFechaClave(hoy);
        var esAyer = fechaIdx >= 0 && fechaNorm === normalizarFechaClave(ayer);
        var esMes = fechaIdx >= 0 && fechaNorm >= normalizarFechaClave(inicioMes);

        var nomCliente = clienteIdx >= 0 ? String(fila[clienteIdx] || '').trim() : '';
        var cant = cantidadIdx >= 0 ? parseNumber(String(fila[cantidadIdx] == null ? '' : fila[cantidadIdx])) : null;
        var pago = pagoIdx >= 0 ? normalize(String(fila[pagoIdx] == null ? '' : fila[pagoIdx])) : '';

        if (nomCliente && clientesTotales.indexOf(nomCliente) === -1) clientesTotales.push(nomCliente);
        if (cant != null && cant > 0) {
          totalDinero += cant;
          if (pago === 'efectivo') totalEfectivo += cant;
          else if (pago === 'tarjeta') totalTarjeta += cant;
          else if (pago === 'bono') totalBono += cant;
        }

        if (esHoy) {
          sesionesHoy++;
          if (nomCliente && clientesHoy.indexOf(nomCliente) === -1) clientesHoy.push(nomCliente);
          if (cant != null && cant > 0) {
            dineroHoy += cant;
            if (pago === 'efectivo') dineroHoyEfectivo += cant;
            else if (pago === 'tarjeta') dineroHoyTarjeta += cant;
            else if (pago === 'bono') dineroHoyBono += cant;
          }
        }
        if (esAyer) {
          sesionesAyer++;
          if (nomCliente && clientesAyer.indexOf(nomCliente) === -1) clientesAyer.push(nomCliente);
          if (cant != null && cant > 0) dineroAyer += cant;
        }
        if (esMes) {
          sesionesMes++;
          if (nomCliente && clientesMes.indexOf(nomCliente) === -1) clientesMes.push(nomCliente);
          if (cant != null && cant > 0) {
            dineroMes += cant;
            if (pago === 'efectivo') dineroMesEfectivo += cant;
            else if (pago === 'tarjeta') dineroMesTarjeta += cant;
            else if (pago === 'bono') dineroMesBono += cant;
          }
        }
      }

      fragmentos.push('\nMODULO: ' + nombreModulo);
      fragmentos.push('Columnas: ' + headers.join(' | '));
      fragmentos.push('RESUMEN TOTAL: ' + totalRegistros + ' registros, ' + clientesTotales.length + ' pacientes unicos, ' + totalDinero + '€ total (Efectivo: ' + totalEfectivo + '€, Tarjeta: ' + totalTarjeta + '€, Bono: ' + totalBono + '€).');
      fragmentos.push('HOY (' + hoy + '): ' + sesionesHoy + ' sesiones, ' + clientesHoy.length + ' pacientes, ' + dineroHoy + '€ (Efectivo: ' + dineroHoyEfectivo + ', Tarjeta: ' + dineroHoyTarjeta + ', Bono: ' + dineroHoyBono + ').');
      fragmentos.push('AYER (' + ayer + '): ' + sesionesAyer + ' sesiones, ' + clientesAyer.length + ' pacientes, ' + dineroAyer + '€.');
      fragmentos.push('MES ACTUAL (desde ' + inicioMes + '): ' + sesionesMes + ' sesiones, ' + clientesMes.length + ' pacientes, ' + dineroMes + '€ (Efectivo: ' + dineroMesEfectivo + ', Tarjeta: ' + dineroMesTarjeta + ', Bono: ' + dineroMesBono + ').');

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