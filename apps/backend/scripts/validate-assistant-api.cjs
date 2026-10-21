// Sólo contra la API y la base aisladas, sin mensajes ni proveedores externos.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { JwtService } = require('@nestjs/jwt');
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
assert.equal(url.hostname, 'emeb-validation-postgres');
assert.equal(url.pathname, '/emeb_validation');
assert.equal(process.env.AI_WHATSAPP_ENABLED, 'false');
const db = require('../dist/database/data-source').default;

(async () => {
  await db.initialize();
  const base = 'http://127.0.0.1:3001/api/v1';
  const request = (path, method = 'GET', body, token) => fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
  for (let attempt = 0; attempt < 30; attempt++) {
    try { if ((await request('')).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  assert.equal((await request('/bot-config')).status, 401);
  const tokens = {};
  for (const role of ['admin', 'agent', 'viewer']) {
    const id = randomUUID(), email = `${id}@example.invalid`;
    await db.query(`INSERT INTO users(id,name,email,password,role,"isActive") VALUES ($1,'Usuario sintético',$2,'not-for-login',$3,true)`, [id, email, role]);
    tokens[role] = new JwtService({ secret: process.env.JWT_SECRET }).sign({ sub: id, email }, { expiresIn: '5m' });
  }
  const paths = [['/bot-config', 'GET'], ['/bot-config/draft', 'PUT'], ['/bot-config/validate', 'POST'], ['/bot-config/publish', 'POST'], ['/bot-config/restore/1', 'POST'], ['/bot-config/preview', 'POST']];
  for (const role of ['agent', 'viewer']) for (const [path, method] of paths) assert.equal((await request(path, method, method === 'GET' ? undefined : {}, tokens[role])).status, 403, role + ':' + path);
  const passed = ['JWT required and admin authorization enforced on all six routes for both other roles'];
  const admin = (path, method = 'GET', body) => request(path, method, body, tokens.admin);
  const initial = await (await admin('/bot-config')).json();
  assert.ok(initial.activeInstructions.includes('CONTRATO TÉCNICO PROTEGIDO'));
  const configuration = { ...initial.state.draft, assistant: '# Instrucciones HTTP sintéticas', rules: { ...initial.state.draft.rules, webEnabled: false }, documents: [{ id: randomUUID(), name: 'curso.md', content: '# Curso de prueba\nIncluye revisión de bicicleta.', enabled: true, validUntil: null }] };
  const invalid = await admin('/bot-config/draft', 'PUT', { revision: initial.state.draftRevision, configuration: { ...configuration, bypassOptOut: true } });
  assert.equal(invalid.status, 400);
  const saving = await admin('/bot-config/draft', 'PUT', { revision: initial.state.draftRevision, configuration });
  assert.equal(saving.status, 200);
  const saved = await saving.json();
  assert.equal(saved.active.version, initial.active.version);
  assert.equal((await admin('/bot-config/publish', 'POST', { revision: saved.state.draftRevision, activeVersion: initial.active.version })).status, 409);
  passed.push('HTTP draft save preserves the published version and publication requires validation');
  const preview = await admin('/bot-config/preview', 'POST', { revision: saved.state.draftRevision, question: '¿Qué incluye el curso?', useAi: false });
  assert.equal(preview.status, 201);
  const prepared = await preview.json();
  assert.equal(prepared.aiUsed, false);
  assert.ok(prepared.context.includes('revisión de bicicleta'));
  assert.equal(prepared.sources[0].name, 'curso.md');
  assert.equal((await admin('/bot-config/preview', 'POST', { revision: saved.state.draftRevision - 1, question: 'Prueba', useAi: false })).status, 400);
  passed.push('HTTP static preview uses saved Markdown and rejects stale revisions');
  assert.equal((await admin('/bot-config/validate', 'POST', { revision: saved.state.draftRevision })).status, 201);
  const publication = await admin('/bot-config/publish', 'POST', { revision: saved.state.draftRevision, activeVersion: initial.active.version });
  assert.equal(publication.status, 201);
  const active = await (await admin('/bot-config')).json();
  assert.notEqual(active.active.version, initial.active.version);
  assert.equal(active.active.configuration.assistant, configuration.assistant);
  const recovery = await admin(`/bot-config/restore/${initial.active.version}`, 'POST', { revision: active.state.draftRevision });
  assert.equal(recovery.status, 201);
  const restored = await recovery.json();
  assert.equal(restored.active.version, active.active.version);
  assert.deepEqual(restored.state.draft, initial.active.configuration);
  passed.push('HTTP publication switches the active version; recovery changes only the draft');
  const budget = await (await admin('/ai-usage')).json();
  assert.equal((await admin('/ai-usage/budget', 'PATCH', { monthlyLimitEur: 0, version: budget.version })).status, 200);
  const safeDraft = await (await admin('/bot-config/draft', 'PUT', { revision: restored.state.draftRevision, configuration })).json();
  const beforeCalls = Number((await db.query('SELECT count(*) FROM ai_usage_calls'))[0].count);
  const blocked = await admin('/bot-config/preview', 'POST', { revision: safeDraft.state.draftRevision, question: '¿Qué incluye el curso?', useAi: true });
  assert.equal(blocked.status, 400);
  assert.equal(Number((await db.query('SELECT count(*) FROM ai_usage_calls'))[0].count), beforeCalls);
  passed.push('AI preview respects the same zero-budget block before making any generation');
  assert.equal((await admin('/ai-guidance/instructions', 'POST', { text: 'No utilizar esta ruta antigua' })).status, 409);
  passed.push('legacy instruction endpoint cannot mutate a second prompt source');
  await db.destroy();
  console.log(JSON.stringify({ tests: passed.length, passed }, null, 2));
})().catch(async error => {
  console.error(JSON.stringify({ validationFailed: true, code: error.code || error.name, detail: error.message }));
  if (db.isInitialized) await db.destroy().catch(() => undefined);
  process.exitCode = 1;
});
