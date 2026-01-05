// Rutas de ventas
const express = require('express');
const router = express.Router();
const ventasController = require('../controllers/ventas.controller');
const { verificarToken, verificarRol } = require('../middleware/auth.middleware');

// Todas las rutas requieren autenticación
router.use(verificarToken);

// GET /api/ventas - Listar ventas
router.get('/', ventasController.listar);

// GET /api/ventas/:id - Obtener venta por ID
router.get('/:id', ventasController.obtenerPorId);

// POST /api/ventas - Crear nueva venta (cajero)
router.post('/', verificarRol('CAJERO', 'ADMINISTRADOR'), ventasController.crear);

// POST /api/ventas/desde-pedido - Crear venta desde un pedido
router.post('/desde-pedido', verificarRol('CAJERO', 'ADMINISTRADOR'), ventasController.crearDesdePedido);

// PUT /api/ventas/:id/cancelar - Cancelar venta
router.put('/:id/cancelar', verificarRol('CAJERO', 'ADMINISTRADOR'), ventasController.cancelar);

module.exports = router;
