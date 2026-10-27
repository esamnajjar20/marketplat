# المرحلة 6 — إكمال المسارات المتبقية

## ما تم
| العنصر | التغيير |
|--------|---------|
| `register.tsx` | تنسيق كامل بنفس نمط تسجيل الدخول |
| `categories.tsx` | PageShell + ListRow + حالات موحّدة |
| `stores/[id].tsx` | LoadingState / ErrorState + تنظيف hex |
| `messages/[id].tsx` | تنظيف كل ألوان hex → tokens |
| `ad-editor.tsx` | AppHeader + LoadingState + PrimaryButton للحالات |
| `src/components/Icons.tsx` | قاموس رموز موحّد `glyphs` + `AppIcon` |
| ملفات متعددة | استبدال `#fff` / `#FFFFFF` بـ `colors.white` |

## الحوكمة
القائمة الصارمة تشمل الآن المسارات الحرجة + التسجيل + التصنيفات + المحادثة + المتجر + المحرر.

## ما قد يبقى (أولوية منخفضة)
قصص، تقارير مبيعات تفصيلية، بعض شاشات الإدارة الثانوية — ما زال فيها hex غير أبيض في أماكن محدودة ويمكن ترحيلها عند اللمس.
