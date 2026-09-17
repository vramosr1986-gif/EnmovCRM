function doGet(e) {
  try {
    const params = (e && e.parameter) || {};

    const modulosValidos = Object.keys(SHEETS);
    const moduloParam = modulosValidos.indexOf(String(params.modulo || '')) !== -1 ? String(params.modulo) : '';
    const accionParam = String(params.accion || '') === 'nuevo' ? 'nuevo' : '';

    const t = HtmlService.createTemplateFromFile('index');
    t.title = APP_TITLE;
    t.apps = APPS;
    t.moduloParam = moduloParam;
    t.accionParam = accionParam;

    return t.evaluate()
      .setTitle(APP_TITLE)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    const codigoSoporte = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss');
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>Error temporal</title>' +
      '<style>body{font-family:Arial,sans-serif;background:#f5f7fb;padding:32px;color:#1f2937}main{max-width:680px;margin:auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e5e7eb}h1{margin-top:0}code{background:#f3f4f6;padding:2px 6px;border-radius:6px}</style>' +
      '</head><body><main><h1>Error temporal</h1><p>No se pudo cargar la aplicacion en este momento.</p><p>Vuelve a intentarlo en unos segundos.</p><p>Codigo de soporte: <code>' + codigoSoporte + '</code></p></main></body></html>';
    return HtmlService.createHtmlOutput(html).setTitle('Error temporal');
  }
}

function include(nombre) {
  return HtmlService.createHtmlOutputFromFile(nombre).getContent();
}
