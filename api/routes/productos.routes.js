// Rutas de productos (inventario)
const express = require('express');
const router = express.Router();
const productosController = require('../controllers/productos.controller');
const { verificarToken, verificarRol } = require('../middleware/auth.middleware');

// Todas las rutas requieren autenticación
router.use(verificarToken);

// GET /api/productos - Listar todos los productos
router.get('/', productosController.listar);

// GET /api/productos/:id - Obtener un producto por ID
router.get('/:id', productosController.obtenerPorId);

// POST /api/productos - Crear nuevo producto
router.post('/', productosController.crear);

// PUT /api/productos/:id - Actualizar producto
router.put('/:id', productosController.actualizar);

// DELETE /api/productos/:id - Eliminar producto
router.delete('/:id', productosController.eliminar);

// PUT /api/productos/:id/stock - Actualizar stock
router.put('/:id/stock', productosController.actualizarStock);

module.exports = router;
