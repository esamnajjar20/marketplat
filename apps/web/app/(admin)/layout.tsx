import type { ReactNode } from 'react';
import { AdminLayoutClient } from '@/components/admin/AdminLayoutClient';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminLayoutClient>{children}</AdminLayoutClient>;
}
