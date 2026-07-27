/**
 * tests/unit/cloudinary.circuitBreaker.test.ts
 *
 * PROD-FIX-12 coverage: every other test file in this repo mocks the
 * WHOLE `../../src/config/cloudinary` module (see
 * cloudinaryHelpers.test.ts, ads.service.test.ts, etc.) — reasonable
 * for testing callers, but that approach can never actually exercise
 * config/cloudinary.ts's own internals (the circuit breaker wiring,
 * the timeout wrapper). This file instead mocks the underlying
 * `cloudinary` SDK package one level down, so config/cloudinary.ts's
 * real code runs — confirming the circuit breaker actually trips after
 * repeated failures and actually rejects immediately once OPEN,
 * against the real module rather than a re-implementation of its
 * expected behavior.
 *
 * jest.resetModules() + dynamic re-import per test is required because
 * uploadBreaker/deleteBreaker are module-level singletons — without a
 * fresh module instance per test, breaker state (open from a previous
 * test) would leak across tests.
 */

const mockUploadStream = jest.fn();
const mockDestroy = jest.fn();

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_stream: (...args: unknown[]) => mockUploadStream(...args),
      destroy: (...args: unknown[]) => mockDestroy(...args),
    },
  },
}));

jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

describe('config/cloudinary — circuit breaker integration', () => {
  beforeEach(() => {
    jest.resetModules();
    mockUploadStream.mockReset();
    mockDestroy.mockReset();
  });

  /**
   * Configures upload_stream's mock to simulate N consecutive
   * failures. upload_stream's real signature is
   * (options, callback) => a writable stream with .end(buffer) — the
   * callback is invoked asynchronously with (error, result).
   */
  function mockUploadStreamToFail() {
    mockUploadStream.mockImplementation((_options: unknown, callback: (err: Error | null, result: unknown) => void) => ({
      end: () => {
        // Simulate Cloudinary invoking the callback with an error,
        // asynchronously (as the real SDK does).
        setImmediate(() => callback(new Error('simulated Cloudinary failure'), null));
      },
    }));
  }

  function mockUploadStreamToSucceed() {
    mockUploadStream.mockImplementation((_options: unknown, callback: (err: Error | null, result: unknown) => void) => ({
      end: () => {
        setImmediate(() =>
          callback(null, { secure_url: 'https://cloudinary.example/img.webp', public_id: 'abc123' }),
        );
      },
    }));
  }

  it('uploadImage succeeds normally while the circuit is CLOSED', async () => {
    mockUploadStreamToSucceed();
    const { uploadImage, getCloudinaryCircuitState } = await import('../../src/config/cloudinary');

    const result = await uploadImage(Buffer.from('fake image data'), 'ads');

    expect(result).toEqual({ url: 'https://cloudinary.example/img.webp', publicId: 'abc123' });
    expect(getCloudinaryCircuitState().upload).toBe('CLOSED');
  });

  it('opens the upload circuit after 5 consecutive upload failures, then rejects the 6th call immediately', async () => {
    mockUploadStreamToFail();
    const { uploadImage, getCloudinaryCircuitState } = await import('../../src/config/cloudinary');
    const { ServiceUnavailableError } = await import('../../src/shared/errors/ServiceUnavailableError');

    for (let i = 0; i < 5; i++) {
      await expect(uploadImage(Buffer.from('x'), 'ads')).rejects.toThrow();
    }
    expect(getCloudinaryCircuitState().upload).toBe('OPEN');

    mockUploadStream.mockClear();
    await expect(uploadImage(Buffer.from('x'), 'ads')).rejects.toBeInstanceOf(ServiceUnavailableError);
    // The 6th call must be rejected WITHOUT even attempting the real
    // upload_stream call — that's the entire point of the breaker.
    expect(mockUploadStream).not.toHaveBeenCalled();
  });

  it('the upload and delete circuits are independent — 5 failed uploads do not open the delete circuit', async () => {
    mockUploadStreamToFail();
    mockDestroy.mockResolvedValue({ result: 'ok' });
    const { uploadImage, deleteImage, getCloudinaryCircuitState } = await import(
      '../../src/config/cloudinary'
    );

    for (let i = 0; i < 5; i++) {
      await expect(uploadImage(Buffer.from('x'), 'ads')).rejects.toThrow();
    }
    expect(getCloudinaryCircuitState().upload).toBe('OPEN');
    expect(getCloudinaryCircuitState().delete).toBe('CLOSED');

    // deleteImage should still work normally — a broken upload path
    // must not block deletions.
    await expect(deleteImage('some-public-id')).resolves.toBeUndefined();
    expect(mockDestroy).toHaveBeenCalledTimes(1);
  });

  it('uploadImage and uploadAvatar share the same circuit — failures via one open it for both', async () => {
    mockUploadStreamToFail();
    const { uploadImage, uploadAvatar, getCloudinaryCircuitState } = await import(
      '../../src/config/cloudinary'
    );

    for (let i = 0; i < 5; i++) {
      await expect(uploadImage(Buffer.from('x'), 'ads')).rejects.toThrow();
    }
    expect(getCloudinaryCircuitState().upload).toBe('OPEN');

    mockUploadStream.mockClear();
    const { ServiceUnavailableError } = await import('../../src/shared/errors/ServiceUnavailableError');
    await expect(uploadAvatar(Buffer.from('x'))).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(mockUploadStream).not.toHaveBeenCalled();
  });
});
