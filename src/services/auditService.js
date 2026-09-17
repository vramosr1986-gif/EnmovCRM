const AUDIT_SHEET_NAME = 'Auditoria';
const AUDIT_HEADERS = ['Fecha_Hora', 'Usuario', 'Rol', 'Modulo', 'Accion', 'Fila', 'Detalle', 'Datos_Antes', 'Datos_Despues'];

function getAuditSheet(modulo) {
  const ss = getSpreadsheetByModulo(modulo);
  let hoja = ss.getSheetByName(AUDIT_SHEET_NAME);
  if (!hoja) {
    hoja = ss.insertSheet(AUDIT_SHEET_NAME);
    hoja.setFrozenRows(1);
    hoja.appendRow(AUDIT_HEADERS);
    hoja.getRange(1, 1, 1, AUDIT_HEADERS.length).setFontWeight('bold');
  }
  return hoja;
}

function formatearFechaAuditoria() {
  const zona = Session.getScriptTimeZone() || 'Europe/Madrid';
  return Utilities.formatDate(new Date(), zona, 'yyyy-MM-dd HH:mm:ss');
}

function serializarParaAuditoria(fila) {
  if (!fila || Object.keys(fila).length === 0) {
    return '';
  }
  try {
    const json = JSON.stringify(fila);
    return json.length > 20000 ? json.slice(0, 20000) : json;
  } catch (e) {
    return String(fila);
  }
}

function resumirCambiosAuditoria(antes, despues) {
  const claves = {};
  Object.keys(antes || {}).forEach(function(k) { claves[k] = true; });
  Object.keys(despues || {}).forEach(function(k) { claves[k] = true; });

  const cambios = [];
  Object.keys(claves).forEach(function(k) {
    const valorAntes = antes && antes[k] != null ? String(antes[k]) : '';
    const valorDespues = despues && despues[k] != null ? String(despues[k]) : '';
    if (valorAntes !== valorDespues) {
      cambios.push(k + ': "' + valorAntes + '" -> "' + valorDespues + '"');
    }
  });

  return cambios.length ? cambios.join(' | ') : 'Sin cambios detectados';
}

function registrarAccionAuditoria(sesion, modulo, accion, filaReal, detalle, antes, despues) {
  try {
    if (!modulo || !SHEETS[modulo]) {
      return false;
    }

    const filaAuditoria = [
      formatearFechaAuditoria(),
      sesion && sesion.username ? sesion.username : '?',
      sesion && sesion.role ? sesion.role : '?',
      modulo,
      String(accion || '').toUpperCase(),
      filaReal == null ? '' : Number(filaReal),
      detalle || '',
      serializarParaAuditoria(antes),
      serializarParaAuditoria(despues)
    ];

    return conBloqueoEscritura(function() {
      getAuditSheet(modulo).appendRow(filaAuditoria);
      return true;
    });
  } catch (e) {
    Logger.log('No se pudo registrar accion de auditoria: ' + e.message);
    return false;
  }
}