// Configuración de MySQL/TiDB con mysql2
const mysql = require('mysql2/promise');

// Función para crear pool de conexiones
function createPool() {
  // Usar variables individuales o DATABASE_URL como fallback
  const dbHost = process.env.DB_HOST;
  const dbPort = process.env.DB_PORT;
  const dbUser = process.env.DB_USER;
  const dbPassword = process.env.DB_PASSWORD;
  const dbName = process.env.DB_NAME;
  const connectionString = process.env.DATABASE_URL;
  
  let user, password, host, port, database;
  
  // Priorizar variables individuales
  if (dbHost && dbPort && dbUser && dbPassword && dbName) {
    console.log('🔍 Usando variables individuales de DB');
    user = dbUser;
    password = dbPassword;
    host = dbHost;
    port = parseInt(dbPort);
    database = dbName;
  } else if (connectionString) {
    console.log('🔍 Usando DATABASE_URL');
    // Parsear connection string de MySQL
    // Formato: mysql://user:password@host:port/database
    const urlMatch = connectionString.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
    
    if (!urlMatch) {
      throw new Error('Formato de DATABASE_URL inválido. Debe ser: mysql://user:password@host:port/database');
    }

    [, user, password, host, port, database] = urlMatch;
  } else {
    throw new Error('No se encontraron variables de conexión. Configura DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME o DATABASE_URL');
  }

  const pool = mysql.createPool({
    host: host,
    port: parseInt(port),
    user: user,
    password: password,
    database: database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    connectTimeout: 20000,
    timezone: '+00:00', // UTC para consistencia
    dateStrings: false, // Devolver fechas como objetos Date
    ssl: {
      rejectUnauthorized: false
    }
  });

  // Wrapper para compatibilidad con el código existente que usa pg
  // Convierte las consultas de PostgreSQL a MySQL
  const pgCompatiblePool = {
    query: async (text, params) => {
      try {
        let query = text;
        let finalParams = params || [];
        let lastInsertId = null;

        // Manejar RETURNING * de PostgreSQL
        if (query.includes('RETURNING *')) {
          // Extraer la parte INSERT
          const insertMatch = query.match(/(INSERT INTO\s+\w+\s*\([^)]+\)\s*VALUES\s*\([^)]+\))/i);
          if (insertMatch) {
            const insertQuery = insertMatch[1];
            // Convertir parámetros $1, $2 a ?
            let convertedQuery = insertQuery.replace(/\$(\d+)/g, '?');
            
            // Ejecutar INSERT
            const [insertResult] = await pool.execute(convertedQuery, finalParams);
            lastInsertId = insertResult.insertId;
            
            // Extraer nombre de tabla
            const tableMatch = query.match(/INSERT INTO\s+(\w+)/i);
            if (tableMatch && lastInsertId) {
              const tableName = tableMatch[1];
              // Hacer SELECT para obtener el registro insertado
              const [rows] = await pool.execute(
                `SELECT * FROM ${tableName} WHERE id = ?`,
                [lastInsertId]
              );
              return {
                rows: Array.isArray(rows) ? rows : [],
                rowCount: Array.isArray(rows) ? rows.length : 0
              };
            }
          }
        }

        // Convertir parámetros posicionales $1, $2, $3 a ? de MySQL
        if (finalParams.length > 0) {
          query = query.replace(/\$(\d+)/g, '?');
        }

        // Convertir funciones específicas de PostgreSQL a MySQL
        query = query.replace(/CURRENT_TIMESTAMP/gi, 'UTC_TIMESTAMP()');
        query = query.replace(/CURRENT_DATE\s*-\s*INTERVAL\s+'(\d+)\s+days'/gi, 'DATE_SUB(CURDATE(), INTERVAL $1 DAY)');
        query = query.replace(/CURRENT_DATE\s*\+\s*INTERVAL\s+'(\d+)\s+day'/gi, 'DATE_ADD(CURDATE(), INTERVAL $1 DAY)');
        query = query.replace(/CURRENT_DATE/gi, 'CURDATE()');
        
        // Convertir INTERVAL de PostgreSQL a MySQL (para otros casos)
        query = query.replace(/INTERVAL\s+'(\d+)\s+days'/gi, 'INTERVAL $1 DAY');
        query = query.replace(/INTERVAL\s+'(\d+)\s+day'/gi, 'INTERVAL $1 DAY');
        
        // json_agg y json_build_object (limitado, mejor reescribir estas consultas)
        // Por ahora, solo manejamos la conversión básica
        
        const [rows, fields] = await pool.execute(query, finalParams);
        
        // Si fue un INSERT y tenemos insertId pero no RETURNING, devolver el ID
        if (lastInsertId && rows.length === 0 && query.trim().toUpperCase().startsWith('INSERT')) {
          const tableMatch = query.match(/INSERT INTO\s+(\w+)/i);
          if (tableMatch) {
            const tableName = tableMatch[1];
            const [insertedRows] = await pool.execute(
              `SELECT * FROM ${tableName} WHERE id = ?`,
              [lastInsertId]
            );
            return {
              rows: Array.isArray(insertedRows) ? insertedRows : [],
              rowCount: Array.isArray(insertedRows) ? insertedRows.length : 0
            };
          }
        }
        
        // Devolver en formato compatible con pg
        return {
          rows: Array.isArray(rows) ? rows : [],
          rowCount: Array.isArray(rows) ? rows.length : 0
        };
      } catch (error) {
        console.error('Error en consulta SQL:', error);
        console.error('Query:', text);
        console.error('Params:', params);
        throw error;
      }
    },
    
    connect: async () => {
      const connection = await pool.getConnection();
      
      // Método para ejecutar transacciones
      const executeTransaction = async (callback) => {
        try {
          await connection.beginTransaction();
          const result = await callback({
            query: async (text, params) => {
              let query = text;
              if (params && params.length > 0) {
                query = text.replace(/\$(\d+)/g, '?');
              }
          query = query.replace(/CURRENT_TIMESTAMP/gi, 'UTC_TIMESTAMP()');
          query = query.replace(/CURRENT_DATE/gi, 'CURDATE()');
          query = query.replace(/NOW\(\)/gi, 'UTC_TIMESTAMP()');
          
          // Manejar RETURNING
              if (query.includes('RETURNING *')) {
                const insertMatch = query.match(/(INSERT INTO\s+\w+\s*\([^)]+\)\s*VALUES\s*\([^)]+\))/i);
                if (insertMatch) {
                  const insertQuery = insertMatch[1].replace(/\$(\d+)/g, '?');
                  const [insertResult] = await connection.query(insertQuery, params);
                  const tableMatch = query.match(/INSERT INTO\s+(\w+)/i);
                  if (tableMatch && insertResult.insertId) {
                    const [rows] = await connection.query(
                      `SELECT * FROM ${tableMatch[1]} WHERE id = ?`,
                      [insertResult.insertId]
                    );
                    return {
                      rows: Array.isArray(rows) ? rows : [],
                      rowCount: Array.isArray(rows) ? rows.length : 0
                    };
                  }
                }
              }
              
              const [rows] = await connection.query(query, params || []);
              return {
                rows: Array.isArray(rows) ? rows : [],
                rowCount: Array.isArray(rows) ? rows.length : 0
              };
            }
          });
          await connection.commit();
          return result;
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          connection.release();
        }
      };
      
      return {
        query: async (text, params) => {
          let query = text;
          if (params && params.length > 0) {
            query = text.replace(/\$(\d+)/g, '?');
          }
          query = query.replace(/CURRENT_TIMESTAMP/gi, 'UTC_TIMESTAMP()');
          query = query.replace(/CURRENT_DATE/gi, 'CURDATE()');
          query = query.replace(/NOW\(\)/gi, 'UTC_TIMESTAMP()');
          
          // Manejar comandos de transacción
          if (query.trim().toUpperCase() === 'BEGIN') {
            await connection.beginTransaction();
            return { rows: [], rowCount: 0 };
          }
          if (query.trim().toUpperCase() === 'COMMIT') {
            await connection.commit();
            return { rows: [], rowCount: 0 };
          }
          if (query.trim().toUpperCase() === 'ROLLBACK') {
            await connection.rollback();
            return { rows: [], rowCount: 0 };
          }
          
          // Manejar RETURNING
          if (query.includes('RETURNING *')) {
            const insertMatch = query.match(/(INSERT INTO\s+\w+\s*\([^)]+\)\s*VALUES\s*\([^)]+\))/i);
            if (insertMatch) {
              const insertQuery = insertMatch[1].replace(/\$(\d+)/g, '?');
              const [insertResult] = await connection.query(insertQuery, params);
              const tableMatch = query.match(/INSERT INTO\s+(\w+)/i);
              if (tableMatch && insertResult.insertId) {
                const [rows] = await connection.query(
                  `SELECT * FROM ${tableMatch[1]} WHERE id = ?`,
                  [insertResult.insertId]
                );
                return {
                  rows: Array.isArray(rows) ? rows : [],
                  rowCount: Array.isArray(rows) ? rows.length : 0
                };
              }
            }
          }
          
          const [rows] = await connection.query(query, params || []);
          return {
            rows: Array.isArray(rows) ? rows : [],
            rowCount: Array.isArray(rows) ? rows.length : 0
          };
        },
        release: () => connection.release(),
        queryAsync: connection.query.bind(connection)
      };
    },
    
    end: async () => {
      await pool.end();
    }
  };

  // Test de conexión
  pool.getConnection()
    .then(connection => {
      console.log('✅ Conectado a MySQL/TiDB');
      connection.release();
    })
    .catch(err => {
      console.error('❌ Error al conectar a MySQL/TiDB:', err.message);
    });

  return pgCompatiblePool;
}

const pool = createPool();

module.exports = pool;
