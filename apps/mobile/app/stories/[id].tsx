import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Spinner } from '@/components/ui';
import { confirmAlert } from '@/lib/confirm';
import { useLocalSearchParams } from 'expo-router';
import { goBack } from '@/lib/navigation';
import { AppImage } from '@/components/AppImage';
import { useAuth } from '@/features/auth/AuthContext';
import { deleteStory, fetchStoryFeed, fetchUserStories, markStoryViewed, type Story } from '@/features/stories/stories.api';
import { shareMarketPlatResource } from '@/features/sharing/deep-links';
import { fontSizes, radius, spacing, fontWeights } from '@/theme/tokens';
const STORY_DURATION_MS = 6500;
export default function StoryViewerScreen() {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createThemeStyles(colors), [colors]);
    const params = useLocalSearchParams<{
        id?: string | string[];
        userId?: string | string[];
    }>();
    const id = Array.isArray(params.id) ? params.id[0] : params.id;
    const userId = Array.isArray(params.userId) ? params.userId[0] : params.userId;
    const { getAccessToken, csrfToken } = useAuth();
    const [stories, setStories] = useState<Story[]>([]);
    const [index, setIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [paused, setPaused] = useState(false);
    const [progress, setProgress] = useState(0);
    const [imageFailed, setImageFailed] = useState(false);
    const progressRef = useRef(progress);
    progressRef.current = progress;
    const story = stories[index];
    const load = useCallback(async () => {
        if (!id) {
            setError('رابط القصة غير مكتمل.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const token = getAccessToken();
            let found: Story[] = [];
            if (userId)
                found = await fetchUserStories(userId, token);
            else if (token)
                found = (await fetchStoryFeed(token)).flatMap(group => group.stories);
            else
                throw new Error('الرابط لا يحتوي على معرّف صاحب القصة. افتح القصة من رابط المشاركة الكامل.');
            const target = found.findIndex(item => item.id === id);
            if (target < 0)
                throw new Error('القصة غير متاحة أو انتهت صلاحيتها أو لا تملك صلاحية مشاهدتها.');
            setStories(found);
            setIndex(target);
            setProgress(0);
            setImageFailed(false);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'تعذر فتح القصة.');
        }
        finally {
            setLoading(false);
        }
    }, [id, userId, getAccessToken]);
    useEffect(() => {
        void load();
    }, [load]);
    useEffect(() => {
        const token = getAccessToken();
        if (story?.id && token && !story.isOwner && !story.viewed)
            void markStoryViewed(story.id, token, csrfToken).catch(() => undefined);
    }, [
        story?.id, story?.isOwner, story?.viewed, getAccessToken, csrfToken
    ]);
    useEffect(() => {
        setProgress(0);
        setImageFailed(false);
    }, [story?.id]);
    useEffect(() => {
        if (!story?.id || paused || loading)
            return;
        const startedAt = Date.now() - (progressRef.current / 100) * STORY_DURATION_MS;
        const timer = setInterval(() => {
            const elapsed = Math.max(0, Date.now() - startedAt);
            setProgress(Math.min(100, (elapsed / STORY_DURATION_MS) * 100));
        }, 250);
        return () => clearInterval(timer);
    }, [story?.id, paused, loading]);
    useEffect(() => {
        if (!story?.id || progress < 100)
            return;
        if (index + 1 < stories.length) {
            setIndex(index + 1);
            setProgress(0);
        }
        else {
            goBack();
        }
    }, [
        progress, story?.id, index, stories.length
    ]);
    const close = () => goBack();
    const next = () => {
        setProgress(0);
        if (index + 1 < stories.length)
            setIndex(index + 1);
        else
            close();
    };
    const previous = () => {
        setProgress(0);
        setIndex(Math.max(0, index - 1));
    };
    const share = async () => {
        if (!story)
            return;
        try {
            await shareMarketPlatResource('stories', story.id, `قصة ${story.user.name}`, { userId: story.userId });
        }
        catch {
            setError('تعذرت مشاركة الرابط.');
        }
    };
    const remove = () => {
        const token = getAccessToken();
        if (!story || !token || busy)
            return;
        confirmAlert('حذف القصة', 'هل تريد حذف هذه القصة نهائيًا؟', [{
                text: 'إلغاء', style: 'cancel'
            }, {
                text: 'حذف', style: 'destructive', onPress: () => {
                    setBusy(true);
                    void deleteStory(story.id, token, csrfToken).then(() => {
                        const remaining = stories.filter(item => item.id !== story.id);
                        if (!remaining.length)
                            close();
                        else {
                            setStories(remaining);
                            setIndex(Math.min(index, remaining.length - 1));
                        }
                    }).catch(e => setError(e instanceof Error ? e.message : 'تعذر حذف القصة.')).finally(() => setBusy(false));
                }
            }]);
    };
    const age = useMemo(() => {
        if (!story?.createdAt)
            return 'التاريخ غير متاح';
        const time = new Date(story.createdAt).getTime();
        if (!Number.isFinite(time))
            return 'التاريخ غير متاح';
        const minutes = Math.max(0, Math.floor((Date.now() - time) / 60000));
        return minutes < 60 ? `منذ ${minutes} دقيقة` : `منذ ${Math.floor(minutes / 60)} ساعة`;
    }, [story?.createdAt]);
    return <View style={styles.safe}>
    <View style={styles.top}><Pressable accessibilityRole="button" onPress={close}><Text style={styles.action}>إغلاق ×</Text></Pressable><Text style={styles.count}>{story ? `${index + 1} / ${stories.length}` : 'القصة'}</Text><Pressable accessibilityRole="button" onPress={() => void share()} disabled={!story}><Text style={styles.action}>مشاركة ↗</Text></Pressable></View>
    {loading ? <View style={styles.center}><Spinner size="large" color={colors.brand}/><Text style={styles.muted}>جارٍ فتح القصة…</Text></View> : error && !story ? <View style={styles.center}><Text style={styles.error}>{error}</Text><Pressable accessibilityRole="button" style={styles.button} onPress={() => void load()}><Text style={styles.buttonText}>إعادة المحاولة</Text></Pressable><Pressable accessibilityRole="button" onPress={close}><Text style={styles.action}>رجوع</Text></Pressable></View> : story ? <View style={[styles.stage, { backgroundColor: story.background || colors.brand }]}>
      <View style={styles.progressRow}>{stories.map((item, i) => <View key={item.id} style={styles.progressTrack}><View style={[styles.progressFill, { width: i < index ? '100%' : i === index ? `${progress}%` : '0%' }]}/></View>)}</View>
      <View style={styles.author}><View style={{ flex: 1 }}><Text style={styles.authorName}>{story.user.name}</Text><Text style={styles.authorMeta}>{age}{story.visibility === 'PUBLIC' ? ' · عامة' : ''}</Text></View>{story.isOwner ? <Pressable disabled={busy} accessibilityRole="button" onPress={remove}><Text style={styles.action}>{busy ? '…' : 'حذف'}</Text></Pressable> : null}</View>
      {story.mediaUrl && !imageFailed ? <AppImage uri={story.mediaUrl} resizeMode="contain" style={styles.media} onError={() => setImageFailed(true)}/> : story.text ? <View style={styles.textOnly}><Text style={styles.storyText}>{story.text}</Text>{imageFailed ? <Text style={styles.authorMeta}>تعذر تحميل صورة القصة</Text> : null}</View> : <View style={styles.textOnly}><Text style={styles.storyText}>تعذر عرض محتوى القصة.</Text></View>}
      {story.mediaUrl && story.text ? <Text style={styles.caption}>{story.text}</Text> : null}
      <View style={styles.nav}><Pressable accessibilityRole="button" style={styles.navButton} onPress={previous} disabled={index === 0}><Text style={styles.navText}>السابق</Text></Pressable><Pressable accessibilityRole="button" style={styles.navButton} onPress={next}><Text style={styles.navText}>{index + 1 === stories.length ? 'إغلاق' : 'التالي'}</Text></Pressable></View>
      <View style={styles.tapZones}><Pressable accessibilityRole="button" accessibilityLabel="القصة السابقة" onPress={previous} onPressIn={() => setPaused(true)} onPressOut={() => setPaused(false)} style={styles.tapZone}/><Pressable accessibilityRole="button" accessibilityLabel="إيقاف القصة مؤقتًا" onPressIn={() => setPaused(true)} onLongPress={() => setPaused(true)} onPressOut={() => setPaused(false)} style={styles.tapZonePause}/><Pressable accessibilityRole="button" accessibilityLabel="القصة التالية" onPress={next} onPressIn={() => setPaused(true)} onPressOut={() => setPaused(false)} style={styles.tapZone}/></View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View> : null}
  </View>;
}
const createThemeStyles = (colors: ColorPalette) => StyleSheet.create({
    safe: {
        flex: 1, backgroundColor: colors.fullscreenBackdrop, paddingTop: 36, paddingBottom: spacing.lg
    }, top: {
        height: 52, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'
    }, action: {
        color: colors.brandSoft, fontWeight: fontWeights.bold, padding: spacing.sm
    }, count: {
        color: colors.white, fontWeight: fontWeights.bold
    }, center: {
        flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md
    }, muted: { color: colors.borderStrong }, error: {
        color: colors.dangerSoft, textAlign: 'center', padding: spacing.md
    }, button: {
        backgroundColor: colors.brand, padding: spacing.md, borderRadius: radius.md
    }, buttonText: {
        color: colors.onBrand, fontWeight: fontWeights.bold
    }, stage: {
        flex: 1, marginHorizontal: spacing.sm, marginBottom: spacing.sm, borderRadius: radius.lg, padding: spacing.md, overflow: 'hidden'
    }, progressRow: {
        flexDirection: 'row', gap: spacing.xs
    }, progressTrack: {
        height: 3, flex: 1, backgroundColor: colors.storyProgressTrack, borderRadius: 2, overflow: 'hidden'
    }, progressFill: {
        height: 3, backgroundColor: colors.white
    }, author: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md
    }, authorName: {
        textAlign: 'right', color: colors.white, fontWeight: fontWeights.bold, fontSize: fontSizes[16]
    }, authorMeta: {
        textAlign: 'right', color: colors.brandSoft, fontSize: fontSizes[12], marginTop: spacing.xs
    }, media: {
        flex: 1, width: '100%', minHeight: 180
    }, textOnly: {
        flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl
    }, storyText: {
        fontSize: fontSizes[28], fontWeight: fontWeights.bold, textAlign: 'center', lineHeight: 40, color: colors.white
    }, caption: {
        color: colors.white, textAlign: 'center', padding: spacing.md, fontSize: fontSizes[16], fontWeight: fontWeights.bold
    }, nav: {
        flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.md
    }, navButton: {
        minHeight: 48, padding: spacing.md, backgroundColor: colors.storyNavigationOverlay, borderRadius: radius.md, minWidth: 100, alignItems: 'center'
    }, navText: {
        color: colors.white, fontWeight: fontWeights.bold
    }, tapZones: {
        position: 'absolute', left: 0, right: 0, top: 70, bottom: 75, flexDirection: 'row'
    }, tapZone: { flex: 1 }, tapZonePause: { flex: 1 }
});
