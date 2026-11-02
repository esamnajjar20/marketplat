import { trackEventsSchema } from '../../src/modules/analytics/analytics.validation';

const event = (eventId?: string) => ({
  ...(eventId ? { eventId } : {}),
  event: 'PAGE_VIEW',
  sessionId: 'session-1',
});

describe('trackEventsSchema', () => {
  it('accepts legacy clients that omit eventId', () => {
    const result = trackEventsSchema.safeParse({ body: { events: [event()] } });
    expect(result.success).toBe(true);
  });

  it('accepts distinct stable event IDs in a batch', () => {
    const result = trackEventsSchema.safeParse({ body: { events: [event('event-1'), event('event-2')] } });
    expect(result.success).toBe(true);
  });

  it('rejects duplicate stable event IDs before Go or Express writes', () => {
    const result = trackEventsSchema.safeParse({ body: { events: [event('same'), event('same')] } });
    expect(result.success).toBe(false);
  });
});
