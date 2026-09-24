/**
 * lib/warmingProgress.ts
 *
 * PHASE-3c — single aggregation point for warming progress across all
 * three passes: core API data (offlineCoreBundle), public route shells
 * and personal route shells (offlineRouteShells).
 *
 * Before this, each pass kept its own pub-sub and only core's was wired
 * to WarmupIndicator, so the user saw a progress bar for one third of
 * the work and nothing for the other two. This module is a tiny event
 * bus with no dependencies — the three engines report into it, and UI
 * subscribes to a single aggregated feed.
 *
 * Semantics:
 *   - active    : true if ANY source is currently warming
 *   - completed : sum of completed items across ACTIVE sources only
 *   - total     : sum of totals across ACTIVE sources only
 *
 * Idle sources contribute nothing (their stale totals would skew the
 * fraction). When the last active source reports active:false, the
 * aggregate flips to active:false and the UI hides.
 *
 * Safe to call from anywhere; listeners are cheap and the state is a
 * single object swap. No persistence — this is in-memory only.
 */
'use client';

export type WarmingSource = 'core' | 'routes' | 'personal';

export interface SourceProgress {
  active: boolean;
  completed: number;
  total: number;
}

export interface AggregatedProgress {
  active: boolean;
  completed: number;
  total: number;
  bySource: Record<WarmingSource, SourceProgress>;
}

const SOURCES: WarmingSource[] = ['core', 'routes', 'personal'];

const IDLE: SourceProgress = { active: false, completed: 0, total: 0 };

let state: Record<WarmingSource, SourceProgress> = {
  core: { ...IDLE },
  routes: { ...IDLE },
  personal: { ...IDLE },
};

const listeners = new Set<(p: AggregatedProgress) => void>();

function aggregate(): AggregatedProgress {
  let active = false;
  let completed = 0;
  let total = 0;
  for (const s of SOURCES) {
    const p = state[s];
    if (p.active) {
      active = true;
      completed += p.completed;
      total += p.total;
    }
  }
  return {
    active,
    completed,
    total,
    bySource: {
      core: { ...state.core },
      routes: { ...state.routes },
      personal: { ...state.personal },
    },
  };
}

/** Report a partial update for one source. Fields not provided are kept. */
function applyProgress(
  source: WarmingSource,
  update: Partial<SourceProgress>,
): void {
  state = { ...state, [source]: { ...state[source], ...update } };
  const snap = aggregate();
  listeners.forEach((cb) => cb(snap));
}

export function reportProgress(
  source: WarmingSource,
  update: Partial<SourceProgress>,
): void {
  applyProgress(source, update);
  // PHASE-4e — mirror to any other tabs so their indicators reflect
  // the same progress. Imported lazily inside try/catch so a browser
  // without BroadcastChannel degrades to the pre-4e behaviour.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { broadcastProgress } = require('./warmingBroadcast');
    broadcastProgress(source, update);
  } catch {
    // silent — cross-tab mirroring is a UI nicety, not a requirement
  }
}

// Subscribe once, at module init, to remote progress messages. When
// this tab receives another tab's update, apply it locally WITHOUT
// re-broadcasting (applyProgress, not reportProgress) — that would
// create an echo loop.
if (typeof window !== 'undefined') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { subscribeRemoteProgress } = require('./warmingBroadcast');
    subscribeRemoteProgress(
      (source: WarmingSource, update: Partial<SourceProgress>) =>
        applyProgress(source, update),
    );
  } catch {
    // silent
  }
}

/**
 * Subscribe to aggregated progress. Fires immediately with the current
 * state, then on every change. Returns an unsubscribe function.
 */
export function subscribeWarmingProgress(
  listener: (p: AggregatedProgress) => void,
): () => void {
  listeners.add(listener);
  listener(aggregate());
  return () => {
    listeners.delete(listener);
  };
}

export function getWarmingProgressAggregate(): AggregatedProgress {
  return aggregate();
}
