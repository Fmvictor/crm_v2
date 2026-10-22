// Destructive tests: the explicit database/host guard prevents use against the CRM.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { fork } = require('node:child_process');
const { join } = require('node:path');
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
assert.equal(url.hostname, 'emeb-validation-postgres');
assert.equal(url.pathname, '/emeb_validation');
const dist = join(__dirname, '../dist');
const db = require(join(dist, 'database/data-source')).default;
const { Conversation, ConversationAiMode } = require(
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
const { ConversationsService } = require(
  join(dist, 'conversations/conversations.service'),
);
const { BotConfigService } = require(
  join(dist, 'bot-config/bot-config.service'),
);
const { AiJobStore } = require(join(dist, 'ai/ai-job.store'));
const { AiQueueService } = require(join(dist, 'ai/ai-queue.service'));
const { AiConversationProcessor } = require(
  join(dist, 'ai/ai-conversation.processor'),
);
const { WhatsAppDispatchService, DeliveryUncertainError } = require(
  join(dist, 'whatsapp/whatsapp-dispatch.service'),
);
global.fetch = () =>
  Promise.reject(
    new Error('External transport is forbidden in this validation'),
  );

async function child() {
  await db.initialize();
  const store = new AiJobStore(db);
  if (process.argv[2] === 'crash') {
    const job = await store.claim();
    process.send({ job }, () => process.exit(0));
    return;
  }
  const completed = [];
  let idle = 0;
  while (idle < 12) {
    const job = await store.claim();
    if (!job) {
      idle++;
      await db.query('SELECT pg_sleep(0.01)');
      continue;
    }
    assert.equal(
      typeof job.id,
      'string',
      'A claimed job must be a row, not a driver update tuple',
    );
    idle = 0;
    await db.query('SELECT pg_sleep(0.01)');
    await store.finish(job);
    completed.push(job.id);
  }
  await db.destroy();
  process.send({ completed });
}

function worker(mode = 'worker') {
  return new Promise((resolve, reject) => {
    const child = fork(__filename, [mode], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    let message;
    let output = '';
    child.on('message', (value) => {
      message = value;
    });
    child.stderr.on('data', (value) => {
      output += value.toString();
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0
        ? resolve(message)
        : reject(new Error(`Worker failed (${code}): ${output.slice(0, 300)}`)),
    );
  });
}

async function main() {
  await db.initialize();
  const version = (await db.query('SHOW server_version'))[0].server_version;
  assert.ok(version.startsWith('16.'), 'PostgreSQL 16 is required');
  await db.synchronize();
  await db.runMigrations();
  const conversations = new ConversationsService(
    db.getRepository(Conversation),
    db.getRepository(ConversationMessage),
    db.getRepository(PipelineEvent),
    db.getRepository(KnowledgeDocument),
  );
  const store = new AiJobStore(db);
  const dispatches = new WhatsAppDispatchService(db);
  const passed = [];
  const clean = () =>
    db.query('TRUNCATE contacts, whatsapp_dispatches CASCADE');
  const conversation = async () => {
    const contact = await db
      .getRepository(Contact)
      .save({ name: 'Validación sintética', phone: '000000001' });
    return conversations.findOrCreate(contact, randomUUID());
  };
  const inbound = (current, externalId = randomUUID()) =>
    conversations.recordMessage(current, {
      externalMessageId: externalId,
      direction: 'inbound',
      actor: 'lead',
      body: 'Prueba sintética',
      providerTimestamp: new Date(),
      queueAi: true,
    });

  await clean();
  let current = await conversation();
  const externalId = randomUUID();
  await Promise.all(
    Array.from({ length: 20 }, () => inbound(current, externalId)),
  );
  assert.equal(
    Number(
      (await db.query('SELECT count(*) FROM conversation_messages'))[0].count,
    ),
    1,
  );
  assert.equal(
    Number((await db.query('SELECT count(*) FROM ai_reply_jobs'))[0].count),
    1,
  );
  passed.push(
    '20 concurrent copies of one webhook create one message and one job',
  );

  await db.query(`CREATE FUNCTION reject_validation_job() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'synthetic job persistence failure'; END $$`);
  await db.query(
    'CREATE TRIGGER reject_validation_job BEFORE INSERT ON ai_reply_jobs FOR EACH ROW EXECUTE FUNCTION reject_validation_job()',
  );
  const rollbackId = randomUUID();
  await assert.rejects(() => inbound(current, rollbackId));
  await db.query('DROP TRIGGER reject_validation_job ON ai_reply_jobs');
  await db.query('DROP FUNCTION reject_validation_job()');
  assert.equal(
    Number(
      (
        await db.query(
          'SELECT count(*) FROM conversation_messages WHERE "externalMessageId"=$1',
          [rollbackId],
        )
      )[0].count,
    ),
    0,
  );
  passed.push(
    'a job write failure rolls back the actual message service transaction',
  );

  for (let round = 0; round < 5; round++) {
    await clean();
    for (let i = 0; i < 8; i++) {
      current = await conversation();
      for (let j = 0; j < 3; j++) await inbound(current);
    }
    const consumers = await Promise.all([worker(), worker()]);
    const completed = consumers.flatMap((result) => result.completed);
    assert.equal(completed.length, 24);
    assert.equal(new Set(completed).size, 24);
    assert.equal(
      Number(
        (
          await db.query(
            "SELECT count(*) FROM ai_reply_jobs WHERE status='completed'",
          )
        )[0].count,
      ),
      24,
    );
  }
  passed.push(
    'two independent Node processes complete 120 jobs in five rounds without duplicate claims',
  );

  await clean();
  current = await conversation();
  await inbound(current);
  const abandoned = (await worker('crash')).job;
  await db.query(
    `UPDATE ai_reply_jobs SET "lockedUntil"=now()-interval '1 second'`,
  );
  const recovered = await store.claim();
  assert.ok(recovered);
  assert.notEqual(recovered.leaseToken, abandoned.leaseToken);
  await store.finish(abandoned);
  assert.equal(
    (await db.query('SELECT status FROM ai_reply_jobs'))[0].status,
    'running',
  );
  await store.finish(recovered);
  passed.push(
    'a killed consumer is recovered and its old acknowledgement is fenced',
  );

  let sendCount = 0;
  const send = async () => {
    sendCount++;
    await db.query('SELECT pg_sleep(0.03)');
    return 'synthetic-provider-id';
  };
  const results = await Promise.allSettled(
    Array.from({ length: 12 }, () =>
      dispatches.deliver('synthetic-dispatch', { text: 'Synthetic' }, send),
    ),
  );
  assert.equal(sendCount, 1);
  assert.ok(results.some((result) => result.status === 'fulfilled'));
  assert.equal(
    (
      await db.query(
        'SELECT status FROM whatsapp_dispatches WHERE "dispatchKey"=$1',
        ['synthetic-dispatch'],
      )
    )[0].status,
    'sent',
  );
  passed.push('12 concurrent send attempts invoke the transport exactly once');

  let uncertainSends = 0;
  const uncertain = async () => {
    uncertainSends++;
    throw new Error('synthetic connection loss');
  };
  await assert.rejects(
    () => dispatches.deliver('synthetic-uncertain', {}, uncertain),
    DeliveryUncertainError,
  );
  await assert.rejects(
    () => dispatches.deliver('synthetic-uncertain', {}, uncertain),
    DeliveryUncertainError,
  );
  assert.equal(uncertainSends, 1);
  passed.push('an uncertain send is retained without automatic replay');

  await clean();
  current = await conversation();
  let message = await inbound(current);
  await dispatches.deliver(
    `reply:${message.id}`,
    { text: 'Synthetic accepted reply' },
    () => Promise.resolve('synthetic-accepted-id'),
  );
  let processorCalls = 0;
  process.env.AI_WHATSAPP_ENABLED = 'true';
  process.env.AI_RELIABLE_DELIVERY_ENABLED = 'true';
  process.env.AI_WHATSAPP_TEST_PHONES = '*';
  const queue = new AiQueueService(
    {
      process: async () => {
        processorCalls++;
      },
    },
    conversations,
    {},
    { isPaused: async () => false },
    store,
    new BotConfigService(db),
  );
  await queue.consume();
  assert.equal(processorCalls, 0);
  assert.equal(
    (await conversations.findOne(current.id)).aiMode,
    ConversationAiMode.HUMAN,
  );
  assert.equal(
    (await db.query('SELECT status FROM ai_reply_jobs'))[0].status,
    'failed',
  );
  passed.push(
    'recovery hands off an accepted send with incomplete history without calling the model',
  );

  await clean();
  current = await conversation();
  message = await inbound(current);
  let releaseModel;
  let modelEntered;
  const entered = new Promise((resolve) => {
    modelEntered = resolve;
  });
  const model = new Promise((resolve) => {
    releaseModel = resolve;
  });
  let automaticSends = 0;
  const processor = new AiConversationProcessor(
    conversations,
    {
      decide: () => {
        modelEntered();
        return model;
      },
    },
    { getContext: async () => 'Synthetic approved context' },
    {
      isPaused: async () => false,
      getLatestInstruction: async () => '',
      getApprovedExamples: async () => [],
    },
    {
      sendText: async () => {
        automaticSends++;
      },
    },
    new BotConfigService(db),
  );
  const processing = processor.process(current.id, message.id);
  await entered;
  await conversations.setMode(
    current.id,
    ConversationAiMode.HUMAN,
    'Synthetic human takeover',
  );
  releaseModel({
    reply: 'Synthetic reply',
    handoff: false,
    optIn: false,
    optOut: false,
  });
  await processing;
  assert.equal(automaticSends, 0);
  assert.equal(
    (await conversations.findOne(current.id)).aiMode,
    ConversationAiMode.HUMAN,
  );
  passed.push(
    'human takeover while the model is pending suppresses the automatic reply',
  );

  await clean();
  current = await conversation();
  message = await inbound(current);
  current = await conversations.findOne(current.id);
  const operatorId = randomUUID();
  const closed = await conversations.setStatus(
    current.id,
    'closed',
    current.lifecycleVersion,
    operatorId,
  );
  assert.equal(closed.aiMode, 'human');
  assert.equal(closed.nextFollowUpAt, null);
  assert.equal(await conversations.canAiReply(current.id, message.id), false);
  assert.equal((await conversations.findOne(current.id)).messages.length, 1);
  assert.equal(
    (
      await db.query(
        `SELECT metadata->>'actorUserId' AS actor FROM pipeline_events WHERE metadata->>'action'='conversation_closed'`,
      )
    )[0].actor,
    operatorId,
  );
  passed.push(
    'closing keeps history, cancels follow-ups, blocks AI and audits the operator',
  );
  await assert.rejects(
    () =>
      conversations.setStatus(
        current.id,
        'open',
        current.lifecycleVersion,
        operatorId,
      ),
    /ha cambiado/,
  );
  passed.push(
    'a stale lifecycle version cannot reopen a newly closed conversation',
  );
  await assert.rejects(
    () => conversations.setMode(current.id, 'auto'),
    /Reabre/,
  );
  passed.push('AI activation cannot implicitly reopen a closed conversation');
  let reopened = await conversations.setStatus(
    current.id,
    'open',
    closed.lifecycleVersion,
    operatorId,
  );
  assert.equal(reopened.aiMode, 'human');
  assert.equal(reopened.nextFollowUpAt, null);
  await conversations.setMode(
    current.id,
    'auto',
    undefined,
    undefined,
    operatorId,
  );
  assert.equal(await conversations.canAiReply(current.id, message.id), false);
  passed.push(
    'reopen stays human and voluntary activation never replays an old inbound',
  );
  await db.query('SELECT pg_sleep(0.01)');
  message = await inbound(current);
  assert.equal(await conversations.canAiReply(current.id, message.id), true);
  passed.push('only a new inbound after activation can receive an AI reply');
  reopened = await conversations.findOne(current.id);
  await inbound(current);
  await assert.rejects(
    () =>
      conversations.setStatus(
        current.id,
        'closed',
        reopened.lifecycleVersion,
        operatorId,
      ),
    /ha cambiado/,
  );
  passed.push(
    'an inbound arriving after the displayed version prevents an unseen-message closure',
  );
  reopened = await conversations.findOne(current.id);
  const competing = await Promise.allSettled([
    conversations.setStatus(
      current.id,
      'closed',
      reopened.lifecycleVersion,
      operatorId,
    ),
    conversations.setStatus(
      current.id,
      'closed',
      reopened.lifecycleVersion,
      operatorId,
    ),
  ]);
  assert.equal(competing.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(competing.filter((r) => r.status === 'rejected').length, 1);
  passed.push(
    'two simultaneous closures commit once and fence the stale operator',
  );
  const jobsBefore = Number(
    (await db.query('SELECT count(*) FROM ai_reply_jobs'))[0].count,
  );
  const newInboundId = randomUUID();
  await Promise.all(
    Array.from({ length: 12 }, () => inbound(current, newInboundId)),
  );
  reopened = await conversations.findOne(current.id);
  assert.equal(reopened.status, 'open');
  assert.equal(reopened.aiMode, 'human');
  assert.equal(reopened.attentionPending, true);
  assert.equal(reopened.attentionVersion, 1);
  assert.equal(reopened.nextFollowUpAt, null);
  assert.equal(
    Number((await db.query('SELECT count(*) FROM ai_reply_jobs'))[0].count),
    jobsBefore,
  );
  assert.equal(
    Number(
      (await db.query(`SELECT count(*) FROM conversation_attention_events`))[0]
        .count,
    ),
    1,
  );
  passed.push(
    '12 copies of a closed-conversation inbound reopen once for human attention with no AI job',
  );
  await assert.rejects(
    () =>
      conversations.setStatus(
        current.id,
        'closed',
        reopened.lifecycleVersion,
        operatorId,
      ),
    /atendida/,
  );
  passed.push('pending human attention cannot be hidden by closing');
  await clean();
  current = await conversation();
  await conversations.updateLead(current.id, { optOut: true });
  current = await conversations.findOne(current.id);
  let result = await conversations.setStatus(
    current.id,
    'closed',
    current.lifecycleVersion,
    operatorId,
  );
  result = await conversations.setStatus(
    current.id,
    'open',
    result.lifecycleVersion,
    operatorId,
  );
  assert.ok(result.optOutAt);
  await assert.rejects(() => conversations.setMode(current.id, 'auto'), /baja/);
  passed.push(
    'closure and reopening preserve opt-out and forbid AI activation',
  );

  await clean();
  const manualContact = await db
    .getRepository(Contact)
    .save({ name: 'Synthetic manual operator test', phone: '000000002' });
  current = await conversations.findOrCreate(
    manualContact,
    manualContact.phone,
  );
  await inbound(current);
  let releaseSend, enteredSend;
  const transportEntered = new Promise((resolve) => {
    enteredSend = resolve;
  });
  const transportHold = new Promise((resolve) => {
    releaseSend = resolve;
  });
  let historiesConfirmed = 0;
  const { WhatsAppService } = require(join(dist, 'whatsapp/whatsapp.service'));
  const manualService = new WhatsAppService(
    { findOneByPhone: async () => manualContact },
    { createSystemInteraction: async () => ({ id: randomUUID() }) },
    conversations,
    {},
    { captureManualResponse: async () => {} },
    {
      deliver: async () => {
        enteredSend();
        await transportHold;
        return 'synthetic-manual-' + randomUUID();
      },
      recorded: async () => {
        const count = Number(
          (
            await db.query(
              `SELECT count(*) FROM conversation_messages WHERE "conversationId"=$1 AND actor='agent'`,
              [current.id],
            )
          )[0].count,
        );
        assert.equal(
          count,
          1,
          'History is confirmed only after its transaction commits',
        );
        historiesConfirmed++;
      },
    },
    {},
    new BotConfigService(db),
  );
  const sending = manualService.sendText(
    manualContact.phone,
    'Synthetic manual reply',
    'agent',
  );
  await transportEntered;
  const duringSend = await conversations.findOne(current.id);
  let closeSettled = false;
  const closing = conversations
    .setStatus(current.id, 'closed', duringSend.lifecycleVersion, operatorId)
    .then(
      () => {
        closeSettled = true;
        throw new Error('A stale closure unexpectedly committed');
      },
      (error) => {
        closeSettled = true;
        assert.match(error.message, /ha cambiado/);
      },
    );
  await db.query('SELECT pg_sleep(0.05)');
  assert.equal(closeSettled, false);
  releaseSend();
  await sending;
  await closing;
  assert.equal(historiesConfirmed, 1);
  assert.equal((await conversations.findOne(current.id)).aiMode, 'human');
  passed.push(
    'manual delivery serializes against closure and confirms history only after commit',
  );

  current = await conversations.findOne(current.id);
  await conversations.setStatus(
    current.id,
    'closed',
    current.lifecycleVersion,
    operatorId,
  );
  const { openAttention } = require(
    join(dist, 'conversations/attention-store'),
  );
  await conversations.withConversationLock(current.id, (manager) =>
    openAttention(
      manager,
      current.id,
      'late-failure',
      'Synthetic late delivery failure',
    ),
  );
  assert.ok(
    (
      await conversations.findAll({ status: 'open', attention: true })
    ).data.some((c) => c.id === current.id),
  );
  passed.push(
    'late delivery attention on a closed conversation remains visible in the open-attention view',
  );

  await db.destroy();
  console.log(
    JSON.stringify(
      {
        postgres: version,
        architecture: process.arch,
        tests: passed.length,
        passed,
      },
      null,
      2,
    ),
  );
}

(process.argv[2] ? child() : main()).catch(async (error) => {
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
