const LOGIN_LOG_SHEET_NAME = 'Log_Sesiones';
const LOGIN_LOG_HEADERS = ['Fecha_Hora', 'Usuario', 'Nombre', 'Rol', 'IP', 'Resultado', 'Detalle'];

function getLoginLogSheet() {
  const ss = getSpreadsheetByModulo('enmov');
  let hoja = ss.getSheetByName(LOGIN_LOG_SHEET_NAME);
  if (!hoja) {
    hoja = ss.insertSheet(LOGIN_LOG_SHEET_NAME);
    hoja.setFrozenRows(1);
    hoja.appendRow(LOGIN_LOG_HEADERS);
    hoja.getRange(1, 1, 1, LOGIN_LOG_HEADERS.length).setFontWeight('bold');
  }
  return hoja;
}

function registrarIntentoLogin(username, usuario, resultOk, detalle) {
  try {
    const fila = [
      Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Europe/Madrid', 'yyyy-MM-dd HH:mm:ss'),
      String(username == null ? '' : username).trim().toLowerCase(),
      usuario && usuario.nombre ? usuario.nombre : '',
      usuario && usuario.role ? usuario.role : '',
      Session.getIpAddress() || '',
      resultOk ? 'EXITOSO' : 'FALLIDO',
      detalle || ''
    ];

    const lock = LockService.getScriptLock();
    if (lock.tryLock(5000)) {
      try {
        getLoginLogSheet().appendRow(fila);
      } finally {
        lock.releaseLock();
      }
    }
  } catch (e) {
    Logger.log('No se pudo registrar el intento de login: ' + e.message);
  }
}