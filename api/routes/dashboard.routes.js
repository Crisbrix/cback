// Rutas del dashboard
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { verificarToken } = require('../middleware/auth.middleware');

// Todas las rutas requieren autenticación
router.use(verificarToken);

// GET /api/dashboard/stats - Obtener estadísticas del dashboard
router.get('/stats', dashboardController.obtenerEstadisticas);

module.exports = router;
