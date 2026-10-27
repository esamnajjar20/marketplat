import { useCallback, useEffect, useMemo, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/AuthContext';
import { deleteStory, fetchStoryFeed, fetchUserStories, markStoryViewed, type Story } from '@/features/stories/stories.api';
import { shareMarketPlatResource } from '@/features/sharing/deep-links';
import { colors, radius, spacing } from '@/theme/tokens';
export default function StoryViewerScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; userId?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const userId = Array.isArray(params.userId) ? params.userId[0] : params.userId;
  const { accessToken, csrfToken } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const story = stories[index];
  const load = useCallback(async () => {
    if (!id) { setError('رابط القصة غير مكتمل.'); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      let found: Story[] = [];
      if (userId) found = await fetchUserStories(userId, accessToken);
      else if (accessToken) found = (await fetchStoryFeed(accessToken)).flatMap(group => group.stories);
      const target = found.findIndex(item => item.id === id);
      if (target < 0) throw new Error('القصة غير متاحة أو انتهت صلاحيتها أو لا تملك صلاحية مشاهدتها.');
      setStories(found); setIndex(target);
    } catch (e) { setError(e instanceof Error ? e.message : 'تعذر فتح القصة.'); }
    finally { setLoading(false); }
  }, [id, userId, accessToken]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (story?.id && accessToken) void markStoryViewed(story.id, accessToken, csrfToken).catch(() => undefined);
  }, [story?.id, accessToken]);
  const close = () => router.back();
  const next = () => { if (index + 1 < stories.length) setIndex(index + 1); else close(); };
  const previous = () => setIndex(Math.max(0, index - 1));
  const share = async () => { if (!story) return; try { await shareMarketPlatResource('stories', story.id, `قصة ${story.user.name}`, { userId: story.userId }); } catch { setError('تعذرت مشاركة الرابط.'); } };
  const remove = () => { if (!story || !accessToken) return; Alert.alert('حذف القصة', 'هل تريد حذف هذه القصة نهائيًا؟', [{ text: 'إلغاء', style: 'cancel' }, { text: 'حذف', style: 'destructive', onPress: () => { setBusy(true); void deleteStory(story.id, accessToken, csrfToken).then(() => { const remaining = stories.filter(item => item.id !== story.id); if (!remaining.length) close(); else { setStories(remaining); setIndex(Math.min(index, remaining.length - 1)); } }).catch(e => setError(e instanceof Error ? e.message : 'تعذر حذف القصة.')).finally(() => setBusy(false)); } }]); };
  const age = useMemo(() => { if (!story?.createdAt) return ''; const minutes = Math.max(0, Math.floor((Date.now() - new Date(story.createdAt).getTime()) / 60000)); return minutes < 60 ? `منذ ${minutes} دقيقة` : `منذ ${Math.floor(minutes / 60)} ساعة`; }, [story?.createdAt]);
  return <SafeAreaView style={styles.safe} edges={['top','bottom']}><View style={styles.top}><Pressable onPress={close}><Text style={styles.action}>إغلاق ×</Text></Pressable><Text style={styles.count}>{story ? `${index + 1} / ${stories.length}` : 'القصة'}</Text><Pressable onPress={() => void share()} disabled={!story}><Text style={styles.action}>مشاركة ↗</Text></Pressable></View>{loading ? <View style={styles.center}><ActivityIndicator size="large" color={colors.brand}/><Text style={styles.muted}>جارٍ فتح القصة…</Text></View> : error && !story ? <View style={styles.center}><Text style={styles.error}>{error}</Text><Pressable style={styles.button} onPress={() => void load()}><Text style={styles.buttonText}>إعادة المحاولة</Text></Pressable><Pressable onPress={close}><Text style={styles.action}>رجوع</Text></Pressable></View> : story ? <View style={[styles.stage, { backgroundColor: story.background || '#176B5B' }]}>
    <View style={styles.progressRow}>{stories.map((item, i) => <View key={item.id} style={styles.progressTrack}><View style={[styles.progressFill, i <= index && styles.progressActive]}/></View>)}</View>
    <View style={styles.author}><View style={{ flex: 1 }}><Text style={styles.authorName}>{story.user.name}</Text><Text style={styles.authorMeta}>{age}{story.visibility === 'PUBLIC' ? ' · عامة' : ''}</Text></View>{story.isOwner ? <Pressable disabled={busy} onPress={remove}><Text style={styles.action}>{busy ? '…' : 'حذف'}</Text></Pressable> : null}</View>
    {story.mediaUrl ? <Image source={{ uri: story.mediaUrl }} resizeMode="contain" style={styles.media}/> : <View style={styles.textOnly}><Text style={styles.storyText}>{story.text}</Text></View>}
    {story.mediaUrl && story.text ? <Text style={styles.caption}>{story.text}</Text> : null}
    <View style={styles.nav}><Pressable style={styles.navButton} onPress={previous} disabled={index === 0}><Text style={styles.navText}>السابق</Text></Pressable><Pressable style={styles.navButton} onPress={next}><Text style={styles.navText}>{index + 1 === stories.length ? 'إغلاق' : 'التالي'}</Text></Pressable></View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
  </View> : null}</SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:'#101715'},top:{height:60,paddingHorizontal:spacing.md,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},action:{color:'#E1F4ED',fontWeight:'900',padding:spacing.sm},count:{color:'#fff',fontWeight:'800'},center:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.xl,gap:spacing.md},muted:{color:'#C8D7D1'},error:{color:'#FFE1E1',textAlign:'center',padding:spacing.md},button:{backgroundColor:colors.brand,padding:spacing.md,borderRadius:radius.md},buttonText:{color:'#fff',fontWeight:'800'},stage:{flex:1,marginHorizontal:spacing.sm,marginBottom:spacing.sm,borderRadius:radius.lg,padding:spacing.md,overflow:'hidden'},progressRow:{flexDirection:'row',gap:4},progressTrack:{height:3,flex:1,backgroundColor:'rgba(255,255,255,.3)',borderRadius:2,overflow:'hidden'},progressFill:{height:3,width:'0%',backgroundColor:'transparent'},progressActive:{width:'100%',backgroundColor:'#fff'},author:{flexDirection:'row-reverse',alignItems:'center',justifyContent:'space-between',paddingVertical:spacing.md},authorName:{textAlign:'right',color:'#fff',fontWeight:'900',fontSize:16},authorMeta:{textAlign:'right',color:'#E1F4ED',fontSize:12,marginTop:3},media:{flex:1,width:'100%',minHeight:180},textOnly:{flex:1,alignItems:'center',justifyContent:'center',padding:spacing.xl},storyText:{fontSize:28,fontWeight:'900',textAlign:'center',lineHeight:40,color:'#fff'},caption:{color:'#fff',textAlign:'center',padding:spacing.md,fontSize:16,fontWeight:'700'},nav:{flexDirection:'row',justifyContent:'space-between',paddingTop:spacing.md},navButton:{minHeight:48,padding:spacing.md,backgroundColor:'rgba(0,0,0,.26)',borderRadius:radius.md,minWidth:100,alignItems:'center'},navText:{color:'#fff',fontWeight:'800'}});
