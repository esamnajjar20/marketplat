import { AppImage } from '@/components/AppImage';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useMemo, useRef, useState } from 'react';
import { FlatList, Modal, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { fontSizes, radius, spacing, type ColorPalette, fontWeights } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
/** Compact RTL gallery with an accessible image counter and native fullscreen viewer. */
export function MediaGallery({ images, title }: {
    images?: string[] | null;
    title: string;
}) {
    const { width: WINDOW_WIDTH } = useWindowDimensions();
    const { colors } = useAppTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const validImages = (images ?? []).filter((uri): uri is string => typeof uri === 'string' && uri.trim().length > 0);
    const [index, setIndex] = useState(0);
    const [fullscreen, setFullscreen] = useState(false);
    const fullList = useRef<FlatList<string>>(null);
    if (!validImages.length) {
        return <View style={styles.empty}><Text style={styles.emptyMark}>◇</Text><Text style={styles.emptyText}>لا توجد صور متاحة</Text></View>;
    }
    return <View style={styles.container}>
    <Pressable accessibilityRole="button" accessibilityLabel={`عرض صور ${title} بملء الشاشة`} onPress={() => setFullscreen(true)}>
      <AppImage uri={validImages[Math.min(index, validImages.length - 1)]} style={styles.hero} resizeMode="cover" accessibilityLabel={`${title} — الصورة ${index + 1}`}/>
    </Pressable>
    <View style={styles.counter}><Text style={styles.counterText}>{index + 1} / {validImages.length}</Text></View>
    {validImages.length > 1 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>
      {validImages.map((uri, i) => <Pressable key={`${uri}-${i}`} accessibilityRole="button" accessibilityLabel={`الصورة ${i + 1}`} accessibilityState={{ selected: index === i }} onPress={() => setIndex(i)} style={[styles.thumbWrap, index === i && styles.thumbActive]}><AppImage uri={uri} style={styles.thumb} resizeMode="cover"/></Pressable>)}
    </ScrollView> : null}
    <Modal visible={fullscreen} animationType="fade" onRequestClose={() => setFullscreen(false)} onShow={() => fullList.current?.scrollToIndex({
        index, animated: false
    })} statusBarTranslucent>
      <View style={styles.modal}>
        <View style={styles.modalHeader}><Text style={styles.modalTitle} numberOfLines={1}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="إغلاق معرض الصور" onPress={() => setFullscreen(false)} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable></View>
        <FlatList ref={fullList} data={validImages} horizontal pagingEnabled initialScrollIndex={index} keyExtractor={(uri, i) => `${uri}-${i}`} getItemLayout={(_, i) => ({
        length: WINDOW_WIDTH, offset: WINDOW_WIDTH * i, index: i
    })} onMomentumScrollEnd={(event) => setIndex(Math.round(event.nativeEvent.contentOffset.x / WINDOW_WIDTH))} renderItem={({ item: uri, index: i }) => <View style={[styles.fullSlide, { width: WINDOW_WIDTH }]}><AppImage uri={uri} style={styles.fullImage} resizeMode="contain" accessibilityLabel={`${title} — الصورة ${i + 1}`}/></View>}/>
        <Text style={styles.fullCounter}>{index + 1} / {validImages.length}</Text>
      </View>
    </Modal>
  </View>;
}
function createStyles(palette: ColorPalette) {
    return StyleSheet.create({
        container: { gap: spacing.sm }, hero: {
            width: '100%', height: 300, borderRadius: radius.lg, backgroundColor: palette.border
        }, counter: {
            position: 'absolute', top: spacing.sm, start: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: palette.mediaCounterOverlay
        }, counterText: {
            color: palette.white, fontSize: fontSizes[12], fontWeight: fontWeights.semibold
        }, thumbs: {
            flexDirection: 'row', gap: spacing.sm
        }, thumbWrap: {
            borderWidth: 2, borderColor: 'transparent', borderRadius: radius.control, padding: spacing.xxs
        }, thumbActive: { borderColor: palette.brand }, thumb: {
            width: 62, height: 62, borderRadius: radius.control, backgroundColor: palette.border
        }, empty: {
            height: 240, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.brandSoft, alignItems: 'center', justifyContent: 'center', gap: spacing.sm
        }, emptyMark: {
            fontSize: fontSizes[40], color: palette.brandOnSoft
        }, emptyText: {
            color: palette.muted, fontSize: fontSizes[13]
        }, modal: {
            flex: 1, backgroundColor: palette.fullscreenBackdrop, justifyContent: 'space-between'
        }, modalHeader: {
            paddingTop: spacing.x4l, paddingHorizontal: spacing.lg, paddingBottom: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md
        }, modalTitle: {
            flex: 1, color: palette.white, textAlign: 'right', fontSize: fontSizes[15], fontWeight: fontWeights.bold
        }, close: {
            width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill, backgroundColor: palette.mediaCloseOverlay
        }, closeText: {
            color: palette.white, fontSize: fontSizes[30], lineHeight: 34
        }, fullSlide: {
            justifyContent: 'center', alignItems: 'center'
        }, fullImage: {
            width: '100%', height: '85%'
        }, fullCounter: {
            color: palette.white, textAlign: 'center', paddingBottom: 34, fontWeight: fontWeights.semibold
        }
    });
}
