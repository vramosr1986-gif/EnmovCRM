const AUTH_SALT = 'EnmovCRM-v1-salt';
const SESSION_TTL_SECONDS = 6 * 60 * 60; // 6 horas

function hashPassword(password) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, AUTH_SALT + String(password));
  return bytes.map(function(b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

// Utilidad manual: ejecutar desde el editor de Apps Script (no se llama desde el cliente) para
// obtener el hash de una contrasena nueva y pegarlo en USERS (src/Config.js).
function generarHashParaContrasena(password) {
  const hash = hashPassword(password);
  Logger.log(hash);
  return hash;
}

function findUsuarioPorUsername(username) {
  const normalizado = String(username || '').trim().toLowerCase();
  if (!normalizado) {
    return null;
  }
  return getUsersStore().find(function(u) {
    return u.username.toLowerCase() === normalizado;
  }) || null;
}

const USERS_PROP_KEY = 'CRM_USERS_JSON';

function getUsersStore() {
  const props = PropertiesService.getScriptProperties();
  const raw = props.getProperty(USERS_PROP_KEY);
  if (raw) {
    try {
      const users = JSON.parse(raw);
      sincronizarUsuariosDesdeConfig(users, props);
      return users;
    } catch (e) {
      // continua y reinicia el almacen si el JSON guardado esta corrupto
    }
  }
  props.setProperty(USERS_PROP_KEY, JSON.stringify(USERS));
  return USERS.slice();
}

function sincronizarUsuariosDesdeConfig(users, props) {
  let cambio = false;
  USERS.forEach(function(cfg) {
    const u = users.find(function(item) {
      return String(item.username || '').toLowerCase() === String(cfg.username).toLowerCase();
    });
    if (!u) {
      return;
    }
    if (u.nombre !== cfg.nombre ||
        u.role !== cfg.role ||
        u.passwordHash !== cfg.passwordHash ||
        (u.modules || []).join(',') !== cfg.modules.join(',') ||
        (u.fisioFiltro || null) !== (cfg.fisioFiltro || null)) {
      u.nombre = cfg.nombre;
      u.role = cfg.role;
      u.passwordHash = cfg.passwordHash;
      u.modules = cfg.modules.slice();
      u.fisioFiltro = cfg.fisioFiltro || null;
      cambio = true;
    }
  });
  if (cambio) {
    props.setProperty(USERS_PROP_KEY, JSON.stringify(users));
  }
}

function saveUsersStore(users) {
  PropertiesService.getScriptProperties().setProperty(USERS_PROP_KEY, JSON.stringify(users));
}

function requireAdminSession(token) {
  const sesion = requireSession(token);
  if (sesion.role !== 'admin') {
    throw new Error('Solo un administrador puede realizar esta accion.');
  }
  return sesion;
}

function listarUsuarios(token) {
  requireAdminSession(token);
  return getUsersStore().map(function(u) {
    return {
      username: u.username,
      nombre: u.nombre,
      role: u.role,
      modules: u.modules,
      fisioFiltro: u.fisioFiltro || null
    };
  });
}

function crearUsuario(token, datos) {
  requireAdminSession(token);
  return crearUsuarioInterno(datos);
}

// Utilidad manual: ejecutar desde el editor de Apps Script (menu Ejecutar > seleccionar funcion)
// para dar de alta un usuario sin tener que entrar como administrador en la web app.
// modules es un array con 'enmov', 'navta' y/o 'domiciliaciones'. fisioFiltro es opcional.
function crearUsuarioDesdeEditor(username, password, nombre, role, modules, fisioFiltro) {
  const resultado = crearUsuarioInterno({
    username: username,
    password: password,
    nombre: nombre,
    role: role,
    modules: modules,
    fisioFiltro: fisioFiltro
  });
  Logger.log('Usuario creado: ' + username);
  return resultado;
}

function crearUsuarioInterno(datos) {
  const username = String((datos && datos.username) || '').trim().toLowerCase();
  const password = String((datos && datos.password) || '');
  const nombre = String((datos && datos.nombre) || '').trim();
  const role = (datos && datos.role === 'admin') ? 'admin' : 'fisio';
  const modulosValidos = Object.keys(SHEETS);
  const modules = Array.isArray(datos && datos.modules)
    ? datos.modules.filter(function(m) { return modulosValidos.indexOf(m) !== -1; })
    : [];
  const fisioFiltro = (datos && datos.fisioFiltro) ? String(datos.fisioFiltro).trim() : '';

  if (!username || !password || !nombre) {
    throw new Error('Usuario, contrasena y nombre son obligatorios.');
  }
  if (!modules.length) {
    throw new Error('Selecciona al menos un modulo.');
  }

  const users = getUsersStore();
  if (users.some(function(u) { return u.username.toLowerCase() === username; })) {
    throw new Error('Ya existe un usuario con ese nombre.');
  }

  users.push({
    username: username,
    passwordHash: hashPassword(password),
    nombre: nombre,
    role: role,
    modules: modules,
    fisioFiltro: role === 'admin' ? null : (fisioFiltro || null)
  });

  saveUsersStore(users);
  return true;
}

function eliminarUsuario(token, username) {
  const sesion = requireAdminSession(token);
  const normalizado = String(username || '').trim().toLowerCase();
  if (normalizado === sesion.username.toLowerCase()) {
    throw new Error('No puedes eliminar tu propio usuario.');
  }

  const users = getUsersStore().filter(function(u) {
    return u.username.toLowerCase() !== normalizado;
  });
  saveUsersStore(users);
  return true;
}

function cambiarContrasenaUsuario(token, username, nuevaContrasena) {
  requireAdminSession(token);

  const normalizado = String(username || '').trim().toLowerCase();
  const password = String(nuevaContrasena || '');
  if (!password) {
    throw new Error('La nueva contrasena no puede estar vacia.');
  }

  const users = getUsersStore();
  const usuario = users.find(function(u) { return u.username.toLowerCase() === normalizado; });
  if (!usuario) {
    throw new Error('Usuario no encontrado.');
  }

  usuario.passwordHash = hashPassword(password);
  saveUsersStore(users);
  return true;
}

function login(username, password) {
  const usuario = findUsuarioPorUsername(username);
  if (!usuario || usuario.passwordHash !== hashPassword(password)) {
    registrarIntentoLogin(username, null, false, 'Usuario o contrasena incorrectos');
    return { ok: false, message: 'Usuario o contrasena incorrectos.' };
  }

  const token = Utilities.getUuid();
  const sesion = {
    username: usuario.username,
    nombre: usuario.nombre,
    role: usuario.role,
    modules: usuario.modules,
    fisioFiltro: usuario.fisioFiltro || null
  };

  CacheService.getScriptCache().put('session_' + token, JSON.stringify(sesion), SESSION_TTL_SECONDS);

  registrarIntentoLogin(username, usuario, true, '');

  return {
    ok: true,
    token: token,
    nombre: sesion.nombre,
    role: sesion.role,
    modules: sesion.modules,
    fisioFiltro: sesion.fisioFiltro
  };
}

function verificarToken(token) {
  if (!token) {
    return null;
  }
  const raw = CacheService.getScriptCache().get('session_' + token);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function logout(token) {
  if (token) {
    CacheService.getScriptCache().remove('session_' + token);
  }
  return true;
}

function requireSession(token) {
  const sesion = verificarToken(token);
  if (!sesion) {
    throw new Error('Sesion no valida. Vuelve a iniciar sesion.');
  }
  return sesion;
}

function requireModuleAccess(sesion, modulo) {
  if (sesion.modules.indexOf(modulo) === -1) {
    throw new Error('No tienes acceso a este modulo.');
  }
}

function requireAuthorizedSession(token, modulo) {
  const sesion = requireSession(token);
  requireModuleAccess(sesion, modulo);
  return sesion;
}