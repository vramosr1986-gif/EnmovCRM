function enmov_getResumen(token) {
  requireAuthorizedSession(token, MODULOS.ENMOV);
  return getResumenGenericoPorModulo(MODULOS.ENMOV);
}

function enmov_getFilas(token) {
  requireAuthorizedSession(token, MODULOS.ENMOV);
  return getFilasGenericoPorModulo(MODULOS.ENMOV);
}
