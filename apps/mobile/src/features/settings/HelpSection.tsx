import { View } from 'react-native';
import { AppIcon } from '@/components/Icons';
import { ListRow, SectionHeader } from '@/components/ui';
import { pushOnce } from '@/lib/navigation';
import { spacing } from '@/theme/tokens';

/** المساعدة والدعم. */
export function HelpSection() {
  return (
    <View style={{ gap: spacing.md }}>
      <SectionHeader title="المساعدة" />
      <ListRow
        title="العمليات دون اتصال"
        description="ما ينتظر المزامنة عند عودة الإنترنت"
        glyph={<AppIcon name="refresh" size={20} />}
        onPress={() => pushOnce('/offline-queue')}
      />
      <ListRow
        title="بلاغاتي"
        description="متابعة البلاغات التي أرسلتها"
        glyph={<AppIcon name="help" size={20} />}
        onPress={() => pushOnce('/my-reports')}
      />
    </View>
  );
}
