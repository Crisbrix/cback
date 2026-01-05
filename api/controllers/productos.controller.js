// Controlador de productos
const pool = require('../config/database');

const tableExists = async (tableName) => {
  const result = await pool.query(
    'SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    [tableName]
  );
  return Number(result.rows?.[0]?.c || 0) > 0;
};

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

// Listar todos los productos
const listar = async (req, res) => {
  try {
    const hasProductos = await tableExists('productos');
    if (!hasProductos) {
      return res.json({ productos: [], total: 0 });
    }

    const hasCategorias = await tableExists('categorias');

    const colCodigo = await resolveColumn('productos', ['codigo_barras', 'codigo']);
    const colNombre = await resolveColumn('productos', ['nombre']);
    const colDescripcion = await resolveColumn('productos', ['descripcion']);
    const colPrecio = await resolveColumn('productos', ['precio_venta', 'precio']);
    const colCosto = await resolveColumn('productos', ['costo']);
    const colStock = await resolveColumn('productos', ['stock_actual', 'stock']);
    const colStockMin = await resolveColumn('productos', ['stock_minimo']);
    const colActivo = await resolveColumn('productos', ['activo']);
    const colImagen = await resolveColumn('productos', ['imagen_url']);
    const colCategoriaId = await resolveColumn('productos', ['categoria_id']);

    const selectCodigo = colCodigo ? `p.${colCodigo} AS codigo` : 'NULL AS codigo';
    const selectNombre = colNombre ? `p.${colNombre} AS nombre` : 'NULL AS nombre';
    const selectDescripcion = colDescripcion ? `p.${colDescripcion} AS descripcion` : 'NULL AS descripcion';
    const selectPrecio = colPrecio ? `p.${colPrecio} AS precio` : '0 AS precio';
    const selectCosto = colCosto ? `p.${colCosto} AS costo` : '0 AS costo';
    const selectStock = colStock ? `p.${colStock} AS stock` : '0 AS stock';
    const selectStockMin = colStockMin ? `p.${colStockMin} AS stock_minimo` : '0 AS stock_minimo';
    const selectActivo = colActivo ? `p.${colActivo} AS activo` : 'true AS activo';
    const selectImagen = colImagen ? `p.${colImagen} AS imagen_url` : 'NULL AS imagen_url';
    const selectCategoriaId = colCategoriaId ? `p.${colCategoriaId} AS categoria_id` : 'NULL AS categoria_id';

    let query =
      'SELECT ' +
      'p.id, ' +
      `${selectCodigo}, ` +
      `${selectNombre}, ` +
      `${selectDescripcion}, ` +
      `${selectPrecio}, ` +
      `${selectCosto}, ` +
      `${selectStock}, ` +
      `${selectStockMin}, ` +
      `${selectActivo}, ` +
      `${selectImagen}, ` +
      `${selectCategoriaId}, ` +
      (hasCategorias ? 'c.nombre AS categoria ' : 'NULL AS categoria ') +
      'FROM productos p ' +
      (hasCategorias && colCategoriaId ? `LEFT JOIN categorias c ON c.id = p.${colCategoriaId} ` : '') +
      'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    // Aplicar filtros si existen
    if (req.query.categoria) {
      const categoriaValue = String(req.query.categoria).trim();
      const asNumber = Number(categoriaValue);

      if (!Number.isNaN(asNumber) && Number.isFinite(asNumber) && categoriaValue !== '') {
        if (colCategoriaId) {
          query += ` AND p.${colCategoriaId} = $${paramIndex}`;
          params.push(asNumber);
          paramIndex++;
        }
      } else if (hasCategorias) {
        query += ` AND c.nombre = $${paramIndex}`;
        params.push(categoriaValue);
        paramIndex++;
      }
    }

    if (req.query.activo !== undefined) {
      const activo = String(req.query.activo).toLowerCase();
      if (colActivo) {
        query += ` AND p.${colActivo} = $${paramIndex}`;
        params.push(activo === 'true' || activo === '1');
        paramIndex++;
      }
    }

    query += colNombre ? ` ORDER BY p.${colNombre} ASC` : ' ORDER BY p.id ASC';

    const result = await pool.query(query, params);

    res.json({ 
      productos: result.rows,
      total: result.rows.length 
    });
  } catch (error) {
    console.error('Error al listar productos:', error);
    res.status(500).json({ 
      error: 'Error al listar productos.',
      details: error.message 
    });
  }
};

// Obtener producto por ID
const obtenerPorId = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query('SELECT * FROM productos WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Producto no encontrado.' 
      });
    }

    res.json({ producto: result.rows[0] });
  } catch (error) {
    console.error('Error al obtener producto:', error);
    res.status(500).json({ 
      error: 'Error al obtener producto.',
      details: error.message 
    });
  }
};

