// Datos sintéticos exclusivamente; nunca ejecutable contra el CRM de producción.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { fork } = require('node:child_process');
const { join } = require('node:path');
const url = new URL(process.env.DATABASE_URL || 'postgresql://invalid/invalid');
assert.equal(url.hostname, 'emeb-validation-postgres');
assert.equal(url.pathname, '/emeb_validation');
const db = require('../dist/database/data-source').default;
const { AiUsageService } = require('../dist/ai/ai-usage.service');
const { AI_PRICING, reserveCost } = require('../dist/ai/ai-pricing');
const { User } = require('../dist/users/entities/user.entity');
global.fetch = () => Promise.reject(new Error('External transport forbidden'));
const worker = () =>
  new Promise((resolve, reject) => {
    const child = fork(__filename, ['worker'], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error('Budget worker failed')),
    );
  });
(async () => {
  await db.initialize();
  const usage = new AiUsageService(db);
  if (process.argv[2] === 'worker') {
    for (let i = 0; i < 12; i++)
      await usage.reserve(AI_PRICING.model, 1000).catch((error) => {
        assert.equal(error.constructor.name, 'AiBudgetBlockedError');
      });
    await db.destroy();
    return;
  }
  assert.ok(
    (await db.query('SHOW server_version'))[0].server_version.startsWith('16.'),
  );
  const operator = await db.getRepository(User).save({
    name: 'Operador sintético',
    email: `${randomUUID()}@example.invalid`,
    password: 'not-used-for-login',
    role: 'admin',
    isActive: true,
  });
  const passed = [];
  const reset = async (limit) => {
    await db.query('DELETE FROM ai_usage_calls');
    const budget = await usage.summary();
    await usage.configure(limit, budget.version, operator.id);
    await usage.resume(operator.id);
  };
  const fittingCalls = Math.floor(1e6 / reserveCost(1000));
  assert.ok(fittingCalls < 24);
  await reset(1);
  await Promise.all([worker(), worker()]);
  let current = await usage.summary();
  assert.equal(current.calls, fittingCalls);
  assert.ok(current.accountedEur <= 1);
  assert.equal(current.blocked, true);
  assert.equal(
    (await db.query('SELECT paused FROM bot_control WHERE id=1'))[0].paused,
    true,
  );
  passed.push(
    'two independent Node workers cannot reserve the same euro balance',
  );
  await assert.rejects(usage.resume(operator.id));
  passed.push('budget pause cannot be bypassed through manual activation');
  current = await usage.summary();
  await usage.configure(100, current.version, operator.id);
  assert.equal(
    (await db.query('SELECT paused FROM bot_control WHERE id=1'))[0].paused,
    true,
  );
  assert.equal((await usage.summary()).calls, fittingCalls);
  passed.push(
    'raising the limit preserves consumption and does not resume the bot',
  );
  await reset(100);
  const id = await usage.reserve(AI_PRICING.model, 500);
  await usage.uncertain(id);
  const restarted = new AiUsageService(db);
  assert.equal(
    (await restarted.summary()).accountedEur,
    reserveCost(500) / 1e6,
  );
  passed.push(
    'uncertain calls survive a service restart without freeing the reservation',
  );
  await reset(100);
  const measured = await usage.reserve(AI_PRICING.model, 1000);
  await usage.settle(
    measured,
    {
      model: AI_PRICING.model,
      usage: {
        input_tokens: 1000,
        output_tokens: 100,
        input_tokens_details: { cached_tokens: 200, cache_write_tokens: 100 },
        output_tokens_details: { reasoning_tokens: 50 },
      },
    },
    200,
    100,
  );
  current = await usage.summary();
  assert.equal(current.inputTokens, 1000);
  assert.equal(current.outputTokens, 100);
  assert.equal(current.reasoningTokens, 50);
  assert.equal(current.pendingEur, 0);
  passed.push(
    'actual usage settles cache writes and reasoning without double counting',
  );
  await reset(100);
  let version = (await usage.summary()).version;
  const edits = await Promise.allSettled([
    usage.configure(50, version, operator.id),
    usage.configure(75, version, operator.id),
  ]);
  assert.equal(edits.filter((r) => r.status === 'fulfilled').length, 1);
  passed.push('concurrent admin updates reject the stale version');
  await reset(100);
  const old = await usage.reserve(AI_PRICING.model, 1000);
  await usage.uncertain(old);
  await db.query(
    `UPDATE ai_usage_calls SET period='2000-01';UPDATE ai_budget_control SET "blockedPeriod"='2000-01';UPDATE bot_control SET paused=true`,
  );
  assert.equal((await usage.summary()).calls, 0);
  assert.equal(
    (await db.query('SELECT paused FROM bot_control WHERE id=1'))[0].paused,
    true,
  );
  passed.push('new month excludes older calls and keeps manual pause');
  const madrid = await db.query(
    `SELECT to_char('2026-10-31 23:30:00+00'::timestamptz AT TIME ZONE 'Europe/Madrid','YYYY-MM') AS period`,
  );
  assert.equal(madrid[0].period, '2026-11');
  passed.push('monthly rollover follows Europe/Madrid rather than UTC');
  await reset(100);
  await db.destroy();
  console.log(
    JSON.stringify({
      tests: passed.length,
      passed,
      externalMessages: 0,
      externalAiCalls: 0,
    }),
  );
})().catch(async (error) => {
  console.error(
    JSON.stringify({ validationFailed: true, detail: error.message }),
  );
  if (db.isInitialized) await db.destroy().catch(() => {});
  process.exitCode = 1;
});
