// Sólo una base sintética en la red de validación; nunca producción.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { fork } = require('node:child_process');
const { join } = require('node:path');
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
assert.equal(url.hostname, 'emeb-validation-postgres');
assert.equal(url.pathname, '/emeb_validation');
const dist = join(__dirname, '../dist');
const db = require(join(dist, 'database/data-source')).default;
const { ConversationsService } = require(
  join(dist, 'conversations/conversations.service'),
);
const { Conversation } = require(
  join(dist, 'conversations/entities/conversation.entity'),
);
const { ConversationMessage } = require(
  join(dist, 'conversations/entities/conversation-message.entity'),
);
const { PipelineEvent } = require(
  join(dist, 'conversations/entities/pipeline-event.entity'),
);
const { KnowledgeDocument } = require(
  join(dist, 'knowledge/entities/knowledge-document.entity'),
);
const { Contact } = require(join(dist, 'contacts/entities/contact.entity'));
const { User } = require(join(dist, 'users/entities/user.entity'));
const { WhatsAppStatusService } = require(
  join(dist, 'whatsapp/whatsapp-status.service'),
);
global.fetch = () => Promise.reject(new Error('External transport forbidden'));
const child = () =>
  new Promise((resolve, reject) => {
    const process = fork(__filename, ['worker'], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    process.on('error', reject);
    process.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('Status worker failed')),
    );
  });

