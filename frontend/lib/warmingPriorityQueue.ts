import type { WarmingJobDefinition, WarmingJobId } from './warmingRegistry';

export interface WarmingQueueItem {
  job: WarmingJobDefinition;
  run: () => Promise<void>;
}

/** Small deterministic priority queue; warming has only a handful of jobs. */
export class WarmingPriorityQueue {
  private readonly items: WarmingQueueItem[] = [];

  enqueue(item: WarmingQueueItem): void {
    this.items.push(item);
    this.items.sort((a, b) => b.job.priority - a.job.priority || a.job.order - b.job.order);
  }

  enqueueMany(items: readonly WarmingQueueItem[]): void {
    for (const item of items) this.enqueue(item);
  }

  remove(id: WarmingJobId): WarmingQueueItem | undefined {
    const index = this.items.findIndex((item) => item.job.id === id);
    if (index < 0) return undefined;
    return this.items.splice(index, 1)[0];
  }

  drain(): WarmingQueueItem[] {
    return this.items.splice(0, this.items.length);
  }

  get size(): number {
    return this.items.length;
  }
}
