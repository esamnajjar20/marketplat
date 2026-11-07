import './instrument';
import serverless from 'serverless-http';
import { app } from './app';

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

function normalizeHeaders(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  const source = input as Record<string, unknown>;
  const connectionValue = Object.entries(source).find(([name]) => name.toLowerCase() === 'connection')?.[1];
  const connectionTokens = String(connectionValue ?? '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);
  const blocked = new Set([...HOP_BY_HOP_HEADERS, ...connectionTokens]);
  const headers: Record<string, string> = {};

  for (const [rawName, rawValue] of Object.entries(source)) {
    const name = rawName.trim().toLowerCase();
    if (!name || blocked.has(name) || rawValue == null) continue;

    if (Array.isArray(rawValue)) {
      headers[name] = rawValue.map(value => String(value)).join(', ');
    } else if (typeof rawValue === 'string') {
      headers[name] = rawValue;
    } else if (typeof rawValue === 'number' || typeof rawValue === 'boolean') {
      headers[name] = String(rawValue);
    }
  }

  return headers;
}

function normalizePath(path: unknown): string {
  const value = typeof path === 'string' && path.trim() ? path.trim() : '/';
  return value.startsWith('/') ? value : `/${value}`;
}

function normalizeQueryString(query: unknown): string {
  if (typeof query !== 'string') return '';
  return query.replace(/^\?/, '');
}

function serializeRequestBody(
  req: Record<string, unknown>,
  method: string,
): { body: string | undefined; isBase64Encoded: boolean } {
  if (method === 'GET' || method === 'HEAD') {
    return { body: undefined, isBase64Encoded: false };
  }

  // Preserve an explicitly supplied empty raw body; do not fall through on ''.
  if (typeof req.bodyRaw === 'string') {
    return { body: req.bodyRaw, isBase64Encoded: false };
  }
  if (req.bodyRaw instanceof Uint8Array) {
    return { body: Buffer.from(req.bodyRaw).toString('base64'), isBase64Encoded: true };
  }
  if (req.body === undefined || req.body === null) {
    return { body: undefined, isBase64Encoded: false };
  }
  if (typeof req.body === 'string') {
    return { body: req.body, isBase64Encoded: false };
  }

  try {
    return { body: JSON.stringify(req.body), isBase64Encoded: false };
  } catch {
    return { body: undefined, isBase64Encoded: false };
  }
}

export default async function ({ req, res, log, error }: any) {
  if (!req || typeof req !== 'object') {
    return res.json({ error: 'Bad Request' }, 400);
  }

  const method = typeof req.method === 'string' ? req.method.toUpperCase() : 'GET';
  const path = normalizePath(req.path);

  try {
    // Appwrite req is mapped to AWS API Gateway v2 format for serverless-http.
    const requestBody = serializeRequestBody(req, method);
    const event = {
      version: '2.0',
      routeKey: 'ANY /{proxy+}',
      rawPath: path,
      rawQueryString: normalizeQueryString(req.queryString),
      headers: normalizeHeaders(req.headers),
      requestContext: {
        http: {
          method,
          path,
        },
      },
      body: requestBody.body,
      isBase64Encoded: requestBody.isBase64Encoded,
    };

    const response = await expressHandler(event, {});
    const statusCode = Number.isInteger(response?.statusCode) && response.statusCode >= 100 && response.statusCode <= 599
      ? response.statusCode
      : 200;
    const responseHeaders = normalizeHeaders(response?.headers);
    const responseBody = response?.body == null ? '' : String(response.body);
    const outputBody = response?.isBase64Encoded ? Buffer.from(responseBody, 'base64') : responseBody;

    // Appwrite's response helper owns the final HTTP response serialization.
    return res.send(outputBody, statusCode, responseHeaders);
  } catch (err: unknown) {
    const details = err instanceof Error ? err : new Error(String(err));
    if (typeof error === 'function') error(`Express Appwrite handler failed: ${details.message}`);
    else if (typeof log === 'function') log(`Express Appwrite handler failed: ${details.message}`);
    return res.json({ error: 'Internal Server Error' }, 500);
  }
}
