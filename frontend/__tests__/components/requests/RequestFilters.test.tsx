import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RequestFilters } from '@/components/requests/RequestFilters';
import { useServiceTypes } from '@/hooks/queries/useServiceTypes';

const { mockReplace } = vi.hoisted(() => ({ mockReplace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mockReplace, back: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('@/hooks/queries/useServiceTypes', () => ({ useServiceTypes: vi.fn() }));

describe('RequestFilters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useServiceTypes).mockReturnValue({
      data: [{ id: 'svc-1', nameAr: 'صيانة', isActive: true }],
    } as never);
  });

  it('does not load service types when the service filter is disabled', () => {
    render(<RequestFilters type="PRODUCT" />);

    expect(useServiceTypes).toHaveBeenCalledWith({ enabled: false });
    expect(screen.getByRole('combobox', { name: 'المجال' })).toBeDisabled();
  });

  it('waits until the service domain select is focused before loading options', () => {
    render(<RequestFilters type="SERVICE" />);

    expect(useServiceTypes).toHaveBeenLastCalledWith({ enabled: false });
    const select = screen.getByRole('combobox', { name: 'المجال' });
    fireEvent.focus(select);
    expect(useServiceTypes).toHaveBeenLastCalledWith({ enabled: true });
    expect(screen.getByRole('option', { name: 'صيانة' })).toBeInTheDocument();
  });

  it('loads service types immediately when the URL already selects a domain', () => {
    render(<RequestFilters type="SERVICE" serviceTypeId="svc-1" />);
    expect(useServiceTypes).toHaveBeenLastCalledWith({ enabled: true });
  });
});
