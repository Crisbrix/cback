// Controlador de configuración
const pool = require('../config/database');

// Obtener configuración
const obtener = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM configuracion LIMIT 1');
    
    let configuracion;
    
    if (result.rows.length === 0) {
      // Crear configuración por defecto
      const insertResult = await pool.query(`
        INSERT INTO configuracion (nombre_restaurante, igv)
        VALUES ($1, $2)
        RETURNING *
      `, ['CriolloS', 18.0]);
      
      configuracion = insertResult.rows[0];
    } else {
      configuracion = result.rows[0];
    }

    res.json({ configuracion });
  } catch (error) {
    console.error('Error al obtener configuración:', error);
    res.status(500).json({ 
      error: 'Error al obtener configuración.',
      details: error.message 
    });
  }
};

// Actualizar configuración
const actualizar = async (req, res) => {
  try {
    const { nombreRestaurante, direccion, telefono, email, logo, ruc, igv } = req.body;

    // Obtener configuración existente
    const checkResult = await pool.query('SELECT * FROM configuracion LIMIT 1');
    
    let configuracion;

    if (checkResult.rows.length === 0) {
      // Crear si no existe
      const insertResult = await pool.query(`
        INSERT INTO configuracion (nombre_restaurante, direccion, telefono, email, logo, ruc, igv)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        nombreRestaurante || 'CriolloS',
        direccion || null,
        telefono || null,
        email || null,
        logo || null,
        ruc || null,
        igv || 18.0
      ]);
      
      configuracion = insertResult.rows[0];
    } else {
      // Actualizar existente
      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (nombreRestaurante) {
        updates.push(`nombre_restaurante = $${paramIndex}`);
        values.push(nombreRestaurante);
        paramIndex++;
      }

      if (direccion !== undefined) {
        updates.push(`direccion = $${paramIndex}`);
        values.push(direccion);
        paramIndex++;
      }

      if (telefono !== undefined) {
        updates.push(`telefono = $${paramIndex}`);
        values.push(telefono);
        paramIndex++;
      }

      if (email !== undefined) {
        updates.push(`email = $${paramIndex}`);
        values.push(email);
        paramIndex++;
      }

      if (logo !== undefined) {
        updates.push(`logo = $${paramIndex}`);
        values.push(logo);
        paramIndex++;
      }

      if (ruc !== undefined) {
        updates.push(`ruc = $${paramIndex}`);
        values.push(ruc);
        paramIndex++;
      }

      if (igv !== undefined) {
        updates.push(`igv = $${paramIndex}`);
        values.push(parseFloat(igv));
        paramIndex++;
      }

      if (updates.length > 0) {
        values.push(checkResult.rows[0].id);
        const query = `UPDATE configuracion SET ${updates.join(', ')}, fecha_actualizacion = CURRENT_TIMESTAMP WHERE id = $${paramIndex} RETURNING *`;
        
        const updateResult = await pool.query(query, values);
        configuracion = updateResult.rows[0];
      } else {
        configuracion = checkResult.rows[0];
      }
    }

    res.json({
      message: 'Configuración actualizada exitosamente.',
      configuracion
    });
  } catch (error) {
    console.error('Error al actualizar configuración:', error);
    res.status(500).json({ 
      error: 'Error al actualizar configuración.',
      details: error.message 
    });
  }
};

module.exports = {
  obtener,
  actualizar
};
