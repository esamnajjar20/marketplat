import type { ColorPalette } from '@/theme/tokens';
import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useState , useMemo} from 'react';
import { router } from 'expo-router';
import { goBack } from '@/lib/navigation';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/features/auth/AuthContext';
import { createStory } from '@/features/stories/stories.api';
import { fontSizes, radius, spacing } from '@/theme/tokens';
export default function StoryCreateScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createThemeStyles(colors), [colors]);

  const { accessToken, csrfToken } = useAuth();
  const [text, setText] = useState('');
  const [visibility, setVisibility] = useState<'FOLLOWERS' | 'PUBLIC'>('FOLLOWERS');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (!accessToken) { router.push('/login'); return; }
    if (!text.trim()) { setError('اكتب نص القصة أولًا.'); return; }
    setBusy(true); setError('');
    try { const story = await createStory({ text: text.trim(), visibility, background: colors.brand }, null, accessToken, csrfToken); router.replace({ pathname: '/stories/[id]', params: { id: story.id, userId: story.userId } }); }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر نشر القصة.'); }
    finally { setBusy(false); }
  };
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><SafeAreaView style={styles.safe} edges={['top']}><View style={styles.header}><Pressable onPress={() => goBack()}><Text style={styles.link}>إلغاء</Text></Pressable><Text style={styles.heading}>قصة نصية</Text><Pressable disabled={busy} onPress={() => void submit()}><Text style={[styles.link, busy && { opacity: .5 }]}>{busy ? 'جارٍ النشر…' : 'نشر'}</Text></Pressable></View><ScrollView contentContainerStyle={styles.content}><View style={styles.preview}><TextInput allowFontScaling maxFontSizeMultiplier={1.3} accessibilityLabel="نص القصة" value={text} onChangeText={setText} maxLength={500} multiline placeholder="ماذا تريد أن تشارك؟" placeholderTextColor={colors.borderStrong} style={styles.input} textAlign="center"/><Text style={styles.counter}>{text.length}/500</Text></View><Text style={styles.label}>من يستطيع مشاهدة القصة؟</Text><View style={styles.row}><Pressable onPress={() => setVisibility('FOLLOWERS')} style={[styles.option, visibility === 'FOLLOWERS' && styles.selected]}><Text style={[styles.optionText, visibility === 'FOLLOWERS' && styles.selectedText]}>المتابعون</Text></Pressable><Pressable onPress={() => setVisibility('PUBLIC')} style={[styles.option, visibility === 'PUBLIC' && styles.selected]}><Text style={[styles.optionText, visibility === 'PUBLIC' && styles.selectedText]}>الجميع</Text></Pressable></View><Text style={styles.hint}>تنتهي صلاحية القصة تلقائيًا بعد 24 ساعة، ويمكن حذفها قبل ذلك.</Text>{error ? <Text style={styles.error}>{error}</Text> : null}<Pressable disabled={busy} onPress={() => void submit()} style={[styles.primary, busy && { opacity: .6 }]}><Text style={styles.primaryText}>{busy ? 'جارٍ النشر…' : 'نشر القصة'}</Text></Pressable></ScrollView></SafeAreaView></KeyboardAvoidingView>;
}
const createThemeStyles = (colors: ColorPalette) => StyleSheet.create({safe:{flex:1,backgroundColor:colors.canvas},header:{minHeight:60,paddingHorizontal:spacing.md,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:colors.surface,borderBottomWidth:1,borderBottomColor:colors.border},heading:{fontSize:fontSizes[18],fontWeight:'700',color:colors.ink},link:{color:colors.brand,fontWeight:'700',padding:spacing.sm},content:{padding:spacing.md,gap:spacing.lg,paddingBottom:spacing.xl},preview:{minHeight:340,borderRadius:radius.lg,backgroundColor:colors.brand,padding:spacing.lg,justifyContent:'center',gap:spacing.md},input:{minHeight:240,color:colors.onBrand,fontSize:fontSizes[24],fontWeight:'700',textAlignVertical:'center'},counter:{textAlign:'left',color:colors.borderStrong,fontSize:fontSizes[12]},label:{textAlign:'right',fontWeight:'700',color:colors.ink},row:{flexDirection:'row',gap:spacing.sm},option:{flex:1,minHeight:48,padding:spacing.md,borderRadius:radius.md,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface,alignItems:'center'},selected:{borderColor:colors.brand,backgroundColor:colors.brandSoft},optionText:{fontWeight:'700',color:colors.ink},selectedText:{color:colors.brandOnSoft},hint:{textAlign:'right',color:colors.muted,lineHeight:21},error:{textAlign:'right',color:colors.danger},primary:{minHeight:50,backgroundColor:colors.brand,borderRadius:radius.md,padding:spacing.md,alignItems:'center',justifyContent:'center'},primaryText:{color:colors.onBrand,fontWeight:'700'}});
