# إضافة WebVitals إلى app/layout.tsx

1. استورد المكوّن:

```tsx
import { WebVitals } from '@/components/shared/WebVitals';
```

2. داخل `<body>` بعد أو داخل `AppProviders`:

```tsx
<body>
  <AppProviders nonce={nonce}>
    <WebVitals />
    {children}
  </AppProviders>
</body>
```
