// Rutas de configuración
const express = require('express');
const router = express.Router();
const configuracionController = require('../controllers/configuracion.controller');
const { verificarToken, verificarRol } = require('../middleware/auth.middleware');

// Todas las rutas requieren autenticación
router.use(verificarToken);

// GET /api/configuracion - Obtener configuración
router.get('/', configuracionController.obtener);

// PUT /api/configuracion - Actualizar configuración (solo admin)
router.put('/', verificarRol('ADMINISTRADOR'), configuracionController.actualizar);

module.exports = router;
