import { apiRequest } from '@/api/client';
import type { AuthUser, AuthSession } from '@/features/auth/auth.api';
type Envelope<T> = { success: boolean; message?: string; data?: T };
function unwrap<T>(r: Envelope<T>, fallback: string): T { if (!r || r.success !== true || r.data === undefined) throw new Error(r?.message || fallback); return r.data; }
export type AccountProfile = AuthUser & { phone?: string | null; city?: string | null; bio?: string | null; avatarUrl?: string | null; emailVerified?: boolean; notificationPreferences?: Record<string, boolean | string> };
export async function registerAccount(input: { name: string; email: string; password: string; phone?: string; city?: string }): Promise<AuthSession> {
 const r=await apiRequest<Envelope<{user?:AuthUser;tokens?:{accessToken?:string;expiresIn?:number};csrfToken?:string}>>('/api/v1/auth/register',{method:'POST',credentials:'include',body:JSON.stringify(input)}); const d=r?.data;
 if(r?.success!==true||!d?.user||typeof d.tokens?.accessToken!=='string')throw new Error(r?.message||'لم تكتمل استجابة إنشاء الحساب.'); return {user:d.user,accessToken:d.tokens.accessToken,expiresIn:d.tokens.expiresIn,csrfToken:d.csrfToken};
}
export async function requestPasswordReset(email:string):Promise<void>{const r=await apiRequest<Envelope<unknown>>('/api/v1/auth/forgot-password',{method:'POST',body:JSON.stringify({email:email.trim()})});if(r?.success!==true)throw new Error(r?.message||'تعذر إرسال طلب الاستعادة.');}
export async function resetPassword(token:string,newPassword:string):Promise<void>{const r=await apiRequest<Envelope<unknown>>('/api/v1/auth/reset-password',{method:'POST',body:JSON.stringify({token:token.trim(),newPassword})});if(r?.success!==true)throw new Error(r?.message||'تعذر تغيير كلمة المرور.');}
export async function fetchMyProfile(token:string, ownerId?:string | null):Promise<AccountProfile>{return unwrap(await apiRequest<Envelope<AccountProfile>>('/api/v1/users/me',{token,cacheOwnerId:ownerId ?? undefined}),'تعذر تحميل الملف الشخصي.');}
export async function updateMyProfile(input:Partial<Pick<AccountProfile,'name'|'phone'|'city'|'bio'>>,token:string,csrfToken?:string|null,ownerId?:string|null):Promise<AccountProfile>{return unwrap(await apiRequest<Envelope<AccountProfile>>('/api/v1/users/me',{method:'PATCH',token,cacheOwnerId:ownerId ?? undefined,headers:csrfToken?{'X-CSRF-Token':csrfToken}:undefined,body:JSON.stringify(input)}),'تعذر حفظ الملف الشخصي.');}
export async function changeMyPassword(currentPassword:string,newPassword:string,token:string,csrfToken?:string|null):Promise<void>{const r=await apiRequest<Envelope<unknown>>('/api/v1/users/me/password',{method:'POST',token,headers:csrfToken?{'X-CSRF-Token':csrfToken}:undefined,body:JSON.stringify({currentPassword,newPassword})});if(r?.success!==true)throw new Error(r?.message||'تعذر تغيير كلمة المرور.');}
export async function updateNotificationPreferences(input:Record<string,boolean | string>,token:string,csrfToken?:string|null,ownerId?:string|null):Promise<AccountProfile>{return unwrap(await apiRequest<Envelope<AccountProfile>>('/api/v1/users/me/notifications',{method:'PATCH',token,cacheOwnerId:ownerId ?? undefined,headers:csrfToken?{'X-CSRF-Token':csrfToken}:undefined,body:JSON.stringify(input)}),'تعذر حفظ تفضيلات الإشعارات.');}
export async function resendVerification(token:string,csrfToken?:string|null):Promise<void>{const r=await apiRequest<Envelope<unknown>>('/api/v1/auth/resend-verification',{method:'POST',token,headers:csrfToken?{'X-CSRF-Token':csrfToken}:undefined,body:JSON.stringify({})});if(r?.success!==true)throw new Error(r?.message||'تعذر إعادة إرسال رسالة التحقق.');}

export async function uploadMyAvatar(asset: { uri: string; fileName?: string | null; mimeType?: string | null }, token: string, csrfToken?: string | null): Promise<AccountProfile> {
 const form = new FormData();
 form.append('image', { uri: asset.uri, name: asset.fileName || `avatar-${Date.now()}.jpg`, type: asset.mimeType || 'image/jpeg' } as unknown as Blob);
 return unwrap(await apiRequest<Envelope<AccountProfile>>('/api/v1/users/me/avatar', { method: 'POST', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: form }), 'تعذر تحديث الصورة الشخصية.');
}
