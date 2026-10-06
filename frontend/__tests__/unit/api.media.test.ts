import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  getNetworkPolicy: vi.fn(),
  recordUploadAttempt: vi.fn(),
  recordUploadResult: vi.fn(),
}));

vi.mock('@/api/client', () => ({ apiClient: { post: mocks.post } }));
vi.mock('@/lib/networkPolicy', () => ({ getNetworkPolicy: mocks.getNetworkPolicy }));
vi.mock('@/lib/networkErrors', () => ({ isNetworkFailure: (error: unknown) => {
  if (!error || typeof error !== 'object') return false;
  const e = error as { response?: unknown; request?: unknown; statusCode?: number; code?: string };
  if (e.response != null) return false;
  return e.statusCode === 0 || e.request != null || ['NETWORK_ERROR', 'ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(e.code ?? '');
} }));
vi.mock('@/lib/networkObservability', () => ({
  recordUploadAttempt: mocks.recordUploadAttempt,
  recordUploadResult: mocks.recordUploadResult,
}));

import { mediaApi } from '@/api/media.api';

describe('mediaApi adaptive upload on flaky networks', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.post.mockReset();
    mocks.recordUploadAttempt.mockReset();
    mocks.recordUploadResult.mockReset();
    mocks.getNetworkPolicy.mockReturnValue({
      uploadConcurrency: 1,
      uploadTimeoutMs: 40_000,
      uploadRetryDelaysMs: [1_000],
    });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('retries a transient network failure and succeeds without changing the file payload', async () => {
    const firstError = Object.assign(new Error('network'), { code: 'NETWORK_ERROR', statusCode: 0 });
    mocks.post.mockRejectedValueOnce(firstError).mockResolvedValueOnce({ data: { success: true } });

    const file = new File(['hello'], 'photo.jpg', { type: 'image/jpeg' });
    const promise = mediaApi.uploadImages([file]);
    await vi.runAllTimersAsync();
    const response = await promise;

    expect(response.data.success).toBe(true);
    expect(mocks.post).toHaveBeenCalledTimes(2);
    expect(mocks.recordUploadAttempt).toHaveBeenCalledTimes(2);
    expect(mocks.recordUploadResult).toHaveBeenNthCalledWith(1, false);
    expect(mocks.recordUploadResult).toHaveBeenNthCalledWith(2, true);
    expect(mocks.post.mock.calls[0]?.[1]).toBeInstanceOf(FormData);
    expect(mocks.post.mock.calls[1]?.[1]).toBeInstanceOf(FormData);
  });

  it.each(['ERR_NETWORK', 'ETIMEDOUT'])('retries Axios %s network failures', async (code) => {
    const firstError = Object.assign(new Error('network'), { code });
    mocks.post.mockRejectedValueOnce(firstError).mockResolvedValueOnce({ data: { success: true } });

    const promise = mediaApi.uploadImages([new File(['x'], 'x.jpg')]);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeTruthy();
    expect(mocks.post).toHaveBeenCalledTimes(2);
  });

  it('does not retry while the device is offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const error = Object.assign(new Error('offline'), { code: 'NETWORK_ERROR', statusCode: 0 });
    mocks.post.mockRejectedValue(error);

    await expect(mediaApi.uploadImages([new File(['x'], 'x.jpg')])).rejects.toBe(error);
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.recordUploadResult).toHaveBeenCalledWith(false);
  });
});
