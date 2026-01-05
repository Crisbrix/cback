// Controlador de ventas
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

const resolveDateColumn = async (tableName, candidates) => {
  return resolveColumn(tableName, candidates);
};

const resolvePedidoDetallesTable = async () => {
  if (await tableExists('pedido_detalles')) return 'pedido_detalles';
  if (await tableExists('detalle_pedido')) return 'detalle_pedido';
  if (await tableExists('pedido_detalle')) return 'pedido_detalle';
  return null;
};

const resolveVentaDetallesTable = async () => {
  if (await tableExists('venta_detalles')) return 'venta_detalles';
  if (await tableExists('detalle_venta')) return 'detalle_venta';
  if (await tableExists('venta_detalle')) return 'venta_detalle';
  return null;
};

const mapEstadoFromDb = (estado) => {
  if (!estado) return null;
  const e = String(estado).toUpperCase();
  if (e === 'PAGADA') return 'completada';
  if (e === 'ANULADA') return 'cancelada';
  if (e === 'PENDIENTE') return 'pendiente';
  return estado;
};

const mapEstadoToDb = (estado) => {
  if (!estado) return null;
  const e = String(estado).toLowerCase();
  if (e === 'completada') return 'PAGADA';
  if (e === 'cancelada') return 'ANULADA';
  if (e === 'pendiente') return 'PENDIENTE';
  const upper = String(estado).toUpperCase();
  if (['PAGADA', 'ANULADA', 'PENDIENTE'].includes(upper)) return upper;
  return null;
};

const mapVentaRow = (row) => {
  if (!row) return null;
  return {
    ...row,
    estado: mapEstadoFromDb(row.estado),
    metodo_pago: row.metodo_pago ? String(row.metodo_pago).toLowerCase() : row.metodo_pago,
    fecha_creacion: row.fecha_creacion ?? row.creado_en ?? null,
    nombre_usuario: row.nombre_usuario ?? row.usuario_nombre ?? null,
    nombre_completo: row.nombre_completo ?? row.usuario_nombre ?? null
  };
};

// Listar ventas
const listar = async (req, res) => {
  try {
    const ventasDateCol = await resolveDateColumn('ventas', [
      'creado_en',
      'fecha_creacion',
      'created_at',
      'createdAt'
    ]);
    const usuariosNombreCol = await resolveColumn('usuarios', ['nombre', 'nombre_usuario', 'nombre_completo']);
    const ventaDetallesTable = await resolveVentaDetallesTable();
    const productosPrecioCol = await resolveColumn('productos', ['precio_venta', 'precio']);

    const usuarioSelect = usuariosNombreCol ? `u.${usuariosNombreCol} as usuario_nombre` : 'NULL as usuario_nombre';
    const orderCol = ventasDateCol ? `v.${ventasDateCol}` : 'v.id';

    let query = `
      SELECT v.*, ${usuarioSelect}
      FROM ventas v
      LEFT JOIN usuarios u ON v.usuario_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (req.query.estado) {
      const estadoDb = mapEstadoToDb(req.query.estado);
      if (estadoDb) {
        query += ` AND v.estado = $${paramIndex}`;
        params.push(estadoDb);
        paramIndex++;
      }
    }

    const metodoPago = req.query.metodoPago ?? req.query.metodo_pago;
    if (metodoPago) {
      query += ` AND UPPER(v.metodo_pago) = $${paramIndex}`;
      params.push(String(metodoPago).toUpperCase());
      paramIndex++;
    }

    query += ` ORDER BY ${orderCol} DESC`;

    const result = await pool.query(query, params);

    // Obtener detalles de cada venta
    for (let venta of result.rows) {
      if (!ventaDetallesTable) {
        venta.detalles = [];
        continue;
      }

      const precioSelect = productosPrecioCol ? `p.${productosPrecioCol} as precio` : '0 as precio';
      const detallesResult = await pool.query(`
        SELECT vd.*, p.nombre as producto_nombre, ${precioSelect}
        FROM ${ventaDetallesTable} vd
        JOIN productos p ON vd.producto_id = p.id
        WHERE vd.venta_id = $1
      `, [venta.id]);
      
      venta.detalles = detallesResult.rows;
    }

    res.json({ 
      ventas: (result.rows || []).map(mapVentaRow),
      total: result.rows.length 
    });
  } catch (error) {
    console.error('Error al listar ventas:', error);
    res.status(500).json({ 
      error: 'Error al listar ventas.',
      details: error.message 
    });
  }
};

// Obtener venta por ID
const obtenerPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const usuariosNombreCol = await resolveColumn('usuarios', ['nombre', 'nombre_usuario', 'nombre_completo']);
    const ventaDetallesTable = await resolveVentaDetallesTable();
    const productosPrecioCol = await resolveColumn('productos', ['precio_venta', 'precio']);

    const usuarioSelect = usuariosNombreCol ? `u.${usuariosNombreCol} as usuario_nombre` : 'NULL as usuario_nombre';
    const result = await pool.query(`
      SELECT v.*, ${usuarioSelect}
      FROM ventas v
      LEFT JOIN usuarios u ON v.usuario_id = u.id
      WHERE v.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Venta no encontrada.' });
    }
    
    const venta = mapVentaRow(result.rows[0]);
    if (venta) {
      if (!ventaDetallesTable) {
        venta.detalles = [];
      } else {
        const precioSelect = productosPrecioCol ? `p.${productosPrecioCol} as precio` : '0 as precio';
        const detallesResult = await pool.query(`
          SELECT vd.*, p.nombre as producto_nombre, ${precioSelect}
          FROM ${ventaDetallesTable} vd
          JOIN productos p ON vd.producto_id = p.id
          WHERE vd.venta_id = $1
        `, [venta.id]);
        venta.detalles = detallesResult.rows;
      }
    }
    res.json({ venta });
  } catch (error) {
    console.error('Error al obtener venta:', error);
    res.status(500).json({ error: 'Error al obtener venta.', details: error.message });
  }
};

