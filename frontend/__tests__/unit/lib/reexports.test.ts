import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ Toaster: function MockToaster() { return null; } }));
vi.mock('@/components/ui/avatar', () => ({ Avatar: 'Avatar', AvatarFallback: 'AvatarFallback', AvatarImage: 'AvatarImage' }));
vi.mock('@/components/ui/separator', () => ({ Separator: 'Separator' }));
describe('re-exports', () => {
  it('Toaster', async () => { expect((await import('@/components/shared/feedback/Toaster')).Toaster).toBeDefined(); });
  it('Avatar', async () => { const m = await import('@/components/shared/ui/Avatar'); expect(m.Avatar).toBe('Avatar'); });
  it('Separator', async () => { expect((await import('@/components/shared/ui/Separator')).Separator).toBe('Separator'); });
});
