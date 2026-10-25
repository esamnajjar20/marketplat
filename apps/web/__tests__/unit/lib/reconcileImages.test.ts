import { describe, it, expect, vi } from 'vitest';
import { reconcileImages } from '@/lib/reconcileImages';

const file = (n: string) => new File(['x'], n);

function setup() {
  const calls: string[] = [];
  return {
    calls,
    ops: {
      addImages: vi.fn(async (f: File[]) => { calls.push(`add:${f.map((x) => x.name).join(',')}`); }),
      removeImage: vi.fn(async (u: string) => { calls.push(`remove:${u}`); }),
      reorderImages: vi.fn(async (i: string[]) => { calls.push(`reorder:${i.join(',')}`); }),
      onUploadStart: vi.fn(() => { calls.push('start'); }),
    },
  };
}

describe('reconcileImages', () => {
  it('does nothing when nothing changed', async () => {
    const { ops, calls } = setup();
    await reconcileImages({ originalImages: ['a', 'b'], existingImages: ['a', 'b'], newFiles: [] }, ops);
    expect(calls).toEqual([]);
  });

  it('removes first, then adds, in the normal case', async () => {
    const { ops, calls } = setup();
    await reconcileImages({ originalImages: ['a', 'b'], existingImages: ['a'], newFiles: [file('n')] }, ops);
    expect(calls).toEqual(['remove:b', 'start', 'add:n']);
  });

  it('adds BEFORE removing when removal would leave zero images (EPIC 1.5)', async () => {
    const { ops, calls } = setup();
    await reconcileImages({ originalImages: ['a'], existingImages: [], newFiles: [file('n')] }, ops);
    expect(calls).toEqual(['start', 'add:n', 'remove:a']);
  });

  it('removes everything when going to zero with no replacement files (backend guard decides)', async () => {
    const { ops, calls } = setup();
    await reconcileImages({ originalImages: ['a'], existingImages: [], newFiles: [] }, ops);
    expect(calls).toEqual(['remove:a']);
  });

  it('reorders only when the surviving order changed and more than one image remains', async () => {
    const { ops, calls } = setup();
    await reconcileImages({ originalImages: ['a', 'b', 'c'], existingImages: ['c', 'a'], newFiles: [] }, ops);
    expect(calls).toEqual(['remove:b', 'reorder:c,a']);
  });

  it('does not reorder a single surviving image', async () => {
    const { ops, calls } = setup();
    await reconcileImages({ originalImages: ['a', 'b'], existingImages: ['b'], newFiles: [] }, ops);
    expect(calls).toEqual(['remove:a']);
  });

  it('propagates errors and stops before later steps', async () => {
    const { ops, calls } = setup();
    ops.removeImage.mockRejectedValueOnce(new Error('boom'));
    await expect(
      reconcileImages({ originalImages: ['a', 'b'], existingImages: ['b'], newFiles: [file('n')] }, ops),
    ).rejects.toThrow('boom');
    expect(calls).toEqual([]);
  });
});
