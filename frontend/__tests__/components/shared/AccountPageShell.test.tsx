import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AccountPageShell } from '@/components/shared/account/AccountPageShell';

describe('AccountPageShell', () => {
  it('renders title, description, actions, and children', () => {
    render(
      <AccountPageShell title="المفضلة" description="وصف" actions={<button type="button">فعل</button>}>
        <div>محتوى</div>
      </AccountPageShell>,
    );
    expect(screen.getByRole('heading', { name: 'المفضلة' })).toBeInTheDocument();
    expect(screen.getByText('وصف')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'فعل' })).toBeInTheDocument();
    expect(screen.getByText('محتوى')).toBeInTheDocument();
  });
});
