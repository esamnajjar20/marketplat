import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdminPageShell } from '@/components/admin/AdminPageShell';

describe('AdminPageShell (UI-PHASE-F)', () => {
  it('renders title, description, actions, and children', () => {
    render(
      <AdminPageShell
        title="إدارة الإعلانات"
        description="وصف"
        actions={<button type="button">تصدير</button>}
      >
        <table>
          <tbody>
            <tr>
              <td>صف</td>
            </tr>
          </tbody>
        </table>
      </AdminPageShell>,
    );
    expect(screen.getByRole('heading', { name: 'إدارة الإعلانات' })).toBeInTheDocument();
    expect(screen.getByText('وصف')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تصدير' })).toBeInTheDocument();
    expect(screen.getByText('صف')).toBeInTheDocument();
  });
});
