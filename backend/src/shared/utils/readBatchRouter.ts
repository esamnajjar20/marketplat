import type { Request, RequestHandler, Response } from 'express';
import type { Router } from 'express';

const MAX_BATCH_SIZE = 8;
const MAX_PATH_LENGTH = 2048;
// Cold DB queries on Render free tier take 300-800ms. 200ms caused
// every batch item to return 504 even when the underlying route was healthy.
const ITEM_TIMEOUT_MS = 800;

// Only read routes that are safe to dispatch through the batch transport.
// Mutations, auth flows, streams and exports keep their normal contracts.
const ALLOWED_PREFIXES = [
  '/home',
  '/users',
  '/ads',
  '/categories',
  '/favorites',
  '/search',
  '/sellers',
  '/service-providers',
  '/service-categories',
  '/service-listings',
  '/service-requests',
  '/requests',
  '/appointments',
  '/service-reviews',
  '/conversations',
  '/blocked-users',
  '/notifications',
  '/saved-searches',
  '/stores',
  '/store-types',
  '/products',
  '/product-categories',
  '/collections',
  '/badges',
  '/activity',
  '/recommendations',
] as const;

type BatchItem = {
  id: string;
  url: string;
  params?: Record<string, unknown>;
};

type CapturedResponse = {
  status: number;
  body: unknown;
  headers: Record<string, string | string[]>;
};

function isAllowedPath(rawUrl: string): boolean {
  if (!rawUrl || rawUrl.length > MAX_PATH_LENGTH) return false;
  if (!rawUrl.startsWith('/') || rawUrl.startsWith('//')) return false;
  if (rawUrl.includes('\\')) return false;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl, 'https://batch.invalid');
  } catch {
    return false;
  }

  // The batch contract accepts relative URLs only. Reject encoded traversal,
  // credentials, fragments and any absolute/external URL tricks.
  if (parsed.origin !== 'https://batch.invalid') return false;
  if (parsed.username || parsed.password || parsed.hash) return false;

  let pathname: string;
  try {
    pathname = decodeURIComponent(parsed.pathname);
  } catch {
    return false;
  }

  if (!pathname.startsWith('/') || pathname.startsWith('//')) return false;
  if (pathname.includes('..') || pathname.includes('\\')) return false;
  if (pathname.startsWith('/auth') || pathname === '/batch' || pathname.startsWith('/batch/')) {
    return false;
  }

  return ALLOWED_PREFIXES.some(
    (prefix) =>
      pathname === prefix ||
      pathname.startsWith(`${prefix}/`),
  );
}

function appendParams(url: string, params?: Record<string, unknown>): string {
  if (!params || Object.keys(params).length === 0) return url;

  const parsed = new URL(url, 'https://batch.invalid');
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      for (const item of value) parsed.searchParams.append(key, String(item));
    } else {
      parsed.searchParams.set(key, String(value));
    }
  }

  return `${parsed.pathname}${parsed.search}`;
}

function cloneRequest(req: Request, url: string): Request {
  const child = Object.create(req) as Request;

  // FIX BATCH-METHOD: a child made with Object.create inherits req.method
  // from the parent (POST /batch). router.handle then matches routes by
  // method, so router.get('/users/me') never matched — every sub-request
  // returned 404, finish() returned null, and the envelope reported 500.
  // Set method explicitly to GET.
  //
  // FIX BATCH-QUERY: Express's req.query getter reads req.url lazily, but
  // an Object.create child inherits the parent's already-parsed query
  // (empty for POST /batch). Re-parse from this child's URL so controllers
  // see this request's params, not the envelope's.
  //
  // FIX BATCH-BODY: a GET has no body. Clear it so no controller accidentally
  // reads { requests: [...] } from the batch envelope.
  const qIndex = url.indexOf('?');
  const query = qIndex >= 0
    ? Object.fromEntries(new URLSearchParams(url.slice(qIndex + 1)).entries())
    : {};

  Object.defineProperties(child, {
    method:      { configurable: true, value: 'GET', writable: true },
    url:         { configurable: true, value: url, writable: true },
    originalUrl: { configurable: true, value: url, writable: true },
    baseUrl:     { configurable: true, value: '', writable: true },
    path:        { configurable: true, value: url.split('?')[0], writable: true },
    query:       { configurable: true, value: query, writable: true },
    body:        { configurable: true, value: {}, writable: true },
  });
  return child;
}

