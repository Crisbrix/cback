// Controlador de reportes
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

// Reporte de ventas diarias
const ventasDiarias = async (req, res) => {
  try {
    const ventasDateCol = await resolveDateColumn('ventas', [
      'creado_en',
      'fecha_creacion',
      'created_at',
      'createdAt'
    ]);
    const usuariosNombreCol = await resolveColumn('usuarios', ['nombre', 'nombre_usuario', 'nombre_completo']);

    // Ventas del día
    if (!ventasDateCol) {
      return res.json({
        fecha: new Date().toISOString().split('T')[0],
        resumen: {
          totalVentas: 0,
          cantidadVentas: 0,
          ticketPromedio: 0
        },
        porMetodoPago: {},
        ventas: []
      });
    }

    const usuarioSelect = usuariosNombreCol ? `u.${usuariosNombreCol} AS nombre` : 'NULL AS nombre';
    const result = await pool.query(`
      SELECT v.*, ${usuarioSelect}
      FROM ventas v
      LEFT JOIN usuarios u ON v.usuario_id = u.id
      WHERE DATE(v.${ventasDateCol}) = CURDATE() AND v.estado = 'PAGADA'
      ORDER BY v.${ventasDateCol} DESC
    `);

    const ventas = result.rows || [];
    const totalVentas = ventas.reduce((sum, v) => sum + parseFloat(v.total || 0), 0);
    const cantidadVentas = ventas.length;

    // Agrupar por método de pago
    const porMetodoPago = {};
    ventas.forEach(v => {
      const metodo = (v.metodo_pago || v.metodoPago || '').toString().toUpperCase();
      if (!porMetodoPago[metodo]) {
        porMetodoPago[metodo] = {
          cantidad: 0,
          total: 0
        };
      }
      porMetodoPago[metodo].cantidad++;
      porMetodoPago[metodo].total += parseFloat(v.total || 0);
    });

    res.json({
      fecha: new Date().toISOString().split('T')[0],
      resumen: {
        totalVentas,
        cantidadVentas,
        ticketPromedio: cantidadVentas > 0 ? totalVentas / cantidadVentas : 0
      },
      porMetodoPago,
      ventas
    });
  } catch (error) {
    console.error('Error al generar reporte de ventas diarias:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: 'Error al generar reporte.',
      details: error.message || 'Error desconocido'
    });
  }
};

// Reporte de ventas por período
const ventasPeriodo = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({ 
        error: 'Fecha de inicio y fin son requeridas.' 
      });
    }

    const inicioDate = new Date(fechaInicio);
    const finDate = new Date(fechaFin);
    finDate.setHours(23, 59, 59, 999); // Incluir todo el día final

    const ventasDateCol = await resolveDateColumn('ventas', [
      'creado_en',
      'fecha_creacion',
      'created_at',
      'createdAt'
    ]);
    const usuariosNombreCol = await resolveColumn('usuarios', ['nombre', 'nombre_usuario', 'nombre_completo']);
    if (!ventasDateCol) {
      return res.json({ periodo: { inicio: fechaInicio, fin: fechaFin }, resumen: { totalVentas: 0, cantidadVentas: 0, ticketPromedio: 0 }, ventas: [] });
    }

    const result = await pool.query(`
      SELECT v.*, ${usuariosNombreCol ? `u.${usuariosNombreCol} AS nombre` : 'NULL AS nombre'}
      FROM ventas v
      LEFT JOIN usuarios u ON v.usuario_id = u.id
      WHERE v.${ventasDateCol} >= ? AND v.${ventasDateCol} <= ? AND v.estado = 'PAGADA'
      ORDER BY v.${ventasDateCol} DESC
    `, [inicioDate, finDate]);

    const ventas = result.rows || [];
    const totalVentas = ventas.reduce((sum, v) => sum + parseFloat(v.total || 0), 0);
    const cantidadVentas = ventas.length;

    res.json({
      periodo: {
        inicio: fechaInicio,
        fin: fechaFin
      },
      resumen: {
        totalVentas,
        cantidadVentas,
        ticketPromedio: cantidadVentas > 0 ? totalVentas / cantidadVentas : 0
      },
      ventas
    });
  } catch (error) {
    console.error('Error al generar reporte de período:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: 'Error al generar reporte.',
      details: error.message || 'Error desconocido'
    });
  }
};

