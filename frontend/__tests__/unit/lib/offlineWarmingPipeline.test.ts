import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runWarmingEngine = vi.fn();
const shouldPauseBackgroundWarming = vi.fn(async () => false);
const getBackgroundWarmingBudget = vi.fn(async () => 'full' as const);

vi.mock('@/lib/warmingEngine', () => ({
  runWarmingEngine: (...args: unknown[]) => runWarmingEngine(...args),
}));
vi.mock('@/lib/offlineStoragePressure', () => ({
  shouldPauseBackgroundWarming: () => shouldPauseBackgroundWarming(),
  getBackgroundWarmingBudget: () => getBackgroundWarmingBudget(),
}));
vi.mock('@/lib/networkPolicy', () => ({
  getNetworkPolicy: () => ({ tier: 'normal', saveData: false, allowBackgroundWarming: true }),
}));

const engineResult = { ran: true, completed: [], skipped: [], budget: {} };

async function loadPipeline() {
  vi.resetModules(); // the pipeline keeps module-level in-flight state
  return import('@/lib/offlineWarmingPipeline');
}

describe('runWarmingPipeline', () => {
  let onLine: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    runWarmingEngine.mockReset();
    shouldPauseBackgroundWarming.mockReset().mockResolvedValue(false);
    getBackgroundWarmingBudget.mockReset().mockResolvedValue('full');
    onLine = vi.spyOn(navigator, 'onLine', 'get');
    onLine.mockReturnValue(true);
  });
  afterEach(() => onLine.mockRestore());

  it('does not stamp the run when the link drops before the engine starts (FIX WARM-PIPELINE-STAMP-01)', async () => {
    const { runWarmingPipeline, getLastPipelineRun } = await loadPipeline();
    // the connection drops while the pipeline is awaiting the storage check
    shouldPauseBackgroundWarming.mockImplementation(async () => {
      onLine.mockReturnValue(false);
      return false;
    });

    await expect(runWarmingPipeline({ authenticated: true })).resolves.toEqual({ ran: false });

    expect(runWarmingEngine).not.toHaveBeenCalled();
    // a run that never started must not trip the scheduler's 2-minute rate limit
    expect(getLastPipelineRun().startedAt).toBe(0);
    expect(getLastPipelineRun().authenticated).toBe(false);
  });

  it('stamps the run once the engine really starts', async () => {
    const { runWarmingPipeline, getLastPipelineRun } = await loadPipeline();
    runWarmingEngine.mockResolvedValue(engineResult);
    const before = Date.now();
    await runWarmingPipeline({ authenticated: true });
    expect(runWarmingEngine).toHaveBeenCalledTimes(1);
    expect(getLastPipelineRun().startedAt).toBeGreaterThanOrEqual(before);
    expect(getLastPipelineRun().authenticated).toBe(true);
  });

  it('an authenticated call during an authenticated run does not queue a second pass (FIX WARM-PIPELINE-RERUN-01)', async () => {
    const { runWarmingPipeline } = await loadPipeline();
    let release!: () => void;
    runWarmingEngine.mockImplementation(
      () => new Promise((resolve) => { release = () => resolve(engineResult); }),
    );

    const first = runWarmingPipeline({ authenticated: true });
    await vi.waitFor(() => expect(runWarmingEngine).toHaveBeenCalledTimes(1));

    await expect(runWarmingPipeline({ authenticated: true })).resolves.toEqual({ ran: false });
    release();
    await first;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(runWarmingEngine).toHaveBeenCalledTimes(1);
  });

  it('an authenticated call during an UNauthenticated run still chains one personal pass (WARM-PIPELINE-QUEUE-01)', async () => {
    const { runWarmingPipeline } = await loadPipeline();
    const releases: Array<() => void> = [];
    runWarmingEngine.mockImplementation(
      () => new Promise((resolve) => { releases.push(() => resolve(engineResult)); }),
    );

    const first = runWarmingPipeline({ authenticated: false });
    await vi.waitFor(() => expect(runWarmingEngine).toHaveBeenCalledTimes(1));
    await runWarmingPipeline({ authenticated: true }); // arrives mid-flight → remembered

    releases[0]!();
    await first;
    await vi.waitFor(() => expect(runWarmingEngine).toHaveBeenCalledTimes(2));
    expect(runWarmingEngine).toHaveBeenLastCalledWith({ authenticated: true, force: false });
    releases[1]!();
  });
});