function captureResponse(): {
  response: Response;
  finish: () => CapturedResponse | null;
} {
  let status = 200;
  let body: unknown = undefined;
  let finished = false;
  const headers = new Map<string, string | string[]>();
  const locals: Record<string, unknown> = {};

  const response = {
    locals,
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    status(this: Response, code: number) {
      status = code;
      this.statusCode = code;
      return this;
    },
    setHeader(this: Response, name: string, value: string | string[]) {
      headers.set(name.toLowerCase(), value);
      return this;
    },
    getHeader(this: Response, name: string) {
      return headers.get(name.toLowerCase());
    },
    removeHeader(this: Response, name: string) {
      headers.delete(name.toLowerCase());
    },
    type(this: Response, value: string) {
      headers.set('content-type', value);
      return this;
    },
    json(this: Response, value: unknown) {
      body = value;
      finished = true;
      // express marks headersSent / writableEnded as readonly on Response;
      // this in-memory stub needs to write them.
      const self = this as unknown as { headersSent: boolean; writableEnded: boolean };
      self.headersSent = true;
      self.writableEnded = true;
      return this;
    },
    send(this: Response, value: unknown) {
      body = value;
      finished = true;
      // express marks headersSent / writableEnded as readonly on Response;
      // this in-memory stub needs to write them.
      const self = this as unknown as { headersSent: boolean; writableEnded: boolean };
      self.headersSent = true;
      self.writableEnded = true;
      return this;
    },
    end(this: Response, value?: unknown) {
      if (value !== undefined) body = value;
      finished = true;
      // express marks headersSent / writableEnded as readonly on Response;
      // this in-memory stub needs to write them.
      const self = this as unknown as { headersSent: boolean; writableEnded: boolean };
      self.headersSent = true;
      self.writableEnded = true;
      return this;
    },
  } as unknown as Response;

  return {
    response,
    finish: () =>
      finished
        ? { status, body, headers: Object.fromEntries(headers) }
        : null,
  };
}

function runSubrequest(
  router: Router,
  parent: Request,
  item: BatchItem,
): Promise<CapturedResponse> {
  const url = appendParams(item.url, item.params);

  return new Promise((resolve, reject) => {
    const { response, finish } = captureResponse();
    const child = cloneRequest(parent, url);
    let settled = false;

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
    };

    const timer = setTimeout(() => {
      settle(() =>
        resolve({
          status: 504,
          body: null,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }, ITEM_TIMEOUT_MS);

    const done = (error?: unknown) => {
      clearTimeout(timer);
      settle(() => {
        if (error) {
          reject(error);
          return;
        }

        const captured = finish();
        if (!captured) {
          reject(new Error(`Batched route did not produce a response: ${url}`));
          return;
        }
        resolve(captured);
      });
    };

    // router.handle executes the same downstream route/middleware stack as a
    // normal request, including authentication/authorization middleware on the
    // matched route. The parent request carries the original Authorization and
    // cookie headers, so the child cannot bypass auth by using batching.
    // express Router.handle exists at runtime (it's how express itself
    // dispatches) but is not exposed in the public @types/express.
    (router as unknown as {
      handle: (req: Request, res: Response, next: (err?: unknown) => void) => void;
    }).handle(child, response, done);
  });
}

export function createReadBatchHandler(router: Router): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const raw = req.body?.requests;
      if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_BATCH_SIZE) {
        res
          .status(400)
          .json({
            success: false,
            message: `Batch must contain 1-${MAX_BATCH_SIZE} GET requests.`,
          });
        return;
      }

      const items = raw.map((value: unknown): BatchItem => {
        if (!value || typeof value !== 'object') {
          throw new Error('Invalid batch item.');
        }

        const row = value as Record<string, unknown>;
        const params = row.params;
        if (
          params !== undefined &&
          (!params || typeof params !== 'object' || Array.isArray(params))
        ) {
          throw new Error('Batch params must be an object.');
        }

        if (
          typeof row.id !== 'string' ||
          !row.id ||
          typeof row.url !== 'string' ||
          !isAllowedPath(row.url)
        ) {
          throw new Error('Only allowlisted relative GET routes can be batched.');
        }

        return {
          id: row.id,
          url: row.url,
          params: params as Record<string, unknown> | undefined,
        };
      });

      const uniqueIds = new Set(items.map((item) => item.id));
      if (uniqueIds.size !== items.length) {
        throw new Error('Batch item ids must be unique.');
      }

      const settled = await Promise.allSettled(
        items.map((item) => runSubrequest(router, req, item)),
      );

      const responses: Record<
        string,
        CapturedResponse | { status: number; error: string }
      > = {};

      settled.forEach((result, index) => {
        const id = items[index].id;
        if (result.status === 'fulfilled') {
          responses[id] = result.value;
        } else {
          // Never leak internal child-router errors through the batch envelope.
          responses[id] = {
            status: 500,
            error: 'Batched request failed.',
          };
        }
      });

      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-App-Batch-Size', String(items.length));
      res.status(200).json({
        success: true,
        message: 'Read batch completed',
        data: { responses },
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message:
          error instanceof Error ? error.message : 'Invalid read batch.',
      });
    }
  };
}
