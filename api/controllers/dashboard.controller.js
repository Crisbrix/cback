// Controlador del dashboard
const pool = require('../config/database');

const tableExists = async (tableName) => {
  const result = await pool.query(
    'SELECT COUNT(*) AS c FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
    [tableName]
  );
  return Number(result.rows?.[0]?.c || 0) > 0;
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

// Obtener estadísticas del dashboard
const obtenerEstadisticas = async (req, res) => {
  try {
    // Respuesta básica con datos por defecto
    const response = {
      stats: {
        ventasHoy: 0,
        pedidosActivos: 0,
        productosVendidos: 0,
        ingresoTotal: 0
      },
      ventasPorHora: {
        labels: ['9:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'],
        data: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
      },
      productosPopulares: [],
      pedidosRecientes: [],
      mesasEstado: {
        disponibles: 0,
        ocupadas: 0,
        reservadas: 0
      }
    };

    const pedidosDateCol = await resolveDateColumn('pedidos', [
      'creado_en',
      'fecha_creacion',
      'created_at',
      'createdAt'
    ]);
    const ventasDateCol = await resolveDateColumn('ventas', [
      'creado_en',
      'fecha_creacion',
      'created_at',
      'createdAt'
    ]);
    const ventaDetallesTable = (await tableExists('venta_detalles'))
      ? 'venta_detalles'
      : (await tableExists('venta_detalle'))
        ? 'venta_detalle'
        : null;
    const pedidoDetallesTable = (await tableExists('pedido_detalles'))
      ? 'pedido_detalles'
      : (await tableExists('pedido_detalle'))
        ? 'pedido_detalle'
        : null;

    const mesasDisplayCol = await resolveColumn('mesas', ['numero', 'nombre']);

    // Obtener pedidos activos del día
    try {
      if (pedidosDateCol) {
        const pedidosResult = await pool.query(
          `SELECT COUNT(*) as count FROM pedidos WHERE DATE(${pedidosDateCol}) = CURDATE() AND estado IN ('PENDIENTE', 'EN_PROCESO', 'LISTO')`
        );
        response.stats.pedidosActivos = parseInt(pedidosResult.rows[0]?.count || 0, 10);
      }
    } catch (error) {
      console.error('Error al obtener pedidos activos:', error.message, error.sql);
    }

    // Obtener ventas del día y productos vendidos
    try {
      if (ventasDateCol) {
        const ventasTotalCol = await resolveColumn('ventas', ['total', 'monto_total', 'importe']);
        const detallesCantidadCol = ventaDetallesTable ? await resolveColumn(ventaDetallesTable, ['cantidad']) : null;
        
        const joinDetalles = ventaDetallesTable ? `LEFT JOIN ${ventaDetallesTable} vd ON v.id = vd.venta_id` : '';
        const totalExpr = ventasTotalCol ? `COALESCE(SUM(v.${ventasTotalCol}), 0)` : '0';
        const vendidosExpr = ventaDetallesTable && detallesCantidadCol ? `COALESCE(SUM(vd.${detallesCantidadCol}), 0)` : '0';

        const ventasResult = await pool.query(`
          SELECT 
            COUNT(DISTINCT v.id) as ventasHoy,
            ${totalExpr} as ingresoTotal,
            ${vendidosExpr} as productosVendidos
          FROM ventas v
          ${joinDetalles}
          WHERE DATE(v.${ventasDateCol}) = CURDATE() AND v.estado = 'PAGADA'
        `);
        response.stats.ventasHoy = parseInt(ventasResult.rows[0]?.ventasHoy || 0, 10);
        response.stats.ingresoTotal = parseFloat(ventasResult.rows[0]?.ingresoTotal || 0);
        response.stats.productosVendidos = parseInt(ventasResult.rows[0]?.productosVendidos || 0, 10);
      }
    } catch (error) {
      console.error('Error al obtener ventas del día:', error.message, error.sql);
    }

    // Obtener ventas por hora
    try {
      if (ventasDateCol) {
        const ventasTotalCol = await resolveColumn('ventas', ['total', 'monto_total', 'importe']);
        const totalExpr = ventasTotalCol ? `COALESCE(SUM(v.${ventasTotalCol}), 0)` : '0';
        
        const ventasPorHoraResult = await pool.query(`
          SELECT 
            HOUR(v.${ventasDateCol}) as hora,
            ${totalExpr} as total
          FROM ventas v
          WHERE DATE(v.${ventasDateCol}) = CURDATE() AND v.estado = 'PAGADA'
          GROUP BY HOUR(v.${ventasDateCol})
          ORDER BY hora
        `);
      
        const ventasPorHora = {};
        (ventasPorHoraResult.rows || []).forEach(row => {
          ventasPorHora[row.hora] = parseFloat(row.total || 0);
        });
      
        // Llenar el array de datos
        response.ventasPorHora.labels = [];
        response.ventasPorHora.data = [];
        for (let h = 9; h <= 20; h++) {
          response.ventasPorHora.labels.push(`${h}:00`);
          response.ventasPorHora.data.push(ventasPorHora[h] || 0);
        }
      }
    } catch (error) {
      console.error('Error al obtener ventas por hora:', error.message, error.sql);
    }

    // Obtener productos populares desde detalles_pedido
    try {
      if (pedidoDetallesTable && pedidosDateCol) {
        const productoNombreCol = await resolveColumn('productos', ['nombre', 'nombre_producto', 'descripcion']);
        const detallesCantidadCol = await resolveColumn(pedidoDetallesTable, ['cantidad']);
        const pedidoIdCol = await resolveColumn(pedidoDetallesTable, ['pedido_id', 'pedidoId']);
        const productoIdCol = await resolveColumn(pedidoDetallesTable, ['producto_id', 'productoId']);
        
        if (productoNombreCol && detallesCantidadCol && pedidoIdCol && productoIdCol) {
          const nombreSelect = `p.${productoNombreCol}`;
          const cantidadExpr = `SUM(pd.${detallesCantidadCol})`;
          
          const productosPopularesResult = await pool.query(`
            SELECT 
              p.id,
              ${nombreSelect} as nombre,
              ${cantidadExpr} as cantidad
            FROM ${pedidoDetallesTable} pd
            INNER JOIN productos p ON pd.${productoIdCol} = p.id
            INNER JOIN pedidos pe ON pd.${pedidoIdCol} = pe.id
            WHERE DATE(pe.${pedidosDateCol}) = CURDATE()
            GROUP BY p.id, ${nombreSelect}
            ORDER BY cantidad DESC
            LIMIT 5
          `);
          
          response.productosPopulares = (productosPopularesResult.rows || []).map(row => ({
            nombre: row.nombre,
            cantidad: parseInt(row.cantidad || 0, 10)
          }));
        }
      }
      
      // Si no hay resultados, obtener productos de fallback
      if (!response.productosPopulares || response.productosPopulares.length === 0) {
        const productoNombreCol = await resolveColumn('productos', ['nombre', 'nombre_producto', 'descripcion']);
        
        if (productoNombreCol) {
          const fallbackResult = await pool.query(`
            SELECT 
              p.id,
              p.${productoNombreCol} as nombre,
              0 as cantidad
            FROM productos p
            WHERE p.activo = true
            ORDER BY p.nombre ASC
            LIMIT 5
          `);
          
          response.productosPopulares = (fallbackResult.rows || []).map(row => ({
            nombre: row.nombre,
            cantidad: row.cantidad || 0
          }));
        }
      }
    } catch (error) {
      console.error('Error al obtener productos populares:', error.message, error.sql);
      response.productosPopulares = [];
    }

    // Obtener pedidos recientes
    try {
      if (pedidosDateCol) {
        const pedidosTotalCol = await resolveColumn('pedidos', ['total', 'monto_total', 'importe']);
        const detallesPedidoCantidadCol = pedidoDetallesTable ? await resolveColumn(pedidoDetallesTable, ['cantidad']) : null;
        const pedidoIdCol = pedidoDetallesTable ? await resolveColumn(pedidoDetallesTable, ['pedido_id', 'pedidoId']) : null;
        
        const joinDetalles = pedidoDetallesTable ? `LEFT JOIN ${pedidoDetallesTable} pd ON p.id = pd.${pedidoIdCol}` : '';
        const itemsExpr = pedidoDetallesTable && detallesPedidoCantidadCol ? `COALESCE(SUM(pd.${detallesPedidoCantidadCol}), 0)` : '0';
        const tiempoExpr = `TIMESTAMPDIFF(MINUTE, p.${pedidosDateCol}, NOW())`;

        const mesaSelect = mesasDisplayCol
          ? `COALESCE(m.${mesasDisplayCol}, 'N/A')`
          : `COALESCE(NULL, 'N/A')`;
        const mesaGroupBy = mesasDisplayCol ? `, m.${mesasDisplayCol}` : '';
        const totalSelect = pedidosTotalCol ? `p.${pedidosTotalCol}` : '0';

        let pedidosRecientesResult = await pool.query(`
          SELECT 
            p.id,
            ${mesaSelect} as mesa,
            ${itemsExpr} as items,
            ${totalSelect} as total,
            ${tiempoExpr} as tiempo_minutos,
            p.estado
          FROM pedidos p
          LEFT JOIN mesas m ON p.mesa_id = m.id
          ${joinDetalles}
          WHERE DATE(p.${pedidosDateCol}) = CURDATE() AND p.estado IN ('PENDIENTE', 'EN_PROCESO', 'LISTO')
          GROUP BY p.id${mesaGroupBy}, ${totalSelect}, p.${pedidosDateCol}, p.estado
          ORDER BY p.${pedidosDateCol} DESC
          LIMIT 5
        `);
        
        if (!pedidosRecientesResult.rows || pedidosRecientesResult.rows.length === 0) {
          pedidosRecientesResult = await pool.query(`
            SELECT 
              p.id,
              ${mesaSelect} as mesa,
              ${itemsExpr} as items,
              ${totalSelect} as total,
              ${tiempoExpr} as tiempo_minutos,
              p.estado
            FROM pedidos p
            LEFT JOIN mesas m ON p.mesa_id = m.id
            ${joinDetalles}
            WHERE DATE(p.${pedidosDateCol}) = CURDATE()
            GROUP BY p.id${mesaGroupBy}, ${totalSelect}, p.${pedidosDateCol}, p.estado
            ORDER BY p.${pedidosDateCol} DESC
            LIMIT 5
          `);
        }
        
        response.pedidosRecientes = (pedidosRecientesResult.rows || []).map(row => ({
          mesa: row.mesa,
          items: parseInt(row.items || 0, 10),
          total: parseFloat(row.total || 0),
          tiempo: row.tiempo_minutos < 60 
            ? `${row.tiempo_minutos} min`
            : `${Math.floor(row.tiempo_minutos / 60)}h ${row.tiempo_minutos % 60}min`,
          estado: (row.estado || '').toLowerCase()
        }));
      }
    } catch (error) {
      console.error('Error al obtener pedidos recientes:', error.message, error.sql);
    }

    // Obtener estado de mesas
    try {
      let mesasResult = await pool.query(`
        SELECT 
          UPPER(estado) as estado,
          COUNT(*) as cantidad
        FROM mesas
        GROUP BY UPPER(estado)
      `);
      
      if (!mesasResult.rows || mesasResult.rows.length === 0) {
        mesasResult = await pool.query(`
          SELECT 
            estado,
            COUNT(*) as cantidad
          FROM mesas
          GROUP BY estado
        `);
      }
      
      (mesasResult.rows || []).forEach(row => {
        const estado = (row.estado || '').toLowerCase().trim();
        if (estado.includes('disponible') || estado.includes('libre')) {
          response.mesasEstado.disponibles = parseInt(row.cantidad || 0);
        } else if (estado.includes('ocupada')) {
          response.mesasEstado.ocupadas = parseInt(row.cantidad || 0);
        } else if (estado.includes('reservada')) {
          response.mesasEstado.reservadas = parseInt(row.cantidad || 0);
        }
      });
    } catch (error) {
      console.error('Error al obtener estado de mesas:', error.message, error.sql);
    }

    res.json(response);
  } catch (error) {
    console.error('Error al obtener estadísticas del dashboard:', error);
    res.status(500).json({ 
      error: 'Error al obtener estadísticas.',
      details: error.message 
    });
  }
};

module.exports = {
  obtenerEstadisticas
};
