import { type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppHeader } from './AppHeader';
import { ErrorState, LoadingState } from './Feedback';
import { uiStyles as s } from './styles';

export function DetailScaffold({
  title,
  right,
  loading,
  loadingMessage = 'جاري التحميل…',
  error,
  onRetry,
  footer,
  children,
}: {
  title: string;
  right?: ReactNode;
  loading?: boolean;
  loadingMessage?: string;
  error?: string | null;
  onRetry?: () => void;
  /** شريط إجراءات ثابت أسفل الشاشة (CTA رئيسي) */
  footer?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <AppHeader title={title} right={right} />
      {loading ? (
        <LoadingState message={loadingMessage} />
      ) : error ? (
        <ErrorState description={error} onAction={onRetry} />
      ) : (
        <>
          <ScrollView
            contentContainerStyle={s.detailContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? <View style={s.detailFooter}>{footer}</View> : null}
        </>
      )}
    </SafeAreaView>
  );
}
