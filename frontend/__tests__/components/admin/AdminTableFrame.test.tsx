import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { AdminTableFrame, ADMIN_THEAD_CLASS } from '@/components/admin/AdminTableFrame';

function renderFrame(props: Parameters<typeof AdminTableFrame>[0] extends infer P ? Partial<P> : never = {}) {
  return render(
    <AdminTableFrame {...props}>
      <thead className={ADMIN_THEAD_CLASS}><tr><th>a</th><th>b</th></tr></thead>
      <tbody><tr><td>1</td><td>2</td></tr></tbody>
    </AdminTableFrame>,
  );
}

describe('AdminTableFrame', () => {
  it('renders a real table with the shared head class', () => {
    const { container } = renderFrame();
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelector('thead')?.className).toBe(ADMIN_THEAD_CLASS);
  });
  it('defaults: hidden on mobile, min-w-[640px], sticky actions column', () => {
    const { container } = renderFrame();
    expect(container.firstElementChild?.className).toContain('hidden md:block');
    const cls = container.querySelector('table')!.className;
    expect(cls).toContain('min-w-[640px]');
    expect(cls).toContain('[&_td:last-child]:sticky');
    expect(cls).toContain('[&_td:last-child]:bg-background');
  });
  it('opt-outs: always visible, no sticky column, custom width and card surface', () => {
    const { container } = renderFrame({ hiddenOnMobile: false, stickyActions: false, minWidthClass: 'min-w-[760px]' });
    expect(container.firstElementChild?.className).not.toContain('hidden');
    const cls = container.querySelector('table')!.className;
    expect(cls).toContain('min-w-[760px]');
    expect(cls).not.toContain('sticky');
    const card = renderFrame({ cellSurface: 'card' });
    expect(card.container.querySelector('table')!.className).toContain('[&_td:last-child]:bg-card');
  });
});
