import { useState } from 'react';
import { Alert, Text } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { createSale } from '@/features/sales/sales.api';
import { enqueueOfflineCreate } from '@/storage/entity-create-outbox';
import { Field, Notice, PageShell, PrimaryButton } from '@/components/MobileUI';
import { colors } from '@/theme/tokens';

export default function SaleCreateScreen() {
  const { accessToken, csrfToken, user } = useAuth();
  const [title,setTitle]=useState(''); const [buyer,setBuyer]=useState(''); const [phone,setPhone]=useState(''); const [quantity,setQuantity]=useState('1'); const [unitPrice,setUnitPrice]=useState(''); const [paid,setPaid]=useState('0'); const [note,setNote]=useState(''); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const submit=async()=>{
    if(!accessToken){router.push('/login');return;}
    const q=Number(quantity), price=Number(unitPrice), paidAmount=Number(paid);
    if(title.trim().length<2||buyer.trim().length<2||!Number.isInteger(q)||q<1||!Number.isFinite(price)||price<0||!Number.isFinite(paidAmount)||paidAmount<0||paidAmount>q*price){setError('تحقق من اسم السلعة واسم المشتري والكمية والسعر والمبلغ المدفوع.');return;}
    const payload={entityType:'FREE',entityTitle:title.trim(),quantity:q,unitPrice:price,currency:'ILS',buyerName:buyer.trim(),...(phone.trim()?{buyerPhone:phone.trim()}:{}),paidAmount,paymentStatus:paidAmount===0?'UNPAID':paidAmount>=q*price?'PAID':'PARTIAL',...(note.trim()?{note:note.trim()}:{}),soldAt:new Date().toISOString()};
    setBusy(true);setError('');try{const net=await NetInfo.fetch();const id=`sale-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;if(net.isConnected!==true||net.isInternetReachable===false){if(!user?.id)throw new Error('تعذر تحديد الحساب لحفظ البيع دون اتصال.');await enqueueOfflineCreate(String(user.id),id,'create-sale',payload);Alert.alert('حُفظ البيع على الجهاز','لم يُسجّل البيع على الخادم بعد. سيُرسل عند عودة الإنترنت؛ لا تعتبره بيعًا مسجلًا حتى تظهر رسالة التأكيد.',[{text:'حسنًا',onPress:()=>router.replace('/offline-queue')}]);}else{await createSale(payload,accessToken,csrfToken,id);Alert.alert('تم تسجيل البيع','أكد الخادم تسجيل عملية البيع.',[{text:'حسنًا',onPress:()=>router.replace('/my-sales')}]);}}catch(e){setError(e instanceof Error?e.message:'تعذر تسجيل البيع.');}finally{setBusy(false);}};
  return <PageShell title="تسجيل عملية بيع"><Notice tone="muted">تسجيل بيع يدوي لسلعة حرة. المبيعات المرتبطة بمنتج أو إعلان أو خدمة تتطلب اختيار العنصر المملوك من المسار المناسب.</Notice><Field label="اسم السلعة أو الخدمة المباعة" value={title} onChangeText={setTitle} maxLength={300} placeholder="اسم السلعة"/><Field label="اسم المشتري" value={buyer} onChangeText={setBuyer} maxLength={160} placeholder="اسم المشتري"/><Field label="هاتف المشتري (اختياري)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={40} placeholder="رقم الهاتف"/><Field label="الكمية" value={quantity} onChangeText={setQuantity} keyboardType="number-pad"/><Field label="سعر الوحدة (₪)" value={unitPrice} onChangeText={setUnitPrice} keyboardType="decimal-pad" placeholder="0.00"/><Field label="المبلغ المدفوع (₪)" value={paid} onChangeText={setPaid} keyboardType="decimal-pad" placeholder="0.00"/><Field label="ملاحظات (اختياري)" value={note} onChangeText={setNote} maxLength={1000} multiline placeholder="ملاحظات البيع"/>{error?<Text style={{color:colors.danger,textAlign:'right'}}>{error}</Text>:null}<PrimaryButton label={busy?'جارٍ الحفظ…':'تسجيل البيع'} onPress={()=>void submit()} busy={busy}/></PageShell>;
}
