import { apiRequest } from '@/api/client';
type Envelope<T>={success:boolean;message?:string;data?:T};function unwrap<T>(r:Envelope<T>,fallback:string):T{if(!r||r.success!==true||r.data===undefined)throw new Error(r?.message||fallback);return r.data;}
export type AppointmentRow={id:string;providerId?:string;status?:string;scheduledStart:string;scheduledEnd:string;notes?:string|null;requestId?:string|null;request?:{id?:string;customerId?:string;listing?:{id?:string;title?:string;providerId?:string};customer?:{name?:string}};provider?:{id?:string;businessName?:string}};
export async function fetchMyAppointments(token:string,ownerId?:string|null):Promise<AppointmentRow[]>{const a=unwrap(await apiRequest<Envelope<AppointmentRow[]>>('/api/v1/appointments/me?page=1&limit=50',{token,cacheOwnerId:ownerId??undefined}),'تعذر تحميل المواعيد.');if(!Array.isArray(a))throw new Error('استجابة المواعيد غير صالحة.');return a;}
export type ProviderAvailability = { date: string; available: boolean; freeRanges: Array<{ start: string; end: string }> };
export async function fetchProviderAvailability(providerId: string, date: string): Promise<ProviderAvailability> {
  const result = unwrap(await apiRequest<Envelope<ProviderAvailability>>(`/api/v1/appointments/availability/${encodeURIComponent(providerId)}?date=${encodeURIComponent(date)}`), 'تعذر تحميل الأوقات المتاحة.');
  if (!result || !Array.isArray(result.freeRanges)) throw new Error('استجابة الأوقات المتاحة غير صالحة.');
  return result;
}
export async function createAppointment(i:{requestId:string;scheduledStart:string;scheduledEnd:string;notes?:string},token:string,csrfToken?:string|null):Promise<AppointmentRow>{return unwrap(await apiRequest<Envelope<AppointmentRow>>('/api/v1/appointments',{method:'POST',token,headers:csrfToken?{'X-CSRF-Token':csrfToken}:undefined,body:JSON.stringify(i)}),'تعذر حجز الموعد.');}
export async function updateAppointmentStatus(id:string,status:'COMPLETED'|'CANCELLED'|'NO_SHOW',token:string,csrfToken?:string|null):Promise<AppointmentRow>{return unwrap(await apiRequest<Envelope<AppointmentRow>>(`/api/v1/appointments/${encodeURIComponent(id)}/status`,{method:'PATCH',token,headers:csrfToken?{'X-CSRF-Token':csrfToken}:undefined,body:JSON.stringify({status})}),'تعذر تحديث الموعد.');}
