/**
 * طبقة توافق — تحافظ على كل الاستيرادات القديمة:
 *   import { PageShell, PrimaryButton, ... } from '@/components/MobileUI'
 *
 * التنفيذ الفعلي أصبح في `src/components/ui/*`.
 * يُفضَّل الاستيراد الجديد من `@/components/ui` في الملفات الجديدة.
 */
export {
  AppHeader,
  PageShell,
  PrimaryButton,
  SecondaryButton,
  Field,
  SectionHeader,
  SectionCard,
  ListRow,
  Notice,
  Badge,
  Chip,
  LoadingState,
  EmptyState,
  ErrorState,
  SkeletonBlock,
  SkeletonCard,
  SkeletonList,
  OfflineBanner,
  SearchBar,
  DetailScaffold,
} from './ui';
