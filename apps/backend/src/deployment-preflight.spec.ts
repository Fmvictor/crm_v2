import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

describe('Deployment schema preflight', () => {
  const source = readFileSync(
    join(__dirname, '../scripts/check-bot-delivery-schema.cjs'),
    'utf8',
  );
  async function run(ready: boolean, databaseFailure = false) {
    const processState = { env: {}, exitCode: 0 };
    const log = jest.fn();
    const error = jest.fn();
    const end = jest.fn().mockResolvedValue(undefined);
    class Client {
      connect = () => Promise.resolve();
      query = () =>
        databaseFailure
          ? Promise.reject(new Error('synthetic private error'))
          : Promise.resolve({ rows: [{ ready }] });
      end = end;
    }
    runInNewContext(source, {
      require: () => ({ Client }),
      process: processState,
      console: { log, error },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    return { processState, log, error, end };
  }
  it('allows an application update only after verifying its schema', async () => {
    const result = await run(true);
    expect(result.processState.exitCode).toBe(0);
    expect(result.log).toHaveBeenCalled();
    expect(result.end).toHaveBeenCalled();
  });
  it('stops the deployment when the migration is missing', async () => {
    const result = await run(false);
    expect(result.processState.exitCode).toBe(1);
    expect(result.error).toHaveBeenCalledWith(
      expect.stringContaining('Despliegue detenido'),
    );
  });
  it('fails closed without exposing a database error', async () => {
    const result = await run(true, true);
    expect(result.processState.exitCode).toBe(1);
    expect(JSON.stringify(result.error.mock.calls)).not.toContain(
      'synthetic private error',
    );
  });
});
