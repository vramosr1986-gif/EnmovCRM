const APP_TITLE = 'CRM - MAVIC - Gestion Unificada - DEV';

const MODULOS = {
  NAVTA: 'navta',
  ENMOV: 'enmov',
  DOMICILIACIONES: 'domiciliaciones'
};

// Usuarios iniciales de la aplicacion (solo se usan para crear el almacen la primera vez que
// alguien inicia sesion). Una vez creado, los usuarios reales viven en Script Properties y se
// gestionan desde el menu "Usuarios" (solo visible para administradores) dentro de la app.
// Las contrasenas NO se guardan en claro, solo su hash SHA-256.
// Para dar de alta un usuario o cambiar una contrasena a mano, ejecuta generarHashParaContrasena('nueva-contrasena')
// desde el editor de Apps Script (menu Ejecutar > seleccionar funcion), copia el hash del log y pegalo aqui.
const USERS = [
  {
    username: 'magui',
    passwordHash: '6df3d374e1792fe3dd9b7eb1a35ec604faf23a1bf6e8c281befc0e53418316bb',
    nombre: 'Magali',
    role: 'admin',
    modules: [MODULOS.ENMOV, MODULOS.NAVTA, MODULOS.DOMICILIACIONES],
    fisioFiltro: null
  },
  {
    username: 'victor',
    passwordHash: '6df3d374e1792fe3dd9b7eb1a35ec604faf23a1bf6e8c281befc0e53418316bb',
    nombre: 'victor',
    role: 'admin',
    modules: [MODULOS.ENMOV, MODULOS.NAVTA, MODULOS.DOMICILIACIONES],
    fisioFiltro: null
  },
  {
    username: 'carol',
    passwordHash: '28fc9c4581fb4949019364a51f650c5248c857baa9595a4f2f3abf825f1ef8ca',
    nombre: 'Carolina',
    role: 'fisio',
    modules: [MODULOS.ENMOV],
    fisioFiltro: 'Carolina'
  }
];

const APPS = [
  {
    id: MODULOS.ENMOV,
    nombre: 'En Movimiento Sano',
    allowsInvoice: true,
    emisorNif: '17761087G',
    logoUrl: 'https://drive.google.com/uc?export=view&id=1cDyfgnIYLhhfeR_1SRdItygPczhj0h7Y'
  },
  {
    id: MODULOS.NAVTA,
    nombre: 'Navta',
    allowsInvoice: true,
    emisorNif: '17761087G',
    logoUrl: 'https://drive.google.com/uc?export=view&id=1cDyfgnIYLhhfeR_1SRdItygPczhj0h7Y'
  },
  {
    id: MODULOS.DOMICILIACIONES,
    nombre: 'Domiciliaciones',
    allowsInvoice: false,
    emisorNif: '17761087G',
    logoUrl: ''
  }
];

// IDs de hojas por modulo. Reemplazar por los IDs reales antes de produccion.
const SHEETS = {
  navta: {
    spreadsheetId: '1BdnSjtQh4Cs6iUN7BuYyiJaJaziBARy0PhDhp0eB5mY',
    sheetGid: 150528170
  },
  enmov: {
    spreadsheetId: '1UawoP4BSCNz0SXm9qTIDtXcBGwYNPMjNvfJnzFl3Ntw',
    sheetGid: 150528170
  },
  domiciliaciones: {
    spreadsheetId: '1NLls40xeKGitujtrfQE2H_tg_esPVn4-rjUcZ0tlA0Q',
    sheetName: 'Respuestas de formulario 1'
  }
};

const DEFAULT_IVA_PCT = 0;
const DEFAULT_IRPF_PCT = 15;

const FISIO_ALIASES = {
  carol: 'Carolina',
  carolina: 'Carolina',
  magui: 'Magali',
  magali: 'Magali',
  paula: 'Paula'
};
