function getDashboardData(token, modulo) {
  const sesion = requireAuthorizedSession(token, modulo);
  const app = getModuloAppConfig(modulo);
  const grid = getGridDataByModulo(modulo);
  const filtrado = filtrarGridPorFisio(grid, sesion.fisioFiltro);

  return {
    modulo: modulo,
    nombre: app.nombre,
    allowsInvoice: !!app.allowsInvoice,
    headers: filtrado.headers,
    rows: filtrado.rows,
    rowIndexMap: filtrado.rowIndexMap
  };
}

function actualizarRegistro(token, modulo, indiceFila, nuevosDatos) {
  const sesion = requireAuthorizedSession(token, modulo);
  verificarPropiedadFilaFisio(modulo, indiceFila, sesion.fisioFiltro);

  const row = Number(indiceFila);
  const grid = getGridDataByModulo(modulo);
  const headers = grid.headers;
  const antes = {};
  headers.forEach(function(cabecera, i) {
    antes[cabecera] = grid.rows[row][i] == null ? '' : grid.rows[row][i];
  });

  actualizarFilaModulo(modulo, indiceFila, nuevosDatos);

  const despues = {};
  headers.forEach(function(cabecera, i) {
    despues[cabecera] = nuevosDatos[i] == null ? '' : nuevosDatos[i];
  });

  registrarAccionAuditoria(
    sesion,
    modulo,
    'EDITAR',
    row + 2,
    resumirCambiosAuditoria(antes, despues),
    antes,
    despues
  );
  return true;
}

function crearRegistro(token, modulo, datosFila) {
  const sesion = requireAuthorizedSession(token, modulo);
  if (sesion.fisioFiltro) {
    const grid = getGridDataByModulo(modulo);
    const colIdx = getColumnaFisioIdx(grid.headers);
    if (colIdx >= 0) {
      datosFila[colIdx] = sesion.fisioFiltro;
    }
  }

  const grid = getGridDataByModulo(modulo);
  const headers = grid.headers;
  crearFilaModulo(modulo, datosFila);

  const filaReal = getHojaDatosPrincipal(modulo).getLastRow();
  const despues = {};
  headers.forEach(function(cabecera, i) {
    despues[cabecera] = datosFila[i] == null ? '' : datosFila[i];
  });

  registrarAccionAuditoria(sesion, modulo, 'CREAR', filaReal, 'Nuevo registro creado', null, despues);
  return true;
}

function eliminarRegistro(token, modulo, indiceFila) {
  const sesion = requireAuthorizedSession(token, modulo);
  verificarPropiedadFilaFisio(modulo, indiceFila, sesion.fisioFiltro);

  const resultado = eliminarFilaModuloConDatos(modulo, indiceFila);

  registrarAccionAuditoria(sesion, modulo, 'ELIMINAR', resultado.filaReal, 'Registro eliminado', resultado.antes, null);
  return true;
}

function eliminarRegistrosDuplicados(token, modulo, indicesFila) {
  const sesion = requireAuthorizedSession(token, modulo);
  if (!Array.isArray(indicesFila) || indicesFila.length === 0) {
    throw new Error('No hay registros duplicados que eliminar.');
  }

  const grid = getGridDataByModulo(modulo);
  if (sesion.fisioFiltro) {
    const colIdx = getColumnaFisioIdx(grid.headers);
    const objetivo = normalizarTexto(sesion.fisioFiltro);
    indicesFila.forEach(function(indiceFila) {
      const row = Number(indiceFila);
      if (!Number.isInteger(row) || row < 0 || row >= grid.rows.length) {
        throw new Error('Indice de fila no valido.');
      }
      const valor = colIdx >= 0 ? normalizarTexto(grid.rows[row][colIdx]) : '';
      if (valor !== objetivo) {
        throw new Error('No tienes permiso sobre uno de los registros.');
      }
    });
  }

  const eliminadas = eliminarFilasModulo(modulo, indicesFila);

  eliminadas.forEach(function(f) {
    registrarAccionAuditoria(sesion, modulo, 'ELIMINAR', f.filaReal, 'Registro eliminado (grupo duplicado)', f.antes, null);
  });

  return eliminadas;
}

