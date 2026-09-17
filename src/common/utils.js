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
