// Middleware de autenticación con JWT
const jwt = require('jsonwebtoken');

const verificarToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('🔍 Auth Middleware - Authorization header:', authHeader ? 'Presente' : 'No presente');
    
    if (!authHeader) {
      console.log('❌ Auth Middleware - No hay header Authorization');
      return res.status(401).json({ 
        error: 'Acceso denegado. Token no proporcionado.' 
      });
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      console.log('❌ Auth Middleware - No hay token después de "Bearer"');
      return res.status(401).json({ 
        error: 'Acceso denegado. Token no proporcionado.' 
      });
    }

    console.log('🔍 Auth Middleware - Token extraído, verificando...');
    
    if (!process.env.JWT_SECRET) {
      console.error('❌ JWT_SECRET no está definido en las variables de entorno');
      return res.status(500).json({ 
        error: 'Error de configuración del servidor.' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded;
    console.log('✅ Auth Middleware - Token válido, usuario:', decoded.nombre_usuario);
    next();
  } catch (error) {
    console.error('❌ Auth Middleware - Error verificando token:', error.message);
    return res.status(401).json({ 
      error: 'Token inválido o expirado.' 
    });
  }
};

const verificarRol = (...rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ 
        error: 'Usuario no autenticado.' 
      });
    }

    // rol_id 1 = Administrador (tiene acceso a todo)
    if (req.usuario.rol_id === 1) {
      return next();
    }

    if (!rolesPermitidos.includes(req.usuario.rol_id)) {
      return res.status(403).json({ 
        error: 'No tienes permisos para realizar esta acción.' 
      });
    }

    next();
  };
};

module.exports = { verificarToken, verificarRol };
