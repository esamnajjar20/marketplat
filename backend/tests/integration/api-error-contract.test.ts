import request from 'supertest';
import { app } from '../../src/app';

describe('HTTP API error contract (real Express middleware chain)', () => {
  it('returns a stable client-error body for malformed JSON before route dispatch', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email":');

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      statusCode: 400,
      code: expect.any(String),
      message: 'Request could not be processed.',
    });
    expect(response.headers['x-request-id']).toEqual(response.body.requestId);
    expect(response.body).not.toHaveProperty('stack');
    expect(JSON.stringify(response.body)).not.toMatch(/entity\.parse\.failed|Unexpected end of JSON input/i);
  });

  it('returns a safe 413 response when a JSON request exceeds the configured 50 KB limit', async () => {
    const payload = JSON.stringify({ payload: 'x'.repeat(60 * 1024) });
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(response.status).toBe(413);
    expect(response.body).toMatchObject({
      success: false,
      statusCode: 413,
      code: expect.any(String),
      message: 'Request payload is too large.',
    });
    expect(response.headers['x-request-id']).toEqual(response.body.requestId);
    expect(response.body).not.toHaveProperty('stack');
    expect(JSON.stringify(response.body)).not.toMatch(/PayloadTooLargeError|raw-body|node_modules/i);
  });

  it('keeps unknown-route errors in the documented API error shape', async () => {
    const response = await request(app).get('/api/v1/__audit_phase_15_missing_route__');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      statusCode: 404,
      code: expect.any(String),
      message: 'Route not found',
    });
    expect(response.headers['x-request-id']).toEqual(response.body.requestId);
  });
});
