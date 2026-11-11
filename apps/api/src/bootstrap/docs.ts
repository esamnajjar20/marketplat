import type { Express, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { env } from '../config/env';
import { swaggerSpec } from '../config/swagger';

/** Swagger UI + raw spec. Never exposed in production. */
export function mountApiDocs(app: Express): void {
  if (env.nodeEnv === 'production') return;

  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customSiteTitle: 'Classifieds Platform API',
      customCss: '.swagger-ui .topbar { display: none }',
      swaggerOptions: { persistAuthorization: true },
    })
  );

  app.get('/api/docs.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });
}
