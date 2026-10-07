export interface MessageCursor {
  createdAt: Date;
  id: string;
}

/** Stable cursor for the (createdAt,id) message ordering. */
export const encodeMessageCursor = (cursor: MessageCursor): string =>
  Buffer.from(JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }), 'utf8').toString('base64url');

export const decodeMessageCursor = (value: string): MessageCursor | null => {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as { createdAt?: unknown; id?: unknown };
    if (typeof parsed.id !== 'string' || !parsed.id || typeof parsed.createdAt !== 'string') return null;
    const createdAt = new Date(parsed.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    return { createdAt, id: parsed.id };
  } catch {
    return null;
  }
};
