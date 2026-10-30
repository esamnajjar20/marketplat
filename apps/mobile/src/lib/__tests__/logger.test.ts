import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('logger', () => {
  it('does not write to the release console by default', async () => {
    vi.stubGlobal('__DEV__', false);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { logger } = await import('../logger');

    logger.debug('auth', 'debug');
    logger.info('auth', 'info');
    logger.warn('auth', 'warning');
    logger.error('auth', 'error');

    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });


  it('redacts camelCase and snake_case secrets in query parameters', async () => {
    vi.stubGlobal('__DEV__', true);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { logger } = await import('../logger');

    logger.info('api', 'https://example.test/?accessToken=abc&refresh_token=def&csrfToken=ghi&apiKey=jkl');

    expect(log).toHaveBeenCalledWith(
      '[MarketPlat:api]',
      'https://example.test/?accessToken=[redacted]&refresh_token=[redacted]&csrfToken=[redacted]&apiKey=[redacted]',
    );
  });

  it('redacts secrets embedded in messages and metadata in development', async () => {
    vi.stubGlobal('__DEV__', true);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { logger } = await import('../logger');

    logger.error('auth', 'request failed: token=abc Bearer xyz', {
      accessToken: 'abc',
      detail: 'csrfToken: secret-value',
    });

    expect(error).toHaveBeenCalledWith(
      '[MarketPlat:auth]',
      'request failed: token=[redacted] Bearer [redacted]',
      { accessToken: '[redacted]', detail: 'csrfToken: [redacted]' },
    );
  });
});
