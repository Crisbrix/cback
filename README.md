# CriolloS Backend - API REST

Backend del sistema POS CriolloS construido con Node.js, Express y Prisma.

## 🚀 Instalación

```bash
# Instalar dependencias
npm install

# Copiar archivo de variables de entorno
cp .env.example .env

# Editar .env con tus credenciales de Neon.tech
```

## 🗄️ Configuración de Base de Datos

1. Crea una cuenta en [Neon.tech](https://neon.tech)
2. Crea un nuevo proyecto PostgreSQL
3. Copia la cadena de conexión (DATABASE_URL)
4. Pégala en tu archivo `.env`

```env
DATABASE_URL="postgresql://usuario:password@ep-xxxx.neon.tech:5432/criollos?sslmode=require"
JWT_SECRET="tu_secreto_super_seguro"
```

## 📦 Prisma - Migraciones

```bash
# Generar el cliente de Prisma
npm run prisma:generate

# Sincronizar esquema con la base de datos
npm run prisma:push

# Abrir Prisma Studio (interfaz visual)
npm run prisma:studio
```

## 🏃 Ejecutar en Desarrollo

```bash
npm run dev
```

El servidor estará disponible en `http://localhost:3000`

## 📡 Endpoints Principales

### Autenticación
- `POST /api/auth/register` - Registrar usuario
- `POST /api/auth/login` - Iniciar sesión
- `GET /api/auth/me` - Obtener perfil

### Productos
- `GET /api/productos` - Listar productos
- `POST /api/productos` - Crear producto
- `PUT /api/productos/:id` - Actualizar producto
- `DELETE /api/productos/:id` - Eliminar producto

### Pedidos
- `GET /api/pedidos` - Listar pedidos
- `POST /api/pedidos` - Crear pedido
- `PUT /api/pedidos/:id/estado` - Cambiar estado

### Ventas
- `GET /api/ventas` - Listar ventas
- `POST /api/ventas` - Crear venta
- `POST /api/ventas/desde-pedido` - Crear venta desde pedido

### Reportes
- `GET /api/reportes/ventas-diarias` - Ventas del día
- `GET /api/reportes/cierre-caja` - Cierre de caja
- `GET /api/reportes/inventario` - Estado del inventario

### Configuración
- `GET /api/configuracion` - Obtener configuración
- `PUT /api/configuracion` - Actualizar configuración

## 🔐 Autenticación

Todas las rutas (excepto login y register) requieren un token JWT en el header:

```
Authorization: Bearer <token>
```

## 👥 Roles de Usuario

- `CAJERO` - Gestión de ventas y reportes
- `MESERO` - Creación de pedidos
- `ADMINISTRADOR` - Acceso completo
- `COCINA` - Visualización de pedidos
- `BEBIDAS` - Visualización de pedidos de bebidas

## 🌐 Despliegue en Vercel

El backend está configurado para desplegarse como funciones serverless en Vercel.

```bash
# Instalar Vercel CLI
npm i -g vercel

# Desplegar
vercel
```

Recuerda configurar las variables de entorno en el dashboard de Vercel:
- `DATABASE_URL`
- `JWT_SECRET`
