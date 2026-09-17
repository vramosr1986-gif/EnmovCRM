function domiciliaciones_getResumen(token) {
  requireAuthorizedSession(token, MODULOS.DOMICILIACIONES);
  return getResumenGenericoPorModulo(MODULOS.DOMICILIACIONES);
}

function domiciliaciones_getFilas(token) {
  requireAuthorizedSession(token, MODULOS.DOMICILIACIONES);
  return getFilasGenericoPorModulo(MODULOS.DOMICILIACIONES);
}
