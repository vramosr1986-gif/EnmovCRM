function parseNumber(entrada) {
  var t = String(entrada == null ? '' : entrada).replace(/,/g, '.').trim();
  if (t === '') return null;
  var n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function parseTime(entrada) {
  var t = String(entrada == null ? '' : entrada).trim();
  var mm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(t);
  if (mm) {
    var h = parseInt(mm[1], 10), mi = parseInt(mm[2], 10), s = mm[3] ? parseInt(mm[3], 10) : 0;
    if (h < 24 && mi < 60 && s < 60) return h * 3600 + mi * 60 + s;
  }
  return null;
}

function parseDate(entrada) {
  var t = String(entrada == null ? '' : entrada).trim();
  var dm = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(t);
  if (dm) {
    var d = new Date(parseInt(dm[3], 10), parseInt(dm[2], 10) - 1, parseInt(dm[1], 10));
    return isNaN(d.getTime()) ? null : d;
  }
  var id = new Date(t);
  return isNaN(id.getTime()) ? null : id;
}

function responderBotWeb(token, pregunta) {
  var sesion = requireSession(token != '' ? token : '');
  var esAdmin = String(sesion.rol || '').toLowerCase() === 'admin';
  var nombreSesion = sesion.nombre || sesion.username || '';
  var rolSesion = esAdmin ? 'administrador' : 'fisioterapeuta';

  var modulosPermitidos = Array.isArray(sesion.modules) ? sesion.modules : [];

  var SCHEMA = {
    ENMOV: {
      nombre: 'En Movimiento Sano (Enmov)',
      columnas: {
        fecha: { idxFn: 'getColumnaFechaIdx', tipo: 'date' },
        hora: { idxFn: 'getColumnaHoraIdx', tipo: 'time' },
        cliente: { idxFn: 'getColumnaClienteIdx', tipo: 'string' },
        fisio: { idxFn: 'getColumnaFisioIdx', tipo: 'string' },
        cantidad: { idxFn: 'getColumnaCantidadIdx', tipo: 'number' },
        pago: { idxFn: 'custom', tipo: 'string', desc: 'como_paga / como paga (efectivo|tarjeta|bono)' }
      }
    },
    NAVTA: { nombre: 'Navta', columnas: {} },
    DOMICILIACIONES: { nombre: 'Domiciliaciones', columnas: {} }
  };

  var MAX_ROWS = 50;
  var MAX_TOKENS_RESPONSE = 800;

  function getSchemaForModulo(modulo) {
    return SCHEMA[modulo] || { nombre: modulo, columnas: {} };
  }

  function buildSchemaDescription() {
    var parts = [];
    for (var i = 0; i < modulosPermitidos.length; i++) {
      var m = modulosPermitidos[i];
      var sch = getSchemaForModulo(m);
      var cols = Object.keys(sch.columnas).join(', ');
      parts.push(sch.nombre + ' (' + m + '): ' + cols);
    }
    return parts.join('\n');
  }

  function executeQuery(params) {
    var modulo = params.modulo;
    if (modulosPermitidos.indexOf(modulo) === -1) {
      return { error: 'No tienes acceso al modulo ' + modulo };
    }
    var grid = getGridDataByModulo(modulo);
    var sesionLocal = requireSession(token);
    var gridFiltrado = esAdmin ? grid : filtrarGridPorFisio(grid, sesionLocal.fisioFiltro || '');
    var headers = gridFiltrado.headers || [];
    var filas = gridFiltrado.rows || [];

    var schema = getSchemaForModulo(modulo);
    var fechaIdx = getColumnaFechaIdx(headers);
    var clienteIdx = getColumnaClienteIdx(headers);
    var fisioIdx = getColumnaFisioIdx(headers);
    var cantidadIdx = getColumnaCantidadIdx(headers);
    var horaIdx = getColumnaHoraIdx(headers);
    var pagoIdx = -1;
    for (var ci = 0; ci < headers.length; ci++) {
      var h = normalizarTexto(headers[ci]);
      if (h.indexOf('como_paga') !== -1 || h.indexOf('como paga') !== -1) { pagoIdx = ci; break; }
    }

    var hoy = Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy');
    var ayerDate = new Date(); ayerDate.setDate(ayerDate.getDate() - 1);
    var ayer = Utilities.formatDate(ayerDate, 'Europe/Madrid', 'dd/MM/yyyy');
    var inicioMes = Utilities.formatDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'Europe/Madrid', 'dd/MM/yyyy');

    var filtradas = filas;
    var filtros = params.filtros || {};

    if (filtros.fecha) {
      var fechaNorm = null;
      if (filtros.fecha === 'hoy') fechaNorm = normalizarFechaClave(hoy);
      else if (filtros.fecha === 'ayer') fechaNorm = normalizarFechaClave(ayer);
      else if (filtros.fecha !== 'mes') fechaNorm = normalizarFechaClave(filtros.fecha);

      if (filtros.fecha === 'mes') {
        var inicioNorm = normalizarFechaClave(inicioMes);
        filtradas = filtradas.filter(function(f) {
          return fechaIdx >= 0 && normalizarFechaClave(String(f[fechaIdx] == null ? '' : f[fechaIdx])) >= inicioNorm;
        });
      } else if (fechaNorm !== null) {
        filtradas = filtradas.filter(function(f) {
          return fechaIdx >= 0 && normalizarFechaClave(String(f[fechaIdx] == null ? '' : f[fechaIdx])) === fechaNorm;
        });
      }
    }
    if (filtros.fisio && fisioIdx >= 0) {
      var fisioNorm = normalizarTexto(filtros.fisio);
      filtradas = filtradas.filter(function(f) { return normalizarTexto(String(f[fisioIdx] || '')) === fisioNorm; });
    }
    if (filtros.cliente && clienteIdx >= 0) {
      var cliNorm = normalizarTexto(filtros.cliente);
      filtradas = filtradas.filter(function(f) { return normalizarTexto(String(f[clienteIdx] || '')).indexOf(cliNorm) !== -1; });
    }
    if (filtros.pago && pagoIdx >= 0) {
      var pagoNorm = normalizarTexto(filtros.pago);
      filtradas = filtradas.filter(function(f) { return normalizarTexto(String(f[pagoIdx] || '')) === pagoNorm; });
    }

    var groupBy = params.groupBy;
    var aggregates = params.aggregates || ['count'];
    var orderBy = params.orderBy;
    var orderDir = params.orderDir || 'desc';
    var limit = params.limit || 50;

    var resultado = { filas: [], resumen: {} };

    if (groupBy && groupBy !== 'none') {
      var grupoIdx = -1;
      if (groupBy === 'fisio') grupoIdx = fisioIdx;
      else if (groupBy === 'cliente') grupoIdx = clienteIdx;
      else if (groupBy === 'pago') grupoIdx = pagoIdx;
      else if (groupBy === 'fecha') grupoIdx = fechaIdx;

      if (grupoIdx >= 0) {
        var grupos = {};
        for (var f = 0; f < filtradas.length; f++) {
          var clave = String(filtradas[f][grupoIdx] || '').trim() || '(vacío)';
          if (!grupos[clave]) grupos[clave] = { count: 0, sum: 0, filas: [] };
          grupos[clave].count++;
          var cant = cantidadIdx >= 0 ? parseNumber(String(filtradas[f][cantidadIdx] == null ? '' : filtradas[f][cantidadIdx])) : 0;
          if (cant) grupos[clave].sum += cant;
          grupos[clave].filas.push(filtradas[f]);
        }
        var items = Object.keys(grupos).map(function(k) {
          var g = grupos[k];
          return { grupo: k, count: g.count, suma_cantidad: g.sum, filas: g.filas.slice(0, 5) };
        });
        items.sort(function(a, b) {
          var dir = orderDir === 'asc' ? 1 : -1;
          if (orderBy === 'suma' || orderBy === 'sum') return (b.suma_cantidad - a.suma_cantidad) * dir;
          if (orderBy === 'count') return (b.count - a.count) * dir;
          return (b.count - a.count) * dir;
        });
        if (limit > 0) items = items.slice(0, limit);
        resultado.filas = items;
        resultado.resumen = { total_grupos: Object.keys(grupos).length, total_filas: filtradas.length };
      }
    } else {
      if (orderBy) {
        var ordIdx = -1;
        if (orderBy === 'fecha') ordIdx = fechaIdx;
        else if (orderBy === 'hora') ordIdx = getColumnaHoraIdx(headers);
        else if (orderBy === 'cantidad') ordIdx = cantidadIdx;
        else if (orderBy === 'cliente') ordIdx = clienteIdx;
        else if (orderBy === 'fisio') ordIdx = fisioIdx;

        if (ordIdx >= 0) {
          filtradas.sort(function(a, b) {
            var av = a[ordIdx], bv = b[ordIdx];
            var an = parseNumber(av), bn = parseNumber(bv);
            if (an != null && bn != null) return (an - bn) * (orderDir === 'asc' ? 1 : -1);
            var at = parseTime(av), bt = parseTime(bv);
            if (at != null && bt != null) return (at - bt) * (orderDir === 'asc' ? 1 : -1);
            var ad = parseDate(av), bd = parseDate(bv);
            if (ad && bd) return (ad.getTime() - bd.getTime()) * (orderDir === 'asc' ? 1 : -1);
            return String(av).localeCompare(String(bv)) * (orderDir === 'asc' ? 1 : -1);
          });
        }
      }
      var mostrar = limit > 0 ? filtradas.slice(0, limit) : filtradas;
      resultado.filas = mostrar.map(function(f) {
        var obj = {};
        for (var c = 0; c < headers.length && c < 12; c++) {
          var v = f[c];
          if (v !== undefined && v !== null && String(v).trim() !== '') obj[headers[c]] = String(v).trim();
        }
        return obj;
      });
      resultado.resumen = { total_filtradas: filtradas.length, mostradas: resultado.filas.length };
    }

    if (filtradas.length > MAX_ROWS) {
      resultado.advertencia = 'Resultado grande: ' + filtradas.length + ' filas. Mostrando primeras ' + resultado.filas.length + '. Refina la consulta (filtra por fecha, fisio, cliente) para ver más detalle.';
    }
    return resultado;
  }

  var systemPrompt = 'Eres el asistente de EnmovCRM. Tienes acceso a la herramienta `query_sheet` para consultar la hoja de datos.\n' +
    'Módulos disponibles:\n' + buildSchemaDescription() + '\n\n' +
    'CATÁLOGO DE PRECIOS:\n' +
    'Sesion de Fisio = 45€\nSesion de Fisio Respi = 50€\nSesion de Pilates = 25€\n' +
    'Bono de Fisio = 200€\nBono de Respi = 240€\nBono de Pilates = 75€\n\n' +
    'INSTRUCCIONES:\n' +
    '- USA `query_sheet` SIEMPRE que el usuario pida datos, conteos, sumas, listas, filtrados.\n' +
    '- Parámetros de `query_sheet`:\n' +
    '  modulo (obligatorio): uno de los módulos permitidos\n' +
    '  filtros: {fecha: "hoy|ayer|mes|YYYY-MM-DD", fisio: "nombre", cliente: "nombre", pago: "efectivo|tarjeta|bono"}\n' +
    '  groupBy: "fisio" | "cliente" | "pago" | "fecha" | "none" (agrupa y cuenta)\n' +
    '  aggregates: ["count", "sum_cantidad"] (qué calcular por grupo)\n' +
    '  orderBy: "fecha" | "hora" | "cantidad" | "cliente" | "fisio"\n' +
    '  orderDir: "asc" | "desc"\n' +
    '  limit: número máx de filas/grupos (defecto 50)\n' +
    '- Si el resultado tiene advertencia (demasiadas filas), díselo al usuario y sugiere refinar.\n' +
    '- Responde en español, breve y claro. Si el resultado es 0 filas, REINTENTA: prueba con otro filtro o sin filtrar fecha antes de concluir. Solo di "No aparece en la web." si la hoja está realmente vacía.\n' +
    '- NO inventes datos. Solo usa lo que devuelva `query_sheet`.\n' +
    '- El usuario actual es "' + nombreSesion + '" con rol ' + rolSesion + '.\n' +
    '- REGLA OBLIGATORIA: Para CUALQUIER pregunta sobre datos (conteos, sumas, listas, filtrados, totales, promedios), DEBES llamar a `query_sheet`. Si respondes sin usarla, tu respuesta será rechazada y se te pedirá que uses la herramienta. Si no hay datos, la tool devolverá resumen vacío y tú responderás "No aparece en la web".';

  var apiKey = PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY');
  if (!apiKey) return 'El asistente no esta configurado: falta la clave API.';

  var baseGroq = 'https://api.groq.com/openai/v1';
  var modelos = ['groq/compound-mini', 'openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b'];

  var tools = [{
    type: 'function',
    function: {
      name: 'query_sheet',
      description: 'Consulta la hoja de datos con filtros, agrupaciones y agregaciones',
      parameters: {
        type: 'object',
        properties: {
          modulo: { type: 'string', enum: modulosPermitidos },
          filtros: {
            type: 'object',
            properties: {
              fecha: { type: 'string', description: 'hoy, ayer, mes, o YYYY-MM-DD' },
              fisio: { type: 'string' },
              cliente: { type: 'string' },
              pago: { type: 'string', enum: ['efectivo', 'tarjeta', 'bono'] }
            }
          },
          groupBy: { type: 'string', enum: ['fisio', 'cliente', 'pago', 'fecha', 'none'] },
          aggregates: { type: 'array', items: { type: 'string', enum: ['count', 'sum_cantidad'] } },
          orderBy: { type: 'string', enum: ['fecha', 'hora', 'cantidad', 'cliente', 'fisio'] },
          orderDir: { type: 'string', enum: ['asc', 'desc'] },
          limit: { type: 'integer', minimum: 1, maximum: 200 }
        },
        required: ['modulo']
      }
    }
  }];

  function obtenerHistorial() {
    var raw = CacheService.getScriptCache().get('chat_' + token);
    if (!raw) return [];
    try { return JSON.parse(raw); } catch (e) { return []; }
  }

  function guardarHistorial(messages) {
    CacheService.getScriptCache().put('chat_' + token, JSON.stringify(messages), 1800);
  }

  function llamarGroq(modelo, mensajes, conTools) {
    var payload = {
      model: modelo,
      messages: mensajes,
      temperature: 0.3,
      max_tokens: MAX_TOKENS_RESPONSE
    };
    if (conTools) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }
    var resp = UrlFetchApp.fetch(baseGroq + '/chat/completions', {
      method: 'post',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    return JSON.parse(resp.getContentText());
  }

  var messages = [
    { role: 'system', content: systemPrompt }
  ].concat(obtenerHistorial().slice(-6)).concat([{ role: 'user', content: pregunta }]);

  var ultimoError = '';
  for (var intento = 0; intento < 3; intento++) {
    for (var m = 0; m < modelos.length; m++) {
      try {
        var data = llamarGroq(modelos[m], messages, true);
        if (data && data.error) { ultimoError = data.error.message || JSON.stringify(data.error); continue; }
        if (!data || !data.choices || !data.choices[0]) continue;
        var msg = data.choices[0].message;
        if (data.choices[0].finish_reason === 'length') { ultimoError = 'respuesta truncada por tokens'; }

        var usoTool = false;
        messages.push(msg);
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          usoTool = true;
          for (var tc = 0; tc < msg.tool_calls.length; tc++) {
            var call = msg.tool_calls[tc];
            if (call.function && call.function.name === 'query_sheet') {
              var args = null;
              try { args = JSON.parse(call.function.arguments); } catch (pe) { args = {}; }
              var resultado = executeQuery(args);
              messages.push({
                role: 'tool',
                tool_call_id: call.id,
                content: JSON.stringify(resultado)
              });
            }
          }
        }

        var textoFinal = msg.content;
        if (!textoFinal && usoTool) {
          // Pasada final SIN tools para cerrar la respuesta con los datos reales
          var dataFinal = llamarGroq(modelos[m], messages, false);
          if (dataFinal && dataFinal.error) {
            ultimoError = dataFinal.error.message || JSON.stringify(dataFinal.error);
          }
          if (dataFinal && dataFinal.choices && dataFinal.choices[0] && dataFinal.choices[0].message.content) {
            textoFinal = dataFinal.choices[0].message.content;
          }
        }

        if (textoFinal) {
          var pareceDatos = /cuantos?|cuanto|total|suma|promedio|list|lista|pacientes?|dinero|sesiones?|factur|ingresos?|efectivo|tarjeta|bono|fisio|cliente|mes|ayer|hoy|semana|ano|top|ranking|mas|menos|entre/.test(pregunta.toLowerCase());
          if (pareceDatos && !usoTool) {
            // El modelo respondio sin consultar: pedimos pasada final con datos reales
            var moduloDefecto = modulosPermitidos[0] || 'ENMOV';
            var resForzada = executeQuery({ modulo: moduloDefecto, limit: 20 });
            var dataForzada = llamarGroq(modelos[m], messages.concat([{
              role: 'user',
              content: 'Datos de la hoja: ' + JSON.stringify(resForzada) + '. Responde usando SOLO estos datos, nunca inventes.'
            }]), false);
            if (dataForzada && dataForzada.choices && dataForzada.choices[0] && dataForzada.choices[0].message.content) {
              textoFinal = dataForzada.choices[0].message.content;
            }
          }
          guardarHistorial(obtenerHistorial().concat([
            { role: 'user', content: pregunta },
            { role: 'assistant', content: textoFinal }
          ]));
          return textoFinal;
        }
      } catch (e) {
        ultimoError = (e && e.message) ? e.message : String(e);
        Logger.log('GROQ error: ' + e);
      }
    }
  }
  return 'No se pudo conectar con el asistente. Detalle: ' + (ultimoError || 'desconocido');
}

function ejecutarAccionAsistenteWeb(token, modulo, accion, indiceFila, datosFila) {
  var sesion = requireSession(token != '' ? token : '');
  var esAdmin = String(sesion.rol || '').toLowerCase() === 'admin';
  if (!esAdmin) return 'Solo el administrador puede ejecutar acciones.';
  var permiso = sesion.modules || [];
  if (permiso.indexOf(modulo) === -1) return 'No tienes acceso a este modulo.';

  var accionL = String(accion || '').toLowerCase();
  if (accionL === 'crear') return crearRegistro(token, modulo, datosFila);
  if (accionL === 'editar') return actualizarRegistro(token, modulo, indiceFila, datosFila);
  if (accionL === 'eliminar') return eliminarRegistro(token, modulo, indiceFila);
  return 'Accion no reconocida: ' + accion;
}