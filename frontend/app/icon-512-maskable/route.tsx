import { ImageResponse } from 'next/og';

/**
 * أيقونة Maskable — نفس الرمز المستخدم في app/icon-512/route.tsx، لكن مع
 * حشوة كافية حول المحتوى بدل تعبئة الحافة بالكامل. Android/الأنظمة التي
 * تدعم maskable icons تقصّ الأيقونة إلى دائرة أو مربع مدوّر أو أشكال أخرى؛
 * أي محتوى خارج "المنطقة الآمنة" المركزية (~80% من القطر) قد يُقصّ فعليًا.
 * الخلفية الملوّنة تمتد للحافة الكاملة (ضرورية لأشكال القص المختلفة)
 * بينما الغلاف (الحرف) يبقى مركزيًا وأصغر.
 */
export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#2F5D45',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '70%',
            height: '70%',
            color: '#FDFBF7',
            fontSize: 210,
            fontWeight: 700,
            fontFamily: 'sans-serif',
          }}
        >
          س
        </div>
      </div>
    ),
    { width: 512, height: 512 },
  );
}
