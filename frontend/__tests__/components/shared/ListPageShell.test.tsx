import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListPageShell, LIST_CARD_GRID_CLASS } from '@/components/shared/list/ListPageShell';
import { isCompactDensity } from '@/lib/cardDensity';

describe('cardDensity', () => {
  it('treats compact as compact', () => {
    expect(isCompactDensity('compact')).toBe(true);
    expect(isCompactDensity('default')).toBe(false);
    expect(isCompactDensity(undefined)).toBe(false);
  });
});

describe('ListPageShell', () => {
  it('renders title, description, toolbar, sidebar, and children', () => {
    render(
      <ListPageShell
        icon={<span data-testid="icon" />}
        title="الإعلانات"
        description="وصف"
        toolbar={<button type="button">فلاتر</button>}
        sidebar={<div data-testid="sidebar">side</div>}
        headerEnd={<a href="/x">رابط</a>}
      >
        <div data-testid="main">نتائج</div>
      </ListPageShell>,
    );
    expect(screen.getByRole('heading', { name: 'الإعلانات' })).toBeInTheDocument();
    expect(screen.getByText('وصف')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'فلاتر' })).toBeInTheDocument();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('main')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'رابط' })).toHaveAttribute('href', '/x');
  });

  it('exports a shared grid class for card layouts', () => {
    expect(LIST_CARD_GRID_CLASS).toMatch(/grid/);
  });
});
