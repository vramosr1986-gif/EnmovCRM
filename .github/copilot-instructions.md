# Instrucciones del proyecto EnmovCRM

- Responde siempre en español.
- Este es un proyecto de Google Apps Script (clasp). El codigo fuente vive en `src/`.
- Tras cualquier cambio en `src/`, ejecuta `clasp push` para subirlo al proyecto de Apps Script.
- Si el cambio debe llegar a producción (no solo a la version @HEAD de desarrollo), actualiza tambien el deployment de produccion con:
  `clasp deploy -i AKfycbzCH_UTvdm6hlJy902eZi9WN-99TrI2QXZP5dofbtgZu3k6-73A3IM_gDlCmU6gkM8rUg -d "<descripcion breve del cambio>"`
- Entorno de pruebas (deployment @HEAD, se actualiza solo con `clasp push`, sin deploy):
  `https://script.google.com/macros/s/AKfycbz_s3YwBRXE_Pq9rvKhmGD-q_tKl7oiuS3fKj2BidHe/dev`
  (solo lo puede abrir la cuenta de Google con permiso de editor sobre el proyecto).
- Autenticacion: usuario/contraseña propio (no Google), gestionado en `src/auth.js` y `src/Config.js`.
  Los usuarios reales se guardan en Script Properties (ver `src/auth.js`), no solo en `Config.js`.
- Roles: `admin` (ve todos los modulos) y `fisio` (modulos limitados + filtro opcional de filas por
  la columna `Fisio_de_sesion`).
- Modulos: En Movimiento Sano (`enmov`), Navta (`navta`), Domiciliaciones (`domiciliaciones`), definidos
  en `src/Config.js` (`MODULOS`, `APPS`, `SHEETS`).
- El campo "Cantidad" de los registros debe validarse siempre como numerico (cliente y servidor).
- No crear archivos `.md` de documentacion salvo que se pida explicitamente.
- No agregar comentarios a menos que te lo pidan
- Resumir al minimo la explicacion de los cambios
- Se ha creado una redirección de dominio desde www.magaliclemente.es/crm
- No ejecutar comandos sin avisar