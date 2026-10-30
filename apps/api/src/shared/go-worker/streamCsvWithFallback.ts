import type { Response as ExpressResponse } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { logger } from '../utils/logger';

type StreamCsvWithFallbackOptions = {
  jobName: 'admin-users-csv' | 'admin-reports-csv';
  path: '/internal/exports/users.csv' | '/internal/exports/reports.csv';
  filename: 'users.csv' | 'reports.csv';
  response: ExpressResponse;
  runExpressFallback: () => Promise<string>;
  timeoutMs?: number;
};

function setCsvHeaders(response: ExpressResponse, filename: string): void {
  response.setHeader('Content-Type', 'text/csv; charset=utf-8');
  response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
}

/**
 * Stream an authenticated Go CSV export through the already-authorized
 * Express controller. If Go cannot produce a response before streaming starts,
 * retain the existing Prisma export as the fallback. Never attempt fallback
 * after bytes may have reached the client.
 */
export async function streamCsvWithGoFallback({
  jobName,
  path,
  filename,
  response,
  runExpressFallback,
  timeoutMs = 15_000,
}: StreamCsvWithFallbackOptions): Promise<'go' | 'express'> {
  const baseUrl = process.env.GO_WORKER_URL?.trim().replace(/\/+$/, '');
  const token = process.env.GO_WORKER_TOKEN?.trim();

  if (baseUrl && token) {
    let streamStarted = false;
    try {
      const workerResponse = await fetch(`${baseUrl}${path}`, {
        method: 'GET',
        redirect: 'error',
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/csv' },
        signal: AbortSignal.timeout(timeoutMs),
      });

      const contentType = workerResponse.headers.get('content-type')?.toLowerCase() ?? '';
      if (workerResponse.ok && contentType.startsWith('text/csv') && workerResponse.body) {
        setCsvHeaders(response, filename);
        streamStarted = true;
        await pipeline(
          Readable.fromWeb(workerResponse.body as NodeReadableStream<Uint8Array>),
          response
        );
        logger.info(`[${jobName}] Go worker completed CSV export`);
        return 'go';
      }

      await workerResponse.body?.cancel().catch(() => undefined);
      logger.warn(`[${jobName}] Go worker could not produce CSV; using Express fallback`, {
        status: workerResponse.status,
        contentType: contentType || 'missing',
      });
    } catch (error) {
      if (streamStarted) throw error;
      logger.warn(`[${jobName}] Go worker unavailable; using Express CSV fallback`, {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
    }
  } else {
    logger.info(`[${jobName}] Go worker is not configured; using Express CSV fallback`);
  }

  const csv = await runExpressFallback();
  if (response.headersSent) {
    throw new Error(`${jobName} fallback cannot start after response headers were sent`);
  }
  setCsvHeaders(response, filename);
  response.status(200).send(csv);
  return 'express';
}
