import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isScrolling, runWhenScrollIdle, scrollActivity } from '../scrollActivity';

describe('scrollActivity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    scrollActivity.reset();
  });
  afterEach(() => {
    scrollActivity.reset();
    vi.useRealTimers();
  });

  it('runs tasks immediately when the list is idle', () => {
    const task = vi.fn();
    runWhenScrollIdle(task);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('defers tasks while dragging and runs them after the list settles', () => {
    const task = vi.fn();
    scrollActivity.dragStart();
    expect(isScrolling()).toBe(true);
    runWhenScrollIdle(task);
    expect(task).not.toHaveBeenCalled();
    scrollActivity.dragEnd();
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('keeps waiting while momentum scrolling follows the drag', () => {
    const task = vi.fn();
    scrollActivity.dragStart();
    runWhenScrollIdle(task);
    scrollActivity.dragEnd();
    scrollActivity.momentumStart();
    vi.advanceTimersByTime(300);
    expect(task).not.toHaveBeenCalled();
    scrollActivity.momentumEnd();
    vi.advanceTimersByTime(200);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('does not starve: runs after maxWaitMs even if momentum never ends', () => {
    const task = vi.fn();
    scrollActivity.momentumStart();
    runWhenScrollIdle(task, { maxWaitMs: 500 });
    vi.advanceTimersByTime(499);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('can be cancelled and never runs twice', () => {
    const task = vi.fn();
    scrollActivity.dragStart();
    const cancel = runWhenScrollIdle(task);
    cancel();
    scrollActivity.dragEnd();
    vi.advanceTimersByTime(5_000);
    expect(task).not.toHaveBeenCalled();

    const once = vi.fn();
    scrollActivity.dragStart();
    runWhenScrollIdle(once, { maxWaitMs: 100 });
    vi.advanceTimersByTime(150);
    scrollActivity.dragEnd();
    vi.advanceTimersByTime(500);
    expect(once).toHaveBeenCalledTimes(1);
  });

  it('a throwing task does not block the remaining tasks', () => {
    const bad = vi.fn(() => { throw new Error('boom'); });
    const good = vi.fn();
    scrollActivity.dragStart();
    runWhenScrollIdle(bad);
    runWhenScrollIdle(good);
    scrollActivity.dragEnd();
    vi.advanceTimersByTime(200);
    expect(bad).toHaveBeenCalledTimes(1);
    expect(good).toHaveBeenCalledTimes(1);
  });
});
