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
  var MAX_EDIT = 10;

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

  var HOY = Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy');
  var MAYER = Utilities.formatDate(new Date(new Date().getTime() - 86400000), 'Europe/Madrid', 'dd/MM/yyyy');
  var INICIO_MES = Utilities.formatDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'Europe/Madrid', 'dd/MM/yyyy');

  function construirIndices(headers) {
    var idx = { fecha: -1, cliente: -1, fisio: -1, cantidad: -1, hora: -1, pago: -1, operacion: -1 };
    idx.fecha = getColumnaFechaIdx(headers);
    idx.cliente = getColumnaClienteIdx(headers);
    idx.fisio = getColumnaFisioIdx(headers);
    idx.cantidad = getColumnaCantidadIdx(headers);
    idx.hora = getColumnaHoraIdx(headers);
    idx.operacion = getColumnaOperacionIdx(headers);
    for (var i = 0; i < headers.length; i++) {
      var h = normalizarTexto(headers[i]);
      if (h.indexOf('como_paga') !== -1 || h.indexOf('como paga') !== -1) { idx.pago = i; break; }
    }
    return idx;
  }

  function seleccionarFilas(filas, headers, filtros, idx) {
    var seleccion = [];
    for (var i = 0; i < filas.length; i++) {
      var fila = filas[i];
      var coincide = true;
      var f = filtros || {};
      if (f.fecha && idx.fecha >= 0) {
        var v = normalizarFechaClave(String(fila[idx.fecha] == null ? '' : fila[idx.fecha]));
        if (f.fecha === 'mes') { if (v < normalizarFechaClave(INICIO_MES)) coincide = false; }
        else if (f.fecha === 'hoy') { if (v !== normalizarFechaClave(HOY)) coincide = false; }
        else if (f.fecha === 'ayer') { if (v !== normalizarFechaClave(MAYER)) coincide = false; }
        else if (v !== normalizarFechaClave(f.fecha)) coincide = false;
        if (!coincide) continue;
      }
      if (f.fisio && idx.fisio >= 0 && normalizarTexto(String(fila[idx.fisio] || '')) !== normalizarTexto(f.fisio)) continue;
      if (f.cliente && idx.cliente >= 0 && normalizarTexto(String(fila[idx.cliente] || '')).indexOf(normalizarTexto(f.cliente)) === -1) continue;
      if (f.pago && idx.pago >= 0 && normalizarTexto(String(fila[idx.pago] || '')) !== normalizarTexto(f.pago)) continue;
      seleccion.push({ fila: fila, indice: i });
    }
    return seleccion;
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

    var idx = construirIndices(headers);
    var fechaIdx = idx.fecha;
    var clienteIdx = idx.cliente;
    var fisioIdx = idx.fisio;
    var cantidadIdx = idx.cantidad;
    var horaIdx = idx.hora;
    var pagoIdx = idx.pago;

    var seleccion = seleccionarFilas(filas, headers, params.filtros || {}, idx);
    var filtradas = seleccion.map(function(s) { return s.fila; });

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

  function ejecutarEdicion(params) {
    if (!esAdmin) {
      return { error: 'Solo el administrador puede editar registros a través del asistente.' };
    }
    var modulo = params.modulo;
    if (modulosPermitidos.indexOf(modulo) === -1) {
      return { error: 'No tienes acceso al modulo ' + modulo };
    }
    var campos = params.campos;
    if (!campos || typeof campos !== 'object') {
      return { error: 'Falta el objeto `campos` con qué cambiar (fecha, hora, cliente, fisio, cantidad, pago, operacion).' };
    }
    var claves = Object.keys(campos);
    if (claves.length === 0) {
      return { error: 'No has indicado qué campos cambiar.' };
    }

    var grid = getGridDataByModulo(modulo);
    var headers = grid.headers || [];
    var filas = grid.rows || [];
    var idx = construirIndices(headers);
    var seleccion = seleccionarFilas(filas, headers, params.filtros || {}, idx);

    if (seleccion.length === 0) {
      return { error: 'Ningún registro coincide con los filtros. No se ha editado nada.' };
    }
    if (seleccion.length > MAX_EDIT) {
      return { error: 'Coinciden ' + seleccion.length + ' registros, supera el tope de ' + MAX_EDIT + '. Refina los filtros (fecha, fisio, cliente) para reducir la selección.' };
    }

    var confirmacion = Number(params.confirmacion);
    if (!Number.isInteger(confirmacion) || confirmacion !== seleccion.length) {
      return {
        error: 'Confirmación incorrecta: indicaste ' + params.confirmacion + ' registros pero coinciden ' + seleccion.length + '. No se ha editado nada.',
        coinciden: seleccion.length
      };
    }

    var CAMPO_IDX = { fecha: 'fecha', hora: 'hora', cliente: 'cliente', fisio: 'fisio', cantidad: 'cantidad', pago: 'pago', operacion: 'operacion' };
    var cambios = [];
    for (var c = 0; c < claves.length; c++) {
      var clave = String(claves[c]).toLowerCase();
      var idxKey = CAMPO_IDX[clave];
      if (!idxKey) {
        return { error: 'Campo no editable: ' + claves[c] + '. Usa solo fecha, hora, cliente, fisio, cantidad, pago u operacion.' };
      }
      if (idx[idxKey] < 0) {
        return { error: 'No se encontró la columna para el campo ' + claves[c] + '. No se ha editado nada.' };
      }
      cambios.push({ col: idx[idxKey], valor: campos[claves[c]] == null ? '' : String(campos[claves[c]]) });
    }

    var editados = 0;
    var filasTocadas = [];
    for (var i = 0; i < seleccion.length; i++) {
      var filaActual = seleccion[i].fila.slice();
      for (var cc = 0; cc < cambios.length; cc++) {
        filaActual[cambios[cc].col] = cambios[cc].valor;
      }
      try {
        actualizarRegistro(token, modulo, seleccion[i].indice, filaActual);
        filasTocadas.push(seleccion[i].indice + 2);
        editados++;
      } catch (er) {
        return {
          error: 'Fallo al editar la fila ' + (seleccion[i].indice + 2) + ': ' + er.message + '. Editadas antes del fallo: ' + editados,
          editados: editados
        };
      }
    }
    return { editados: editados, filas: filasTocadas, modulo: modulo };
  }

  function ejecutarCreacion(params) {
    if (!esAdmin) {
      return { error: 'Solo el administrador puede crear registros a través del asistente.' };
    }
    var modulo = params.modulo;
    if (modulosPermitidos.indexOf(modulo) === -1) {
      return { error: 'No tienes acceso al modulo ' + modulo };
    }
    if (params.confirmacion !== true) {
      return { error: 'Falta la confirmación del usuario para crear el registro.' };
    }
    var datos = params.datos;
    if (!datos || typeof datos !== 'object') {
      return { error: 'Falta el objeto `datos` con los campos del registro.' };
    }
    if (!datos.cliente || String(datos.cliente).trim() === '') {
      return { error: 'El campo `cliente` es obligatorio para crear un registro.' };
    }

    var grid = getGridDataByModulo(modulo);
    var headers = grid.headers || [];
    var idx = construirIndices(headers);
    var datosFila = [];
    for (var i = 0; i < headers.length; i++) { datosFila[i] = ''; }

    var CAMPO_IDX = { fecha: 'fecha', hora: 'hora', cliente: 'cliente', fisio: 'fisio', cantidad: 'cantidad', pago: 'pago', operacion: 'operacion' };
    var claves = Object.keys(datos);
    for (var c = 0; c < claves.length; c++) {
      var clave = String(claves[c]).toLowerCase();
      var idxKey = CAMPO_IDX[clave];
      if (!idxKey) {
        return { error: 'Campo no válido: ' + claves[c] + '. Usa solo fecha, hora, cliente, fisio, cantidad, pago u operacion.' };
      }
      if (idx[idxKey] < 0) {
        return { error: 'No se encontró la columna para el campo ' + claves[c] + '. No se ha creado nada.' };
      }
      datosFila[idx[idxKey]] = datos[claves[c]] == null ? '' : String(datos[claves[c]]);
    }

    try {
      crearRegistro(token, modulo, datosFila);
    } catch (er) {
      return { error: 'Fallo al crear el registro: ' + er.message };
    }
    return { creado: true, modulo: modulo };
  }

  var systemPrompt = 'Eres el asistente de EnmovCRM. Tienes acceso a la herramienta `query_sheet` para consultar la hoja de datos.\n' +
    'Módulos disponibles:\n' + buildSchemaDescription() + '\n\n' +
    'CATÁLOGO: Fisio 45€ | Fisio Respi 50€ | Pilates 25€ | Bono Fisio 200€ | Bono Respi 240€ | Bono Pilates 75€\n\n' +
    'INSTRUCCIONES:\n' +
    '- CUALQUIER dato (conteos, sumas, listas, totales) requiere llamar a `query_sheet`.\n' +
    '- Params: modulo (obligatorio), filtros {fecha:hoy|ayer|mes|YYYY-MM-DD, fisio, cliente, pago:efectivo|tarjeta|bono}, groupBy:fisio|cliente|pago|fecha|none, aggregates:[count|sum_cantidad], orderBy:fecha|hora|cantidad|cliente|fisio, orderDir:asc|desc, limit.\n' +
    '- Si resultado.advertencia existe, díselo y sugiere refinar la consulta.\n' +
    '- Si la consulta devuelve 0 filas, REINTENTA sin filtro de fecha o con otra fecha. SOLO di "No aparece en la web." si la hoja está realmente vacía.\n' +
    '- NO inventes datos. Usa solo lo que devuelva `query_sheet`.\n' +
    '- FORMATO: NUNCA uses tablas markdown (columnas |). Responde en texto plano legible con frases cortas y listas de guiones ("- "). Ejemplo: "- 10/02/2026 · Carolina · Efectivo · 200 €". Resumen breve primero, pocas líneas.\n' +
    '- EDITAR (solo admin, tope 10): cuando el usuario pida modificar registros, usa `query_sheet` con los mismos filtros para saber CUÁNTOS coinciden, muéstraselo y exige que escriba ese número exacto. Solo entonces llama `editar_registros` con confirmacion = ese número. Campos editables: fecha, hora, cliente, fisio, cantidad, pago, operacion.\n' +
    '- CREAR (solo admin): muestra al usuario el registro que vas a crear y exige "confirmo" antes de llamar `crear_registro` con confirmacion=true. cliente es obligatorio.\n' +
    '- Usuario actual: "' + nombreSesion + '" rol ' + rolSesion + '.';

  var apiKey = PropertiesService.getScriptProperties().getProperty('GROQ_API_KEY');
  if (!apiKey) return 'El asistente no esta configurado: falta la clave API.';

  var baseGroq = 'https://api.groq.com/openai/v1';
  var modelos = ['groq/compound-mini', 'openai/gpt-oss-20b', 'openai/gpt-oss-120b'];

  var tools = [{
    type: 'function',
    function: {
      name: 'query_sheet',
      description: 'Consulta la hoja de datos. Si 0 filas, reintenta sin filtro de fecha antes de concluir.',
      parameters: {
        type: 'object',
        properties: {
          modulo: { type: 'string', enum: modulosPermitidos },
          filtros: {
            type: 'object',
            description: 'fecha:hoy|ayer|mes|YYYY-MM-DD; pago:efectivo|tarjeta|bono',
            properties: {
              fecha: { type: 'string' },
              fisio: { type: 'string' },
              cliente: { type: 'string' },
              pago: { type: 'string' }
            }
          },
          groupBy: { type: 'string', enum: ['fisio', 'cliente', 'pago', 'fecha', 'none'] },
          aggregates: { type: 'array', items: { type: 'string', enum: ['count', 'sum_cantidad'] } },
          orderBy: { type: 'string', enum: ['fecha', 'hora', 'cantidad', 'cliente', 'fisio'] },
          orderDir: { type: 'string', enum: ['asc', 'desc'] },
          limit: { type: 'integer' }
        },
        required: ['modulo']
      }
    }
  }, {
    type: 'function',
    function: {
      name: 'editar_registros',
      description: 'Edita registros existentes en la hoja (solo admin, tope 10). Exige que el usuario confirme por escrito el número exacto de registros a modificar.',
      parameters: {
        type: 'object',
        properties: {
          modulo: { type: 'string', enum: modulosPermitidos },
          filtros: { type: 'object', description: 'Seleccion: fecha(hoy|ayer|mes|YYYY-MM-DD), fisio, cliente, pago(efectivo|tarjeta|bono)' },
          campos: { type: 'object', description: 'Cambios: fecha, hora, cliente, fisio, cantidad, pago, operacion' },
          confirmacion: { type: 'integer', description: 'Numero de registros que el usuario confirmó por escrito' }
        },
        required: ['modulo', 'campos', 'confirmacion']
      }
    }
  }, {
    type: 'function',
    function: {
      name: 'crear_registro',
      description: 'Crea un registro nuevo en la hoja (solo admin). Exige confirmacion explicita del usuario antes de llamarla.',
      parameters: {
        type: 'object',
        properties: {
          modulo: { type: 'string', enum: modulosPermitidos },
          datos: { type: 'object', description: 'Datos: fecha, hora, cliente, fisio, cantidad, pago, operacion. cliente obligatorio' },
          confirmacion: { type: 'boolean', description: 'true solo si el usuario confirmó' }
        },
        required: ['modulo', 'datos', 'confirmacion']
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
  ].concat(obtenerHistorial().slice(-4)).concat([{ role: 'user', content: pregunta }]);

  var ultimoError = '';
  function registrarError(texto) {
    if (!texto) return;
    if (ultimoError.indexOf(texto) !== -1) return;
    var lista = ultimoError ? ultimoError.split(' | ') : [];
    lista.push(String(texto).slice(0, 300));
    if (lista.length > 4) lista.shift();
    ultimoError = lista.join(' | ');
  }
  for (var intento = 0; intento < 3; intento++) {
    for (var m = 0; m < modelos.length; m++) {
      try {
        var data = llamarGroq(modelos[m], messages, true);
        if (data && data.error) { registrarError(data.error.message || JSON.stringify(data.error)); continue; }
        if (!data || !data.choices || !data.choices[0]) continue;
        var msg = data.choices[0].message;
        if (data.choices[0].finish_reason === 'length') { registrarError('respuesta truncada por tokens'); }

        var usoTool = false;
        messages.push(msg);
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          usoTool = true;
          for (var tc = 0; tc < msg.tool_calls.length; tc++) {
            var call = msg.tool_calls[tc];
            var contenidoTool = 'Herramienta desconocida.';
            if (call.function) {
              var nombreTool = call.function.name;
              var args = null;
              try { args = JSON.parse(call.function.arguments || '{}'); } catch (pe) { args = {}; }
              if (nombreTool === 'query_sheet') {
                contenidoTool = JSON.stringify(executeQuery(args));
              } else if (nombreTool === 'editar_registros') {
                contenidoTool = JSON.stringify(ejecutarEdicion(args));
              } else if (nombreTool === 'crear_registro') {
                contenidoTool = JSON.stringify(ejecutarCreacion(args));
              }
            }
            messages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: contenidoTool
            });
          }
        }

        var textoFinal = msg.content;
        if (!textoFinal && usoTool) {
          // Pasada final SIN tools para cerrar la respuesta con los datos reales
          var dataFinal = llamarGroq(modelos[m], messages, false);
          if (dataFinal && dataFinal.error) {
            registrarError(dataFinal.error.message || JSON.stringify(dataFinal.error));
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
        registrarError((e && e.message) ? e.message : String(e));
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