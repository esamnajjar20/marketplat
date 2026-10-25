import { decodeMessageCursor, encodeMessageCursor } from '../../src/shared/utils/messageCursor';

describe('messageCursor', () => {
  it('round-trips the deterministic cursor', () => {
    const createdAt = new Date('2026-10-07T10:20:30.000Z');
    const encoded = encodeMessageCursor({ createdAt, id: 'msg-1' });
    expect(decodeMessageCursor(encoded)).toEqual({ createdAt, id: 'msg-1' });
  });

  it('rejects malformed cursors', () => {
    expect(decodeMessageCursor('not-a-cursor')).toBeNull();
    expect(decodeMessageCursor(Buffer.from(JSON.stringify({ id: 'x', createdAt: 'bad' })).toString('base64url'))).toBeNull();
  });
});
