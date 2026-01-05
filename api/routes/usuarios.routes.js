// Rutas de usuarios
const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuarios.controller');
const { verificarToken, verificarRol } = require('../middleware/auth.middleware');

// Todas las rutas requieren autenticación y rol de administrador
router.use(verificarToken);
router.use(verificarRol(1)); // Solo administradores

router.get('/', usuariosController.listar);
router.put('/:id', usuariosController.actualizar);
router.delete('/:id', usuariosController.eliminar);
router.put('/:id/estado', usuariosController.cambiarEstado);

module.exports = router;