function abrirFormularioFactura(token, modulo, indiceFila) {
  const sesion = requireAuthorizedSession(token, modulo);
  verificarPropiedadFilaFisio(modulo, indiceFila, sesion.fisioFiltro);

  const app = getModuloAppConfig(modulo);
  if (!app.allowsInvoice) {
    throw new Error('Este modulo no admite facturas.');
  }

  const fila = obtenerFilaComoObjetoModulo(modulo, indiceFila);
  const nombre = obtenerValorPorNombre(fila, ['nombre', 'cliente', 'paciente', 'usuario', 'persona'], '');
  const dni = obtenerValorPorNombre(fila, ['dni', 'nif', 'documento'], '');
  const direccion = obtenerValorPorNombre(fila, ['direccion', 'domicilio'], '');
  const concepto = obtenerValorPorNombre(fila, ['concepto', 'servicio', 'descripcion'], 'Sesion de fisioterapia');
  const importeTexto = obtenerValorPorNombre(
    fila,
    ['importe', 'precio', 'pago', 'cantidad', 'total', 'base', 'base imponible', 'subtotal'],
    0
  );

  return {
    nombre: nombre,
    dni: dni,
    direccion: direccion,
    concepto: concepto,
    importe: convertirImporte(importeTexto),
    fecha: fechaActual(),
    numeroFactura: modulo.toUpperCase() + '-' + new Date().getFullYear() + '-' + String(Number(indiceFila) + 1),
    emisorNif: app.emisorNif || '',
    ivaPorcentaje: DEFAULT_IVA_PCT,
    irpfPorcentaje: DEFAULT_IRPF_PCT
  };
}

function generarFacturaDesdeFormulario(token, modulo, datos) {
  requireAuthorizedSession(token, modulo);

  const app = getModuloAppConfig(modulo);
  if (!app.allowsInvoice) {
    throw new Error('Este modulo no admite facturas.');
  }

  const base = convertirImporte(datos && datos.importe);
  if (base <= 0) {
    throw new Error('El importe debe ser mayor que cero.');
  }

  const ivaPorcentaje = Number(datos.ivaPorcentaje);
  const irpfPorcentaje = Number(datos.irpfPorcentaje);
  const ivaPct = isNaN(ivaPorcentaje) ? DEFAULT_IVA_PCT : ivaPorcentaje;
  const irpfPct = isNaN(irpfPorcentaje) ? DEFAULT_IRPF_PCT : irpfPorcentaje;

  const ivaImporte = redondear(base * ivaPct / 100);
  const irpfImporte = redondear(base * irpfPct / 100);
  const total = redondear(base + ivaImporte - irpfImporte);

  const paquete = {
    modulo: modulo,
    nombreModulo: app.nombre,
    logoUrl: app.logoUrl || '',
    nombre: (datos && datos.nombre) || '',
    dni: (datos && datos.dni) || '',
    direccion: (datos && datos.direccion) || '',
    concepto: (datos && datos.concepto) || 'Sesion de fisioterapia',
    fecha: (datos && datos.fecha) || fechaActual(),
    numeroFactura: (datos && datos.numeroFactura) || (modulo.toUpperCase() + '-' + new Date().getFullYear()),
    nif: (datos && datos.emisorNif) || app.emisorNif || '',
    baseImponible: base.toFixed(2),
    ivaPorcentaje: ivaPct,
    ivaImporte: ivaImporte.toFixed(2),
    irpfPorcentaje: irpfPct,
    irpfImporte: irpfImporte.toFixed(2),
    totalFactura: total.toFixed(2)
  };

  const pdf = generarFacturaPDF(paquete);
  return {
    fileName: pdf.getName(),
    mimeType: 'application/pdf',
    contentBase64: Utilities.base64Encode(pdf.getBytes())
  };
}

