/**
 * __tests__/components/LegalPageShell.test.tsx
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LegalPageShell } from '@/components/shared/legal/LegalPageShell';

describe('LegalPageShell', () => {
  it('renders title, description, and children', () => {
    render(
      <LegalPageShell title="الخصوصية" description="كيف نحمي بياناتك">
        <p>محتوى الصفحة</p>
      </LegalPageShell>,
    );

    expect(screen.getByRole('heading', { name: 'الخصوصية' })).toBeInTheDocument();
    expect(screen.getByText('كيف نحمي بياناتك')).toBeInTheDocument();
    expect(screen.getByText('محتوى الصفحة')).toBeInTheDocument();
    expect(screen.getByText('سوق غزة')).toBeInTheDocument();
  });

  it('renders legal navigation links', () => {
    render(
      <LegalPageShell title="الشروط">
        <p>نص</p>
      </LegalPageShell>,
    );

    expect(screen.getByRole('navigation', { name: 'صفحات المعلومات' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'من نحن' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'تواصل معنا' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'الخصوصية' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'الشروط' })).toBeInTheDocument();
  });

  it('omits description when not provided', () => {
    render(
      <LegalPageShell title="من نحن">
        <p>عن المنصة</p>
      </LegalPageShell>,
    );

    expect(screen.getByRole('heading', { name: 'من نحن' })).toBeInTheDocument();
    expect(screen.queryByText('كيف نحمي بياناتك')).not.toBeInTheDocument();
  });
});
