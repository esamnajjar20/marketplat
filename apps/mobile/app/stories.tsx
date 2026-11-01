import { showToast } from '@/lib/toast';
import { AppIcon } from '@/components/Icons';
import { ActionSheet } from '@/components/ActionSheet';
import { AppImage } from '@/components/AppImage';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/AuthContext';
import { createStory, fetchStoryFeed, type StoryGroup } from '@/features/stories/stories.api';
import { fontSizes, colors, radius, spacing, typography } from '@/theme/tokens';

export default function StoriesScreen() {
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
    if (!token) { setGroups([]); hasGroupsRef.current = false; setLoading(false); return; }
    const current = ++seq.current;
    if (!hasGroupsRef.current) setLoading(true); setError('');
    try { const data = await fetchStoryFeed(token); if (current !== seq.current) return; hasGroupsRef.current = data.length > 0; setGroups(data); }
    catch (e) { if (current === seq.current) setError(e instanceof Error ? e.message : 'تعذر تحميل القصص.'); }
    finally { if (current === seq.current) setLoading(false); }
  }, [getAccessToken]);
  useFocusEffect(useCallback(() => { void load(); return () => { seq.current += 1; }; }, [load]));
  const publishImageStory = async (visibility: 'FOLLOWERS' | 'PUBLIC') => {
    setBusy(true);
    setError('');
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('اسمح للتطبيق بالوصول إلى الصور.');
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.85 });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) throw new Error('حجم الصورة يجب ألا يتجاوز 5 ميغابايت.');
      const mime = asset.mimeType || 'image/jpeg';
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('اختر صورة JPEG أو PNG أو WebP.');
      const token = getAccessToken();
      if (!token) { router.push('/login'); return; }
      await createStory({ visibility }, { uri: asset.uri, fileName: asset.fileName, mimeType: mime }, token, csrfToken);
      await load();
      showToast(visibility === 'PUBLIC' ? 'تم نشر القصة العامة' : 'تم نشر القصة', 'ستنتهي صلاحيتها بعد 24 ساعة.', 'success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر نشر القصة.');
    } finally {
      setBusy(false);
    }
  };
  const addStory = () => {
    if (!getAccessToken()) { router.push('/login'); return; }
    setShowAddStorySheet(true);
  };
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ActionSheet
        visible={showAddStorySheet}
        title="إضافة قصة"
        description="اختر نوع القصة والجمهور الذي يمكنه مشاهدتها."
        onClose={() => setShowAddStorySheet(false)}
        options={[
          { key: 'text', label: 'قصة نصية', onPress: () => router.push('/story-create') },
          { key: 'followers', label: 'صورة للمتابعين', onPress: () => void publishImageStory('FOLLOWERS') },
          { key: 'public', label: 'صورة عامة', onPress: () => void publishImageStory('PUBLIC') },
        ]}
      />
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="العودة" onPress={() => router.back()}>
          <Text style={styles.link}>رجوع</Text>
        </Pressable>
        <Text style={styles.heading}>القصص</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="إضافة قصة" disabled={busy} onPress={() => void addStory()}>
          <Text style={styles.link}>{busy ? 'جارٍ النشر…' : '+ قصة'}</Text>
        </Pressable>
      </View>

      {!getAccessToken() ? (
        <View style={styles.center}>
          <Text style={styles.title}>سجّل الدخول لمشاهدة القصص</Text>
          <Text style={styles.muted}>يمكنك فتح القصص العامة عبر رابط مشاركة مباشر.</Text>
          <Pressable accessibilityRole="button" style={styles.primary} onPress={() => router.push('/login')}>
            <Text style={styles.primaryText}>تسجيل الدخول</Text>
          </Pressable>
        </View>
      ) : loading && groups.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
          <Text style={styles.muted}>جارٍ تحميل القصص…</Text>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(group) => group.user.id}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          ListHeaderComponent={(
            <View style={{ gap: spacing.lg }}>
              {error ? (
                <View style={styles.error}>
                  <Text style={styles.errorText}>{error}</Text>
                  <Pressable accessibilityRole="button" onPress={() => void load()}>
                    <Text style={styles.link}>إعادة المحاولة</Text>
                  </Pressable>
                </View>
              ) : null}
              <Pressable accessibilityRole="button" style={styles.addCard} onPress={() => void addStory()}>
                <View style={styles.addCircle}><Text style={styles.plus}>＋</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>أضف قصتك</Text>
                  <Text style={styles.muted}>صورة أو نص، وتختفي بعد 24 ساعة</Text>
                </View>
              </Pressable>
            </View>
          )}
          ListEmptyComponent={!error ? (
            <Text style={styles.muted}>لا توجد قصص نشطة حاليًا. تابع المستخدمين لرؤية قصصهم هنا.</Text>
          ) : undefined}
          renderItem={({ item: group }) => (
            <View style={styles.group}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`عرض قصص ${group.user.name || 'المستخدم'}`}
                onPress={() => router.push({ pathname: '/stories/[id]', params: { id: group.stories[0]?.id || 'missing', userId: group.user.id } })}
                style={styles.person}
              >
                <View style={[styles.avatarRing, group.hasUnseen && styles.unseen]}>
                  {group.user.avatarUrl ? (
                    <AppImage uri={group.user.avatarUrl} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.initial}>{group.user.name?.trim()?.[0] || '؟'}</Text>
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{group.user.name || 'مستخدم MarketPlat'}</Text>
                  <Text style={styles.muted}>{group.stories.length} قصة · {group.hasUnseen ? 'قصص جديدة' : 'تمت المشاهدة'}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Text style={styles.link}>عرض</Text><AppIcon name="forward" size={16} color={colors.brand} /></View>
              </Pressable>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyStrip}>
                {group.stories.map((story) => (
                  <Pressable
                    key={story.id}
                    accessibilityRole="button"
                    accessibilityLabel={`فتح قصة ${group.user.name || 'المستخدم'}`}
                    style={styles.storyTile}
                    onPress={() => router.push({ pathname: '/stories/[id]', params: { id: story.id, userId: story.userId } })}
                  >
                    {story.mediaUrl ? (
                      <AppImage uri={story.mediaUrl} style={styles.tileImage} />
                    ) : (
                      <View style={[styles.tileImage, styles.textTile, { backgroundColor: story.background || colors.brand }]}>
                        <Text numberOfLines={3} style={styles.tileText}>{story.text || 'قصة نصية'}</Text>
                      </View>
                    )}
                    <Text numberOfLines={1} style={styles.tileCaption}>{story.text || (story.viewed ? 'تمت المشاهدة' : 'قصة جديدة')}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:colors.canvas},header:{minHeight:60,paddingHorizontal:spacing.md,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:colors.surface,borderBottomWidth:1,borderBottomColor:colors.border},heading:{fontSize:fontSizes[18],fontWeight:'900',color:colors.ink},link:{color:colors.brand,fontWeight:'800',padding:spacing.sm},content:{padding:spacing.md,gap:spacing.lg,paddingBottom:spacing.xl},center:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.xl,gap:spacing.md},title:{fontSize:fontSizes[17],fontWeight:'900',color:colors.ink},muted:{fontSize:fontSizes[13],color:colors.muted,textAlign:'right',lineHeight:20},primary:{backgroundColor:colors.brand,borderRadius:radius.md,padding:spacing.md},primaryText:{color:colors.white,fontWeight:'800'},addCard:{minHeight:84,backgroundColor:colors.surface,borderColor:colors.border,borderWidth:1,borderRadius:radius.lg,padding:spacing.md,flexDirection:'row',alignItems:'center',gap:spacing.md},addCircle:{width:56,height:56,borderRadius:28,backgroundColor:colors.brandSoft,alignItems:'center',justifyContent:'center'},plus:{fontSize:fontSizes[30],color:colors.brandOnSoft,fontWeight:'800'},group:{backgroundColor:colors.surface,borderColor:colors.border,borderWidth:1,borderRadius:radius.lg,padding:spacing.md,gap:spacing.md},person:{flexDirection:'row',alignItems:'center',gap:spacing.sm},avatarRing:{width:52,height:52,borderRadius:26,padding:3,borderWidth:2,borderColor:colors.border},unseen:{borderColor:colors.brand},avatar:{width:'100%',height:'100%',borderRadius:22},avatarFallback:{flex:1,borderRadius:22,backgroundColor:colors.brandSoft,alignItems:'center',justifyContent:'center'},initial:{fontSize:fontSizes[20],fontWeight:'900',color:colors.brandOnSoft},cardTitle:{fontSize:fontSizes[15],fontWeight:'900',color:colors.ink,textAlign:'right'},storyStrip:{gap:spacing.sm,paddingVertical:spacing.xs},storyTile:{width:108,gap:6},tileImage:{width:108,height:152,borderRadius:radius.md,backgroundColor:colors.border},textTile:{alignItems:'center',justifyContent:'center',padding:spacing.sm},tileText:{color:colors.white,fontWeight:'800',textAlign:'center'},tileCaption:{fontSize:fontSizes[11],color:colors.muted,textAlign:'right'},error:{padding:spacing.md,borderRadius:radius.md,backgroundColor:colors.dangerSoft,gap:spacing.xs},errorText:{color:colors.danger,textAlign:'right'}});
