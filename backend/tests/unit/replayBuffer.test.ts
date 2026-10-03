import {
  appendReplayEvent,
  compareEventIds,
  nextEventId,
  parseEventId,
  readReplayEvents,
  type ReplayRedis,
} from '../../src/shared/utils/replayBuffer';

/** Minimal in-memory stand-in for the three Redis stream commands the buffer uses. */
function fakeRedis(): ReplayRedis & { rows: Array<[string, string[]]> } {
  const rows: Array<[string, string[]]> = [];
  let seq = 0;
  return {
    rows,
    pipeline() {
      const ops: Array<unknown[]> = [];
      const p = {
        xadd(...a: Array<string | number>) {
          ops.push(a);
          return p;
        },
        expire() {
          return p;
        },
        async exec() {
          const id = `${1000 + seq++}-0`;
          const a = ops[0] as Array<string | number>;
          rows.push([id, ['e', String(a[5])]]);
          while (rows.length > Number(a[2])) rows.shift();
          return [[null, id], [null, 1]] as Array<[Error | null, unknown]>;
        },
      };
      return p;
    },
    async xrange(_k, start) {
      return rows.filter(([id]) => compareEventIds(id, start) >= 0);
    },
    async xlen() {
      return rows.length;
    },
  };
}

const opts = { maxEvents: 3, ttlSeconds: 3600 };

describe('event ids', () => {
  it('parses, compares and increments', () => {
    expect(parseEventId('1-2-3')).toBeNull();
    expect(nextEventId('100-5')).toBe('100-6');
    expect(nextEventId('x')).toBeNull();
    expect(compareEventIds('100-5', '100-6')).toBeLessThan(0);
    expect(compareEventIds('101-0', '100-9')).toBeGreaterThan(0);
  });
});

describe('replay buffer', () => {
  it('replays only events after Last-Event-ID, with no gap while not full', async () => {
    const c = fakeRedis();
    await appendReplayEvent(c, 'u', { n: 0 }, opts);
    await appendReplayEvent(c, 'u', { n: 1 }, opts);
    const r = await readReplayEvents(c, 'u', '1000-0', opts, 1500);
    expect(r.events.map((e) => (e.event as { n: number }).n)).toEqual([1]);
    expect(r.gap).toBe(false);
  });

  it('reports a gap when the stream is full and the resume point was trimmed away', async () => {
    const c = fakeRedis();
    for (let i = 0; i < 5; i++) await appendReplayEvent(c, 'u', { n: i }, opts);
    expect((await readReplayEvents(c, 'u', '1000-0', opts, 1500)).gap).toBe(true);
    const ok = await readReplayEvents(c, 'u', '1002-0', opts, 1500);
    expect(ok.gap).toBe(false);
    expect(ok.events.map((e) => (e.event as { n: number }).n)).toEqual([3, 4]);
  });

  it('reports a gap when the resume point is older than the TTL', async () => {
    const c = fakeRedis();
    await appendReplayEvent(c, 'u', { n: 0 }, opts);
    const r = await readReplayEvents(c, 'u', '1000-0', opts, 1000 + 3600_000 + 1);
    expect(r.gap).toBe(true);
  });

  it('is inert when disabled and treats an unusable id as a fresh connection', async () => {
    const c = fakeRedis();
    expect(await appendReplayEvent(c, 'u', {}, { maxEvents: 0, ttlSeconds: 1 })).toBeNull();
    expect(await readReplayEvents(c, 'u', 'garbage', opts, 1500)).toEqual({ events: [], gap: false });
  });

  it('returns null (live-only) when the pipeline reports an error', async () => {
    const bad = {
      pipeline() {
        const p = {
          xadd: () => p,
          expire: () => p,
          exec: async () => [[new Error('x'), null]] as Array<[Error | null, unknown]>,
        };
        return p;
      },
    } as unknown as ReplayRedis;
    expect(await appendReplayEvent(bad, 'u', {}, opts)).toBeNull();
  });
});
