import './instrument';
import serverless from 'serverless-http';
import { app } from './app';

const expressHandler = serverless(app);

export default async ({ req, res, log, error }: any) => {
  try {
    // حماية 1: إذا كان req غير موجود
    if (!req) {
      error('Appwrite context is missing the "req" object.');
      return res.json({ error: 'Missing request context' }, 400);
    }

    // حماية 2: قراءة الحقول بأمان
    const path = req.path || '/';
    const method = req.method || 'GET';
    const headers = req.headers || {};
    const queryString = req.queryString || '';
    const rawBody = req.bodyRaw || req.body || undefined;
    
    // حماية 3: تحويل الجسم إلى نص إن كان كائناً
    const body = typeof rawBody === 'object' && rawBody !== null ? JSON.stringify(rawBody) : rawBody;

    // تجهيز الحدث لـ serverless-http
    const event = {
      version: '2.0',
      rawPath: path,
      path: path,
      httpMethod: method.toUpperCase(),
      method: method.toUpperCase(),
      headers: headers,
      queryStringParameters: Object.fromEntries(new URLSearchParams(queryString)),
      rawQueryString: queryString,
      body: body,
      isBase64Encoded: false,
    };

    const response = await expressHandler(event, {});
    
    // إرجاع الاستجابة إلى Appwrite
    return res.send(
      response.body || '', 
      response.statusCode || 200, 
      response.headers || {}
    );

  } catch (err: any) {
    error(`Express Appwrite handler failed: ${err.message}`);
    return res.json({ error: 'Internal Server Error' }, 500);
  }
};
