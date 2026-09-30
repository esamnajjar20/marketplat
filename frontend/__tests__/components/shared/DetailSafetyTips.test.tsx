import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DetailSafetyTips } from '@/components/shared/DetailSafetyTips';
import {
  LIST_CARD_GRID_CLASS,
  LIST_STORE_GRID_CLASS,
  LIST_SERVICE_GRID_CLASS,
} from '@/components/shared/list/ListPageShell';

describe('DetailSafetyTips', () => {
  it('is collapsed by default and expands on click', () => {
    render(<DetailSafetyTips />);
    expect(screen.queryByText(/مكان عام/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /نصائح للسلامة/ }));
    expect(screen.getByText(/مكان عام/)).toBeInTheDocument();
  });

  it('can start open', () => {
    render(<DetailSafetyTips defaultOpen />);
    expect(screen.getByText(/مكان عام/)).toBeInTheDocument();
  });
});

describe('list grid class tokens (UI-PHASE-B)', () => {
  it('exports product/ad, store, and service grids', () => {
    expect(LIST_CARD_GRID_CLASS).toMatch(/grid-cols-2/);
    expect(LIST_STORE_GRID_CLASS).toMatch(/grid-cols-1/);
    expect(LIST_SERVICE_GRID_CLASS).toMatch(/sm:grid-cols-2/);
  });
});
