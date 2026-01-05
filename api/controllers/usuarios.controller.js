// Controlador de usuarios
const pool = require('../config/database');

const resolveColumn = async (tableName, candidates) => {
  const checks = await Promise.all(
    candidates.map(async (col) => {
      const result = await pool.query(
        'SELECT COUNT(*) AS c FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
        [tableName, col]
      );
      return { col, exists: Number(result.rows?.[0]?.c || 0) > 0 };
    })
  );
  return checks.find((x) => x.exists)?.col || null;
};

const mapUsuarioResponse = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    nombre_usuario: row.nombre_usuario ?? row.nombre ?? null,
    nombre_completo: row.nombre_completo ?? row.nombre ?? null,
    correo: row.correo ?? row.email ?? null,
    rol_id: row.rol_id,
    activo: row.activo,
    fecha_creacion: row.fecha_creacion ?? row.creado_en ?? null,
    ultimo_ingreso: row.ultimo_ingreso ?? null
  };
};

// Listar usuarios
const listar = async (req, res) => {
  try {
    const colNombre = await resolveColumn('usuarios', ['nombre', 'nombre_usuario', 'nombre_completo']);
    const colEmail = await resolveColumn('usuarios', ['email', 'correo']);
    const colCreado = await resolveColumn('usuarios', ['creado_en', 'fecha_creacion', 'created_at', 'createdAt']);

    const selectNombre = colNombre ? `u.${colNombre} AS nombre_out` : 'NULL AS nombre_out';
    const selectEmail = colEmail ? `u.${colEmail} AS email_out` : 'NULL AS email_out';
    const orderCol = colCreado ? `u.${colCreado}` : 'u.id';

    const result = await pool.query(`
      SELECT u.id, ${selectNombre}, ${selectEmail}, u.rol_id, u.activo, ${colCreado ? `u.${colCreado} AS creado_out` : 'NULL AS creado_out'}, u.ultimo_ingreso
      FROM usuarios u
      ORDER BY ${orderCol} DESC
    `);

    res.json({ 
      usuarios: (result.rows || []).map((u) => mapUsuarioResponse({
        ...u,
        nombre_usuario: u.nombre_out,
        nombre_completo: u.nombre_out,
        correo: u.email_out,
        fecha_creacion: u.creado_out
      })),
      total: result.rows.length 
    });
  } catch (error) {
    console.error('Error al listar usuarios:', error);
    res.status(500).json({ 
      error: 'Error al listar usuarios.',
      details: error.message 
    });
  }
};

// Actualizar usuario
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      nombre_usuario,
      nombre_completo,
      correo,
      rol_id,
      password,
      // payload alterno
      nombre,
      email
    } = req.body;

    // Verificar si el usuario existe
    const usuarioExiste = await pool.query('SELECT id FROM usuarios WHERE id = $1', [id]);
    
    if (usuarioExiste.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    // Construir query de actualización dinámicamente
    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    const colNombre = await resolveColumn('usuarios', ['nombre', 'nombre_usuario', 'nombre_completo']);
    const colEmail = await resolveColumn('usuarios', ['email', 'correo']);

    const nombreValue = nombre_usuario !== undefined ? nombre_usuario : (nombre_completo !== undefined ? nombre_completo : nombre);
    const emailValue = correo !== undefined ? correo : email;

    if (nombreValue !== undefined && colNombre) {
      updateFields.push(`${colNombre} = $${paramIndex}`);
      values.push(nombreValue);
      paramIndex++;
    }
    if (emailValue !== undefined && colEmail) {
      updateFields.push(`${colEmail} = $${paramIndex}`);
      values.push(emailValue);
      paramIndex++;
    }
    if (rol_id !== undefined) {
      updateFields.push(`rol_id = $${paramIndex}`);
      values.push(parseInt(rol_id));
      paramIndex++;
    }
    if (password) {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash(password, 10);
      updateFields.push(`password_hash = $${paramIndex}`);
      values.push(hashedPassword);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar.' });
    }

    // Agregar ID al final
    values.push(id);

    const query = `
      UPDATE usuarios 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    res.json({ 
      message: 'Usuario actualizado exitosamente.',
      usuario: mapUsuarioResponse({
        ...result.rows[0],
        nombre_usuario: result.rows[0].nombre ?? result.rows[0].nombre_usuario ?? result.rows[0].nombre_completo,
        nombre_completo: result.rows[0].nombre ?? result.rows[0].nombre_completo ?? result.rows[0].nombre_usuario,
        correo: result.rows[0].email ?? result.rows[0].correo,
        fecha_creacion: result.rows[0].creado_en ?? result.rows[0].fecha_creacion
      })
    });
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({ 
      error: 'Error al actualizar usuario.',
      details: error.message 
    });
  }
};

// Eliminar usuario
const eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si el usuario existe
    const usuarioExiste = await pool.query('SELECT id FROM usuarios WHERE id = $1', [id]);
    
    if (usuarioExiste.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    // No permitir eliminar el usuario con ID 1 (admin principal) si es numérico
    // Si la BD usa UUIDs, esto no aplicará, pero lo mantenemos por seguridad
    if (id === '1' || id === 1) {
      return res.status(400).json({ error: 'No se puede eliminar el usuario administrador principal.' });
    }

    await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);

    res.json({ 
      message: 'Usuario eliminado exitosamente.'
    });
  } catch (error) {
    console.error('Error al eliminar usuario:', error);
    res.status(500).json({ 
      error: 'Error al eliminar usuario.',
      details: error.message 
    });
  }
};

// Cambiar estado de usuario
const cambiarEstado = async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;

    // Verificar si el usuario existe
    const usuarioExiste = await pool.query('SELECT id FROM usuarios WHERE id = $1', [id]);
    
    if (usuarioExiste.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    await pool.query(
      'UPDATE usuarios SET activo = $1 WHERE id = $2',
      [Boolean(activo), id]
    );

    res.json({ 
      message: `Usuario ${activo ? 'activado' : 'desactivado'} exitosamente.`
    });
  } catch (error) {
    console.error('Error al cambiar estado:', error);
    res.status(500).json({ 
      error: 'Error al cambiar estado del usuario.',
      details: error.message 
    });
  }
};

module.exports = {
  listar,
  actualizar,
  eliminar,
  cambiarEstado
};