// Productos más vendidos - VERSIÓN CORREGIDA 2024
const productosVendidos = async (req, res) => {
  console.log('🟢🟢🟢 productosVendidos - VERSIÓN ACTUALIZADA - SIN LIMIT EN SQL - V2024');
  try {
    // Por defecto mostrar los 5 más vendidos
    const { limite } = req.query;
    let limitNum = 5; // Valor por defecto
    
    if (limite) {
      const parsed = parseInt(limite, 10);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 100) {
        limitNum = parsed;
      }
    }

    // Asegurar que limitNum sea un número entero válido
    limitNum = Math.floor(Number(limitNum));
    if (isNaN(limitNum) || limitNum < 1) {
      limitNum = 5;
    }

    console.log('📊 Límite solicitado:', limitNum);

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

    if (!ventaDetallesTable) {
      return res.json({ productos: [], total: 0 });
    }

    // Construir la query sin LIMIT - lo haremos en JavaScript
    const query =
      'SELECT p.id, p.nombre, p.precio_venta, ' +
      'COALESCE(SUM(vd.cantidad), 0) as cantidadVendida, ' +
      'COALESCE(SUM(vd.total), 0) as totalVentas ' +
      `FROM ${ventaDetallesTable} vd ` +
      'INNER JOIN productos p ON vd.producto_id = p.id ' +
      'INNER JOIN ventas v ON vd.venta_id = v.id ' +
      "WHERE v.estado = 'PAGADA' " +
      (ventasDateCol ? '' : '') +
      'GROUP BY p.id, p.nombre, p.precio_venta ' +
      'HAVING SUM(vd.cantidad) > 0 ' +
      'ORDER BY SUM(vd.cantidad) DESC';

    console.log('📝 Query ejecutada (SIN LIMIT):', query);
    console.log('⚠️ IMPORTANTE: Esta es la versión NUEVA sin LIMIT en SQL');

    // Ejecutar la query sin parámetros - VERSIÓN NUEVA
    const result = await pool.query(query);
    
    console.log('✅ Productos obtenidos:', result.rows?.length || 0);

    // Limitar resultados en JavaScript
    const allProductos = (result.rows || []).map(p => {
      // Manejar diferentes casos de nombres de columnas de MySQL
      const cantidadVendida = p.cantidadVendida || p.cantidadvendida || p.cantidad_vendida || 0;
      const totalVentas = p.totalVentas || p.totalventas || p.total_ventas || 0;
      
      return {
        producto: {
          id: p.id,
          nombre: p.nombre || '',
          precio: parseFloat(p.precio_venta || p.precio_venta || 0)
        },
        cantidadVendida: parseInt(cantidadVendida, 10),
        totalVentas: parseFloat(totalVentas)
      };
    });

    // Limitar a los primeros limitNum productos
    const productos = allProductos.slice(0, limitNum);

    res.json({
      productos,
      total: productos.length
    });
  } catch (error) {
    console.error('Error al generar reporte de productos vendidos:', error);
    console.error('SQL Error:', error.sqlMessage);
    console.error('Query:', error.sql);
    
    // Si hay error, devolver array vacío en lugar de fallar
    res.json({
      productos: [],
      total: 0
    });
  }
};

// Cierre de caja
const cierreCaja = async (req, res) => {
  try {
    const { fecha } = req.query;
    
    let inicio, fin;
    
    if (fecha) {
      inicio = new Date(fecha);
      inicio.setHours(0, 0, 0, 0);
      fin = new Date(inicio);
      fin.setDate(fin.getDate() + 1);
    } else {
      inicio = new Date();
      inicio.setHours(0, 0, 0, 0);
      fin = new Date(inicio);
      fin.setDate(fin.getDate() + 1);
    }

    const ventasDateCol = await resolveDateColumn('ventas', [
      'creado_en',
      'fecha_creacion',
      'created_at',
      'createdAt'
    ]);
    const usuariosNombreCol = await resolveColumn('usuarios', ['nombre', 'nombre_usuario', 'nombre_completo']);
    if (!ventasDateCol) {
      return res.json({ fecha: inicio.toISOString().split('T')[0], resumen: { totalVentas: 0, totalGeneral: 0, ticketPromedio: 0 }, ventas: [] });
    }

    const result = await pool.query(`
      SELECT v.*, ${usuariosNombreCol ? `u.${usuariosNombreCol} AS nombre` : 'NULL AS nombre'}
      FROM ventas v
      LEFT JOIN usuarios u ON v.usuario_id = u.id
      WHERE v.${ventasDateCol} >= ? AND v.${ventasDateCol} < ? AND v.estado = 'PAGADA'
    `, [inicio, fin]);

    const ventas = result.rows || [];
    const totalGeneral = ventas.reduce((sum, v) => sum + parseFloat(v.total || 0), 0);

    res.json({
      fecha: inicio.toISOString().split('T')[0],
      resumen: {
        totalVentas: ventas.length,
        totalGeneral,
        ticketPromedio: ventas.length > 0 ? totalGeneral / ventas.length : 0
      },
      ventas
    });
  } catch (error) {
    console.error('Error al generar cierre de caja:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: 'Error al generar cierre de caja.',
      details: error.message || 'Error desconocido'
    });
  }
};

