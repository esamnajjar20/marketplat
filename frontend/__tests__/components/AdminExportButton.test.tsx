/**
 * __tests__/components/AdminExportButton.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { AdminExportButton } from '@/components/admin/AdminExportButton';
import { adminApi } from '@/api/admin.api';

vi.mock('@/api/admin.api', () => ({
  adminApi: {
    exportUsersCsv: vi.fn(),
    exportReportsCsv: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('AdminExportButton', () => {
  beforeEach(() => {
    vi.mocked(adminApi.exportUsersCsv).mockReset();
    vi.mocked(adminApi.exportReportsCsv).mockReset();
  });

  it('renders the provided label', () => {
    render(<AdminExportButton kind="users" label="تصدير المستخدمين" />);
    expect(screen.getByRole('button', { name: /تصدير المستخدمين/ })).toBeInTheDocument();
  });

  it('downloads users CSV on click', async () => {
    vi.mocked(adminApi.exportUsersCsv).mockResolvedValue({
      data: 'id,email\n1,a@b.com',
    } as never);

    const clickSpy = vi.fn();
    const originalCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreate(tag);
      if (tag === 'a') {
        Object.defineProperty(el, 'click', { value: clickSpy });
      }
      return el;
    });

    const user = setupUser();
    render(<AdminExportButton kind="users" label="تصدير" />);
    await user.click(screen.getByRole('button', { name: /تصدير/ }));

    expect(adminApi.exportUsersCsv).toHaveBeenCalled();
    vi.mocked(document.createElement).mockRestore();
  });

  it('exports reports when kind is reports', async () => {
    vi.mocked(adminApi.exportReportsCsv).mockResolvedValue({
      data: 'id,reason\n1,spam',
    } as never);

    const user = setupUser();
    render(<AdminExportButton kind="reports" label="تقارير" />);
    await user.click(screen.getByRole('button', { name: /تقارير/ }));
    expect(adminApi.exportReportsCsv).toHaveBeenCalled();
  });
});
