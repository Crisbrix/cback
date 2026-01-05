// Rutas de autenticación
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verificarToken } = require('../middleware/auth.middleware');

// POST /api/auth/register - Registrar nuevo usuario
router.post('/register', authController.registrar);

// POST /api/auth/login - Iniciar sesión
router.post('/login', authController.login);

// GET /api/auth/me - Obtener datos del usuario autenticado
router.get('/me', verificarToken, authController.obtenerPerfil);

// PUT /api/auth/cambiar-password - Cambiar contraseña
router.put('/cambiar-password', verificarToken, authController.cambiarPassword);

module.exports = router;
