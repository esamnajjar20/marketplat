'use client';

import { TabsBar } from '@/components/shared/ui/TabsBar';

export type ProfileTabValue = 'overview' | 'ads' | 'store' | 'services' | 'ratings';

interface Props {
  value: ProfileTabValue;
  onChange: (value: ProfileTabValue) => void;
  /** Which tabs to render, in order — sections without data are omitted. */
  available: { value: ProfileTabValue; label: string }[];
  className?: string;
}

/** Profile content tabs share the same accessible tab strip as search and account hubs. */
export function ProfileTabs({ value, onChange, available, className }: Props) {
  return (
    <TabsBar
      value={value}
      onChange={onChange}
      options={available}
      ariaLabel="أقسام الملف الشخصي"
      variant="underline"
      className={className}
      idPrefix="profile-sections"
    />
  );
}