// Crear venta (simplificado)
const crear = async (req, res) => {
  try {
    res.status(501).json({ error: 'Función en desarrollo' });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear venta.', details: error.message });
  }
};

// Crear venta desde pedido
const crearDesdePedido = async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { pedido_id, metodo_pago, observaciones } = req.body;
    const usuario_id = 1; // Usuario cajero temporal

    // Validar campos requeridos
    if (!pedido_id) {
      return res.status(400).json({ error: 'El ID del pedido es requerido.' });
    }

    // Pre-resolver esquema ANTES de abrir transacción (evita timeouts/desconexiones)
    const pedidoDetallesTable = await resolvePedidoDetallesTable();
    const ventaDetallesTable = await resolveVentaDetallesTable();

    const productosPrecioCol = await resolveColumn('productos', ['precio_venta', 'precio']);
    const productosStockCol = await resolveColumn('productos', ['stock_actual', 'stock']);
    const pedidoUpdatedCol = await resolveColumn('pedidos', [
      'actualizado_en',
      'fecha_actualizacion',
      'updated_at',
      'updatedAt'
    ]);
    const usuariosNombreCol = await resolveColumn('usuarios', ['nombre', 'nombre_usuario', 'nombre_completo']);

    // Columnas de tabla detalle de pedido (si existe)
    const detallesCantidadCol = pedidoDetallesTable ? await resolveColumn(pedidoDetallesTable, ['cantidad']) : null;
    const detallesPrecioUnitCol = pedidoDetallesTable ? await resolveColumn(pedidoDetallesTable, ['precio_unitario', 'precio']) : null;

    // Columnas de tabla detalle de venta (si existe)
    const vdVentaIdCol = ventaDetallesTable ? await resolveColumn(ventaDetallesTable, ['venta_id']) : null;
    const vdProductoIdCol = ventaDetallesTable ? await resolveColumn(ventaDetallesTable, ['producto_id']) : null;
    const vdCantidadCol = ventaDetallesTable ? await resolveColumn(ventaDetallesTable, ['cantidad']) : null;
    const vdPrecioUnitCol = ventaDetallesTable ? await resolveColumn(ventaDetallesTable, ['precio_unitario', 'precio']) : null;
    const vdSubtotalCol = ventaDetallesTable ? await resolveColumn(ventaDetallesTable, ['subtotal']) : null;
    const vdImpuestoCol = ventaDetallesTable ? await resolveColumn(ventaDetallesTable, ['impuesto']) : null;
    const vdDescuentoCol = ventaDetallesTable ? await resolveColumn(ventaDetallesTable, ['descuento']) : null;
    const vdTotalCol = ventaDetallesTable ? await resolveColumn(ventaDetallesTable, ['total']) : null;

    await client.query('BEGIN');

    // Obtener el pedido
    const pedidoResult = await client.query('SELECT * FROM pedidos WHERE id = $1', [pedido_id]);

    if (pedidoResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }

    const pedido = pedidoResult.rows[0];

    // Obtener detalles del pedido
    if (!pedidoDetallesTable) {
      pedido.detalles = [];
    } else {
      const alias = pedidoDetallesTable === 'pedido_detalles' ? 'pd' : 'dp';
      const cantidadExpr = detallesCantidadCol ? `${alias}.${detallesCantidadCol}` : '0';
      const precioExpr = detallesPrecioUnitCol
        ? `${alias}.${detallesPrecioUnitCol}`
        : (productosPrecioCol ? `pr.${productosPrecioCol}` : '0');

      const detallesResult = await client.query(`
        SELECT ${alias}.producto_id as producto_id,
          ${cantidadExpr} as cantidad,
          ${precioExpr} as precio_unitario,
          pr.nombre as producto_nombre
        FROM ${pedidoDetallesTable} ${alias}
        JOIN productos pr ON ${alias}.producto_id = pr.id
        WHERE ${alias}.pedido_id = $1
      `, [pedido_id]);

      pedido.detalles = detallesResult.rows || [];
    }

    // Verificar que el pedido no esté ya cerrado/anulado
    const estadoPedido = String(pedido.estado || '').toUpperCase();
    if (estadoPedido === 'ENTREGADO' || estadoPedido === 'CANCELADO') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Este pedido ya está cerrado.' });
    }

    // Crear la venta (dinámico según columnas existentes)
    const ventasCodigoCol = await resolveColumn('ventas', ['codigo', 'codigo_venta', 'codigoVenta']);
    const ventasCajaSesionCol = await resolveColumn('ventas', ['caja_sesion_id', 'caja_id', 'cajaSesionId']);
    const ventasUsuarioCol = await resolveColumn('ventas', ['usuario_id']);
    const ventasPedidoCol = await resolveColumn('ventas', ['pedido_id']);
    const ventasTipoCompCol = await resolveColumn('ventas', ['tipo_comprobante', 'tipoComprobante']);
    const ventasSubtotalCol = await resolveColumn('ventas', ['subtotal']);
    const ventasImpuestoCol = await resolveColumn('ventas', ['impuesto']);
    const ventasDescuentoCol = await resolveColumn('ventas', ['descuento']);
    const ventasTotalCol = await resolveColumn('ventas', ['total']);
    const ventasEstadoCol = await resolveColumn('ventas', ['estado']);
    const ventasMetodoPagoCol = await resolveColumn('ventas', ['metodo_pago', 'metodoPago']);
    const ventasObsCol = await resolveColumn('ventas', ['observaciones', 'observacion']);

    if (!ventasUsuarioCol || !ventasTotalCol) {
      await client.query('ROLLBACK');
      return res.status(500).json({
        error: 'Esquema de ventas incompatible en la base de datos.',
        details: 'Faltan columnas requeridas (usuario_id/total) en la tabla ventas.'
      });
    }

    const insertCols = [];
    const insertVals = [];

    if (ventasCodigoCol) {
      insertCols.push(ventasCodigoCol);
      insertVals.push(`V${Date.now()}`);
    }
    if (ventasCajaSesionCol) {
      insertCols.push(ventasCajaSesionCol);
      insertVals.push(1);
    }

    insertCols.push(ventasUsuarioCol);
    insertVals.push(usuario_id);

    if (ventasPedidoCol) {
      insertCols.push(ventasPedidoCol);
      insertVals.push(pedido_id);
    }

    if (ventasTipoCompCol) {
      insertCols.push(ventasTipoCompCol);
      insertVals.push('TICKET');
    }

    if (ventasSubtotalCol) {
      insertCols.push(ventasSubtotalCol);
      insertVals.push(pedido.total);
    }
    if (ventasImpuestoCol) {
      insertCols.push(ventasImpuestoCol);
      insertVals.push(0);
    }
    if (ventasDescuentoCol) {
      insertCols.push(ventasDescuentoCol);
      insertVals.push(0);
    }

    insertCols.push(ventasTotalCol);
    insertVals.push(pedido.total);

    if (ventasEstadoCol) {
      insertCols.push(ventasEstadoCol);
      insertVals.push('PAGADA');
    }
    if (ventasMetodoPagoCol) {
      insertCols.push(ventasMetodoPagoCol);
      insertVals.push((metodo_pago || 'EFECTIVO').toUpperCase());
    }
    if (ventasObsCol) {
      insertCols.push(ventasObsCol);
      insertVals.push(observaciones || null);
    }

    const placeholders = insertVals.map((_, idx) => `$${idx + 1}`).join(', ');
    const ventaResult = await client.query(
      `INSERT INTO ventas (${insertCols.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      insertVals
    );

    const venta = ventaResult.rows[0];
    if (!ventaDetallesTable) {
      await client.query('ROLLBACK');
      return res.status(500).json({
        error: 'Esquema de ventas incompatible en la base de datos.',
        details: 'No existe tabla de detalle de venta (venta_detalles/detalle_venta/venta_detalle).'
      });
    }

    // Crear detalles de la venta desde los detalles del pedido
    for (const detalle of (pedido.detalles || [])) {
      const subtotal = parseFloat(detalle.cantidad || 0) * parseFloat(detalle.precio_unitario || 0);

      const detCols = [];
      const detVals = [];

      if (vdVentaIdCol) {
        detCols.push(vdVentaIdCol);
        detVals.push(venta.id);
      }
      if (vdProductoIdCol) {
        detCols.push(vdProductoIdCol);
        detVals.push(detalle.producto_id);
      }
      if (vdCantidadCol) {
        detCols.push(vdCantidadCol);
        detVals.push(detalle.cantidad);
      }
      if (vdPrecioUnitCol) {
        detCols.push(vdPrecioUnitCol);
        detVals.push(detalle.precio_unitario);
      }
      if (vdSubtotalCol) {
        detCols.push(vdSubtotalCol);
        detVals.push(subtotal);
      }
      if (vdImpuestoCol) {
        detCols.push(vdImpuestoCol);
        detVals.push(0);
      }
      if (vdDescuentoCol) {
        detCols.push(vdDescuentoCol);
        detVals.push(0);
      }
      if (vdTotalCol) {
        detCols.push(vdTotalCol);
        detVals.push(subtotal);
      }

      if (detCols.length > 0) {
        const detPlaceholders = detVals.map((_, idx) => `$${idx + 1}`).join(', ');
        await client.query(
          `INSERT INTO ${ventaDetallesTable} (${detCols.join(', ')}) VALUES (${detPlaceholders})`,
          detVals
        );
      }

      if (productosStockCol) {
        await client.query(
          `UPDATE productos SET ${productosStockCol} = ${productosStockCol} - $1 WHERE id = $2 AND ${productosStockCol} >= $1`,
          [detalle.cantidad, detalle.producto_id, detalle.cantidad]
        );
      }
    }

    // Cerrar el pedido
    if (pedidoUpdatedCol) {
      await client.query(
        `UPDATE pedidos SET estado = 'ENTREGADO', ${pedidoUpdatedCol} = CURRENT_TIMESTAMP WHERE id = $1`,
        [pedido_id]
      );
    } else {
      await client.query(
        "UPDATE pedidos SET estado = 'ENTREGADO' WHERE id = $1",
        [pedido_id]
      );
    }

    await client.query('COMMIT');

    // Obtener la venta completa con detalles
    const usuarioSelect = usuariosNombreCol ? `u.${usuariosNombreCol} as usuario_nombre` : 'NULL as usuario_nombre';
    const ventaBaseResult = await pool.query(`
      SELECT v.*, ${usuarioSelect}
      FROM ventas v
      LEFT JOIN usuarios u ON v.usuario_id = u.id
      WHERE v.id = $1
    `, [venta.id]);

    const detallesVentaResult = await pool.query(`
      SELECT vd.*, p.nombre as producto_nombre
      FROM ${ventaDetallesTable} vd
      JOIN productos p ON vd.producto_id = p.id
      WHERE vd.venta_id = $1
    `, [venta.id]);

    const ventaCompleta = mapVentaRow(ventaBaseResult.rows[0]);
    ventaCompleta.detalles = detallesVentaResult.rows;

    res.status(201).json({
      message: 'Venta creada exitosamente y pedido cerrado.',
      venta: ventaCompleta
    });
  } catch (error) {
    // Solo hacer rollback si hay una transacción activa
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error al hacer rollback:', rollbackError);
    }
    console.error('Error al crear venta desde pedido:', error);
    res.status(500).json({ 
      error: 'Error al crear venta.',
      details: error.message 
    });
  } finally {
    client.release();
  }
};

// Cancelar venta (simplificado)
const cancelar = async (req, res) => {
  try {
    res.status(501).json({ error: 'Función en desarrollo' });
  } catch (error) {
    res.status(500).json({ error: 'Error al cancelar venta.', details: error.message });
  }
};

module.exports = {
  listar,
  obtenerPorId,
  crear,
  crearDesdePedido,
  cancelar
};
