function navta_getResumen(token) {
  requireAuthorizedSession(token, MODULOS.NAVTA);
  return getResumenGenericoPorModulo(MODULOS.NAVTA);
}

function navta_getFilas(token) {
  requireAuthorizedSession(token, MODULOS.NAVTA);
  return getFilasGenericoPorModulo(MODULOS.NAVTA);
}
