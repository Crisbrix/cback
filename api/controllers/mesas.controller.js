// Controlador de mesas
const pool = require('../config/database');

// Listar todas las mesas
const listar = async (req, res) => {
  try {
    const result = await pool.query('SELECT id, nombre, cantidad_personas, estado FROM mesas ORDER BY nombre ASC');

    res.json({ 
      mesas: result.rows,
      total: result.rows.length 
    });
  } catch (error) {
    console.error('Error al listar mesas:', error);
    res.status(500).json({ 
      error: 'Error al listar mesas.',
      details: error.message 
    });
  }
};

// Obtener mesa por ID
const obtenerPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM mesas WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Mesa no encontrada.' 
      });
    }

    res.json({ mesa: result.rows[0] });
  } catch (error) {
    console.error('Error al obtener mesa:', error);
    res.status(500).json({ 
      error: 'Error al obtener mesa.',
      details: error.message 
    });
  }
};

// Crear nueva mesa
const crear = async (req, res) => {
  try {
    const { nombre, cantidad_personas, estado } = req.body;

    // Validar campos requeridos
    if (!nombre) {
      return res.status(400).json({ 
        error: 'El nombre de la mesa es requerido.' 
      });
    }

    const result = await pool.query(`
      INSERT INTO mesas (nombre, cantidad_personas, estado)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [nombre, cantidad_personas || 4, estado || 'libre']);

    res.status(201).json({
      message: 'Mesa creada exitosamente.',
      mesa: result.rows[0]
    });
  } catch (error) {
    console.error('Error al crear mesa:', error);
    res.status(500).json({ 
      error: 'Error al crear mesa.',
      details: error.message 
    });
  }
};

// Actualizar mesa
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, cantidad_personas, estado } = req.body;

    // Verificar si existe
    const existeResult = await pool.query('SELECT id FROM mesas WHERE id = $1', [id]);

    if (existeResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Mesa no encontrada.' 
      });
    }

    // Construir query de actualización dinámicamente
    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    if (nombre !== undefined) {
      updateFields.push(`nombre = $${paramIndex}`);
      values.push(nombre);
      paramIndex++;
    }
    if (cantidad_personas !== undefined) {
      updateFields.push(`cantidad_personas = $${paramIndex}`);
      values.push(parseInt(cantidad_personas));
      paramIndex++;
    }
    if (estado !== undefined) {
      updateFields.push(`estado = $${paramIndex}`);
      values.push(estado);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar.' });
    }

    // Agregar ID al final
    values.push(id);

    const query = `
      UPDATE mesas 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    res.json({
      message: 'Mesa actualizada exitosamente.',
      mesa: result.rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar mesa:', error);
    res.status(500).json({ 
      error: 'Error al actualizar mesa.',
      details: error.message 
    });
  }
};

// Eliminar mesa
const eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si existe
    const existeResult = await pool.query('SELECT id FROM mesas WHERE id = $1', [id]);

    if (existeResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Mesa no encontrada.' 
      });
    }

    await pool.query('DELETE FROM mesas WHERE id = $1', [id]);

    res.json({ 
      message: 'Mesa eliminada exitosamente.' 
    });
  } catch (error) {
    console.error('Error al eliminar mesa:', error);
    res.status(500).json({ 
      error: 'Error al eliminar mesa.',
      details: error.message 
    });
  }
};

module.exports = {
  listar,
  obtenerPorId,
  crear,
  actualizar,
  eliminar
};
