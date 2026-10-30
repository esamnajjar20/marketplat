import { PassThrough } from 'node:stream';
import { ReadableStream } from 'node:stream/web';
import type { Response as ExpressResponse } from 'express';
import { streamCsvWithGoFallback } from '../../../src/shared/go-worker/streamCsvWithFallback';

jest.mock('../../../src/shared/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

function createExpressResponse(): {
  response: ExpressResponse;
  setHeader: jest.Mock;
  status: jest.Mock;
  send: jest.Mock;
  stream: PassThrough;
} {
  const stream = new PassThrough();
  const response = stream as unknown as ExpressResponse;
  const setHeader = jest.fn();
  const status = jest.fn().mockReturnValue(response);
  const send = jest.fn();
  Object.assign(response, {
    setHeader,
    status,
    send,
  });
  Object.defineProperty(response, 'headersSent', { configurable: true, value: false });
  return { response, setHeader, status, send, stream };
}

describe('streamCsvWithGoFallback', () => {
  const originalUrl = process.env.GO_WORKER_URL;
  const originalToken = process.env.GO_WORKER_TOKEN;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalUrl === undefined) delete process.env.GO_WORKER_URL;
    else process.env.GO_WORKER_URL = originalUrl;
    if (originalToken === undefined) delete process.env.GO_WORKER_TOKEN;
    else process.env.GO_WORKER_TOKEN = originalToken;
  });

  it('uses the existing Express export when Go is not configured', async () => {
    delete process.env.GO_WORKER_URL;
    delete process.env.GO_WORKER_TOKEN;
    const output = createExpressResponse();
    const fallback = jest.fn().mockResolvedValue('id,email\n1,a@example.com');

    const outcome = await streamCsvWithGoFallback({
      jobName: 'admin-users-csv',
      path: '/internal/exports/users.csv',
      filename: 'users.csv',
      response: output.response,
      runExpressFallback: fallback,
    });

    expect(outcome).toBe('express');
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(output.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(output.status).toHaveBeenCalledWith(200);
    expect(output.send).toHaveBeenCalledWith('id,email\n1,a@example.com');
  });

  it('streams a successful Go response without invoking Express fallback', async () => {
    process.env.GO_WORKER_URL = 'https://worker.example/';
    process.env.GO_WORKER_TOKEN = 'secret';
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('id,email\n1,a@example.com', {
        status: 200,
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
      })
    );
    const output = createExpressResponse();
    const chunks: Buffer[] = [];
    output.stream.on('data', chunk => chunks.push(Buffer.from(chunk)));
    const fallback = jest.fn().mockResolvedValue('must not be used');

    const outcome = await streamCsvWithGoFallback({
      jobName: 'admin-users-csv',
      path: '/internal/exports/users.csv',
      filename: 'users.csv',
      response: output.response,
      runExpressFallback: fallback,
    });

    expect(outcome).toBe('go');
    expect(Buffer.concat(chunks).toString('utf8')).toBe('id,email\n1,a@example.com');
    expect(fallback).not.toHaveBeenCalled();
    expect(output.setHeader).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="users.csv"');
  });

  it('falls back when Go rejects the export before streaming begins', async () => {
    process.env.GO_WORKER_URL = 'https://worker.example';
    process.env.GO_WORKER_TOKEN = 'secret';
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"error":"database unavailable"}', {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const output = createExpressResponse();
    const fallback = jest.fn().mockResolvedValue('id,reason\n1,spam');

    const outcome = await streamCsvWithGoFallback({
      jobName: 'admin-reports-csv',
      path: '/internal/exports/reports.csv',
      filename: 'reports.csv',
      response: output.response,
      runExpressFallback: fallback,
    });

    expect(outcome).toBe('express');
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(output.send).toHaveBeenCalledWith('id,reason\n1,spam');
  });
  it('does not attempt Express fallback after the Go stream has started', async () => {
    process.env.GO_WORKER_URL = 'https://worker.example';
    process.env.GO_WORKER_TOKEN = 'secret';
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('partial,csv'));
        controller.error(new Error('stream interrupted'));
      },
    });
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'text/csv; charset=utf-8' },
      })
    );
    const output = createExpressResponse();
    const fallback = jest.fn().mockResolvedValue('must not be used');

    await expect(
      streamCsvWithGoFallback({
        jobName: 'admin-users-csv',
        path: '/internal/exports/users.csv',
        filename: 'users.csv',
        response: output.response,
        runExpressFallback: fallback,
      })
    ).rejects.toThrow('stream interrupted');

    expect(fallback).not.toHaveBeenCalled();
  });

});
