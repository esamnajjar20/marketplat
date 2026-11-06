declare module 'serverless-http' {
  import type { Express } from 'express';

  interface ServerlessHttpOptions {
    binary?: string[];
    request?: (request: unknown, event: unknown, context: unknown) => void;
    response?: (response: unknown, event: unknown, context: unknown) => void;
  }

  interface ServerlessHandler {
    (event: Record<string, unknown>, context?: Record<string, unknown>): Promise<{
      statusCode?: number;
      headers?: Record<string, string | number | string[] | undefined>;
      body?: string;
      isBase64Encoded?: boolean;
    }>;
  }

  function serverless(app: Express, options?: ServerlessHttpOptions): ServerlessHandler;
  export default serverless;
}
