/**
 * __tests__/unit/lib/offlineWarmingScheduler.test.ts
 *
 * "when to warm" rules: coalescing, deferral,
 * visible-only, rate limiting, slow-link delay, cancel.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const runWarmingPipeline = vi.fn().mockResolvedValue({ ran: true });
const getLastPipelineRun = vi.fn(() => ({ startedAt: 0, authenticated: false }));
let tier: 'core' | 'critical' = 'core';

vi.mock('@/lib/offlineWarmingPipeline', () => ({
  runWarmingPipeline: (...a: unknown[]) => runWarmingPipeline(...a),
  getLastPipelineRun: () => getLastPipelineRun(),
}));
vi.mock('@/lib/offlineWarmingPlanner', () => ({
  getWarmingPlan: () => ({ tier }),
}));
vi.mock('@/lib/networkPolicy', () => ({
  getNetworkPolicy: () => ({ tier: tier === 'critical' ? 'very-slow' : 'fast', allowBackgroundWarming: true }),
}));

import {
  scheduleWarming,
  cancelScheduledWarming,
  TRIGGER_DELAY_MS,
  MIN_GAP_MS,
} from '@/lib/offlineWarmingScheduler';

function setVisibility(v: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
}

describe('offlineWarmingScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    tier = 'core';
    setVisibility('visible');
    Object.defineProperty(document, 'readyState', { value: 'complete', configurable: true });
    getLastPipelineRun.mockReturnValue({ startedAt: 0, authenticated: false });
  });

  afterEach(() => {
    cancelScheduledWarming();
    vi.useRealTimers();
  });

  it('does not start immediately — page content goes first', async () => {
    scheduleWarming('mount', { authenticated: false });
    await vi.advanceTimersByTimeAsync(TRIGGER_DELAY_MS.mount - 1);
    expect(runWarmingPipeline).not.toHaveBeenCalled();
  });

  it('coalesces mount + auth into ONE run and OR-es the authenticated flag', async () => {
    scheduleWarming('mount', { authenticated: false });
    scheduleWarming('auth', { authenticated: true });
    await vi.advanceTimersByTimeAsync(TRIGGER_DELAY_MS.mount + 10);

    expect(runWarmingPipeline).toHaveBeenCalledTimes(1);
    expect(runWarmingPipeline).toHaveBeenCalledWith({
      authenticated: true,
    });
  });

  it('a tick remains queue-first', async () => {
    scheduleWarming('tick', { authenticated: true });
    await vi.advanceTimersByTimeAsync(10);
    expect(runWarmingPipeline).toHaveBeenLastCalledWith({
      authenticated: true,
    });

    getLastPipelineRun.mockReturnValue({ startedAt: 0, authenticated: true });
    scheduleWarming('visible', { authenticated: true });
    scheduleWarming('tick', { authenticated: true });
    await vi.advanceTimersByTimeAsync(TRIGGER_DELAY_MS.visible + 10);
    expect(runWarmingPipeline).toHaveBeenLastCalledWith({
      authenticated: true,
    });
  });

  it('never warms while the tab is hidden; a later visible trigger resumes the parked run', async () => {
    setVisibility('hidden');
    scheduleWarming('mount', { authenticated: false });
    await vi.advanceTimersByTimeAsync(TRIGGER_DELAY_MS.mount + 10);
    expect(runWarmingPipeline).not.toHaveBeenCalled();

    setVisibility('visible');
    scheduleWarming('visible', { authenticated: false });
    await vi.advanceTimersByTimeAsync(TRIGGER_DELAY_MS.visible + 10);
    expect(runWarmingPipeline).toHaveBeenCalledTimes(1);
  });

  it('rate-limits online/visible/tick triggers right after a run', async () => {
    getLastPipelineRun.mockReturnValue({ startedAt: Date.now(), authenticated: true });
    scheduleWarming('online', { authenticated: true });
    scheduleWarming('tick', { authenticated: true });
    await vi.advanceTimersByTimeAsync(MIN_GAP_MS - 1);
    expect(runWarmingPipeline).not.toHaveBeenCalled();
  });

  it('a login upgrade bypasses the rate limit (personal phases still need to run)', async () => {
    getLastPipelineRun.mockReturnValue({ startedAt: Date.now(), authenticated: false });
    scheduleWarming('online', { authenticated: true });
    await vi.advanceTimersByTimeAsync(TRIGGER_DELAY_MS.online + 10);
    expect(runWarmingPipeline).toHaveBeenCalledTimes(1);
  });

  it('mount / auth are not rate-limited (fresh page load always gets its pass)', async () => {
    getLastPipelineRun.mockReturnValue({ startedAt: Date.now(), authenticated: true });
    scheduleWarming('mount', { authenticated: true });
    await vi.advanceTimersByTimeAsync(TRIGGER_DELAY_MS.mount + 10);
    expect(runWarmingPipeline).toHaveBeenCalledTimes(1);
  });

  it('doubles the delay on very slow links (critical tier)', async () => {
    tier = 'critical';
    scheduleWarming('auth', { authenticated: true });
    await vi.advanceTimersByTimeAsync(TRIGGER_DELAY_MS.auth * 2 - 1);
    expect(runWarmingPipeline).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(20);
    expect(runWarmingPipeline).toHaveBeenCalledTimes(1);
  });

  it('cancelScheduledWarming drops the armed run', async () => {
    scheduleWarming('mount', { authenticated: false });
    cancelScheduledWarming();
    await vi.advanceTimersByTimeAsync(TRIGGER_DELAY_MS.mount * 3);
    expect(runWarmingPipeline).not.toHaveBeenCalled();
  });
});