function generarFacturaPDF(paquete) {
  const logoHtml = paquete.logoUrl
    ? '<div class="logo-container"><img class="logo" src="' + escaparHtml(paquete.logoUrl) + '" alt="Logo"></div>'
    : '';

  const html =
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>' +
    '@page{size:A4;margin:18mm;}body{font-family:Arial,sans-serif;color:#333;font-size:12px;margin:0;}' +
    '.cabecera{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #3d6f86;padding-bottom:15px;margin-bottom:25px;}' +
    '.cabecera-left{display:flex;gap:18px;align-items:flex-start;}.logo{max-height:70px;width:auto;display:block;}' +
    'h1{color:#3d6f86;margin:0 0 8px;font-size:25px;}h2{color:#3d6f86;font-size:13px;border-bottom:1px solid #3d6f86;padding-bottom:5px;margin-top:22px;}' +
    'table{width:100%;border-collapse:collapse;}.datos td{padding:5px 0;vertical-align:top;}' +
    '.detalle th{background:#f1f3f5;text-align:left;padding:8px;border-bottom:1px solid #ccc;}.detalle td{padding:10px 8px;border-bottom:1px solid #ddd;}' +
    '.derecha{text-align:right;}.totales{width:300px;margin-left:auto;margin-top:20px;}.totales td{padding:6px;}' +
    '.total{color:#3d6f86;font-size:15px;font-weight:bold;border-top:2px solid #3d6f86;}.pie{margin-top:45px;text-align:center;color:#888;font-size:10px;border-top:1px solid #ddd;padding-top:10px;}' +
    '</style></head><body>' +
    '<div class="cabecera"><div class="cabecera-left">' + logoHtml +
    '<div><h1>FACTURA</h1><div><strong>N.o de factura:</strong> ' + escaparHtml(paquete.numeroFactura) + '</div>' +
    '<div><strong>Fecha de emision:</strong> ' + escaparHtml(paquete.fecha) + '</div>' +
    '<div><strong>Modulo:</strong> ' + escaparHtml(paquete.nombreModulo) + '</div></div></div>' +
    '<div class="derecha"><strong>CRM - MAVIC</strong><br><span>NIF/NIE: ' + escaparHtml(paquete.nif) + '</span></div></div>' +
    '<h2>Datos del cliente</h2><table class="datos">' +
    '<tr><td style="width:25%;"><strong>Nombre:</strong></td><td>' + escaparHtml(paquete.nombre) + '</td></tr>' +
    '<tr><td><strong>DNI/NIF:</strong></td><td>' + escaparHtml(paquete.dni) + '</td></tr>' +
    '<tr><td><strong>Direccion:</strong></td><td>' + escaparHtml(paquete.direccion) + '</td></tr>' +
    '</table>' +
    '<h2>Detalle del servicio</h2><table class="detalle"><thead><tr><th>Concepto</th><th class="derecha">Importe</th></tr></thead>' +
    '<tbody><tr><td>' + escaparHtml(paquete.concepto) + '</td><td class="derecha">' + paquete.baseImponible + ' EUR</td></tr></tbody></table>' +
    '<table class="totales"><tr><td>Base imponible:</td><td class="derecha">' + paquete.baseImponible + ' EUR</td></tr>' +
    '<tr><td>IVA (' + paquete.ivaPorcentaje + '%):</td><td class="derecha">' + paquete.ivaImporte + ' EUR</td></tr>' +
    '<tr><td>IRPF (' + paquete.irpfPorcentaje + '%):</td><td class="derecha">-' + paquete.irpfImporte + ' EUR</td></tr>' +
    '<tr class="total"><td>TOTAL A PAGAR:</td><td class="derecha">' + paquete.totalFactura + ' EUR</td></tr></table>' +
    '<div class="pie">CRM - MAVIC · Documento generado electronicamente</div></body></html>';

  const blob = HtmlService.createHtmlOutput(html).getAs(MimeType.PDF);

  const nombreCliente = String(paquete.nombre || 'Cliente').replace(/[^\w\s-]/g, '_').trim();
  const numeroFactura = String(paquete.numeroFactura || 'Factura').replace(/[^\w-]/g, '_');
  blob.setName('Factura_' + numeroFactura + '_' + nombreCliente + '.pdf');
  return blob;
}

