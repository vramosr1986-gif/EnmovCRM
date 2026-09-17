# CRM - MAVIC - Gestion Unificada (Apps Script + clasp)

Proyecto contenedor para gestionar en una sola Web App los flujos de Enmov, Navta y Domiciliaciones.

## Estructura

- `src/Config.js`: configuracion central y usuarios (usuario/contrasena, rol y modulos permitidos).
- `src/auth.js`: login por usuario/contrasena y control de sesion (token).
- `src/server/routes.js`: `doGet` y renderizado.
- `src/common/utils.js`: utilidades compartidas.
- `src/services/*.js`: servicios por modulo y servicio comun de Sheets.
- `src/index.html`, `src/styles.html`, `src/client.html`: frontend unificado (incluye pantalla de login).

## Requisitos

- Node.js instalado.
- `clasp` instalado globalmente:

```bash
npm i -g @google/clasp
```

## Configuracion inicial (sin Git)

1. Inicia sesion:

```bash
clasp login
```

2. Crea un nuevo proyecto Apps Script y enlaza este folder:

```bash
clasp create --type webapp --title "EnmovCRM"
```

Si ya tienes un Script creado, reemplaza `scriptId` en `.clasp.json`.

3. Configura IDs reales de hojas en `src/Config.js`.

## Publicar

```bash
clasp push
clasp version "Produccion v1 - suite unificada"
clasp deploy --description "Produccion v1"
```

## Flujo recomendado

- Hacer cambios en `src/`
- `clasp push`
- Crear version
- Desplegar esa version al deployment de produccion
