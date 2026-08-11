import type { ReactNode } from 'react';

// P1 FIX (layout audit §6, "sidebar داخل sidebar"): this used to render
// its own SettingsSidebar (8 links) in a second nav column next to
// ProtectedSidebar's single "الإعدادات" entry — three nested navigation
// levels on desktop. Those 8 destinations now live directly inside
// ProtectedSidebar as a disclosure group (SETTINGS_GROUP), so this layout
// is just a passthrough — settings pages get the same single-column
// <main> every other protected route gets.
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <div className="max-w-3xl">{children}</div>;
}
