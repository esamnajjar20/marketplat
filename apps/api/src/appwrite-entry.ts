import './instrument';
import serverless from 'serverless-http';
import { app } from './app';

const expressHandler = serverless(app);

export default async function ({ req, res, log, error }: any) {
  try {
    // Appwrite req is mapped to AWS API Gateway v2 format for serverless-http
    const event = {
      version: '2.0',
      routeKey: 'ANY /{proxy+}',
      rawPath: req.path || '/',
      rawQueryString: req.queryString || '',
      headers: req.headers || {},
      requestContext: {
        http: {
          method: req.method || 'GET',
          path: req.path || '/',
        },
      },
      body: req.bodyRaw || (req.body ? JSON.stringify(req.body) : undefined),
      isBase64Encoded: false,
    };

    // serverless-http parses the event and calls Express
    const response = await expressHandler(event, {});

    // Send the response back to Appwrite
    return res.send(
      response.body || '',
      response.statusCode || 200,
      response.headers || {}
    );
  } catch (err: any) {
    error(`Express Appwrite handler failed: ${err.message}`);
    return res.json({ error: 'Internal Server Error', message: err.message }, 500);
  }
}
