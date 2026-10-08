import { register, backgroundTaskFailuresTotal, backgroundTaskFailurePersistenceTotal } from '../../src/shared/utils/metrics';

describe('background observability metrics', () => {
  beforeEach(() => register.resetMetrics());

  it('exposes stable background task failure counters', async () => {
    backgroundTaskFailuresTotal.inc({ task_type: 'notification', outcome: 'recorded' });
    backgroundTaskFailuresTotal.inc({ task_type: 'notification', outcome: 'persistence_failed' });
    backgroundTaskFailurePersistenceTotal.inc({ task_type: 'notification' });
    const failures = await backgroundTaskFailuresTotal.get();
    expect(failures.values.find(v => v.labels.outcome === 'recorded')?.value).toBe(1);
    expect(failures.values.find(v => v.labels.outcome === 'persistence_failed')?.value).toBe(1);
    const persistence = await backgroundTaskFailurePersistenceTotal.get();
    expect(persistence.values.find(v => v.labels.task_type === 'notification')?.value).toBe(1);
  });
});
