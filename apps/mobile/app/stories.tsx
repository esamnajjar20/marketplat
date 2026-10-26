import { useCallback, useState } from 'react';
import { router, useFocusEffect } from 'expo-router';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/AuthContext';
import { createStory, fetchStoryFeed, type StoryGroup } from '@/features/stories/stories.api';
import { colors, radius, spacing } from '@/theme/tokens';

export default function StoriesScreen() {
  const { user, accessToken, csrfToken } = useAuth();
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!accessToken) { setGroups([]); setLoading(false); return; }
    setLoading(true); setError('');
    try { setGroups(await fetchStoryFeed(accessToken)); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تحميل القصص.'); }
    finally { setLoading(false); }
  }, [accessToken]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  const addStory = async () => {
    if (!accessToken) { router.push('/login'); return; }
    Alert.alert('إضافة قصة', 'اختر طريقة نشر القصة', [
      { text: 'إلغاء', style: 'cancel' },
      { text: 'قصة نصية', onPress: () => router.push('/story-create') },
      { text: 'صورة للمتابعين', onPress: () => { void (async () => {
        setBusy(true); setError('');
        try {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted) throw new Error('اسمح للتطبيق بالوصول إلى الصور.');
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.85 });
          if (result.canceled || !result.assets[0]) return;
          const asset = result.assets[0];
          if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) throw new Error('حجم الصورة يجب ألا يتجاوز 5 ميغابايت.');
          const mime = asset.mimeType || 'image/jpeg';
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('اختر صورة JPEG أو PNG أو WebP.');
          await createStory({ visibility: 'FOLLOWERS' }, { uri: asset.uri, fileName: asset.fileName, mimeType: mime }, accessToken, csrfToken);
          await load(); Alert.alert('تم النشر', 'نُشرت القصة وستنتهي صلاحيتها بعد 24 ساعة.');
        } catch (e) { setError(e instanceof Error ? e.message : 'تعذر نشر القصة.'); }
        finally { setBusy(false); }
      })(); } },
      { text: 'صورة عامة', onPress: () => { void (async () => {
        setBusy(true); setError('');
        try {
          const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!permission.granted) throw new Error('اسمح للتطبيق بالوصول إلى الصور.');
          const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.85 });
          if (result.canceled || !result.assets[0]) return;
          const asset = result.assets[0];
          if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) throw new Error('حجم الصورة يجب ألا يتجاوز 5 ميغابايت.');
          const mime = asset.mimeType || 'image/jpeg';
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) throw new Error('اختر صورة JPEG أو PNG أو WebP.');
          await createStory({ visibility: 'PUBLIC' }, { uri: asset.uri, fileName: asset.fileName, mimeType: mime }, accessToken, csrfToken);
          await load(); Alert.alert('تم النشر', 'نُشرت القصة العامة وستنتهي صلاحيتها بعد 24 ساعة.');
        } catch (e) { setError(e instanceof Error ? e.message : 'تعذر نشر القصة.'); }
        finally { setBusy(false); }
      })(); } },
    ]);
  };
  return <SafeAreaView style={styles.safe} edges={['top']}>
    <View style={styles.header}><Pressable onPress={() => router.back()}><Text style={styles.link}>رجوع</Text></Pressable><Text style={styles.heading}>القصص</Text><Pressable disabled={busy} onPress={() => void addStory()}><Text style={styles.link}>{busy ? 'جارٍ النشر…' : '+ قصة'}</Text></Pressable></View>
    {!accessToken ? <View style={styles.center}><Text style={styles.title}>سجّل الدخول لمشاهدة القصص</Text><Text style={styles.muted}>يمكنك فتح القصص العامة عبر رابط مشاركة مباشر.</Text><Pressable style={styles.primary} onPress={() => router.push('/login')}><Text style={styles.primaryText}>تسجيل الدخول</Text></Pressable></View>
      : loading ? <View style={styles.center}><ActivityIndicator size="large" color={colors.brand}/><Text style={styles.muted}>جارٍ تحميل القصص…</Text></View>
      : <ScrollView contentContainerStyle={styles.content}>
        {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => void load()}><Text style={styles.link}>إعادة المحاولة</Text></Pressable></View> : null}
        <Pressable style={styles.addCard} onPress={() => void addStory()}><View style={styles.addCircle}><Text style={styles.plus}>＋</Text></View><View style={{ flex: 1 }}><Text style={styles.cardTitle}>أضف قصتك</Text><Text style={styles.muted}>صورة أو نص، وتختفي بعد 24 ساعة</Text></View></Pressable>
        {groups.length === 0 && !error ? <Text style={styles.muted}>لا توجد قصص نشطة حاليًا. تابع المستخدمين لرؤية قصصهم هنا.</Text> : groups.map(group => <View key={group.user.id} style={styles.group}>
          <Pressable style={styles.person} onPress={() => router.push({ pathname: '/stories/[id]', params: { id: group.stories[0]?.id || 'missing', userId: group.user.id } })}>
            <View style={[styles.avatarRing, group.hasUnseen && styles.unseen]}>{group.user.avatarUrl ? <Image source={{ uri: group.user.avatarUrl }} style={styles.avatar}/> : <View style={styles.avatarFallback}><Text style={styles.initial}>{group.user.name?.trim()?.[0] || '؟'}</Text></View>}</View>
            <View style={{ flex: 1 }}><Text style={styles.cardTitle}>{group.user.name || 'مستخدم MarketPlat'}</Text><Text style={styles.muted}>{group.stories.length} قصة · {group.hasUnseen ? 'قصص جديدة' : 'تمت المشاهدة'}</Text></View>
            <Text style={styles.link}>عرض ←</Text>
          </Pressable>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storyStrip}>{group.stories.map(story => <Pressable key={story.id} style={styles.storyTile} onPress={() => router.push({ pathname: '/stories/[id]', params: { id: story.id, userId: story.userId } })}>{story.mediaUrl ? <Image source={{ uri: story.mediaUrl }} style={styles.tileImage}/> : <View style={[styles.tileImage, styles.textTile, { backgroundColor: story.background || '#176B5B' }]}><Text numberOfLines={3} style={styles.tileText}>{story.text || 'قصة نصية'}</Text></View>}<Text numberOfLines={1} style={styles.tileCaption}>{story.text || (story.viewed ? 'تمت المشاهدة' : 'قصة جديدة')}</Text></Pressable>)}</ScrollView>
        </View>)}
      </ScrollView>}
  </SafeAreaView>;
}
const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:colors.canvas},header:{minHeight:56,paddingHorizontal:spacing.lg,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:colors.surface,borderBottomWidth:1,borderBottomColor:colors.border},heading:{fontSize:18,fontWeight:'900',color:colors.ink},link:{color:colors.brand,fontWeight:'800',padding:spacing.sm},content:{padding:spacing.lg,gap:spacing.md},center:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.xl,gap:spacing.md},title:{fontSize:17,fontWeight:'900',color:colors.ink},muted:{fontSize:13,color:colors.muted,textAlign:'right',lineHeight:20},primary:{backgroundColor:colors.brand,borderRadius:radius.md,padding:spacing.md},primaryText:{color:'#fff',fontWeight:'800'},addCard:{backgroundColor:colors.surface,borderColor:colors.border,borderWidth:1,borderRadius:radius.lg,padding:spacing.md,flexDirection:'row-reverse',alignItems:'center',gap:spacing.md},addCircle:{width:56,height:56,borderRadius:28,backgroundColor:'#E3F4EE',alignItems:'center',justifyContent:'center'},plus:{fontSize:30,color:colors.brand,fontWeight:'800'},group:{backgroundColor:colors.surface,borderColor:colors.border,borderWidth:1,borderRadius:radius.lg,padding:spacing.md,gap:spacing.sm},person:{flexDirection:'row-reverse',alignItems:'center',gap:spacing.sm},avatarRing:{width:52,height:52,borderRadius:26,padding:3,borderWidth:2,borderColor:colors.border},unseen:{borderColor:colors.brand},avatar:{width:'100%',height:'100%',borderRadius:22},avatarFallback:{flex:1,borderRadius:22,backgroundColor:'#E4F2ED',alignItems:'center',justifyContent:'center'},initial:{fontSize:20,fontWeight:'900',color:colors.brand},cardTitle:{fontSize:15,fontWeight:'900',color:colors.ink,textAlign:'right'},storyStrip:{gap:spacing.sm,paddingVertical:spacing.xs},storyTile:{width:100,gap:4},tileImage:{width:100,height:142,borderRadius:radius.md,backgroundColor:'#E8ECEF'},textTile:{alignItems:'center',justifyContent:'center',padding:spacing.sm},tileText:{color:'#fff',fontWeight:'800',textAlign:'center'},tileCaption:{fontSize:11,color:colors.muted,textAlign:'right'},error:{padding:spacing.md,borderRadius:radius.md,backgroundColor:'#FCE8E8',gap:spacing.xs},errorText:{color:'#B42318',textAlign:'right'}});
