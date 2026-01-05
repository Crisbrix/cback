-- Índices para optimizar rendimiento de consultas de pedidos y mesas

-- Índice en pedidos.estado para filtrar rápidamente por estado
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado);

-- Índice en pedidos.mesa_id para joins rápidos
CREATE INDEX IF NOT EXISTS idx_pedidos_mesa_id ON pedidos(mesa_id);

-- Índice en pedidos.usuario_id para joins rápidos
CREATE INDEX IF NOT EXISTS idx_pedidos_usuario_id ON pedidos(usuario_id);

-- Índice en pedidos.creado_en/created_at para ordenamiento rápido
CREATE INDEX IF NOT EXISTS idx_pedidos_fecha_creacion ON pedidos(creado_en DESC) WHERE creado_en IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pedidos_created_at ON pedidos(created_at DESC) WHERE created_at IS NOT NULL;

-- Índice en detalles_pedido.pedido_id para búsquedas rápidas de detalles
CREATE INDEX IF NOT EXISTS idx_detalles_pedido_pedido_id ON detalles_pedido(pedido_id);

-- Índice en detalles_pedido.producto_id para joins con productos
CREATE INDEX IF NOT EXISTS idx_detalles_pedido_producto_id ON detalles_pedido(producto_id);

-- Índice en mesas.nombre para búsquedas y ordenamiento
CREATE INDEX IF NOT EXISTS idx_mesas_nombre ON mesas(nombre);

-- Índice en mesas.numero para búsquedas por número de mesa
CREATE INDEX IF NOT EXISTS idx_mesas_numero ON mesas(numero);

-- Índice en usuarios.id para joins rápidos
CREATE INDEX IF NOT EXISTS idx_usuarios_id ON usuarios(id);

-- Índice en productos.id para joins rápidos
CREATE INDEX IF NOT EXISTS idx_productos_id ON productos(id);

-- Índice compuesto para búsquedas comunes de pedidos
CREATE INDEX IF NOT EXISTS idx_pedidos_estado_mesa ON pedidos(estado, mesa_id);
