import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
});

test('serializes nested bigint values in production logs without throwing', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.resetModules();
  const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
  const { logger } = await import('./logger.mts');

  expect(() => logger.info('Updated settings', {
    result: { numInsertedOrUpdatedRows: 1n, nested: { count: 2n } },
  })).not.toThrow();
  expect(JSON.parse(String(info.mock.calls[0]?.[0]))).toEqual({
    level: 'info',
    message: 'Updated settings',
    result: { numInsertedOrUpdatedRows: '1', nested: { count: '2' } },
  });
});

test('preserves structured errors whose causes contain bigint values', async () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.resetModules();
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { logger } = await import('./logger.mts');
  const error = new Error('outer', { cause: { affectedRows: 3n } });

  expect(() => logger.error('Database failed', error)).not.toThrow();
  expect(JSON.parse(String(errorLog.mock.calls[0]?.[0])).error.cause).toEqual({ affectedRows: '3' });
});
