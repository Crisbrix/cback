// Script para aplicar índices de optimización a la base de datos
const pool = require('./api/config/database');
const fs = require('fs');
const path = require('path');

const applyIndexes = async () => {
  try {
    console.log('🔍 Iniciando aplicación de índices de optimización...\n');

    // Leer el archivo de migraciones
    const migrationPath = path.join(__dirname, 'migrations', 'add_performance_indexes.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Dividir por punto y coma y filtrar líneas vacías
    const statements = sql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    let successCount = 0;
    let errorCount = 0;

    for (const statement of statements) {
      try {
        await pool.query(statement);
        const indexName = statement.match(/CREATE INDEX IF NOT EXISTS (\w+)/)?.[1] || 'unknown';
        console.log(`✅ ${indexName}`);
        successCount++;
      } catch (error) {
        if (error.message.includes('already exists')) {
          const indexName = statement.match(/CREATE INDEX IF NOT EXISTS (\w+)/)?.[1] || 'unknown';
          console.log(`⏭️  ${indexName} (ya existe)`);
          successCount++;
        } else {
          console.error(`❌ Error: ${error.message}`);
          errorCount++;
        }
      }
    }

    console.log(`\n📊 Resumen:`);
    console.log(`✅ Índices aplicados/existentes: ${successCount}`);
    console.log(`❌ Errores: ${errorCount}`);

    if (errorCount === 0) {
      console.log('\n🎉 ¡Optimización completada exitosamente!');
      console.log('\n📈 Mejoras esperadas:');
      console.log('  • Carga de mesas: 5-10x más rápido');
      console.log('  • Listar pedidos: 5-10x más rápido');
      console.log('  • Cambio de estado: 3-5x más rápido');
      console.log('  • Adicionar productos: 3-5x más rápido');
    }

    process.exit(errorCount > 0 ? 1 : 0);
  } catch (error) {
    console.error('❌ Error fatal:', error.message);
    process.exit(1);
  }
};

applyIndexes();
