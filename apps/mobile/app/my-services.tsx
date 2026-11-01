import { AppText as Text } from '@/components/ui/AppText';
import { AccessiblePressable as Pressable } from '@/components/AccessiblePressable';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/features/auth/AuthContext';
import { deleteMyServiceListing, fetchMyServiceListingsPage, type ServiceListing } from '@/features/services/services.api';
import { Notice, PageShell, PrimaryButton, SectionCard } from '@/components/MobileUI';
import { statusLabel } from '@/lib/status-labels';
import { fontSizes, colors } from '@/theme/tokens';
export default function MyServicesScreen(){
 const{accessToken,csrfToken}=useAuth();
 const[items,setItems]=useState<ServiceListing[]>([]);
 const[loading,setLoading]=useState(true);
 const[loadingMore,setLoadingMore]=useState(false);
 const[page,setPage]=useState(1);
 const[totalPages,setTotalPages]=useState(1);
 const[error,setError]=useState('');
 const[moreError,setMoreError]=useState('');
 const load=useCallback(async()=>{
  if(!accessToken){setItems([]);setLoading(false);return;}
  setLoading(true);setError('');setMoreError('');
  try{const result=await fetchMyServiceListingsPage(accessToken,1);setItems(result.items);setPage(result.page);setTotalPages(result.totalPages);}
  catch(e){setError(e instanceof Error?e.message:'تعذر تحميل خدماتك.');}
  finally{setLoading(false);}
 },[accessToken]);
 useEffect(()=>{void load();},[load]);
 const loadMore=async()=>{
  if(!accessToken||loadingMore||loading||page>=totalPages)return;
  setLoadingMore(true);setMoreError('');
  try{const result=await fetchMyServiceListingsPage(accessToken,page+1);setItems(current=>{const seen=new Set(current.map(item=>item.id));return [...current,...result.items.filter(item=>!seen.has(item.id))];});setPage(result.page);setTotalPages(result.totalPages);}
  catch(e){setMoreError(e instanceof Error?e.message:'تعذر تحميل المزيد.');}
  finally{setLoadingMore(false);}
 };
 const remove=(id:string)=>Alert.alert('حذف الخدمة','هل تريد حذف هذه الخدمة؟',[{text:'إلغاء',style:'cancel'},{text:'حذف',style:'destructive',onPress:()=>{if(!accessToken)return;void deleteMyServiceListing(id,accessToken,csrfToken).then(load).catch(e=>Alert.alert('تعذر الحذف',e instanceof Error?e.message:'حاول مجددًا.'));}}]);
 return <PageShell title="خدماتي">
  <Text style={{textAlign:'right',fontSize:fontSizes[12],lineHeight:20,color:colors.muted}}>نظّم خدماتك وتابع أسعارها وحالتها من مكان واحد.</Text>
  <PrimaryButton label="+ إضافة خدمة" onPress={()=>router.push('/service-editor')}/>
  {!accessToken?<><Notice>سجّل الدخول لإدارة خدماتك.</Notice><PrimaryButton label="تسجيل الدخول" onPress={()=>router.push('/login')}/></>:loading?<ActivityIndicator color={colors.brand}/>:error?<><Notice>{error}</Notice><PrimaryButton label="إعادة المحاولة" onPress={()=>void load()}/></>:items.length===0?<Notice tone="muted">لم تضف أي خدمة بعد. أنشئ أول خدمة ليتمكن العملاء من العثور عليها.</Notice>:<>{items.map(i=><SectionCard key={i.id}>
   <Pressable onPress={()=>router.push({pathname:'/services/[id]',params:{id:i.id}})}><Text style={{textAlign:'right',fontSize:fontSizes[16],fontWeight:'800',color:colors.ink}}>{i.title}</Text></Pressable>
   <Text style={{textAlign:'right',color:colors.muted}}>{i.category?.nameAr||i.category?.name||'بدون تصنيف'}</Text>
   <Text style={{textAlign:'right',color:colors.brand,fontWeight:'800'}}>{i.pricingType==='NEGOTIABLE'?'السعر قابل للتفاوض':`${i.price??'—'} ₪`}</Text>
   <View style={{flexDirection:'row-reverse',gap:8}}><View style={{flex:1}}><PrimaryButton label="تعديل" variant="secondary" onPress={()=>router.push({pathname:'/service-editor',params:{id:i.id}})}/></View><View style={{flex:1}}><PrimaryButton label="حذف" variant="danger" onPress={()=>remove(i.id)}/></View></View>
   <Text style={{textAlign:'right',color:colors.muted,fontSize:fontSizes[12]}}>الحالة: {statusLabel(i.status || 'ACTIVE')}</Text>
  </SectionCard>)}
  {moreError?<Notice>{moreError}</Notice>:null}
  {page<totalPages?<PrimaryButton label={loadingMore?'جارٍ التحميل…':'تحميل المزيد'} disabled={loadingMore} onPress={()=>void loadMore()}/>:null}
  </>}
 </PageShell>;
}
