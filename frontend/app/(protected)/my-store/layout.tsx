import { StorePendingBanner } from '@/components/stores/StorePendingBanner';

export default function MyStoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <StorePendingBanner />
      {children}
    </div>
  );
}
