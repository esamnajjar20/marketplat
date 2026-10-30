import { useRef, useState } from 'react';
import { FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { colors, radius, spacing } from '@/theme/tokens';


/** Compact RTL gallery with an accessible image counter and native fullscreen viewer. */
export function MediaGallery({ images, title }: { images?: string[] | null; title: string }) {
  const { width: WINDOW_WIDTH } = useWindowDimensions();
  const validImages = (images ?? []).filter((uri): uri is string => typeof uri === 'string' && uri.trim().length > 0);
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const fullList = useRef<FlatList<string>>(null);
  if (!validImages.length) {
    return <View style={styles.empty}><Text style={styles.emptyMark}>◇</Text><Text style={styles.emptyText}>لا توجد صور متاحة</Text></View>;
  }
  return <View style={styles.container}>
    <Pressable accessibilityRole="button" accessibilityLabel={`عرض صور ${title} بملء الشاشة`} onPress={() => setFullscreen(true)}>
      <Image source={{ uri: validImages[Math.min(index, validImages.length - 1)] }} style={styles.hero} resizeMode="cover" accessibilityLabel={`${title} — الصورة ${index + 1}`} />
    </Pressable>
    <View style={styles.counter}><Text style={styles.counterText}>{index + 1} / {validImages.length}</Text></View>
    {validImages.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
      {validImages.map((uri, i) => <Pressable key={`${uri}-${i}`} accessibilityRole="button" accessibilityLabel={`الصورة ${i + 1}`} accessibilityState={{ selected: index === i }} onPress={() => setIndex(i)} style={[styles.thumbWrap, index === i && styles.thumbActive]}><Image source={{ uri }} style={styles.thumb} resizeMode="cover" /></Pressable>)}
    </ScrollView> : null}
    <Modal visible={fullscreen} animationType="fade" onRequestClose={() => setFullscreen(false)} onShow={() => fullList.current?.scrollToIndex({ index, animated: false })} statusBarTranslucent>
      <View style={styles.modal}>
        <View style={styles.modalHeader}><Text style={styles.modalTitle} numberOfLines={1}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="إغلاق معرض الصور" onPress={() => setFullscreen(false)} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable></View>
        <FlatList ref={fullList} data={validImages} horizontal pagingEnabled initialScrollIndex={index} keyExtractor={(uri, i) => `${uri}-${i}`} getItemLayout={(_, i) => ({ length: WINDOW_WIDTH, offset: WINDOW_WIDTH * i, index: i })} onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / WINDOW_WIDTH))} renderItem={({ item: uri, index: i }) => <View style={[styles.fullSlide, { width: WINDOW_WIDTH }]}><Image source={{ uri }} style={styles.fullImage} resizeMode="contain" accessibilityLabel={`${title} — الصورة ${i + 1}`} /></View>} />
        <Text style={styles.fullCounter}>{index + 1} / {validImages.length}</Text>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({ container: { gap: spacing.sm }, hero: { width: '100%', height: 280, borderRadius: radius.hero, backgroundColor: colors.border }, counter: { position: 'absolute', top: spacing.sm, left: spacing.sm, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.mediaCounterOverlay }, counterText: { color: colors.white, fontSize: 12, fontWeight: '800' }, thumbs: { flexDirection: 'row-reverse', gap: spacing.sm }, thumbWrap: { borderWidth: 2, borderColor: 'transparent', borderRadius: radius.control, padding: 2 }, thumbActive: { borderColor: colors.brand }, thumb: { width: 62, height: 62, borderRadius: radius.control, backgroundColor: colors.border }, empty: { height: 220, borderRadius: radius.hero, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, emptyMark: { fontSize: 40, color: colors.brand }, emptyText: { color: colors.muted, fontSize: 13 }, modal: { flex: 1, backgroundColor: colors.fullscreenBackdrop, justifyContent: 'space-between' }, modalHeader: { paddingTop: 48, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row-reverse', alignItems: 'center', gap: spacing.md }, modalTitle: { flex: 1, color: colors.white, textAlign: 'right', fontSize: 15, fontWeight: '700' }, close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: colors.mediaCloseOverlay }, closeText: { color: colors.white, fontSize: 30, lineHeight: 34 }, fullSlide: { justifyContent: 'center', alignItems: 'center' }, fullImage: { width: '100%', height: '85%' }, fullCounter: { color: colors.white, textAlign: 'center', paddingBottom: 34, fontWeight: '800' } });
