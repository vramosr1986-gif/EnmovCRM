function getHojaDatosPrincipal(modulo) {
  const ss = getSpreadsheetByModulo(modulo);
  const cfg = SHEETS[modulo] || {};

  if (cfg.sheetGid != null) {
    const byGid = ss.getSheets().find(function(s) {
      return s.getSheetId() === Number(cfg.sheetGid);
    });
    if (byGid) {
      return byGid;
    }
  }

  if (cfg.sheetName) {
    const byName = ss.getSheetByName(cfg.sheetName);
    if (byName) {
      return byName;
    }
  }

  const hoja = ss.getSheets()[0];
  if (!hoja) {
    throw new Error('No hay hojas en el spreadsheet para modulo: ' + modulo);
  }
  return hoja;
}

function getGridDataByModulo(modulo) {
  const hoja = getHojaDatosPrincipal(modulo);
  const values = hoja.getDataRange().getDisplayValues();
  if (!values || values.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = values[0].map(function(h, i) {
    const key = String(h || '').trim();
    return key || ('Columna ' + (i + 1));
  });

  return {
    headers: headers,
    rows: values.slice(1)
  };
}

function normalizarTexto(valor) {
  return String(valor == null ? '' : valor)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getColumnaFisioIdx(headers) {
  const exactos = ['fisio_de_sesion', 'fisio', 'profesional', 'terapeuta'];
  for (var i = 0; i < headers.length; i++) {
    const key = normalizarTexto(headers[i]).replace(/\s+/g, '_');
    if (exactos.indexOf(key) !== -1) {
      return i;
    }
  }
  for (var j = 0; j < headers.length; j++) {
    const key = normalizarTexto(headers[j]);
    if (/(fisio|profesional|terapeuta)/.test(key)) {
      return j;
    }
  }
  return -1;
}

function getColumnaClienteIdx(headers) {
  var exactos = ['cliente', 'nombre', 'paciente', 'usuario'];
  for (var i = 0; i < headers.length; i++) {
    const key = normalizarTexto(headers[i]).replace(/\s+/g, '_');
    if (exactos.indexOf(key) !== -1) {
      return i;
    }
  }
  for (var j = 0; j < headers.length; j++) {
    const key = normalizarTexto(headers[j]);
    if (/(cliente|nombre|paciente|usuario)/.test(key)) {
      return j;
    }
  }
  return -1;
}

function getColumnaCantidadIdx(headers) {
  for (var i = 0; i < headers.length; i++) {
    if (normalizarTexto(headers[i]) === 'cantidad') {
      return i;
    }
  }
  return -1;
}

function getColumnaFechaIdx(headers) {
  var exactos = ['fecha de la sesion', 'fecha sesion', 'fecha de sesion', 'fecha'];
  for (var i = 0; i < headers.length; i++) {
    if (exactos.indexOf(normalizarTexto(headers[i])) !== -1) {
      return i;
    }
  }
  for (var j = 0; j < headers.length; j++) {
    if (/(fecha|dia)/.test(normalizarTexto(headers[j]))) {
      return j;
    }
  }
  return -1;
}

function getColumnaHoraIdx(headers) {
  var exactos = ['hora de la sesion', 'hora sesion', 'hora de sesion', 'hora'];
  for (var i = 0; i < headers.length; i++) {
    if (exactos.indexOf(normalizarTexto(headers[i])) !== -1) {
      return i;
    }
  }
  for (var j = 0; j < headers.length; j++) {
    if (/(hora)/.test(normalizarTexto(headers[j]))) {
      return j;
    }
  }
  return -1;
}

function getColumnaOperacionIdx(headers) {
  for (var i = 0; i < headers.length; i++) {
    const key = normalizarTexto(headers[i]);
    if (/(numero operacion|numero de operacion|n.? operacion|operacion)/.test(key)) {
      return i;
    }
  }
  return -1;
}

function normalizarFechaClave(valor) {
  var texto = String(valor == null ? '' : valor).trim();
  var dd = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(texto);
  if (dd) {
    return dd[3] + '-' + pad2Num(Number(dd[2])) + '-' + pad2Num(Number(dd[1]));
  }
  var iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (iso) {
    return iso[1] + '-' + iso[2] + '-' + iso[3];
  }
  return normalizarTexto(texto);
}

function normalizarHoraClave(valor) {
  var texto = String(valor == null ? '' : valor).trim();
  var m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(texto);
  if (m) {
    return pad2Num(Number(m[1])) + ':' + pad2Num(Number(m[2])) + ':' + pad2Num(Number(m[3] || 0));
  }
  return normalizarTexto(texto);
}

function pad2Num(n) {
  return String(n).length === 1 ? '0' + n : String(n);
}

function esColumnaIgnorableDuplicado(headers, idx) {
  if (idx === getColumnaFechaIdx(headers) || idx === getColumnaHoraIdx(headers) ||
      idx === getColumnaFisioIdx(headers) || idx === getColumnaOperacionIdx(headers)) {
    return true;
  }
  const key = normalizarTexto(headers[idx] || '');
  return /(marca temporal|timestamp|comentario|comentarios|observaciones|notas|quien cobra|quien_cobra)/.test(key);
}

function verificarDuplicadoFila(modulo, nuevosDatos, indiceAExcluir) {
  const grid = getGridDataByModulo(modulo);
  const headers = grid.headers;

  const fechaIdx = getColumnaFechaIdx(headers);
  const horaIdx = getColumnaHoraIdx(headers);
  if (fechaIdx < 0 || horaIdx < 0) {
    return -1;
  }

  const cantidadIdx = getColumnaCantidadIdx(headers);
  const cantidadNueva = String(nuevosDatos[cantidadIdx] == null ? '' : nuevosDatos[cantidadIdx]).trim();
  const numNueva = esNumericoValido(nuevosDatos[cantidadIdx]) ? Number(normalizarNumero(nuevosDatos[cantidadIdx])) : null;
  if (cantidadIdx >= 0 && (cantidadNueva === '' || numNueva === null || numNueva === 0)) {
    return -1;
  }

  const fechaNueva = normalizarFechaClave(nuevosDatos[fechaIdx]);
  const horaNueva = normalizarHoraClave(nuevosDatos[horaIdx]);
  const fisioNueva = getColumnaFisioIdx(headers) >= 0 ? normalizarTexto(nuevosDatos[getColumnaFisioIdx(headers)]) : '';
  const operNueva = getColumnaOperacionIdx(headers) >= 0 ? normalizarTexto(nuevosDatos[getColumnaOperacionIdx(headers)]) : '';
  if (!fechaNueva || !horaNueva) {
    return -1;
  }

  const pairNueva = headers.map(function(_, i) {
    return esColumnaIgnorableDuplicado(headers, i) ? '' : normalizarTexto(nuevosDatos[i]);
  }).join('||');

  for (var i = 0; i < grid.rows.length; i++) {
    if (indiceAExcluir != null && i === Number(indiceAExcluir)) {
      continue;
    }
    const fila = grid.rows[i];
    const fechaExistente = normalizarFechaClave(fila[fechaIdx]);
    const horaExistente = normalizarHoraClave(fila[horaIdx]);
    const fisioExistente = getColumnaFisioIdx(headers) >= 0 ? normalizarTexto(fila[getColumnaFisioIdx(headers)]) : '';
    const operExistente = getColumnaOperacionIdx(headers) >= 0 ? normalizarTexto(fila[getColumnaOperacionIdx(headers)]) : '';
    if (!fechaExistente || !horaExistente) {
      continue;
    }
    if (fechaExistente !== fechaNueva || horaExistente !== horaNueva ||
        fisioExistente !== fisioNueva || operExistente !== operNueva) {
      continue;
    }
    const cantidadExistente = String(fila[cantidadIdx] == null ? '' : fila[cantidadIdx]).trim();
    const numExistente = esNumericoValido(fila[cantidadIdx]) ? Number(normalizarNumero(fila[cantidadIdx])) : null;
    if (cantidadIdx >= 0 && (cantidadExistente === '' || numExistente === null || numExistente === 0)) {
      continue;
    }
    const pairExistente = headers.map(function(_, j) {
      return esColumnaIgnorableDuplicado(headers, j) ? '' : normalizarTexto(fila[j]);
    }).join('||');
    if (pairExistente === pairNueva) {
      return i;
    }
  }

  return -1;
}

function normalizarNumero(valor) {
  var texto = String(valor == null ? '' : valor).trim().replace(/[\u20ac$]/g, '').replace(/\s/g, '');
  if (texto.indexOf(',') !== -1 && texto.indexOf('.') !== -1) {
    texto = texto.replace(/\./g, '').replace(',', '.');
  } else if (texto.indexOf(',') !== -1) {
    texto = texto.replace(',', '.');
  }
  return texto;
}

function esNumericoValido(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === '') {
    return false;
  }
  var texto = String(valor).trim().replace(/[\u20ac$]/g, '').replace(/\s/g, '');
  if (texto.indexOf(',') !== -1 && texto.indexOf('.') !== -1) {
    texto = texto.replace(/\./g, '').replace(',', '.');
  } else if (texto.indexOf(',') !== -1) {
    texto = texto.replace(',', '.');
  }
  return texto !== '' && !isNaN(Number(texto));
}

function validarCantidadEnFila(modulo, datosFila) {
  const grid = getGridDataByModulo(modulo);
  const colIdx = getColumnaCantidadIdx(grid.headers);
  if (colIdx < 0) {
    return;
  }

  if (!esNumericoValido(datosFila[colIdx])) {
    throw new Error('El campo "Cantidad" debe ser numerico.');
  }
}

function filtrarGridPorFisio(grid, fisioNombre) {
  if (!fisioNombre) {
    return {
      headers: grid.headers,
      rows: grid.rows,
      rowIndexMap: grid.rows.map(function(_, idx) { return idx; })
    };
  }

  const colIdx = getColumnaFisioIdx(grid.headers);
  const objetivo = normalizarTexto(fisioNombre);
  const rows = [];
  const rowIndexMap = [];

  grid.rows.forEach(function(row, idx) {
    const valor = colIdx >= 0 ? normalizarTexto(row[colIdx]) : '';
    if (valor === objetivo) {
      rows.push(row);
      rowIndexMap.push(idx);
    }
  });

  return { headers: grid.headers, rows: rows, rowIndexMap: rowIndexMap };
}

function verificarPropiedadFilaFisio(modulo, indiceFila, fisioNombre) {
  if (!fisioNombre) {
    return;
  }

  const grid = getGridDataByModulo(modulo);
  const row = Number(indiceFila);
  if (!Number.isInteger(row) || row < 0 || row >= grid.rows.length) {
    throw new Error('Indice de fila no valido.');
  }

  const colIdx = getColumnaFisioIdx(grid.headers);
  const valor = colIdx >= 0 ? normalizarTexto(grid.rows[row][colIdx]) : '';
  if (valor !== normalizarTexto(fisioNombre)) {
    throw new Error('No tienes permiso sobre este registro.');
  }
}

function getFilasGenericoPorModulo(modulo) {
  const grid = getGridDataByModulo(modulo);
  if (grid.headers.length === 0) {
    return [];
  }

  return grid.rows.map(function(row, idx) {
    const obj = { _rowNumber: idx + 2 };
    grid.headers.forEach(function(key, i) {
      obj[key || ('col' + (i + 1))] = row[i];
    });
    return obj;
  });
}

function getResumenGenericoPorModulo(modulo) {
  const filas = getFilasGenericoPorModulo(modulo);
  return {
    modulo: modulo,
    totalFilas: filas.length,
    actualizado: new Date().toISOString()
  };
}

function conBloqueoEscritura(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error('El sistema esta ocupado guardando otro cambio. Intentalo de nuevo en unos segundos.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function actualizarFilaModulo(modulo, indiceFila, nuevosDatos) {
  if (!Array.isArray(nuevosDatos) || nuevosDatos.length === 0) {
    throw new Error('Los datos de la fila no son validos.');
  }

  const row = Number(indiceFila);
  const filaReal = row + 2;
  if (!Number.isInteger(row) || filaReal < 2) {
    throw new Error('Indice de fila no valido.');
  }

  validarCantidadEnFila(modulo, nuevosDatos);

  const duplicadoIdx = verificarDuplicadoFila(modulo, nuevosDatos, row);
  if (duplicadoIdx >= 0) {
    throw new Error('No se puede guardar: este registro ya existe en la fila ' + (duplicadoIdx + 2) + '. Coinciden fecha, hora, fisio, cantidad y el resto de campos.');
  }

  return conBloqueoEscritura(function() {
    const hoja = getHojaDatosPrincipal(modulo);
    hoja.getRange(filaReal, 1, 1, nuevosDatos.length).setValues([nuevosDatos]);
    return true;
  });
}

function crearFilaModulo(modulo, datosFila) {
  if (!Array.isArray(datosFila) || datosFila.length === 0) {
    throw new Error('Los datos de la nueva fila no son validos.');
  }

  validarCantidadEnFila(modulo, datosFila);

  const duplicadoIdx = verificarDuplicadoFila(modulo, datosFila, null);
  if (duplicadoIdx >= 0) {
    throw new Error('No se puede crear: ya existe un registro identico en la fila ' + (duplicadoIdx + 2) + '. Coinciden fecha, hora, fisio, cantidad y el resto de campos.');
  }

  return conBloqueoEscritura(function() {
    const hoja = getHojaDatosPrincipal(modulo);
    const totalColumnas = hoja.getLastColumn();
    const fila = [];

    for (var i = 0; i < totalColumnas; i++) {
      fila[i] = i < datosFila.length ? (datosFila[i] || '') : '';
    }

    hoja.appendRow(fila);
    return true;
  });
}

function obtenerHeadersDeValores(valores) {
  return (valores && valores[0]) ? valores[0].map(function(h, i) {
    const key = String(h || '').trim();
    return key || ('Columna ' + (i + 1));
  }) : [];
}

function filaRealADatos(hoja, filaReal) {
  const rango = hoja.getRange(filaReal, 1, 1, hoja.getLastColumn());
  const valores = rango.getValues()[0];
  const headers = obtenerHeadersDeValores(hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues());
  const datos = {};
  headers.forEach(function(cabecera, i) {
    datos[cabecera] = valores[i] == null ? '' : valores[i];
  });
  return datos;
}

function eliminarFilaModulo(modulo, indiceFila) {
  const row = Number(indiceFila);
  const filaReal = row + 2;
  if (!Number.isInteger(row) || filaReal < 2) {
    throw new Error('Indice de fila no valido.');
  }

  return conBloqueoEscritura(function() {
    const hoja = getHojaDatosPrincipal(modulo);
    if (filaReal > hoja.getLastRow()) {
      throw new Error('La fila indicada no existe.');
    }

    hoja.deleteRow(filaReal);
    return true;
  });
}

function eliminarFilaModuloConDatos(modulo, indiceFila) {
  const row = Number(indiceFila);
  const filaReal = row + 2;
  if (!Number.isInteger(row) || filaReal < 2) {
    throw new Error('Indice de fila no valido.');
  }

  return conBloqueoEscritura(function() {
    const hoja = getHojaDatosPrincipal(modulo);
    const ultimaFila = hoja.getLastRow();
    if (filaReal > ultimaFila) {
      throw new Error('La fila indicada no existe.');
    }

    const antes = filaRealADatos(hoja, filaReal);
    hoja.deleteRow(filaReal);
    return { filaReal: filaReal, antes: antes };
  });
}

function eliminarFilasModulo(modulo, indicesFila) {
  if (!Array.isArray(indicesFila) || indicesFila.length === 0) {
    throw new Error('No hay filas que eliminar.');
  }

  const nums = indicesFila.map(Number).filter(function(n) {
    return Number.isInteger(n) && n >= 0;
  });

  if (!nums.length) {
    throw new Error('Indices de fila no validos.');
  }

  return conBloqueoEscritura(function() {
    const hoja = getHojaDatosPrincipal(modulo);
    const ultimaFila = hoja.getLastRow();
    const filasReales = nums
      .map(function(row) { return row + 2; })
      .filter(function(f) { return f >= 2 && f <= ultimaFila; });

    const unicas = filasReales.filter(function(v, i, arr) { return arr.indexOf(v) === i; });
    if (!unicas.length) {
      throw new Error('Ninguna fila indicada existe.');
    }

    const eliminadas = unicas.map(function(fr) {
      return { filaReal: fr, antes: filaRealADatos(hoja, fr) };
    });

    unicas.sort(function(a, b) { return b - a; });
    unicas.forEach(function(fr) {
      hoja.deleteRow(fr);
    });

    return eliminadas;
  });
}

function obtenerFilaComoObjetoModulo(modulo, indiceFila) {
  const grid = getGridDataByModulo(modulo);
  const row = Number(indiceFila);
  if (!Number.isInteger(row) || row < 0 || row >= grid.rows.length) {
    throw new Error('Indice de fila no valido.');
  }

  const valores = grid.rows[row];
  const fila = {};

  grid.headers.forEach(function(cabecera, i) {
    fila[cabecera] = valores[i] || '';
  });

  return fila;
}
