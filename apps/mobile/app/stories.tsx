import { usePullRefresh } from '@/hooks/usePullRefresh';
import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { showToast } from '@/lib/toast';
import { AppIcon } from '@/components/Icons';
import { ActionSheet } from '@/components/ActionSheet';
import { AppImage } from '@/components/AppImage';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useRef, useState, useMemo } from 'react';
import { useFocusEffect } from 'expo-router';
import { pushOnce } from '@/lib/navigation';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { BrandRefreshControl } from '@/components/ui/BrandRefreshControl';
import * as ImagePicker from 'expo-image-picker';
import { EmptyState, ErrorState, LoadingState, PageShell, StoryAvatar } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthContext';
import { createStory, fetchStoryFeed, type StoryGroup } from '@/features/stories/stories.api';
import { fontSizes, radius, spacing, fontWeights } from '@/theme/tokens';
export default function StoriesScreen() {
    const { colors } = useAppTheme();
    const styles = useMemo(() => createThemeStyles(colors), [colors]);
    const { user, getAccessToken, csrfToken } = useAuth();
    const [groups, setGroups] = useState<StoryGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [showAddStorySheet, setShowAddStorySheet] = useState(false);
    const [error, setError] = useState('');
    const seq = useRef(0);
    const hasGroupsRef = useRef(false);
    const load = useCallback(async () => {
        const token = getAccessToken();
        if (!token) {
            setGroups([]);
            hasGroupsRef.current = false;
            setLoading(false);
            return;
        }
        const current = ++seq.current;
        if (!hasGroupsRef.current)
            setLoading(true);
        setError('');
        try {
            const data = await fetchStoryFeed(token);
            if (current !== seq.current)
                return;
            hasGroupsRef.current = data.length > 0;
            setGroups(data);
        }
        catch (e) {
            if (current === seq.current)
                setError(e instanceof Error ? e.message : 'تعذر تحميل القصص.');
        }
        finally {
            if (current === seq.current)
                setLoading(false);
        }
    }, [getAccessToken]);
  const { refreshing: pullRefreshing, onRefresh: onPullRefresh } = usePullRefresh(() => load());
    useFocusEffect(useCallback(() => {
        void load();
        return () => {
            seq.current += 1;
        };
    }, [load]));
    const publishImageStory = async (visibility: 'FOLLOWERS' | 'PUBLIC') => {
        setBusy(true);
        setError('');
        try {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted)
                throw new Error('اسمح للتطبيق بالوصول إلى الصور.');
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'], allowsEditing: true, quality: 0.85
            });
            if (result.canceled || !result.assets[0])
                return;
            const asset = result.assets[0];
            if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024)
                throw new Error('حجم الصورة يجب ألا يتجاوز 5 ميغابايت.');
            const mime = asset.mimeType || 'image/jpeg';
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime))
                throw new Error('اختر صورة JPEG أو PNG أو WebP.');
            const token = getAccessToken();
            if (!token) {
                pushOnce('/login');
                return;
            }
            await createStory({ visibility }, {
                uri: asset.uri, fileName: asset.fileName, mimeType: mime
            }, token, csrfToken);
            await load();
            showToast(visibility === 'PUBLIC' ? 'تم نشر القصة العامة' : 'تم نشر القصة', 'ستنتهي صلاحيتها بعد 24 ساعة.', 'success');
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'تعذر نشر القصة.');
        }
        finally {
            setBusy(false);
        }
    };
    const addStory = () => {
        if (!getAccessToken()) {
            pushOnce('/login');
            return;
        }
        setShowAddStorySheet(true);
    };
    return (<PageShell title="القصص" scroll={false} right={(<Pressable accessibilityRole="button" accessibilityLabel="إضافة قصة" disabled={busy} onPress={() => void addStory()}>
          <Text style={styles.link}>{busy ? 'جارٍ النشر…' : '+ قصة'}</Text>
        </Pressable>)}>
      <ActionSheet visible={showAddStorySheet} title="إضافة قصة" description="اختر نوع القصة والجمهور الذي يمكنه مشاهدتها." onClose={() => setShowAddStorySheet(false)} options={[
            {
                key: 'text', label: 'قصة نصية', onPress: () => pushOnce('/story-create')
            },
            {
                key: 'followers', label: 'صورة للمتابعين', onPress: () => void publishImageStory('FOLLOWERS')
            },
            {
                key: 'public', label: 'صورة عامة', onPress: () => void publishImageStory('PUBLIC')
            },
        ]}/>
      {!getAccessToken() ? (<EmptyState title="سجّل الدخول لمشاهدة القصص" description="يمكنك فتح القصص العامة عبر رابط مشاركة مباشر." actionLabel="تسجيل الدخول" onAction={() => pushOnce('/login')}/>) : loading && groups.length === 0 ? (<LoadingState message="جارٍ تحميل القصص…"/>) : error && groups.length === 0 ? (<ErrorState description={error} onAction={() => void load()}/>) : (<FlatList refreshControl={<BrandRefreshControl refreshing={pullRefreshing} onRefresh={() => void onPullRefresh()} />} data={groups} keyExtractor={(group) => group.user.id} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} initialNumToRender={6} maxToRenderPerBatch={6} windowSize={7} ListHeaderComponent={(<View style={{ gap: spacing.lg }}>
              {error ? (<View style={styles.error}>
                  <Text style={styles.errorText}>{error}</Text>
                  <Pressable accessibilityRole="button" onPress={() => void load()}>
                    <Text style={styles.link}>إعادة المحاولة</Text>
                  </Pressable>
                </View>) : null}
              <Pressable accessibilityRole="button" style={styles.addCard} onPress={() => void addStory()}>
                <View style={styles.addCircle}><Text style={styles.plus}>＋</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>أضف قصتك</Text>
                  <Text style={styles.muted}>صورة أو نص، وتختفي بعد 24 ساعة</Text>
                </View>
              </Pressable>
            </View>)} ListEmptyComponent={!error ? (<EmptyState title="لا توجد قصص نشطة حاليًا" description="تابع المستخدمين لرؤية قصصهم هنا."/>) : undefined} renderItem={({ item: group }) => (<View style={styles.group}>
              <Pressable accessibilityRole="button" accessibilityLabel={`عرض قصص ${group.user.name || 'المستخدم'}`} onPress={() => pushOnce({
                pathname: '/stories/[id]', params: {
                    id: group.stories[0]?.id || 'missing', userId: group.user.id
                }
            })} style={styles.person}>
                <StoryAvatar uri={group.user.avatarUrl} name={group.user.name} unseen={group.hasUnseen} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{group.user.name || 'مستخدم MarketPlat'}</Text>
                  <Text style={styles.muted}>{group.stories.length} قصة · {group.hasUnseen ? 'قصص جديدة' : 'تمت المشاهدة'}</Text>
                </View>
                <View style={{
                flexDirection: 'row', alignItems: 'center', gap: spacing.xs
            }}><Text style={styles.link}>عرض</Text><AppIcon name="forward" size={16} color={colors.brand}/></View>
              </Pressable>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyStrip}>
                {group.stories.map((story) => (<Pressable key={story.id} accessibilityRole="button" accessibilityLabel={`فتح قصة ${group.user.name || 'المستخدم'}`} style={styles.storyTile} onPress={() => pushOnce({
                    pathname: '/stories/[id]', params: {
                        id: story.id, userId: story.userId
                    }
                })}>
                    {story.mediaUrl ? (<AppImage variant="list" uri={story.mediaUrl} style={styles.tileImage}/>) : (<View style={[styles.tileImage, styles.textTile, { backgroundColor: story.background || colors.brand }]}>
                        <Text numberOfLines={3} style={styles.tileText}>{story.text || 'قصة نصية'}</Text>
                      </View>)}
                    <Text numberOfLines={1} style={styles.tileCaption}>{story.text || (story.viewed ? 'تمت المشاهدة' : 'قصة جديدة')}</Text>
                  </Pressable>))}
              </ScrollView>
            </View>)}/>)}
    </PageShell>);
}
const createThemeStyles = (colors: ColorPalette) => StyleSheet.create({
    link: {
        color: colors.brand, fontWeight: fontWeights.bold, padding: spacing.sm
    }, content: {
        gap: spacing.lg, paddingBottom: spacing.xl
    }, muted: {
        fontSize: fontSizes[13], color: colors.muted, textAlign: 'right', lineHeight: 20
    }, addCard: {
        minHeight: 84, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md
    }, addCircle: {
        width: 56, height: 56, borderRadius: radius.xl, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center'
    }, plus: {
        fontSize: fontSizes[30], color: colors.brandOnSoft, fontWeight: fontWeights.bold
    }, group: {
        backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md
    }, person: {
        flexDirection: 'row', alignItems: 'center', gap: spacing.sm
    }, cardTitle: {
        fontSize: fontSizes[15], fontWeight: fontWeights.bold, color: colors.ink, textAlign: 'right'
    }, storyStrip: {
        gap: spacing.sm, paddingVertical: spacing.xs
    }, storyTile: {
        width: 108, gap: spacing.sm
    }, tileImage: {
        width: 108, height: 152, borderRadius: radius.md, backgroundColor: colors.border
    }, textTile: {
        alignItems: 'center', justifyContent: 'center', padding: spacing.sm
    }, tileText: {
        color: colors.white, fontWeight: fontWeights.bold, textAlign: 'center'
    }, tileCaption: {
        fontSize: fontSizes[11], color: colors.muted, textAlign: 'right'
    }, error: {
        padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerSoft, gap: spacing.xs
    }, errorText: {
        color: colors.danger, textAlign: 'right'
    }
});
