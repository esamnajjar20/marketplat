import Link from 'next/link';
import { ROUTES } from '@/lib/constants';

/** شعار سوق غزة أعلى شاشات المصادقة — مطابق للتصميم. */
export function AuthBrand() {
  return (
    <Link
      href={ROUTES.home}
      className="mb-5 inline-flex items-center justify-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#397F56]/40"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#397F56] text-[15px] font-extrabold text-white">
        س
      </span>
      <span className="text-[18px] font-extrabold text-[#1F4D33]">سوق غزة</span>
    </Link>
  );
}
