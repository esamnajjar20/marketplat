import {
  executeWithGoFallback,
  runAdvisoryLockedBatch,
} from '../../../src/shared/go-worker/executeWithFallback';
import type { PrismaClient, Prisma } from '@prisma/client';

jest.mock('../../../src/shared/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

type TestResult = { completed: true };
const isTestResult = (value: unknown): value is TestResult =>
  Boolean(value && typeof value === 'object' && (value as { completed?: unknown }).completed === true);

describe('Go worker fallback coordinator', () => {
  const originalUrl = process.env.GO_WORKER_URL;
  const originalToken = process.env.GO_WORKER_TOKEN;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalUrl === undefined) delete process.env.GO_WORKER_URL;
    else process.env.GO_WORKER_URL = originalUrl;
    if (originalToken === undefined) delete process.env.GO_WORKER_TOKEN;
    else process.env.GO_WORKER_TOKEN = originalToken;
  });

  it('runs the Express fallback when the Go worker is not configured', async () => {
    delete process.env.GO_WORKER_URL;
    delete process.env.GO_WORKER_TOKEN;
    const runExpressFallback = jest.fn().mockResolvedValue('completed');

    const outcome = await executeWithGoFallback<TestResult>({
      jobName: 'test-job',
      path: '/internal/jobs/test',
      body: {},
      validateResult: isTestResult,
      runExpressFallback,
    });

    expect(outcome).toBe('express');
    expect(runExpressFallback).toHaveBeenCalledTimes(1);
  });

  it('does not run Express when Go returns a valid success result', async () => {
    process.env.GO_WORKER_URL = 'https://worker.example/';
    process.env.GO_WORKER_TOKEN = 'test-token';
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ completed: true }),
    });
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock as typeof fetch);
    const runExpressFallback = jest.fn().mockResolvedValue('completed');

    const outcome = await executeWithGoFallback<TestResult>({
      jobName: 'test-job',
      path: '/internal/jobs/test',
      body: { retentionDays: 90 },
      validateResult: isTestResult,
      runExpressFallback,
    });

    expect(outcome).toBe('go');
    expect(runExpressFallback).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      'https://worker.example/internal/jobs/test',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('treats Go 409 as already running and never starts a duplicate fallback', async () => {
    process.env.GO_WORKER_URL = 'https://worker.example';
    process.env.GO_WORKER_TOKEN = 'test-token';
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 409 } as Response);
    const runExpressFallback = jest.fn().mockResolvedValue('completed');

    const outcome = await executeWithGoFallback<TestResult>({
      jobName: 'test-job',
      path: '/internal/jobs/test',
      body: {},
      validateResult: isTestResult,
      runExpressFallback,
    });

    expect(outcome).toBe('busy');
    expect(runExpressFallback).not.toHaveBeenCalled();
  });

  it('runs Express after a Go failure and preserves a lock-busy fallback result', async () => {
    process.env.GO_WORKER_URL = 'https://worker.example';
    process.env.GO_WORKER_TOKEN = 'test-token';
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 503 } as Response);
    const runExpressFallback = jest.fn().mockResolvedValue('busy');

    const outcome = await executeWithGoFallback<TestResult>({
      jobName: 'test-job',
      path: '/internal/jobs/test',
      body: {},
      validateResult: isTestResult,
      runExpressFallback,
    });

    expect(outcome).toBe('busy');
    expect(runExpressFallback).toHaveBeenCalledTimes(1);
  });

  it('falls back when Go returns malformed success JSON', async () => {
    process.env.GO_WORKER_URL = 'https://worker.example';
    process.env.GO_WORKER_TOKEN = 'test-token';
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: true }),
    } as Response);
    const runExpressFallback = jest.fn().mockResolvedValue('completed');

    const outcome = await executeWithGoFallback<TestResult>({
      jobName: 'test-job',
      path: '/internal/jobs/test',
      body: {},
      validateResult: isTestResult,
      runExpressFallback,
    });

    expect(outcome).toBe('express');
    expect(runExpressFallback).toHaveBeenCalledTimes(1);
  });
});

describe('runAdvisoryLockedBatch', () => {
  it('does not run the batch when the PostgreSQL lock is already owned', async () => {
    const operation = jest.fn().mockResolvedValue(12);
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ locked: false }]),
    } as unknown as Prisma.TransactionClient;
    const prisma = {
      $transaction: jest.fn(async (callback: (innerTx: Prisma.TransactionClient) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaClient;

    const result = await runAdvisoryLockedBatch(prisma, 731904281n, operation);

    expect(result).toEqual({ acquired: false });
    expect(operation).not.toHaveBeenCalled();
  });

  it('runs one batch under the transaction-scoped PostgreSQL lock', async () => {
    const operation = jest.fn().mockResolvedValue(12);
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ locked: true }]),
    } as unknown as Prisma.TransactionClient;
    const prisma = {
      $transaction: jest.fn(async (callback: (innerTx: Prisma.TransactionClient) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaClient;

    const result = await runAdvisoryLockedBatch(prisma, 731904281n, operation);

    expect(result).toEqual({ acquired: true, value: 12 });
    expect(operation).toHaveBeenCalledWith(tx);
  });
});
