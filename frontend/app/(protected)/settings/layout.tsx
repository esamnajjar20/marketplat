import { SettingsSidebar } from '@/components/profile/SettingsSidebar';
import type { ReactNode }  from 'react';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <aside className="md:col-span-1">
        <SettingsSidebar />
      </aside>
      <main className="md:col-span-3">{children}</main>
    </div>
  );
}
