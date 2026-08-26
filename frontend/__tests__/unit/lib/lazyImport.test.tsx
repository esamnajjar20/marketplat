import { describe, it, expect, vi } from 'vitest';
import { lazyImport } from '@/lib/lazyImport';
const dynamicMock = vi.fn((loader: () => Promise<unknown>, opts: unknown) => {
  const Comp = () => null;
  (Comp as any)._loader = loader;
  (Comp as any)._opts = opts;
  return Comp;
});
vi.mock('next/dynamic', () => ({ default: (loader: any, opts: any) => dynamicMock(loader, opts) }));
describe('lazyImport', () => {
  it('defaults ssr:false and resolves named export', async () => {
    const Dummy = () => null;
    const Comp = lazyImport(() => Promise.resolve({ MyWidget: Dummy }), 'MyWidget');
    expect((Comp as any)._opts.ssr).toBe(false);
    expect(await (Comp as any)._loader()).toBe(Dummy);
  });
});
