// Controlador de autenticación
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const resolveRolId = async (rol) => {
  if (rol === undefined || rol === null || rol === '') return null;
  const asNumber = Number(rol);
  if (!Number.isNaN(asNumber) && Number.isFinite(asNumber)) return Math.floor(asNumber);

  const rolNombre = String(rol).trim().toUpperCase();
  if (!rolNombre) return null;

  try {
    const result = await pool.query('SELECT id FROM roles WHERE UPPER(nombre) = $1', [rolNombre]);
    return result.rows?.[0]?.id ?? null;
  } catch (e) {
    return null;
  }
};

const mapUsuarioResponse = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    nombre_usuario: row.nombre_usuario,
    nombre_completo: row.nombre_completo,
    correo: row.correo,
    rol_id: row.rol_id,
    activo: row.activo,
    fecha_creacion: row.fecha_creacion
  };
};

// Registrar nuevo usuario
const registrar = async (req, res) => {
  try {
    // Soportar payload legacy y payload nuevo del formulario
    const {
      nombre_usuario,
      nombre_completo,
      correo,
      password,
      rol_id,
      // payload nuevo
      nombre,
      email,
      rol
    } = req.body;

    const nombreValue = (nombre_usuario ?? nombre ?? '').toString().trim();
    const emailValue = (correo ?? email ?? '').toString().trim();

    // Validar campos requeridos
    if (!nombreValue || !password) {
      return res.status(400).json({ 
        error: 'Nombre de usuario y contraseña son requeridos.' 
      });
    }

    // Resolver rol (acepta rol_id numérico o rol string)
    const rolIdResolved = (await resolveRolId(rol_id ?? rol)) ?? 1;

    // Verificar si el usuario ya existe
    const usuarioExiste = await pool.query(
      'SELECT id FROM usuarios WHERE correo = $1 OR nombre_usuario = $2',
      [emailValue || null, nombreValue]
    );

    if (usuarioExiste.rows.length > 0) {
      return res.status(400).json({ 
        error: 'El nombre de usuario ya está registrado.' 
      });
    }

    // Encriptar password
    const passwordHash = await bcrypt.hash(password, 10);

    // Crear usuario
    const result = await pool.query(`
      INSERT INTO usuarios (nombre_usuario, correo, contraseña_hash, rol_id, activo)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, nombre_usuario, correo, rol_id, activo, fecha_creacion
    `, [
      nombreValue,
      emailValue || null,
      passwordHash,
      rolIdResolved,
      true
    ]);

    const row = result.rows[0];
    const nuevoUsuario = mapUsuarioResponse({
      ...row
    });

    res.status(201).json({
      message: 'Usuario registrado exitosamente.',
      usuario: nuevoUsuario
    });
  } catch (error) {
    console.error('Error al registrar usuario:', error);
    res.status(500).json({ 
      error: 'Error al registrar usuario.',
      details: error.message 
    });
  }
};

