// Run through the current backend container, which supplies pg and its private environment.
const { Client } = require('pg');
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
  query_timeout: 5000,
});

async function check() {
  try {
    await client.connect();
    const { rows } = await client.query(`SELECT
      EXISTS (SELECT 1 FROM migrations WHERE name = 'ReliableBotDelivery1760000002000')
      AND to_regclass('public.ai_reply_jobs') IS NOT NULL
      AND to_regclass('public.whatsapp_dispatches') IS NOT NULL AS ready`);
    if (rows[0]?.ready !== true) throw new Error('Schema pending');
    console.log('Migración de entrega persistente verificada.');
  } finally {
    await client.end();
  }
}

void check().catch(() => {
  console.error('Despliegue detenido: preparar y verificar la migración del bot antes de actualizar la aplicación.');
  process.exitCode = 1;
});
