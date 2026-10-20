// Execute through stdin inside the isolated candidate API container, never production.
const assert = require('node:assert/strict');
const { randomUUID, randomBytes, createHmac } = require('node:crypto');
const { createServer } = require('node:http');
const bcrypt = require('bcrypt');
const { JwtService } = require('@nestjs/jwt');
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
assert.equal(url.hostname, 'emeb-validation-postgres');
assert.equal(url.pathname, '/emeb_validation');
assert.equal(process.env.WHATSAPP_API_URL, 'http://127.0.0.1:3999/v25.0');
assert.equal(process.env.AI_WHATSAPP_ENABLED, 'false');
const db = require('./dist/database/data-source').default;
let transportCalls = 0;
let server;

async function main() {
  server = createServer((request, response) => {
    assert.equal(request.url, '/v25.0/validation-phone/messages');
    transportCalls++;
    request.resume();
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        messages: [{ id: `synthetic-provider-${randomUUID()}` }],
      }),
    );
  });
  await new Promise((resolve) => server.listen(3999, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:3001/api/v1';
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const request = (path, options = {}) =>
    fetch(`${base}${path}`, { ...options, signal: AbortSignal.timeout(5000) });
  assert.equal((await request('')).status, 200);
  assert.equal((await request('/conversations')).status, 401);
  await db.initialize();
  await db.query(
    'TRUNCATE contacts, whatsapp_dispatches, whatsapp_status_events CASCADE',
  );
  const password = randomBytes(24).toString('hex');
  const hash = await bcrypt.hash(password, 4);
  const userId = randomUUID();
  const email = `validation-${randomUUID()}@example.invalid`;
  await db.query(
    `INSERT INTO users (id,name,email,password,role,"isActive") VALUES ($1,'Synthetic validation',$2,$3,'admin',true)`,
    [userId, email, hash],
  );
  const login = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.status, 200);
  const token = (await login.json()).accessToken;
  assert.ok(token);
  const auth = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const refreshCookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal(
    (
      await request('/auth/refresh', {
        method: 'POST',
        headers: { Cookie: refreshCookie },
      })
    ).status,
    200,
  );
  assert.equal(
    (await request('/conversations', { headers: auth })).status,
    200,
  );

  const externalId = `synthetic-http-${randomUUID()}`;
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: 'validation-phone' },
              messages: [
                {
                  id: externalId,
                  from: '000000001',
                  type: 'text',
                  text: { body: 'Prueba sintética HTTP' },
                  timestamp: String(Math.floor(Date.now() / 1000)),
                },
              ],
            },
          },
        ],
      },
    ],
  };
  const postWebhook = (body, signature) =>
    request('/whatsapp/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': signature,
      },
      body,
    });
  const sign = (body) =>
    `sha256=${createHmac('sha256', process.env.WHATSAPP_APP_SECRET).update(body).digest('hex')}`;
  const raw = JSON.stringify(payload);
  assert.equal(
    (await postWebhook(raw, `sha256=${'0'.repeat(64)}`)).status,
    401,
  );
  const malformed = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: 'invalid',
  });
  assert.equal((await postWebhook(malformed, sign(malformed))).status, 400);
  assert.equal((await postWebhook(raw, sign(raw))).status, 200);
  assert.equal((await postWebhook(raw, sign(raw))).status, 200);
  const rows = await db.query(
    'SELECT "conversationId" FROM conversation_messages WHERE "externalMessageId"=$1',
    [externalId],
  );
  assert.equal(rows.length, 1);
  assert.equal(
    Number(
      (
        await db.query(
          'SELECT count(*) FROM interactions WHERE "externalMessageId"=$1',
          [externalId],
        )
      )[0].count,
    ),
    1,
  );
  const conversationId = rows[0].conversationId;
  assert.equal(
    (
      await request(`/conversations/${conversationId}/send`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ text: 'Respuesta manual sintética' }),
      })
    ).status,
    201,
  );
  const conversation = await (
    await request(`/conversations/${conversationId}`, { headers: auth })
  ).json();
  assert.equal(conversation.aiMode, 'human');
  assert.equal(
    conversation.messages.filter((message) => message.actor === 'agent').length,
    1,
  );
  assert.equal(transportCalls, 1);
  assert.equal(
    Number(
      (
        await db.query(
          `SELECT count(*) FROM whatsapp_dispatches WHERE status='sent' AND "historyRecorded"`,
        )
      )[0].count,
    ),
    1,
  );
  assert.equal(
    (
      await request(`/conversations/${conversationId}/mode`, {
        method: 'PATCH',
        headers: auth,
        body: JSON.stringify({ aiMode: 'auto' }),
      })
    ).status,
    200,
  );
  const viewer = randomUUID();
  await db.query(
    `INSERT INTO users (id,name,email,password,role,"isActive") VALUES ($1,'Synthetic viewer',$2,$3,'viewer',true)`,
    [viewer, `viewer-${randomUUID()}@example.invalid`, hash],
  );
  const viewerToken = new JwtService().sign(
    { sub: viewer },
    { secret: process.env.JWT_SECRET, expiresIn: '1m' },
  );
  assert.equal(
    (
      await request(`/conversations/${conversationId}/send`, {
        method: 'POST',
        headers: { ...auth, Authorization: `Bearer ${viewerToken}` },
        body: JSON.stringify({ text: 'Blocked synthetic reply' }),
      })
    ).status,
    403,
  );
  assert.equal(transportCalls, 1);
  const outbound = (
    await db.query(
      `SELECT "externalMessageId" FROM conversation_messages WHERE "conversationId"=$1 AND direction='outbound'`,
      [conversationId],
    )
  )[0];
  const receipt = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: 'validation-phone' },
              statuses: [
                {
                  id: outbound.externalMessageId,
                  recipient_id: '000000001',
                  status: 'failed',
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  errors: [{ code: 131026 }],
                },
              ],
            },
          },
        ],
      },
    ],
  });
  assert.equal(
    (await postWebhook(receipt, `sha256=${'0'.repeat(64)}`)).status,
    401,
  );
  assert.equal((await postWebhook(receipt, sign(receipt))).status, 200);
  assert.equal((await postWebhook(receipt, sign(receipt))).status, 200);
  let attention;
  for (let attempt = 0; attempt < 25; attempt++) {
    attention = await (
      await request(`/conversations/${conversationId}`, { headers: auth })
    ).json();
    if (attention.attentionPending) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.equal(attention.aiMode, 'human');
  assert.equal(attention.attentionPending, true);
  assert.equal(attention.nextFollowUpAt, null);
  assert.equal(
    attention.messages.find((message) => message.actor === 'agent')
      .deliveryStatus,
    'failed',
  );
  const endpoint = `/conversations/${conversationId}/attention/acknowledge`;
  assert.equal(
    (
      await request(endpoint, {
        method: 'POST',
        headers: { ...auth, Authorization: `Bearer ${viewerToken}` },
        body: JSON.stringify({ version: attention.attentionVersion }),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(endpoint, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ version: attention.attentionVersion - 1 }),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(`/conversations/${conversationId}/mode`, {
        method: 'PATCH',
        headers: auth,
        body: JSON.stringify({ aiMode: 'auto' }),
      })
    ).status,
    409,
  );
  const acknowledged = await request(endpoint, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ version: attention.attentionVersion }),
  });
  assert.equal(acknowledged.status, 201);
  const ack = await acknowledged.json();
  assert.equal(ack.aiMode, 'human');
  assert.equal(ack.attentionPending, false);
  assert.equal(transportCalls, 1);
  const viewerHeaders = { ...auth, Authorization: `Bearer ${viewerToken}` };
  assert.equal(
    (await request('/ai-usage', { headers: viewerHeaders })).status,
    403,
  );
  assert.equal(
    (
      await request('/ai-usage/budget', {
        method: 'PATCH',
        headers: viewerHeaders,
        body: JSON.stringify({ monthlyLimitEur: 100, version: 0 }),
      })
    ).status,
    403,
  );
  let budget = await (await request('/ai-usage', { headers: auth })).json();
  assert.equal(
    (
      await request('/ai-usage/budget', {
        method: 'PATCH',
        headers: auth,
        body: JSON.stringify({ monthlyLimitEur: 0, version: budget.version }),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await request('/ai-guidance/paused', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ paused: false }),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request('/ai-usage/budget', {
        method: 'PATCH',
        headers: auth,
        body: JSON.stringify({ monthlyLimitEur: 100, version: budget.version }),
      })
    ).status,
    409,
  );
  budget = await (await request('/ai-usage', { headers: auth })).json();
  assert.equal(
    (
      await request('/ai-usage/budget', {
        method: 'PATCH',
        headers: auth,
        body: JSON.stringify({ monthlyLimitEur: 100, version: budget.version }),
      })
    ).status,
    200,
  );
  const guidance = await (
    await request('/ai-guidance', { headers: auth })
  ).json();
  assert.equal(guidance.paused, true);
  assert.equal(
    (
      await request('/ai-usage/budget', {
        method: 'PATCH',
        headers: auth,
        body: JSON.stringify({
          monthlyLimitEur: '100',
          version: budget.version + 1,
        }),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request('/ai-guidance/paused', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ paused: false }),
      })
    ).status,
    201,
  );
  await db.destroy();
  await new Promise((resolve) => server.close(resolve));
  console.log(
    JSON.stringify(
      {
        api: true,
        budgetRoles: true,
        budgetConflict: true,
        budgetBlocksResume: true,
        budgetChangeKeepsPause: true,
        explicitResume: true,
        signedStatusCallbacks: true,
        deliveryFailurePersistent: true,
        staleAcknowledgementRejected: true,
        viewerAcknowledgementRejected: true,
        acknowledgementKeepsHumanMode: true,
        authentication: true,
        refresh: true,
        anonymousRejected: true,
        invalidSignatureRejected: true,
        invalidEnvelopeRejected: true,
        duplicateWebhookDeduplicated: true,
        manualSendAndHistory: true,
        humanMode: true,
        adminResume: true,
        viewerSendRejected: true,
        localTransportCalls: transportCalls,
        externalMessages: 0,
      },
      null,
      2,
    ),
  );
}

main().catch(async (error) => {
  console.error(
    JSON.stringify({
      isolatedApiValidationFailed: true,
      detail: error.message,
    }),
  );
  if (db.isInitialized) await db.destroy().catch(() => undefined);
  server?.close();
  process.exitCode = 1;
});