function exportarFiltradoExcel(token, modulo, payload) {
  requireAuthorizedSession(token, modulo);

  const app = getModuloAppConfig(modulo);
  const headers = Array.isArray(payload && payload.headers) ? payload.headers : [];
  const rows = Array.isArray(payload && payload.rows) ? payload.rows : [];
  const amountColIdx = Number(payload && payload.amountColIdx);
  const totalAmount = Number(payload && payload.totalAmount);
  const titulo = String((payload && payload.title) || app.nombre || modulo);

  const logoHtml = app.logoUrl
    ? '<img src="' + escaparHtml(app.logoUrl) + '" style="width:1.26in;height:0.63in;display:block;object-fit:contain;">'
    : '';

  let table = '<table><thead><tr>';
  headers.forEach(function(h) {
    table += '<th>' + escaparHtml(h) + '</th>';
  });
  table += '</tr></thead><tbody>';

  rows.forEach(function(row) {
    table += '<tr>';
    headers.forEach(function(_, i) {
      table += '<td>' + escaparHtml(row[i] == null ? '' : row[i]) + '</td>';
    });
    table += '</tr>';
  });

  if (!isNaN(amountColIdx) && amountColIdx >= 0) {
    table += '<tr class="total-row">';
    headers.forEach(function(_, i) {
      if (i === 0) {
        table += '<td><strong>Total filtrado</strong></td>';
      } else if (i === amountColIdx && !isNaN(totalAmount)) {
        table += '<td><strong>' + escaparHtml(totalAmount.toFixed(2)) + '</strong></td>';
      } else {
        table += '<td></td>';
      }
    });
    table += '</tr>';
  }

  table += '</tbody></table>';

  const html =
    '<html><head><meta charset="UTF-8"><style>' +
    'body{font-family:Segoe UI,Arial,sans-serif;color:#22333d;font-size:12px;padding:18px;}' +
    '.head{width:100%;border-collapse:collapse;border-bottom:2px solid #4a6a7a;margin-bottom:10px;}' +
    '.head td{border:none;padding:0 0 8px 0;vertical-align:middle;}' +
    '.head .right{text-align:right;}' +
    '.title{font-size:18px;font-weight:700;color:#2f5668;}' +
    '.meta{font-size:11px;color:#4f6470;margin-top:4px;}' +
    'table{border-collapse:collapse;width:100%;margin-top:8px;}' +
    'th,td{border:1px solid #d5e1e8;padding:6px 8px;text-align:left;}' +
    'th{background:#edf4f8;color:#2f4d5c;}' +
    '.total-row td{background:#f6fbff;}' +
    '</style></head><body>' +
    '<table class="head"><tr><td><div class="title">CRM - MAVIC - ' + escaparHtml(titulo) + '</div>' +
    '<div class="meta">Exportado: ' + escaparHtml(fechaActual()) + '</div></td><td class="right">' + logoHtml + '</td></tr></table>' +
    table +
    '</body></html>';

  const blob = Utilities.newBlob(html, 'application/vnd.ms-excel', 'Export_' + titulo.replace(/[^\w\s-]/g, '_') + '.xls');
  return {
    fileName: blob.getName(),
    mimeType: 'application/vnd.ms-excel',
    contentBase64: Utilities.base64Encode(blob.getBytes())
  };
}

function obtenerSesionesCalendario(token, desdeISO, hastaISO, moduloFiltro) {
  const sesion = requireSession(token);
  const permitidos = sesion.modules || [];
  const filtro = String(moduloFiltro || '').trim();

  const modulos = filtro ? [filtro] : permitidos;

  const sesiones = [];

  modulos.forEach(function(modId) {
    if (permitidos.indexOf(modId) === -1) {
      return;
    }

    const app = getModuloAppConfig(modId);
    const grid = getGridDataByModulo(modId);
    const headers = grid.headers;

    const fechaIdx = indiceColumnaPorPatron(headers, [
      'fecha de la sesion',
      'fecha sesion',
      'fecha de sesion',
      'fecha'
    ]);
    const horaIdx = indiceColumnaPorPatron(headers, [
      'hora de la sesion',
      'hora sesion',
      'hora de sesion',
      'hora'
    ]);
    const clienteIdx = indiceColumnaPorPatron(headers, [
      'cliente',
      'nombre del cliente',
      'nombre',
      'paciente',
      'usuario'
    ]);
    const fisioIdx = getColumnaFisioIdx(headers);
    const objetivoFisio = sesion.fisioFiltro ? normalizarTexto(sesion.fisioFiltro) : '';

    grid.rows.forEach(function(row) {
      if (fechaIdx < 0) {
        return;
      }
      const fechaKey = formatoFechaKey(String(row[fechaIdx] || '').trim());
      if (!fechaKey) {
        return;
      }
      if (desdeISO && fechaKey < desdeISO) {
        return;
      }
      if (hastaISO && fechaKey > hastaISO) {
        return;
      }
      if (objetivoFisio) {
        const valorFisio = fisioIdx >= 0 ? normalizarTexto(row[fisioIdx]) : '';
        if (valorFisio !== objetivoFisio) {
          return;
        }
      }

      sesiones.push({
        fecha: fechaKey,
        hora: horaIdx >= 0 ? String(row[horaIdx] || '') : '',
        cliente: clienteIdx >= 0 ? String(row[clienteIdx] || '') : '',
        fisio: fisioIdx >= 0 ? String(row[fisioIdx] || '') : '',
        modulo: modId,
        moduloNombre: app.nombre || modId
      });
    });
  });

  return { sesiones: sesiones };
}

function formatoFechaKey(valor) {
  const dd = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor);
  if (dd) {
    return dd[3] + '-' + dd[2] + '-' + dd[1];
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return valor;
  }
  return '';
}

function indiceColumnaPorPatron(headers, patrones) {
  for (let i = 0; i < headers.length; i++) {
    const key = normalizarTexto(headers[i]);
    const keyConGuion = key.replace(/\s+/g, '_');
    for (let p = 0; p < patrones.length; p++) {
      if (key === patrones[p] || keyConGuion === patrones[p]) {
        return i;
      }
    }
  }
  return -1;
}
