'use client';

/**
 * lib/imageCompressWorkerClient.ts
 *
 * SW-IMAGE-WORKER-01: client for public/imageCompressWorker.js.
 *
 * Manages a small pool of Workers (max 2 — more than that adds memory
 * pressure on the low-end phones this app targets without speeding up
 * the typical 1-10 image upload). Falls back silently to `null` on
 * every failure mode so callers can drop into the main-thread
 * implementation without branching:
 *
 *   - Worker API unavailable (very old browsers, SSR, Node tests)
 *   - OffscreenCanvas unavailable in the worker
 *   - Worker throws or does not respond within WORKER_TIMEOUT_MS
 *
 * The worker URL is a same-origin static asset, so proxy.ts's CSP
 * (script-src 'self') allows it via the worker-src fallback chain.
 * A blob: URL would have been blocked, which is why the worker is a
 * real file and not an inline Blob.
 */

const WORKER_URL = '/imageCompressWorker.js';
const MAX_WORKERS = 2;
const WORKER_TIMEOUT_MS = 30_000;

export interface CompressInWorkerOpts {
  maxDim: number;
  quality: number;
  /** Optional byte ceiling. The worker will retry at lower quality
   *  (up to two steps, floor 0.4) if the first result exceeds it. */
  maxBytes?: number;
}

export interface WorkerCompressResult {
  blob: Blob;
  size: number;
}

const pool: Worker[] = [];
const available: Worker[] = [];
const waiters: Array<(w: Worker) => void> = [];
let nextId = 1;
let capabilityCache: boolean | null = null;

function capabilitiesOk(): boolean {
  if (capabilityCache !== null) return capabilityCache;
  if (typeof window === 'undefined') {
    capabilityCache = false;
    return false;
  }
  if (typeof Worker === 'undefined') {
    capabilityCache = false;
    return false;
  }
  if (typeof OffscreenCanvas === 'undefined') {
    // Worker would immediately reject with 'unsupported' — skip the
    // roundtrip entirely and let the caller fall through.
    capabilityCache = false;
    return false;
  }
  capabilityCache = true;
  return true;
}

function acquire(): Promise<Worker> {
  const existing = available.pop();
  if (existing) return Promise.resolve(existing);
  if (pool.length < MAX_WORKERS) {
    try {
      const w = new Worker(WORKER_URL);
      pool.push(w);
      return Promise.resolve(w);
    } catch {
      return Promise.reject(new Error('worker-spawn-failed'));
    }
  }
  return new Promise<Worker>((resolve) => waiters.push(resolve));
}

function release(w: Worker): void {
  const next = waiters.shift();
  if (next) next(w);
  else available.push(w);
}

/**
 * Compress a File off the main thread. Returns null on any failure —
 * the caller keeps the original File or falls back to its own
 * main-thread implementation.
 */
export async function compressInWorker(
  file: File,
  opts: CompressInWorkerOpts,
): Promise<WorkerCompressResult | null> {
  if (!capabilitiesOk()) return null;

  let worker: Worker;
  try {
    worker = await acquire();
  } catch {
    return null;
  }

  const id = nextId++;

  return new Promise<WorkerCompressResult | null>((resolve) => {
    let settled = false;

    const finish = (result: WorkerCompressResult | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.removeEventListener('message', onMessage);
      release(worker);
      resolve(result);
    };

    const timer = setTimeout(() => finish(null), WORKER_TIMEOUT_MS);

    function onMessage(e: MessageEvent) {
      const msg = e.data as
        | { id?: number; buffer?: ArrayBuffer; size?: number; mimeType?: string; error?: string }
        | undefined;
      if (!msg || msg.id !== id) return;
      if (msg.error || !msg.buffer) {
        finish(null);
        return;
      }
      try {
        const blob = new Blob([msg.buffer], { type: msg.mimeType || 'image/jpeg' });
        finish({ blob, size: msg.size ?? blob.size });
      } catch {
        finish(null);
      }
    }

    worker.addEventListener('message', onMessage);

    try {
      worker.postMessage({
        type: 'compress',
        id,
        file,
        maxDim: opts.maxDim,
        quality: opts.quality,
        maxBytes: opts.maxBytes,
      });
    } catch {
      finish(null);
    }
  });
}
