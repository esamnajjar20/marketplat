import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CreateSheet, CREATE_LINKS } from '@/components/layout/CreateSheet';

const mockRoles = {
  isSeller: true,
  isProvider: true,
  hasActiveStore: true,
};

vi.mock('@/store/auth.store', () => ({
  useAuthStore: (selector: (state: typeof mockRoles) => unknown) => selector(mockRoles),
  selectLastKnownRoles: (state: typeof mockRoles) => state,
}));

vi.mock('@/components/shared/ui/Sheet', () => ({
  Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="sheet">{children}</div> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

describe('CreateSheet (UI-PHASE-D)', () => {
  beforeEach(() => {
    mockRoles.isSeller = true;
    mockRoles.isProvider = true;
    mockRoles.hasActiveStore = true;
  });

  it('lists primary create destinations and drafts entry', () => {
    render(<CreateSheet open onOpenChange={() => {}} />);
    expect(screen.getByText('إعلان جديد')).toBeInTheDocument();
    expect(screen.getByText('منتج جديد')).toBeInTheDocument();
    expect(screen.getByText('خدمة جديدة')).toBeInTheDocument();
    expect(screen.getByText('طلب / احتياج')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /متابعة المسودات/ })).toHaveAttribute(
      'href',
      '/offline?tab=drafts',
    );
  });

  it('hides seller/store/provider options when their capabilities are absent', async () => {
    mockRoles.isSeller = false;
    mockRoles.isProvider = false;
    mockRoles.hasActiveStore = false;

    render(<CreateSheet open onOpenChange={() => {}} />);

    expect(screen.queryByText('إعلان جديد')).not.toBeInTheDocument();
    expect(screen.queryByText('منتج جديد')).not.toBeInTheDocument();
    expect(screen.queryByText('خدمة جديدة')).not.toBeInTheDocument();
    expect(screen.getByText('طلب / احتياج')).toBeInTheDocument();
  });

  it('exports create links with ad as primary', () => {
    expect(CREATE_LINKS[0]?.primary).toBe(true);
    expect(CREATE_LINKS).toHaveLength(4);
  });
});
