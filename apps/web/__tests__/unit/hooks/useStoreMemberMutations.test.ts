/**
 * __tests__/unit/hooks/useStoreMemberMutations.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import {
  useInviteStoreMember,
  useUpdateStoreMemberRole,
  useRemoveStoreMember,
} from '@/hooks/mutations/useStoreMemberMutations';
import { storeMembersApi } from '@/api/store-members.api';
import { toast } from 'sonner';

vi.mock('@/api/store-members.api', () => ({
  storeMembersApi: {
    invite: vi.fn(),
    updateRole: vi.fn(),
    remove: vi.fn(),
  },
}));
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/errorParser', () => ({
  parseApiError: () => ({ message: 'خطأ' }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe('useStoreMemberMutations', () => {
  beforeEach(() => {
    vi.mocked(storeMembersApi.invite).mockResolvedValue({
      data: { data: { id: 'm1' } },
    } as never);
    vi.mocked(storeMembersApi.updateRole).mockResolvedValue({
      data: { data: {} },
    } as never);
    vi.mocked(storeMembersApi.remove).mockResolvedValue({
      data: { data: {} },
    } as never);
    vi.mocked(toast.success).mockReset();
  });

  it('invite shows success toast', async () => {
    const { result } = renderHook(() => useInviteStoreMember('s1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ email: 'a@b.com', role: 'EDITOR' } as never);
    });
    expect(storeMembersApi.invite).toHaveBeenCalledWith('s1', {
      email: 'a@b.com',
      role: 'EDITOR',
    });
    expect(toast.success).toHaveBeenCalledWith('تم إرسال الدعوة');
  });

  it('updateRole shows success toast', async () => {
    const { result } = renderHook(() => useUpdateStoreMemberRole('s1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        memberId: 'm1',
        payload: { role: 'ADMIN' },
      } as never);
    });
    expect(toast.success).toHaveBeenCalledWith('تم تحديث الدور');
  });

  it('remove shows success toast', async () => {
    const { result } = renderHook(() => useRemoveStoreMember('s1'), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('m1');
    });
    expect(storeMembersApi.remove).toHaveBeenCalledWith('s1', 'm1');
    expect(toast.success).toHaveBeenCalled();
  });
});
