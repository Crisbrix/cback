// Rutas de reportes
const express = require('express');
const router = express.Router();
const reportesController = require('../controllers/reportes.controller');
const { verificarToken, verificarRol } = require('../middleware/auth.middleware');

// Todas las rutas requieren autenticación
// Permitir acceso a admin (1) y cajero (2)
router.use(verificarToken);

// GET /api/reportes/ventas-diarias - Reporte de ventas del día
router.get('/ventas-diarias', reportesController.ventasDiarias);

// GET /api/reportes/ventas-periodo - Reporte de ventas por período
router.get('/ventas-periodo', reportesController.ventasPeriodo);

// GET /api/reportes/productos-vendidos - Productos más vendidos
router.get('/productos-vendidos', reportesController.productosVendidos);

// GET /api/reportes/cierre-caja - Cierre de caja
router.get('/cierre-caja', reportesController.cierreCaja);

// GET /api/reportes/inventario - Estado del inventario
router.get('/inventario', reportesController.inventario);

// GET /api/reportes/ventas-por-dia - Ventas por día de la semana
router.get('/ventas-por-dia', reportesController.ventasPorDia);

module.exports = router;
