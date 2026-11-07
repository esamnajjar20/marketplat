// Import instrumentation first
import './instrument';
import { app } from './app';

// In Appwrite (Open-Runtimes), the req and res objects passed to the
// function are already Express/Node.js native objects. We can pass them
// directly to the Express app instead of using serverless-http adapters.
export default async function (req: any, res: any) {
  // Handle Appwrite's specific event structure if it wraps the req
  const actualReq = req.req || req; 
  const actualRes = req.res || res;

  // Pass directly to Express
  app(actualReq, actualRes);
}