// Iniciar sesión
const login = async (req, res) => {
  try {
    console.log('🔍 Iniciando proceso de login...');
    const { nombre_usuario, password } = req.body;

    // Validar campos
    if (!nombre_usuario || !password) {
      console.log('❌ Campos faltantes - nombre_usuario:', !!nombre_usuario, 'password:', !!password);
      return res.status(400).json({ 
        error: 'Nombre de usuario y contraseña son requeridos.' 
      });
    }

    console.log('🔍 Buscando usuario:', nombre_usuario);

    // Verificar que JWT_SECRET esté configurado
    if (!process.env.JWT_SECRET) {
      console.error('❌ JWT_SECRET no está definido en las variables de entorno');
      return res.status(500).json({ 
        error: 'Error de configuración del servidor.',
        details: 'JWT_SECRET no está configurado'
      });
    }

    // Verificar conexión a la base de datos
    try {
      await pool.query('SELECT UTC_TIMESTAMP()');
      console.log('✅ Conexión a base de datos OK');
    } catch (dbError) {
      console.error('❌ Error de conexión a base de datos:', dbError);
      return res.status(500).json({ 
        error: 'Error de conexión a la base de datos.',
        details: dbError.message 
      });
    }

    // Buscar usuario
    let result;
    try {
      const identifier = String(nombre_usuario).trim();
      if (identifier.includes('@')) {
        result = await pool.query('SELECT * FROM usuarios WHERE correo = $1', [identifier]);
      } else {
        // Permitir login por nombre_usuario como fallback
        result = await pool.query('SELECT * FROM usuarios WHERE nombre_usuario = $1', [identifier]);
      }
      console.log('🔍 Usuario encontrado:', result.rows.length > 0);
    } catch (queryError) {
      console.error('❌ Error en consulta SQL:', queryError);
      return res.status(500).json({ 
        error: 'Error al consultar la base de datos.',
        details: queryError.message 
      });
    }

    if (result.rows.length === 0) {
      console.log('❌ Usuario no encontrado');
      return res.status(401).json({ 
        error: 'Credenciales inválidas.' 
      });
    }

    const usuario = result.rows[0];
    
    // Debug logs
    console.log('🔍 Debug login:');
    console.log('- Usuario encontrado:', usuario.nombre_usuario);
    console.log('- ID usuario:', usuario.id);
    console.log('- Hash en BD existe:', !!usuario.contraseña_hash);
    console.log('- Hash length:', usuario.contraseña_hash ? usuario.contraseña_hash.length : 0);
    console.log('- Usuario activo:', usuario.activo);

    // Verificar si está activo
    if (!usuario.activo) {
      console.log('❌ Usuario inactivo');
      return res.status(401).json({ 
        error: 'Usuario inactivo. Contacta al administrador.' 
      });
    }

    // Verificar password
    let passwordValido;
    try {
      if (!usuario.contraseña_hash) {
        console.error('❌ No hay hash de contraseña en la base de datos');
        return res.status(500).json({ 
          error: 'Error en la configuración del usuario.',
          details: 'Usuario sin contraseña configurada'
        });
      }
      passwordValido = await bcrypt.compare(password, usuario.contraseña_hash);
      console.log('🔍 Password válido:', passwordValido);
    } catch (bcryptError) {
      console.error('❌ Error al verificar password:', bcryptError);
      return res.status(500).json({ 
        error: 'Error al verificar contraseña.',
        details: bcryptError.message 
      });
    }

    if (!passwordValido) {
      console.log('❌ Password incorrecto');
      return res.status(401).json({ 
        error: 'Credenciales inválidas.' 
      });
    }

    // Actualizar último ingreso (no crítico si falla)
    try {
      await pool.query(
        'UPDATE usuarios SET ultimo_ingreso = UTC_TIMESTAMP() WHERE id = $1',
        [usuario.id]
      );
      console.log('✅ Último ingreso actualizado');
    } catch (updateError) {
      console.warn('⚠️ Error al actualizar último ingreso (no crítico):', updateError.message);
    }

    // Generar token JWT
    let token;
    try {
      token = jwt.sign(
        { 
          id: usuario.id, 
          nombre_usuario: usuario.nombre, 
          rol_id: usuario.rol_id 
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );
      console.log('✅ Token JWT generado correctamente');
    } catch (jwtError) {
      console.error('❌ Error al generar token JWT:', jwtError);
      return res.status(500).json({ 
        error: 'Error al generar token de autenticación.',
        details: jwtError.message 
      });
    }

    console.log('✅ Login exitoso para usuario:', usuario.nombre_usuario);

    res.json({
      message: 'Login exitoso.',
      token,
      usuario: mapUsuarioResponse({
        ...usuario
      })
    });
  } catch (error) {
    console.error('❌ Error inesperado al iniciar sesión:');
    console.error('- Mensaje:', error.message);
    console.error('- Stack:', error.stack);
    res.status(500).json({ 
      error: 'Error al iniciar sesión.',
      details: error.message || 'Error desconocido'
    });
  }
};

// Obtener perfil del usuario autenticado
const obtenerPerfil = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, nombre_usuario, correo, rol_id, activo, fecha_creacion, ultimo_ingreso
      FROM usuarios WHERE id = $1
    `, [req.usuario.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const usuario = mapUsuarioResponse({
      ...result.rows[0]
    });

    if (!usuario) {
      return res.status(404).json({ 
        error: 'Usuario no encontrado.' 
      });
    }

    res.json({ usuario });
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ 
      error: 'Error al obtener perfil.',
      details: error.message 
    });
  }
};

// Cambiar password
const cambiarPassword = async (req, res) => {
  try {
    const { passwordActual, passwordNuevo } = req.body;

    if (!passwordActual || !passwordNuevo) {
      return res.status(400).json({ 
        error: 'Password actual y nuevo son requeridos.' 
      });
    }

    // Obtener usuario
    const result = await pool.query('SELECT * FROM usuarios WHERE id = $1', [req.usuario.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }
    
    const usuario = result.rows[0];

    // Verificar password actual
    const passwordValido = await bcrypt.compare(passwordActual, usuario.contraseña_hash);

    if (!passwordValido) {
      return res.status(401).json({ 
        error: 'Password actual incorrecto.' 
      });
    }

    // Encriptar nuevo password
    const passwordHash = await bcrypt.hash(passwordNuevo, 10);

    // Actualizar password
    await pool.query(
      'UPDATE usuarios SET contraseña_hash = $1 WHERE id = $2',
      [passwordHash, req.usuario.id]
    );

    res.json({ 
      message: 'Password actualizado exitosamente.' 
    });
  } catch (error) {
    console.error('Error al cambiar password:', error);
    res.status(500).json({ 
      error: 'Error al cambiar password.',
      details: error.message 
    });
  }
};

module.exports = {
  registrar,
  login,
  obtenerPerfil,
  cambiarPassword
};
