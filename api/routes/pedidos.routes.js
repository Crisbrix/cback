// Rutas de pedidos
const express = require('express');
const router = express.Router();
const pedidosController = require('../controllers/pedidos.controller');
const { verificarToken, verificarRol } = require('../middleware/auth.middleware');

// Todas las rutas requieren autenticación
router.use(verificarToken);

// GET /api/pedidos - Listar pedidos
router.get('/', pedidosController.listar);

// GET /api/pedidos/:id - Obtener pedido por ID
router.get('/:id', pedidosController.obtenerPorId);

// POST /api/pedidos - Crear nuevo pedido (mesero)
router.post('/', pedidosController.crear);

// POST /api/pedidos/:id/adicionar - Adicionar productos a pedido existente
router.post('/:id/adicionar', pedidosController.adicionarProductos);

// PUT /api/pedidos/:id/estado - Cambiar estado del pedido
router.put('/:id/estado', pedidosController.actualizarEstado);

module.exports = router;
