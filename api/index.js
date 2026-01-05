// Servidor principal de Express para CriolloS
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

// Verificar variables de entorno críticas
console.log('🔍 Verificando variables de entorno...');
console.log('- DB_HOST:', process.env.DB_HOST ? '✅ Configurada' : '❌ No configurada');
console.log('- DB_USER:', process.env.DB_USER ? '✅ Configurada' : '❌ No configurada');
console.log('- JWT_SECRET:', process.env.JWT_SECRET ? '✅ Configurada' : '❌ No configurada');
console.log('- PORT:', process.env.PORT || 3000);

if (!process.env.JWT_SECRET) {
  console.error('❌ ERROR: JWT_SECRET no está configurado en las variables de entorno');
  console.error('Por favor, configura JWT_SECRET en el archivo .env');
}

if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD) {
  console.error('❌ ERROR: Variables de base de datos no configuradas');
  console.error('Por favor, configura DB_HOST, DB_USER, DB_PASSWORD en el archivo .env');
}

const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const productosRoutes = require('./routes/productos.routes');
const pedidosRoutes = require('./routes/pedidos.routes');
const mesasRoutes = require('./routes/mesas.routes');
const ventasRoutes = require('./routes/ventas.routes');
const usuariosRoutes = require('./routes/usuarios.routes');
const reportesRoutes = require('./routes/reportes.routes');
const configuracionRoutes = require('./routes/configuracion.routes');
const dashboardRoutes = require('./routes/dashboard.routes');

const app = express();

// Configuración de CORS - Permitir solo el origen del frontend
app.use(cors({
  origin: 'https://criollos-phi.vercel.app',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  preflightContinue: false,
  optionsSuccessStatus: 204
}));

// Middleware adicional para asegurar headers CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'https://criollos-phi.vercel.app');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.header('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Manejar preflight requests
app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ruta de prueba
app.get('/', (req, res) => {
  res.json({ 
    message: 'API CriolloS - Sistema POS',
    version: '1.0.1',
    status: 'online',
    cors: 'enabled'
  });
});

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/mesas', mesasRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/configuracion', configuracionRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: err.message 
  });
});

// Para desarrollo local
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  });
}

// Para Vercel (exportar la app)
module.exports = app;
