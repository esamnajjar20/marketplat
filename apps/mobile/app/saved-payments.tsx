import { useAppTheme } from '@/theme/ThemeProvider';
import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { pushOnce } from '@/lib/navigation';
import { View } from 'react-native';
import { confirmAlert } from '@/lib/confirm';
import { Field, Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { radius, spacing, typography, fontWeights } from '@/theme/tokens';
import { useAuth } from '@/features/auth/AuthContext';
import { deleteSavedNetCard, deleteSavedPayee, listSavedNetCards, listSavedPayees, saveNetCard, savePayee, updateSavedNetCard, updateSavedPayee, type SavedNetCard, type SavedPayee } from '@/storage/saved-payments.store';
type Tab = 'payees' | 'cards';
function maskIdentifier(value: string): string {
    const digits = value.replace(/\D/g, '');
    if (digits.length >= 6)
        return `•••• ${digits.slice(-4)}`;
    if (value.length > 16)
        return `${'•'.repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
    return value;
}
const methods = [{
        value: 'jawwal', label: 'جوال'
    }, {
        value: 'palpay', label: 'PalPay'
    }, {
        value: 'bank', label: 'حساب بنكي'
    }] as const;
export default function SavedPaymentsScreen() {
    const { colors } = useAppTheme();
    const { user } = useAuth();
    const ownerId = user?.id ?? '';
    const [tab, setTab] = useState<Tab>('payees');
    const [payees, setPayees] = useState<SavedPayee[]>([]);
    const [cards, setCards] = useState<SavedNetCard[]>([]);
    const [name, setName] = useState('');
    const [number, setNumber] = useState('');
    const [method, setMethod] = useState<SavedPayee['method']>('jawwal');
    const [label, setLabel] = useState('');
    const [username, setUsername] = useState('');
    const [editingPayee, setEditingPayee] = useState<SavedPayee | null>(null);
    const [editingCard, setEditingCard] = useState<SavedNetCard | null>(null);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const refresh = useCallback(async () => {
        if (!ownerId) {
            setPayees([]);
            setCards([]);
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const [p, c] = await Promise.all([listSavedPayees(ownerId), listSavedNetCards(ownerId)]);
            setPayees(p);
            setCards(c);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'تعذر فتح المحفوظات الآمنة.');
        }
        finally {
            setLoading(false);
        }
    }, [ownerId]);
    useEffect(() => {
        void refresh();
    }, [refresh]);
    const filteredPayees = useMemo(() => payees.filter(x => `${x.name} ${x.number} ${x.method}`.toLowerCase().includes(query.trim().toLowerCase())), [payees, query]);
    const filteredCards = useMemo(() => cards.filter(x => `${x.label} ${x.username}`.toLowerCase().includes(query.trim().toLowerCase())), [cards, query]);
    const addPayee = async () => {
        if (!ownerId) {
            setError('سجّل الدخول لحفظ بيانات مرتبطة بحسابك.');
            return;
        }
        if (!name.trim() || !number.trim()) {
            setError('أدخل الاسم والرقم.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            if (editingPayee)
                await updateSavedPayee(editingPayee.id, ownerId, {
                    name, number, method
                });
            else
                await savePayee({
                    name, number, method
                }, ownerId);
            setName('');
            setNumber('');
            setEditingPayee(null);
            await refresh();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'تعذر الحفظ.');
        }
        finally {
            setBusy(false);
        }
    };
    const addCard = async () => {
        if (!ownerId) {
            setError('سجّل الدخول لحفظ بيانات مرتبطة بحسابك.');
            return;
        }
        if (!username.trim()) {
            setError('أدخل اسم المستخدم أو رقم البطاقة.');
            return;
        }
        setBusy(true);
        setError('');
        try {
            if (editingCard)
                await updateSavedNetCard(editingCard.id, ownerId, {
                    label, username
                });
            else
                await saveNetCard({
                    label, username
                }, ownerId);
            setLabel('');
            setUsername('');
            setEditingCard(null);
            await refresh();
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'تعذر الحفظ.');
        }
        finally {
            setBusy(false);
        }
    };
    const confirmDelete = (title: string, action: () => Promise<void>) => confirmAlert('تأكيد الحذف', `هل تريد حذف ${title} من هذا الجهاز؟`, [{
            text: 'إلغاء', style: 'cancel'
        }, {
            text: 'حذف', style: 'destructive', onPress: () => {
                void action().then(refresh).catch(e => setError(e instanceof Error ? e.message : 'تعذر الحذف.'));
            }
        }]);
    if (!user)
        return <PageShell title="المحفوظات المحلية"><Notice tone="muted">سجّل الدخول للوصول إلى محفوظات الدفع المرتبطة بحسابك. لا تُنشأ محفوظات عامة للضيف حتى لا تختلط بيانات المستخدمين على الجهاز نفسه.</Notice><PrimaryButton label="تسجيل الدخول" onPress={() => pushOnce('/login')}/></PageShell>;
    return <PageShell title="المحفوظات المحلية">
    <Notice tone="muted">تُحفظ البيانات محليًا داخل قاعدة مشفّرة ومربوطة بحسابك. لا تحفظ كلمات مرور أو CVV. أرقام الحسابات والمعرّفات التي تدخلها تبقى مخزنة مشفّرة ويُخفى معظمها أثناء العرض.</Notice>
    <View style={{
        flexDirection: 'row', gap: spacing.sm
    }}>{([{
            key: 'payees', label: 'جهات الدفع'
        }, {
            key: 'cards', label: 'بطاقات الإنترنت'
        }] as const).map(x => <Pressable key={x.key} accessibilityRole="tab" accessibilityState={{ selected: tab === x.key }} onPress={() => setTab(x.key)} style={{
        flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control, backgroundColor: tab === x.key ? colors.brand : colors.surface, borderWidth: 1, borderColor: colors.border
    }}><Text style={{
        color: tab === x.key ? colors.white : colors.ink, fontWeight: fontWeights.bold
    }}>{x.label}</Text></Pressable>)}</View>
    <Field label="بحث في المحفوظات" value={query} onChangeText={setQuery} placeholder="الاسم أو الرقم"/>
    {tab === 'payees' ? <SectionCard><Text style={{
        ...typography.subtitle, color: colors.ink, textAlign: 'right'
    }}>{editingPayee ? 'تعديل جهة الدفع' : 'إضافة جهة دفع'}</Text><Field label="الاسم" value={name} onChangeText={setName}/><Field label="الرقم أو الحساب" value={number} onChangeText={setNumber}/><View style={{
        flexDirection: 'row', gap: 6
    }}>{methods.map(m => <Pressable accessibilityRole="button" key={m.value} onPress={() => setMethod(m.value)} style={{
        flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control, borderWidth: 1, borderColor: method === m.value ? colors.brand : colors.border, backgroundColor: method === m.value ? colors.brandSoft : colors.surface
    }}><Text style={{
        color: colors.ink, fontWeight: fontWeights.bold
    }}>{m.label}</Text></Pressable>)}</View><PrimaryButton label={editingPayee ? 'حفظ التعديلات' : 'حفظ جهة الدفع'} onPress={() => void addPayee()} busy={busy}/>{editingPayee ? <PrimaryButton label="إلغاء التعديل" variant="ghost" onPress={() => {
        setEditingPayee(null);
        setName('');
        setNumber('');
        setMethod('jawwal');
    }}/> : null}</SectionCard> : <SectionCard><Text style={{
        ...typography.subtitle, color: colors.ink, textAlign: 'right'
    }}>{editingCard ? 'تعديل البطاقة' : 'إضافة بطاقة إنترنت'}</Text><Field label="اسم اختياري" value={label} onChangeText={setLabel}/><Field label="اسم المستخدم أو الرقم" value={username} onChangeText={setUsername}/><PrimaryButton label={editingCard ? 'حفظ التعديلات' : 'حفظ البطاقة'} onPress={() => void addCard()} busy={busy}/>{editingCard ? <PrimaryButton label="إلغاء التعديل" variant="ghost" onPress={() => {
        setEditingCard(null);
        setLabel('');
        setUsername('');
    }}/> : null}</SectionCard>}
    {error ? <Notice>{error}</Notice> : null}
    {loading ? <Notice tone="muted">جارٍ تحميل المحفوظات…</Notice> : tab === 'payees' ? filteredPayees.map(p => <SectionCard key={p.id}><View style={{
        flexDirection: 'row', alignItems: 'center', gap: spacing.sm
    }}><View style={{ flex: 1 }}><Text tone="ink" strong>{p.name}</Text><Text tone="muted">{maskIdentifier(p.number)} · {methods.find(m => m.value === p.method)?.label}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`تعديل ${p.name}`} onPress={() => {
        setEditingPayee(p);
        setName(p.name);
        setNumber(p.number);
        setMethod(p.method);
    }} style={{
        minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center'
    }}><Text style={{
        color: colors.brand, fontWeight: fontWeights.bold
    }}>تعديل</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`حذف ${p.name}`} onPress={() => confirmDelete(p.name, () => deleteSavedPayee(p.id, ownerId))} style={{
        minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center'
    }}><Text style={{
        color: colors.danger, fontWeight: fontWeights.bold
    }}>حذف</Text></Pressable></View></SectionCard>) : filteredCards.map(c => <SectionCard key={c.id}><View style={{
        flexDirection: 'row', alignItems: 'center', gap: spacing.sm
    }}><View style={{ flex: 1 }}><Text tone="ink" strong>{c.label || 'بطاقة إنترنت'}</Text><Text tone="muted">{maskIdentifier(c.username)}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="تعديل البطاقة" onPress={() => {
        setEditingCard(c);
        setLabel(c.label);
        setUsername(c.username);
    }} style={{
        minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center'
    }}><Text style={{
        color: colors.brand, fontWeight: fontWeights.bold
    }}>تعديل</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="حذف البطاقة" onPress={() => confirmDelete(c.label || 'البطاقة', () => deleteSavedNetCard(c.id, ownerId))} style={{
        minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center'
    }}><Text style={{
        color: colors.danger, fontWeight: fontWeights.bold
    }}>حذف</Text></Pressable></View></SectionCard>)}
    {!loading && (tab === 'payees' ? filteredPayees.length === 0 : filteredCards.length === 0) ? <Notice tone="muted">لا توجد عناصر مطابقة بعد.</Notice> : null}
  </PageShell>;
}