// Crear nuevo producto
const crear = async (req, res) => {
  try {
    const { codigo, nombre, descripcion, precio, precio_venta, costo, stock, stock_actual, categoria_id, activo, imagen_url } = req.body;

    // Validar campos requeridos
    const precioVentaValue = precio_venta !== undefined ? precio_venta : precio;
    if (!nombre || precioVentaValue === undefined) {
      return res.status(400).json({ 
        error: 'Nombre y precio son requeridos.' 
      });
    }

    const stockValue = stock_actual !== undefined ? stock_actual : stock;

    const result = await pool.query(`
      INSERT INTO productos (codigo_barras, nombre, descripcion, precio_venta, costo, stock_actual, categoria_id, activo, imagen_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      codigo || null,
      nombre,
      descripcion || null,
      parseFloat(precioVentaValue),
      costo !== undefined ? parseFloat(costo) : 0,
      stockValue !== undefined ? parseInt(stockValue, 10) : 0,
      categoria_id !== undefined && categoria_id !== null && categoria_id !== '' ? parseInt(categoria_id, 10) : null,
      activo !== undefined ? Boolean(activo) : true,
      imagen_url || null
    ]);

    res.status(201).json({
      message: 'Producto creado exitosamente.',
      producto: result.rows[0]
    });
  } catch (error) {
    console.error('Error al crear producto:', error);
    res.status(500).json({ 
      error: 'Error al crear producto.',
      details: error.message 
    });
  }
};

// Actualizar producto
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { codigo, nombre, descripcion, precio, precio_venta, costo, stock, stock_actual, categoria_id, activo, imagen_url } = req.body;

    // Verificar si existe
    const existeResult = await pool.query('SELECT id FROM productos WHERE id = $1', [id]);

    if (existeResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Producto no encontrado.' 
      });
    }

    // Construir query de actualización dinámicamente
    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    if (codigo !== undefined) {
      updateFields.push(`codigo_barras = $${paramIndex}`);
      values.push(codigo);
      paramIndex++;
    }
    if (nombre !== undefined) {
      updateFields.push(`nombre = $${paramIndex}`);
      values.push(nombre);
      paramIndex++;
    }
    if (descripcion !== undefined) {
      updateFields.push(`descripcion = $${paramIndex}`);
      values.push(descripcion);
      paramIndex++;
    }
    const precioVentaValue = precio_venta !== undefined ? precio_venta : precio;
    if (precioVentaValue !== undefined) {
      updateFields.push(`precio_venta = $${paramIndex}`);
      values.push(parseFloat(precioVentaValue));
      paramIndex++;
    }
    if (costo !== undefined) {
      updateFields.push(`costo = $${paramIndex}`);
      values.push(parseFloat(costo));
      paramIndex++;
    }
    const stockValue = stock_actual !== undefined ? stock_actual : stock;
    if (stockValue !== undefined) {
      updateFields.push(`stock_actual = $${paramIndex}`);
      values.push(parseInt(stockValue, 10));
      paramIndex++;
    }
    if (categoria_id !== undefined) {
      updateFields.push(`categoria_id = $${paramIndex}`);
      values.push(categoria_id !== null && categoria_id !== '' ? parseInt(categoria_id, 10) : null);
      paramIndex++;
    }
    if (imagen_url !== undefined) {
      updateFields.push(`imagen_url = $${paramIndex}`);
      values.push(imagen_url || null);
      paramIndex++;
    }
    if (activo !== undefined) {
      updateFields.push(`activo = $${paramIndex}`);
      values.push(activo);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No hay campos para actualizar.' });
    }

    // Agregar ID al final
    values.push(id);

    const query = `
      UPDATE productos 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);

    res.json({
      message: 'Producto actualizado exitosamente.',
      producto: result.rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar producto:', error);
    res.status(500).json({ 
      error: 'Error al actualizar producto.',
      details: error.message 
    });
  }
};

// Eliminar producto (soft delete - marcar como inactivo)
const eliminar = async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar si existe
    const existeResult = await pool.query('SELECT id FROM productos WHERE id = $1', [id]);

    if (existeResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Producto no encontrado.' 
      });
    }

    // Soft delete - marcar como inactivo en lugar de eliminar
    await pool.query('UPDATE productos SET activo = false WHERE id = $1', [id]);

    res.json({ 
      message: 'Producto eliminado exitosamente.' 
    });
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    res.status(500).json({ 
      error: 'Error al eliminar producto.',
      details: error.message 
    });
  }
};

// Actualizar stock
const actualizarStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { cantidad, operacion } = req.body; // operacion: 'sumar' o 'restar'

    if (cantidad === undefined || !operacion) {
      return res.status(400).json({ 
        error: 'Cantidad y operación son requeridos.' 
      });
    }

    // Obtener producto actual
    const productoResult = await pool.query('SELECT * FROM productos WHERE id = $1', [id]);

    if (productoResult.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Producto no encontrado.' 
      });
    }

    const producto = productoResult.rows[0];
    let nuevaCantidad;

    if (operacion === 'sumar') {
      nuevaCantidad = parseInt(producto.stock_actual, 10) + parseInt(cantidad, 10);
    } else if (operacion === 'restar') {
      nuevaCantidad = parseInt(producto.stock_actual, 10) - parseInt(cantidad, 10);
      if (nuevaCantidad < 0) {
        return res.status(400).json({ 
          error: 'Stock insuficiente.' 
        });
      }
    } else {
      return res.status(400).json({ 
        error: 'Operación inválida. Use "sumar" o "restar".' 
      });
    }

    // Actualizar stock
    const result = await pool.query(
      'UPDATE productos SET stock_actual = $1 WHERE id = $2 RETURNING *',
      [nuevaCantidad, id]
    );

    res.json({
      message: 'Stock actualizado exitosamente.',
      producto: result.rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar stock:', error);
    res.status(500).json({ 
      error: 'Error al actualizar stock.',
      details: error.message 
    });
  }
};

module.exports = {
  listar,
  obtenerPorId,
  crear,
  actualizar,
  eliminar,
  actualizarStock
};
