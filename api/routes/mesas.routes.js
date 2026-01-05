// Rutas de mesas
const express = require('express');
const router = express.Router();
const mesasController = require('../controllers/mesas.controller');
const { verificarToken } = require('../middleware/auth.middleware');

// Todas las rutas requieren autenticación
router.use(verificarToken);

// GET /api/mesas - Listar mesas
router.get('/', mesasController.listar);

// GET /api/mesas/:id - Obtener mesa por ID
router.get('/:id', mesasController.obtenerPorId);

// POST /api/mesas - Crear nueva mesa
router.post('/', mesasController.crear);

// PUT /api/mesas/:id - Actualizar mesa
router.put('/:id', mesasController.actualizar);

// DELETE /api/mesas/:id - Eliminar mesa
router.delete('/:id', mesasController.eliminar);

module.exports = router;
