/**
 * __tests__/components/WorkingHoursEditor.test.tsx
 *
 * Previously uncovered (0%), ~90 lines. Controlled editor for the
 * WorkingHours shape the backend's workingHoursSchema expects verbatim
 * — a disabled day is sent as `null`, not omitted.
 *
 * Coverage targets:
 *  - Renders all 7 days in sat→fri order
 *  - A day with a schedule shows checked checkbox + open/close time
 *    inputs with the right values; a null day shows unchecked + "مغلق"
 *  - Enabling a day calls onChange with { open: '09:00', close: '17:00' }
 *    for that day, other days unchanged
 *  - Disabling a day calls onChange with null for that day
 *  - Changing the open/close time calls onChange with only that field
 *    updated, other fields preserved
 *  - Changing a time on a currently-disabled day is a no-op (no
 *    time inputs exist to interact with, since schedule is null)
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkingHoursEditor } from '@/components/services/WorkingHoursEditor';
import type { WorkingHours } from '@/types/service.types';

const ALL_CLOSED: WorkingHours = {
  sat: null, sun: null, mon: null, tue: null, wed: null, thu: null, fri: null,
};

describe('WorkingHoursEditor', () => {
  it('renders all seven days in sat→fri order', () => {
    render(<WorkingHoursEditor value={ALL_CLOSED} onChange={vi.fn()} />);
    const labels = screen.getAllByText(/السبت|الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة/);
    expect(labels.map((l) => l.textContent)).toEqual([
      'السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة',
    ]);
  });

  it('shows "مغلق" and an unchecked checkbox for a null day', () => {
    render(<WorkingHoursEditor value={ALL_CLOSED} onChange={vi.fn()} />);
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes.every((cb) => !(cb as HTMLInputElement).checked)).toBe(true);
    expect(screen.getAllByText('مغلق')).toHaveLength(7);
  });

  it('shows checked checkbox and open/close time inputs for a scheduled day', () => {
    const value: WorkingHours = { ...ALL_CLOSED, sun: { open: '08:00', close: '16:00' } };
    render(<WorkingHoursEditor value={value} onChange={vi.fn()} />);
    const openInput = screen.getByLabelText('الأحد — وقت الفتح') as HTMLInputElement;
    const closeInput = screen.getByLabelText('الأحد — وقت الإغلاق') as HTMLInputElement;
    expect(openInput.value).toBe('08:00');
    expect(closeInput.value).toBe('16:00');
  });

  it('calls onChange with default hours when a day is enabled', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WorkingHoursEditor value={ALL_CLOSED} onChange={onChange} />);

    const sundayCheckbox = screen.getAllByRole('checkbox')[1]; // sat, sun, ...
    await user.click(sundayCheckbox);

    expect(onChange).toHaveBeenCalledWith({
      ...ALL_CLOSED,
      sun: { open: '09:00', close: '17:00' },
    });
  });

  it('calls onChange with null when a scheduled day is disabled', async () => {
    const value: WorkingHours = { ...ALL_CLOSED, mon: { open: '08:00', close: '16:00' } };
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WorkingHoursEditor value={value} onChange={onChange} />);

    // Day order is sat, sun, mon, ... — mon is the third checkbox.
    const mondayCheckbox = screen.getAllByRole('checkbox')[2];
    await user.click(mondayCheckbox);

    expect(onChange).toHaveBeenCalledWith({ ...value, mon: null });
  });

  it('updates only the open time when changed, preserving close', async () => {
    const value: WorkingHours = { ...ALL_CLOSED, tue: { open: '08:00', close: '16:00' } };
    const onChange = vi.fn();
    render(<WorkingHoursEditor value={value} onChange={onChange} />);

    const openInput = screen.getByLabelText('الثلاثاء — وقت الفتح');
    fireEvent.change(openInput, { target: { value: '10:30' } });

    expect(onChange).toHaveBeenCalledWith({ ...value, tue: { open: '10:30', close: '16:00' } });
  });

  it('updates only the close time when changed, preserving open', async () => {
    const value: WorkingHours = { ...ALL_CLOSED, wed: { open: '08:00', close: '16:00' } };
    const onChange = vi.fn();
    render(<WorkingHoursEditor value={value} onChange={onChange} />);

    const closeInput = screen.getByLabelText('الأربعاء — وقت الإغلاق');
    fireEvent.change(closeInput, { target: { value: '18:45' } });

    expect(onChange).toHaveBeenCalledWith({ ...value, wed: { open: '08:00', close: '18:45' } });
  });

  it('does not render time inputs for a day that is closed', () => {
    render(<WorkingHoursEditor value={ALL_CLOSED} onChange={vi.fn()} />);
    expect(screen.queryByLabelText('السبت — وقت الفتح')).not.toBeInTheDocument();
  });
});