(async () => {
  await db.initialize();
  if (process.argv[2] === 'worker') {
    await new WhatsAppStatusService(db).reconcilePending();
    await db.destroy();
    return;
  }
  assert.ok(
    (await db.query('SHOW server_version'))[0].server_version.startsWith('16.'),
  );
  const service = new ConversationsService(
    db.getRepository(Conversation),
    db.getRepository(ConversationMessage),
    db.getRepository(PipelineEvent),
    db.getRepository(KnowledgeDocument),
  );
  const receipts = new WhatsAppStatusService(db);
  const operator = await db.getRepository(User).save({
    name: 'Operador sintético',
    email: `${randomUUID()}@example.invalid`,
    password: 'synthetic-not-used-for-login',
    role: 'admin',
    isActive: true,
  });
  const passed = [];
  const clean = () =>
    db.query('TRUNCATE contacts,whatsapp_status_events CASCADE');
  const create = async () => {
    const contact = await db
      .getRepository(Contact)
      .save({ name: 'Validación sintética', phone: '000000001' });
    const conversation = await service.findOrCreate(contact, '000000001');
    const provider = 'synthetic-' + randomUUID();
    const message = () =>
      service.recordMessage(conversation, {
        externalMessageId: provider,
        direction: 'outbound',
        actor: 'ai',
        body: 'Prueba sintética',
      });
    const event = (
      status,
      timestamp = '1700000000',
      recipient_id = '000000001',
    ) => ({
      id: provider,
      status,
      timestamp,
      recipient_id,
      errors: status === 'failed' ? [{ code: 131026 }] : undefined,
    });
    return { conversation, provider, message, event };
  };

  await clean();
  let c = await create();
  await c.message();
  await Promise.all(
    Array.from({ length: 20 }, () => receipts.record([c.event('delivered')])),
  );
  await receipts.reconcilePending();
  assert.equal(
    Number(
      (await db.query('SELECT count(*) AS n FROM whatsapp_status_events'))[0].n,
    ),
    1,
  );
  assert.equal(
    (await service.findOne(c.conversation.id)).messages[0].deliveryStatus,
    'delivered',
  );
  passed.push('twenty concurrent duplicate callbacks persist one event');

  await clean();
  c = await create();
  await c.message();
  await receipts.record([
    c.event('read'),
    c.event('sent', '1700000002'),
    c.event('failed', '1700000003'),
  ]);
  await Promise.all([child(), child()]);
  assert.equal(
    (await service.findOne(c.conversation.id)).messages[0].deliveryStatus,
    'read',
  );
  assert.equal(
    (await service.findOne(c.conversation.id)).attentionPending,
    false,
  );
  passed.push(
    'two Node workers reconcile unordered callbacks without regression or false alert',
  );

  await clean();
  c = await create();
  await c.message();
  await receipts.record([c.event('sent')]);
  let interleaved = false;
  const racingReceipts = new WhatsAppStatusService({
    query: (...args) => db.query(...args),
    transaction: (action) =>
      db.transaction((manager) =>
        action({
          query: async (...args) => {
            const result = await manager.query(...args);
            if (args[0].startsWith('SELECT id,status') && !interleaved) {
              interleaved = true;
              await receipts.record([c.event('delivered', '1700000001')]);
            }
            return result;
          },
        }),
      ),
  });
  await racingReceipts.reconcilePending();
  assert.equal(
    (await service.findOne(c.conversation.id)).messages[0].deliveryStatus,
    'sent',
  );
  assert.equal(
    Number(
      (
        await db.query(
          'SELECT count(*) AS n FROM whatsapp_status_events WHERE "processedAt" IS NULL',
        )
      )[0].n,
    ),
    1,
  );
  await receipts.reconcilePending();
  assert.equal(
    (await service.findOne(c.conversation.id)).messages[0].deliveryStatus,
    'delivered',
  );
  passed.push(
    'callback committed on a second connection during reconciliation remains pending and is applied next cycle',
  );

  await clean();
  c = await create();
  await c.message();
  await receipts.record([c.event('failed')]);
  await receipts.reconcilePending();
  let current = await service.findOne(c.conversation.id);
  assert.equal(current.aiMode, 'human');
  assert.equal(current.attentionPending, true);
  assert.equal(current.attentionVersion, 1);
  assert.equal(current.nextFollowUpAt, null);
  await assert.rejects(service.setMode(current.id, 'auto'), /atendida/);
  await service.acknowledgeAttention(current.id, 1, operator.id);
  await receipts.record([c.event('failed', '1700000004')]);
  await receipts.reconcilePending();
  current = await service.findOne(current.id);
  assert.equal(current.attentionPending, false);
  assert.equal(current.attentionVersion, 1);
  assert.equal(current.aiMode, 'human');
  assert.equal(current.attentionAcknowledgedBy, operator.id);
  passed.push(
    'failed delivery is durable; acknowledgement does not enable AI; old failure cannot reopen it',
  );

  await clean();
  c = await create();
  await receipts.record([c.event('delivered')]);
  await receipts.reconcilePending();
  assert.equal(
    (await db.query('SELECT "processedAt" FROM whatsapp_status_events'))[0]
      .processedAt,
    null,
  );
  await c.message();
  await receipts.reconcilePending();
  assert.equal(
    (await service.findOne(c.conversation.id)).messages[0].deliveryStatus,
    'delivered',
  );
  passed.push(
    'callback preceding outbound history is reconciled after the message is recorded',
  );

  await clean();
  c = await create();
  await c.message();
  await receipts.record([c.event('failed', '1700000000', '999000000001')]);
  await receipts.reconcilePending();
  current = await service.findOne(c.conversation.id);
  assert.equal(current.messages[0].deliveryStatus, null);
  assert.equal(current.attentionPending, false);
  passed.push(
    'recipient mismatch never updates a conversation based on suffix matching',
  );

  await service.setMode(current.id, 'human', 'Primera prueba', 'test:one');
  const results = await Promise.allSettled([
    service.acknowledgeAttention(current.id, 1, operator.id),
    service.setMode(current.id, 'human', 'Nueva prueba', 'test:two'),
  ]);
  assert.equal(results[1].status, 'fulfilled');
  current = await service.findOne(current.id);
  assert.equal(current.attentionPending, true);
  assert.equal(current.attentionVersion, 2);
  await assert.rejects(
    service.acknowledgeAttention(current.id, 1, operator.id),
    /más reciente/,
  );
  passed.push('concurrent acknowledgement cannot close a newer request');

  await db.query(`UPDATE conversations SET status='closed' WHERE id=$1`, [
    current.id,
  ]);
  assert.equal(
    (await service.findAll({ attention: true })).data[0].id,
    current.id,
  );
  passed.push(
    'pending attention remains visible even for a closed conversation',
  );

  await db.destroy();
  console.log(
    JSON.stringify({ tests: passed.length, passed, externalMessages: 0 }),
  );
})().catch(async (error) => {
  console.error(
    JSON.stringify({
      validationFailed: true,
      code: error.code || error.name,
      detail: error.message,
    }),
  );
  if (db.isInitialized) await db.destroy().catch(() => undefined);
  process.exitCode = 1;
});
