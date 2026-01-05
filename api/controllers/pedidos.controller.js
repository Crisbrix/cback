// Controlador de pedidos
const pool = require('../config/database');

const tableExists = async (tableName) => {
  const result = await pool.query(
    'SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    [tableName]
  );
  return Number(result.rows?.[0]?.c || 0) > 0;
};

const resolvePedidoDetallesTable = async () => {
  if (await tableExists('pedido_detalles')) return 'pedido_detalles';
  if (await tableExists('detalle_pedido')) return 'detalle_pedido';
  if (await tableExists('pedido_detalle')) return 'pedido_detalle';
  return null;
};

const resolveDateColumn = async (tableName, candidates) => {
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

const mapEstadoToDb = (estado) => {
  if (!estado) return null;
  const e = String(estado).toUpperCase();

  // Estados que vienen del frontend
  if (e === 'ABIERTO') return 'PENDIENTE';
  if (e === 'ENVIADO_COCINA') return 'EN_PROCESO';
  if (e === 'LISTO') return 'LISTO';
  if (e === 'CERRADO') return 'ENTREGADO';
  if (e === 'CANCELADO') return 'CANCELADO';

  // Estados directos de BD
  if (['PENDIENTE', 'EN_PROCESO', 'LISTO', 'ENTREGADO', 'CANCELADO'].includes(e)) return e;
  return null;
};

const mapEstadoFromDb = (estado) => {
  if (!estado) return null;
  const e = String(estado).toUpperCase();
  if (e === 'PENDIENTE') return 'abierto';
  if (e === 'EN_PROCESO') return 'enviado_cocina';
  if (e === 'LISTO') return 'listo';
  if (e === 'ENTREGADO') return 'cerrado';
  if (e === 'CANCELADO') return 'cancelado';
  return estado;
};

const mapPedidoRow = (row) => {
  if (!row) return null;
  return {
    ...row,
    estado: mapEstadoFromDb(row.estado),
    mesa_nombre: row.mesa_nombre ?? row.mesa ?? null,
    nombre_usuario: row.nombre_usuario ?? row.usuario_nombre ?? null,
    nombre_completo: row.nombre_completo ?? row.usuario_nombre ?? null,
    fecha_creacion: row.fecha_creacion ?? row.creado_en ?? null,
    fecha_actualizacion: row.fecha_actualizacion ?? row.actualizado_en ?? null
  };
};

// Listar pedidos
const listar = async (req, res) => {
  try {
    const pedidosDateCol = await resolveDateColumn('pedidos', [
      'creado_en',
      'fecha_creacion',
      'created_at',
      'createdAt'
    ]);
    const mesasDisplayCol = await resolveColumn('mesas', ['numero', 'nombre']);
    const usuariosNombreCol = await resolveColumn('usuarios', ['nombre', 'nombre_usuario', 'nombre_completo']);
    const pedidoDetallesTable = await resolvePedidoDetallesTable();
    const productosPrecioCol = await resolveColumn('productos', ['precio_venta', 'precio']);

    const mesaSelect = mesasDisplayCol ? `m.${mesasDisplayCol}` : 'NULL';
    const usuarioSelect = usuariosNombreCol ? `u.${usuariosNombreCol}` : 'NULL';
    const orderCol = pedidosDateCol ? `p.${pedidosDateCol}` : 'p.id';

    let query = `
      SELECT p.*, ${usuarioSelect} as usuario_nombre, ${mesaSelect} as mesa_nombre
      FROM pedidos p
      LEFT JOIN usuarios u ON p.usuario_id = u.id
      LEFT JOIN mesas m ON p.mesa_id = m.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (req.query.estado) {
      const estadoDb = mapEstadoToDb(req.query.estado) || req.query.estado;
      query += ` AND p.estado = ?`;
      params.push(estadoDb);
    }

    if (req.query.numeroMesa) {
      query += ` AND m.numero = ?`;
      params.push(String(req.query.numeroMesa));
    }

    query += ` ORDER BY ${orderCol} DESC`;

    const result = await pool.query(query, params);

    // Obtener detalles de cada pedido
    for (let pedido of result.rows) {
      if (!pedidoDetallesTable) {
        pedido.detalles = [];
        continue;
      }

      const alias = pedidoDetallesTable === 'pedido_detalles' ? 'pd' : 'dp';
      const precioSelect = productosPrecioCol ? `pr.${productosPrecioCol} as precio` : '0 as precio';
      const detallesResult = await pool.query(`
        SELECT ${alias}.*, pr.nombre as producto_nombre, ${precioSelect}
        FROM ${pedidoDetallesTable} ${alias}
        JOIN productos pr ON ${alias}.producto_id = pr.id
        WHERE ${alias}.pedido_id = ?
      `, [pedido.id]);
      
      pedido.detalles = detallesResult.rows || [];
    }

    res.json({ 
      pedidos: (result.rows || []).map(mapPedidoRow),
      total: result.rows.length 
    });
  } catch (error) {
    console.error('Error al listar pedidos:', error);
    res.status(500).json({ 
      error: 'Error al listar pedidos.',
      details: error.message 
    });
  }
};

// Obtener pedido por ID
const obtenerPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const pedidoDetallesTable = await resolvePedidoDetallesTable();
    const productosPrecioCol = await resolveColumn('productos', ['precio_venta', 'precio']);
    const mesasDisplayCol = await resolveColumn('mesas', ['numero', 'nombre']);
    const usuariosNombreCol = await resolveColumn('usuarios', ['nombre', 'nombre_usuario', 'nombre_completo']);

    const mesaSelect = mesasDisplayCol ? `m.${mesasDisplayCol}` : 'NULL';
    const usuarioSelect = usuariosNombreCol ? `u.${usuariosNombreCol}` : 'NULL';
    
    // Obtener pedido con información relacionada
    const pedidoResult = await pool.query(`
      SELECT p.*, ${usuarioSelect} as usuario_nombre, ${mesaSelect} as mesa_nombre
      FROM pedidos p
      LEFT JOIN usuarios u ON p.usuario_id = u.id
      LEFT JOIN mesas m ON p.mesa_id = m.id
      WHERE p.id = ?
    `, [id]);

    if (pedidoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }

    const pedido = pedidoResult.rows[0];

    // Obtener detalles del pedido
    let detalles = [];
    if (pedidoDetallesTable) {
      const alias = pedidoDetallesTable === 'pedido_detalles' ? 'pd' : 'dp';
      const precioSelect = productosPrecioCol ? `pr.${productosPrecioCol} as precio` : '0 as precio';
      const detallesResult = await pool.query(`
        SELECT ${alias}.*, pr.nombre as producto_nombre, ${precioSelect}
        FROM ${pedidoDetallesTable} ${alias}
        JOIN productos pr ON ${alias}.producto_id = pr.id
        WHERE ${alias}.pedido_id = ?
      `, [id]);
      detalles = detallesResult.rows;
    }

    // Formatear respuesta
    const pedidoFormateado = {
      ...mapPedidoRow(pedido),
      detalles: detalles
    };
    
    res.json({ pedido: pedidoFormateado });
  } catch (error) {
    console.error('Error al obtener pedido:', error);
    res.status(500).json({ 
      error: 'Error al obtener pedido.',
      details: error.message 
    });
  }
};

// Crear pedido
const crear = async (req, res) => {
  try {
    const { mesa_id, productos, observaciones } = req.body;
    // Usar usuario_id = 1 (admin) temporalmente hasta arreglar autenticación
    const usuario_id = 1; // req.usuario.id;

    const pedidoDetallesTable = await resolvePedidoDetallesTable();
    const productosPrecioCol = await resolveColumn('productos', ['precio_venta', 'precio']);
    const mesasDisplayCol = await resolveColumn('mesas', ['numero', 'nombre']);
    const usuariosNombreCol = await resolveColumn('usuarios', ['nombre', 'nombre_usuario', 'nombre_completo']);

    const pedidosMesaIdCol = await resolveColumn('pedidos', ['mesa_id']);
    const pedidosUsuarioIdCol = await resolveColumn('pedidos', ['usuario_id']);
    const pedidosTotalCol = await resolveColumn('pedidos', ['total']);
    const pedidosEstadoCol = await resolveColumn('pedidos', ['estado']);
    const pedidosTipoCol = await resolveColumn('pedidos', ['tipo']);
    const pedidosObservacionesCol = await resolveColumn('pedidos', ['observaciones']);
    const pedidosCodigoCol = await resolveColumn('pedidos', ['codigo', 'codigo_pedido', 'codigoPedido']);

    // Validar campos requeridos
    if (!mesa_id || !productos || productos.length === 0) {
      return res.status(400).json({ 
        error: 'Mesa y productos son requeridos.' 
      });
    }

    // Calcular total
    let total = 0;
    const detallesData = [];

    for (const item of productos) {
      const productoResult = await pool.query(
        'SELECT * FROM productos WHERE id = ?',
        [item.producto_id]
      );

      if (productoResult.rows.length === 0) {
        return res.status(404).json({ 
          error: `Producto ${item.producto_id} no encontrado.` 
        });
      }

      const producto = productoResult.rows[0];
      const productoPrecio = productosPrecioCol ? producto[productosPrecioCol] : (producto.precio_venta ?? producto.precio ?? 0);
      const subtotal = parseFloat(productoPrecio) * parseFloat(item.cantidad);
      total += subtotal;

      detallesData.push({
        producto_id: producto.id,
        cantidad: item.cantidad,
        precio_unitario: productoPrecio,
        notas: item.notas || null
      });
    }

    // Crear pedido (dinámico según columnas existentes)
    if (!pedidosMesaIdCol || !pedidosUsuarioIdCol || !pedidosTotalCol) {
      return res.status(500).json({
        error: 'Esquema de pedidos incompatible en la base de datos.',
        details: 'Faltan columnas requeridas (mesa_id/usuario_id/total) en la tabla pedidos.'
      });
    }

    const insertCols = [];
    const insertVals = [];

    if (pedidosCodigoCol) {
      insertCols.push(pedidosCodigoCol);
      insertVals.push(`P${Date.now()}`);
    }

    insertCols.push(pedidosMesaIdCol);
    insertVals.push(mesa_id);

    insertCols.push(pedidosUsuarioIdCol);
    insertVals.push(usuario_id);

    if (pedidosEstadoCol) {
      insertCols.push(pedidosEstadoCol);
      insertVals.push('PENDIENTE');
    }

    if (pedidosTipoCol) {
      insertCols.push(pedidosTipoCol);
      insertVals.push('MESA');
    }

    if (pedidosObservacionesCol) {
      insertCols.push(pedidosObservacionesCol);
      insertVals.push(observaciones || null);
    }

    insertCols.push(pedidosTotalCol);
    insertVals.push(total);

    const placeholders = insertVals.map(() => '?').join(', ');
    const pedidoResult = await pool.query(
      `INSERT INTO pedidos (${insertCols.join(', ')}) VALUES (${placeholders})`,
      insertVals
    );

    const pedido = pedidoResult.rows[0];

    // Crear detalles del pedido
    if (pedidoDetallesTable) {
      for (const detalle of detallesData) {
        const baseCols = pedidoDetallesTable === 'pedido_detalles'
          ? '(pedido_id, producto_id, cantidad, precio_unitario, subtotal, observaciones)'
          : '(pedido_id, producto_id, cantidad, precio_unitario, notas)';

        const baseVals = pedidoDetallesTable === 'pedido_detalles'
          ? '($1, $2, $3, $4, $5, $6)'
          : '($1, $2, $3, $4, $5)';

        const params = pedidoDetallesTable === 'pedido_detalles'
          ? [
              pedido.id,
              detalle.producto_id,
              detalle.cantidad,
              detalle.precio_unitario,
              parseFloat(detalle.cantidad) * parseFloat(detalle.precio_unitario),
              detalle.notas
            ]
          : [
              pedido.id,
              detalle.producto_id,
              detalle.cantidad,
              detalle.precio_unitario,
              detalle.notas
            ];

        const placeholdersDetail = baseVals.replace(/\$\d+/g, '?');
        await pool.query(
          `INSERT INTO ${pedidoDetallesTable} ${baseCols} VALUES ${placeholdersDetail}`,
          params
        );
      }
    }

    // Obtener pedido completo con detalles
    const mesaSelect = mesasDisplayCol ? `m.${mesasDisplayCol}` : 'NULL';
    const usuarioSelect = usuariosNombreCol ? `u.${usuariosNombreCol}` : 'NULL';

    const pedidoCompletoResult = await pool.query(`
      SELECT p.*, ${usuarioSelect} as usuario_nombre, ${mesaSelect} as mesa_nombre
      FROM pedidos p
      LEFT JOIN usuarios u ON p.usuario_id = u.id
      LEFT JOIN mesas m ON p.mesa_id = m.id
      WHERE p.id = ?
    `, [pedido.id]);

    const detallesResult = pedidoDetallesTable
      ? await pool.query(`
          SELECT ${pedidoDetallesTable === 'pedido_detalles' ? 'pd' : 'dp'}.*, pr.nombre as producto_nombre, ${productosPrecioCol ? `pr.${productosPrecioCol} as precio` : '0 as precio'}
          FROM ${pedidoDetallesTable} ${pedidoDetallesTable === 'pedido_detalles' ? 'pd' : 'dp'}
          JOIN productos pr ON ${pedidoDetallesTable === 'pedido_detalles' ? 'pd' : 'dp'}.producto_id = pr.id
          WHERE ${pedidoDetallesTable === 'pedido_detalles' ? 'pd' : 'dp'}.pedido_id = ?
        `, [pedido.id])
      : { rows: [] };

    const pedidoCompleto = pedidoCompletoResult.rows[0];
    pedidoCompleto.detalles = detallesResult.rows;
    const pedidoRespuesta = mapPedidoRow(pedidoCompleto);
    pedidoRespuesta.detalles = pedidoCompleto.detalles;

    res.status(201).json({
      message: 'Pedido creado exitosamente.',
      pedido: pedidoRespuesta
    });
  } catch (error) {
    console.error('Error al crear pedido:', error);
    res.status(500).json({ 
      error: 'Error al crear pedido.',
      details: error.message 
    });
  }
};

// Actualizar estado del pedido
const actualizarEstado = async (req, res) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    const estadosValidos = ['abierto', 'enviado_cocina', 'listo', 'cerrado', 'cancelado', 'PENDIENTE', 'EN_PROCESO', 'LISTO', 'ENTREGADO', 'CANCELADO'];

    if (!estado || !estadosValidos.includes(estado)) {
      return res.status(400).json({ 
        error: 'Estado inválido. Debe ser: abierto, enviado_cocina, listo, cerrado o cancelado.' 
      });
    }

    const estadoDb = mapEstadoToDb(estado);
    if (!estadoDb) {
      return res.status(400).json({ 
        error: 'Estado inválido.' 
      });
    }

    // Actualizar estado del pedido
    const updatedCol = await resolveColumn('pedidos', [
      'actualizado_en',
      'fecha_actualizacion',
      'updated_at',
      'updatedAt'
    ]);

    let updateQuery = `UPDATE pedidos SET estado = ?`;
    const updateParams = [estadoDb];
    
    if (updatedCol) {
      updateQuery += `, ${updatedCol} = CURRENT_TIMESTAMP`;
    }
    updateQuery += ` WHERE id = ?`;
    updateParams.push(id);

    await pool.query(updateQuery, updateParams);

    // Obtener el pedido actualizado
    const updated = await pool.query('SELECT * FROM pedidos WHERE id = ?', [id]);

    if (updated.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Pedido no encontrado.' 
      });
    }

    res.json({
      message: 'Estado actualizado exitosamente.',
      pedido: mapPedidoRow(updated.rows[0])
    });
  } catch (error) {
    console.error('Error al actualizar estado:', error);
    res.status(500).json({ 
      error: 'Error al actualizar estado.',
      details: error.message 
    });
  }
};

// Adicionar productos a un pedido existente
const adicionarProductos = async (req, res) => {
  try {
    const { id } = req.params;
    const { productos } = req.body;

    const pedidoDetallesTable = await resolvePedidoDetallesTable();

    if (!productos || productos.length === 0) {
      return res.status(400).json({ error: 'Debe proporcionar al menos un producto.' });
    }

    // Verificar que el pedido existe y no está cerrado
    const pedidoCheck = await pool.query('SELECT estado FROM pedidos WHERE id = ?', [id]);
    
    if (pedidoCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }

    const pedido = pedidoCheck.rows[0];
    
    if (pedido.estado === 'ENTREGADO' || pedido.estado === 'CANCELADO' || pedido.estado === 'cerrado' || pedido.estado === 'cancelado') {
      return res.status(400).json({ error: 'No se pueden adicionar productos a un pedido cerrado o cancelado.' });
    }

    // Obtener todos los productos
    const productosMap = {};
    for (const producto of productos) {
      const productoResult = await pool.query(
        'SELECT id, nombre, precio_venta, stock_actual FROM productos WHERE id = ?',
        [producto.producto_id]
      );
      
      if (productoResult.rows.length > 0) {
        const prod = productoResult.rows[0];
        productosMap[prod.id] = prod;
      }
    }

    // Validar todos los productos antes de hacer cambios
    for (const producto of productos) {
      const { producto_id, cantidad } = producto;
      const prod = productosMap[producto_id];
      
      if (!prod) {
        return res.status(404).json({ error: `Producto con ID ${producto_id} no encontrado.` });
      }

      if (prod.stock_actual < cantidad) {
        return res.status(400).json({ error: `Stock insuficiente para ${prod.nombre}.` });
      }
    }

    // Agregar productos al detalle del pedido
    for (const producto of productos) {
      const { producto_id, cantidad, notas } = producto;
      const prod = productosMap[producto_id];

      // Verificar si el producto ya existe en el pedido
      const detalleExistente = pedidoDetallesTable
        ? await pool.query(
            `SELECT id FROM ${pedidoDetallesTable} WHERE pedido_id = ? AND producto_id = ?`,
            [id, producto_id]
          )
        : { rows: [] };

      if (detalleExistente.rows.length > 0) {
        // Actualizar cantidad
        if (pedidoDetallesTable) {
          await pool.query(
            `UPDATE ${pedidoDetallesTable} SET cantidad = cantidad + ? WHERE pedido_id = ? AND producto_id = ?`,
            [cantidad, id, producto_id]
          );
        }
      } else {
        // Insertar nuevo detalle (si existe tabla de detalles)
        if (pedidoDetallesTable) {
          if (pedidoDetallesTable === 'pedido_detalles') {
            await pool.query(
              `INSERT INTO ${pedidoDetallesTable} (pedido_id, producto_id, cantidad, precio_unitario, subtotal, observaciones) VALUES (?, ?, ?, ?, ?, ?)`,
              [id, producto_id, cantidad, prod.precio_venta, parseFloat(prod.precio_venta) * parseFloat(cantidad), notas || null]
            );
          } else {
            await pool.query(
              `INSERT INTO ${pedidoDetallesTable} (pedido_id, producto_id, cantidad, precio_unitario, notas) VALUES (?, ?, ?, ?, ?)`,
              [id, producto_id, cantidad, prod.precio_venta, notas || null]
            );
          }
        }
      }

      // Actualizar stock
      await pool.query(
        'UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ?',
        [cantidad, producto_id]
      );
    }

    // Recalcular total del pedido (calculando subtotal en la consulta)
    const totalResult = pedidoDetallesTable
      ? await pool.query(
          `SELECT COALESCE(SUM(cantidad * precio_unitario), 0) as total FROM ${pedidoDetallesTable} WHERE pedido_id = ?`,
          [id]
        )
      : { rows: [{ total: 0 }] };

    const nuevoTotal = totalResult.rows[0].total;

    // Actualizar pedido
    await pool.query(
      'UPDATE pedidos SET total = ?, actualizado_en = CURRENT_TIMESTAMP WHERE id = ?',
      [nuevoTotal, id]
    );

    // Obtener pedido actualizado con detalles
    const pedidoActualizado = await pool.query(`
      SELECT p.*, m.numero as mesa_nombre, u.nombre as usuario_nombre
      FROM pedidos p
      LEFT JOIN mesas m ON p.mesa_id = m.id
      LEFT JOIN usuarios u ON p.usuario_id = u.id
      WHERE p.id = ?
    `, [id]);

    const detalles = pedidoDetallesTable
      ? await pool.query(`
          SELECT ${pedidoDetallesTable === 'pedido_detalles' ? 'pd' : 'dp'}.*, pr.nombre as producto_nombre
          FROM ${pedidoDetallesTable} ${pedidoDetallesTable === 'pedido_detalles' ? 'pd' : 'dp'}
          JOIN productos pr ON ${pedidoDetallesTable === 'pedido_detalles' ? 'pd' : 'dp'}.producto_id = pr.id
          WHERE ${pedidoDetallesTable === 'pedido_detalles' ? 'pd' : 'dp'}.pedido_id = ?
        `, [id])
      : { rows: [] };

    const pedidoCompleto = mapPedidoRow(pedidoActualizado.rows[0]);
    pedidoCompleto.detalles = detalles.rows;

    res.json({
      message: 'Productos adicionados exitosamente.',
      pedido: pedidoCompleto
    });
  } catch (error) {
    console.error('Error al adicionar productos:', error);
    res.status(500).json({ 
      error: 'Error al adicionar productos.',
      details: error.message 
    });
  }
};

module.exports = {
  listar,
  obtenerPorId,
  crear,
  actualizarEstado,
  adicionarProductos
};