// Estado del inventario
const inventario = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM productos
      ORDER BY stock_actual ASC
    `);

    const productos = result.rows || [];
    const valorTotal = productos.reduce((sum, p) => sum + (parseFloat(p.precio_venta || 0) * parseFloat(p.stock_actual || 0)), 0);

    res.json({
      resumen: {
        totalProductos: productos.length,
        valorTotal,
        productosStockBajo: productos.filter(p => parseFloat(p.stock_actual || 0) < parseFloat(p.stock_minimo || 0)).length
      },
      productos
    });
  } catch (error) {
    console.error('Error al generar reporte de inventario:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: 'Error al generar reporte de inventario.',
      details: error.message || 'Error desconocido'
    });
  }
};

// Ventas por día de la semana (últimos 7 días)
const ventasPorDia = async (req, res) => {
  try {
    const ventasDateCol = await resolveDateColumn('ventas', [
      'creado_en',
      'fecha_creacion',
      'created_at',
      'createdAt'
    ]);
    if (!ventasDateCol) {
      return res.json({ ventasPorDia: [0, 0, 0, 0, 0, 0, 0], labels: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'], total: 0 });
    }

    // Obtener ventas de los últimos 7 días
    const result = await pool.query(`
      SELECT 
        DATE(${ventasDateCol}) as fecha,
        COALESCE(SUM(total), 0) as total_dia,
        COUNT(*) as cantidad_ventas
      FROM ventas
      WHERE ${ventasDateCol} >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
        AND ${ventasDateCol} < DATE_ADD(CURDATE(), INTERVAL 1 DAY)
        AND estado = 'PAGADA'
      GROUP BY DATE(${ventasDateCol})
      ORDER BY fecha ASC
    `);

    // Crear array de los últimos 7 días
    const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const ventasPorDia = [];
    const labels = [];
    
    for (let i = 6; i >= 0; i--) {
      const fecha = new Date();
      fecha.setDate(fecha.getDate() - i);
      fecha.setHours(0, 0, 0, 0);
      
      const fechaStr = fecha.toISOString().split('T')[0];
      // Convertir fecha de la BD a string si es necesario
      const venta = (result.rows || []).find(v => {
        let ventaFecha;
        if (v.fecha instanceof Date) {
          ventaFecha = v.fecha.toISOString().split('T')[0];
        } else if (typeof v.fecha === 'string') {
          // Si viene como string desde MySQL, puede venir en formato YYYY-MM-DD
          ventaFecha = v.fecha.split('T')[0];
        } else {
          ventaFecha = new Date(v.fecha).toISOString().split('T')[0];
        }
        return ventaFecha === fechaStr;
      });
      
      ventasPorDia.push(venta ? parseFloat(venta.total_dia || 0) : 0);
      labels.push(diasSemana[fecha.getDay()]);
    }

    res.json({
      ventasPorDia,
      labels,
      total: ventasPorDia.reduce((sum, v) => sum + v, 0)
    });
  } catch (error) {
    console.error('Error al generar reporte de ventas por día:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: 'Error al generar reporte.',
      details: error.message || 'Error desconocido'
    });
  }
};

module.exports = {
  ventasDiarias,
  ventasPeriodo,
  productosVendidos,
  cierreCaja,
  inventario,
  ventasPorDia
};
