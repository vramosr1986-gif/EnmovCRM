function assertModuloValido(modulo) {
  if (!SHEETS[modulo]) {
    throw new Error('Modulo invalido: ' + modulo);
  }
}

function getSpreadsheetByModulo(modulo) {
  assertModuloValido(modulo);
  const id = SHEETS[modulo].spreadsheetId;
  if (!id || id.indexOf('REPLACE_') === 0) {
    throw new Error('SpreadsheetId no configurado para modulo: ' + modulo);
  }
  return SpreadsheetApp.openById(id);
}

function fechaActual() {
  const zona = Session.getScriptTimeZone() || 'Europe/Madrid';
  return Utilities.formatDate(new Date(), zona, 'dd/MM/yyyy');
}

function escaparHtml(valor) {
  return String(valor == null ? '' : valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function convertirImporte(valor) {
  if (valor === null || valor === undefined || valor === '') {
    return 0;
  }

  var texto = String(valor)
    .trim()
    .replace(/[€$]/g, '')
    .replace(/\s/g, '');

  if (texto.includes(',') && texto.includes('.')) {
    texto = texto.replace(/\./g, '').replace(',', '.');
  } else if (texto.includes(',')) {
    texto = texto.replace(',', '.');
  }

  const importe = Number(texto);
  return isNaN(importe) ? 0 : importe;
}

function obtenerValorPorNombre(fila, nombres, valorPorDefecto) {
  const claveEncontrada = Object.keys(fila).find(function(clave) {
    const normalizada = clave
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
    return nombres.some(function(nombre) {
      return normalizada === nombre;
    });
  });

  return claveEncontrada ? fila[claveEncontrada] : valorPorDefecto;
}

function redondear(numero) {
  return Math.round((Number(numero) + Number.EPSILON) * 100) / 100;
}

function getModuloAppConfig(modulo) {
  const app = APPS.find(function(item) {
    return item.id === modulo;
  });
  if (!app) {
    throw new Error('Modulo no configurado: ' + modulo);
  }
  return app;
}

function diagnosticoConfiguracionHojas() {
  const resultado = Object.keys(SHEETS || {}).map(function(modulo) {
    const cfg = SHEETS[modulo] || {};
    const entrada = {
      modulo: modulo,
      spreadsheetId: cfg.spreadsheetId || '',
      sheetGid: cfg.sheetGid != null ? cfg.sheetGid : '',
      sheetName: cfg.sheetName || ''
    };
    try {
      const ss = getSpreadsheetByModulo(modulo);
      const hoja = getHojaDatosPrincipal(modulo);
      entrada.archivo = ss.getName();
      entrada.hojaResuelta = hoja.getName();
      entrada.sheetIdReal = hoja.getSheetId();
      entrada.ultimaFila = hoja.getLastRow();
      entrada.primerosHeaders = hoja.getRange(1, 1, 1, Math.min(hoja.getLastColumn(), 10)).getValues()[0].join(' | ');
    } catch (e) {
      entrada.error = e.message;
    }
    return entrada;
  });
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}
