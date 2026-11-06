// Appwrite Functions entrypoint. Import instrumentation before the Express
// application, but deliberately do not import server.ts: server.ts owns the
// persistent-process bootstrap (listen, queue consumers, timers and signals).
import './instrument';
import serverless from 'serverless-http';
import { app } from './app';

interface AppwriteRequest {
  path: string;
  method: string;
  headers?: Record<string, string | string[] | undefined>;
  queryString?: string;
  bodyRaw?: string;
  body?: unknown;
}

interface AppwriteResponse {
  send(body: string, statusCode?: number, headers?: Record<string, string>): unknown;
  json(body: unknown, statusCode?: number, headers?: Record<string, string>): unknown;
}

interface AppwriteFunctionContext {
  req: AppwriteRequest;
  res: AppwriteResponse;
  log: (message: string) => void;
  error: (message: string) => void;
}

const expressHandler = serverless(app);
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function normalizeHeaders(
  headers: Record<string, string | number | string[] | undefined> | undefined
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (value === undefined || HOP_BY_HOP_HEADERS.has(name.toLowerCase())) continue;
    normalized[name] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return normalized;
}

function serializeBody(req: AppwriteRequest): string | undefined {
  if (typeof req.bodyRaw === 'string') return req.bodyRaw;
  if (typeof req.body === 'string') return req.body;
  if (req.body === undefined || req.body === null) return undefined;
  return JSON.stringify(req.body);
}

export default async ({ req, res, log, error }: AppwriteFunctionContext) => {
  try {
    const path = req.path.startsWith('/') ? req.path : `/${req.path}`;
    const queryString = req.queryString?.replace(/^\?/, '') ?? '';
    const event: Record<string, unknown> = {
      version: '2.0',
      rawPath: path,
      path,
      httpMethod: req.method.toUpperCase(),
      method: req.method.toUpperCase(),
      headers: req.headers ?? {},
      queryStringParameters: Object.fromEntries(new URLSearchParams(queryString)),
      rawQueryString: queryString,
      body: serializeBody(req),
      isBase64Encoded: false,
    };

    const response = await expressHandler(event, {});
    const statusCode = response.statusCode ?? 200;
    const headers = normalizeHeaders(response.headers);
    const body = response.body ?? '';

    log(`Express request completed: ${req.method.toUpperCase()} ${path} (${statusCode})`);
    return res.send(body, statusCode, headers);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    error(`Express Appwrite handler failed: ${message}`);
    return res.json({ error: 'Internal Server Error' }, 500, {
      'content-type': 'application/json; charset=utf-8',
    });
  }
};
