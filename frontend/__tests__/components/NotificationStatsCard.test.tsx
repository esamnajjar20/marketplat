/**
 * __tests__/components/NotificationStatsCard.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { NotificationStatsCard } from '@/components/admin/NotificationStatsCard';
import { adminApi } from '@/api/admin.api';

vi.mock('@/api/admin.api', () => ({
  adminApi: {
    getNotificationStats: vi.fn(),
  },
}));

function wrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function W({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('NotificationStatsCard', () => {
  beforeEach(() => {
    vi.mocked(adminApi.getNotificationStats).mockReset();
  });

  it('shows loading then stats', async () => {
    vi.mocked(adminApi.getNotificationStats).mockResolvedValue({
      data: {
        data: {
          total: 100,
          unread: 12,
          byType: [{ type: 'NEW_MESSAGE', count: 40 }],
        },
      },
    } as never);

    render(<NotificationStatsCard />, { wrapper: wrapper() });

    await waitFor(() => {
      expect(screen.getByText(/إحصاءات الإشعارات/)).toBeInTheDocument();
    });
    expect(screen.getByText('الإجمالي')).toBeInTheDocument();
    expect(screen.getByText('غير مقروء')).toBeInTheDocument();
  });

  it('shows error message on failure', async () => {
    vi.mocked(adminApi.getNotificationStats).mockRejectedValue(new Error('fail'));
    render(<NotificationStatsCard />, { wrapper: wrapper() });

    await waitFor(() => {
      expect(screen.getByText(/تعذّر تحميل إحصاءات الإشعارات/)).toBeInTheDocument();
    });
  });
});
