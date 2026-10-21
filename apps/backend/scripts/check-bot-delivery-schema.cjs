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
      AND to_regclass('public.whatsapp_dispatches') IS NOT NULL
      AND EXISTS (SELECT 1 FROM migrations WHERE name = 'DeliveryAttention1760000003000')
      AND to_regclass('public.whatsapp_status_events') IS NOT NULL
      AND to_regclass('public.conversation_attention_events') IS NOT NULL
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='conversations' AND column_name='attentionVersion')
      AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='conversation_messages' AND column_name='deliveryStatus') AND EXISTS (SELECT 1 FROM migrations WHERE name='AiUsageBudget1760000004000')
      AND to_regclass('public.ai_budget_control') IS NOT NULL
      AND to_regclass('public.ai_usage_calls') IS NOT NULL
      AND EXISTS (SELECT 1 FROM migrations WHERE name='AssistantConfiguration1760000005000')
      AND to_regclass('public.bot_config_versions') IS NOT NULL
      AND to_regclass('public.bot_config_state') IS NOT NULL
      AND to_regclass('public.bot_config_usage_refs') IS NOT NULL AS ready`);
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
