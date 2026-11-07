export const DEFAULT_SCENARIOS = [
  {
    id: 'public-browse',
    name: 'تصفح الزائر للصفحات العامة',
    description: 'يتنقل عبر الصفحات العامة كما يفعل زائر حقيقي، ويتحقق من تحميل جسم الصفحة وعدم حدوث أخطاء JavaScript.',
    enabled: true,
    writes: false,
    requiresAccount: false,
    tags: ['public', 'navigation', 'read-only'],
    steps: [
      { type: 'goto', value: '/' },
      { type: 'expectVisible', selector: 'body' },
      { type: 'goto', value: '/ads' },
      { type: 'expectVisible', selector: 'body' },
      { type: 'goto', value: '/products' },
      { type: 'expectVisible', selector: 'body' },
      { type: 'goto', value: '/services' },
      { type: 'expectVisible', selector: 'body' },
      { type: 'goto', value: '/stores' },
      { type: 'expectVisible', selector: 'body' },
      { type: 'goto', value: '/search' },
      { type: 'expectVisible', selector: 'body' },
      { type: 'goto', value: '/sellers/ranking' },
      { type: 'expectVisible', selector: 'body' }
    ]
  },
  {
    id: 'register-test-user',
    name: 'إنشاء حساب تجريبي',
    description: 'ينشئ حسابًا باسم واضح وبريد QA مشتق من قالب البريد المضبوط على خادم المحاكي.',
    enabled: true,
    writes: true,
    requiresAccount: false,
    tags: ['auth', 'registration', 'write'],
    steps: [
      { type: 'goto', value: '/register' },
      { type: 'fill', selector: '#name', value: 'MarketPlat QA {user}' },
      { type: 'fill', selector: '#email', value: '{email}' },
      { type: 'fill', selector: '#password', value: '{password}' },
      { type: 'fill', selector: '#confirmPassword', value: '{password}' },
      { type: 'click', selector: 'form button[type="submit"]', risk: 'safe' },
      { type: 'expectUrl', contains: '/dashboard', timeoutMs: 25000 }
    ]
  },
  {
    id: 'login-and-account-pages',
    name: 'تسجيل الدخول واستعراض صفحات الحساب',
    description: 'بعد تسجيل الدخول التلقائي الموثق في سجل التشغيل، يتصفح صفحات الحساب دون تغيير بياناتها.',
    enabled: true,
    writes: false,
    requiresAccount: true,
    tags: ['auth', 'account', 'read-only'],
    steps: [
      { type: 'goto', value: '/dashboard' },
      { type: 'expectVisible', selector: 'body' },
      { type: 'goto', value: '/activity' },
      { type: 'expectNotUrl', contains: '/login' },
      { type: 'goto', value: '/favorites' },
      { type: 'expectNotUrl', contains: '/login' },
      { type: 'goto', value: '/following' },
      { type: 'expectNotUrl', contains: '/login' },
      { type: 'goto', value: '/saved-searches' },
      { type: 'expectNotUrl', contains: '/login' },
      { type: 'goto', value: '/my-ads' },
      { type: 'expectNotUrl', contains: '/login' },
      { type: 'goto', value: '/my-store' },
      { type: 'expectNotUrl', contains: '/login' },
      { type: 'goto', value: '/my-services' },
      { type: 'expectNotUrl', contains: '/login' },
      { type: 'goto', value: '/messages' },
      { type: 'expectNotUrl', contains: '/login' },
      { type: 'goto', value: '/notifications' },
      { type: 'expectNotUrl', contains: '/login' },
      { type: 'goto', value: '/settings' },
      { type: 'expectNotUrl', contains: '/login' },
      { type: 'goto', value: '/account/sales' },
      { type: 'expectNotUrl', contains: '/login' },
      { type: 'goto', value: '/account/customers' },
      { type: 'expectNotUrl', contains: '/login' },
      { type: 'goto', value: '/requests/me' },
      { type: 'expectNotUrl', contains: '/login' }
    ]
  },
  {
    id: 'seller-workbench-entrypoints',
    name: 'صفحات البائع ونماذج الإنشاء',
    description: 'يتأكد من إمكانية فتح واجهات إدارة إعلانات ومنتجات ومتاجر وخدمات وطلبات حساب QA دون إرسال نماذج أو إنشاء سجلات.',
    enabled: true,
    writes: false,
    requiresAccount: true,
    accountRole: 'seller',
    tags: ['seller', 'forms', 'read-only'],
    steps: [
      { type: 'goto', value: '/ads/create' },
      { type: 'expectNotUrl', contains: '/login' },
      { type: 'expectVisible', selector: 'body' },
      { type: 'goto', value: '/my-store/products/new' },
      { type: 'expectNotUrl', contains: '/login' },
      { type: 'expectVisible', selector: 'body' },
      { type: 'goto', value: '/my-services/new' },
      { type: 'expectNotUrl', contains: '/login' },
      { type: 'expectVisible', selector: 'body' },
      { type: 'goto', value: '/requests/new' },
      { type: 'expectNotUrl', contains: '/login' },
      { type: 'expectVisible', selector: 'body' },
      { type: 'goto', value: '/requests/offers' },
      { type: 'expectNotUrl', contains: '/login' },
      { type: 'expectVisible', selector: 'body' }
    ]
  },
  {
    id: 'search-and-discovery',
    name: 'البحث والاكتشاف',
    description: 'يتحقق من صفحات البحث والتصنيفات والمحتوى المقترح والشائع.',
    enabled: true,
    writes: false,
    requiresAccount: false,
    tags: ['search', 'discovery', 'read-only'],
    steps: [
      { type: 'goto', value: '/search' },
      { type: 'expectVisible', selector: 'body' },
      { type: 'fillRole', role: 'searchbox', name: 'بحث', value: 'سيارة اختبار {user}' },
      { type: 'pressRole', role: 'searchbox', name: 'بحث', value: 'Enter' },
      { type: 'expectUrl', contains: 'q=' },
      { type: 'goto', value: '/categories' },
      { type: 'expectVisible', selector: 'body' },
      { type: 'goto', value: '/for-you' },
      { type: 'expectVisible', selector: 'body' },
      { type: 'goto', value: '/trending' },
      { type: 'expectVisible', selector: 'body' },
      { type: 'goto', value: '/promoted' },
      { type: 'expectVisible', selector: 'body' },
      { type: 'goto', value: '/sellers' },
      { type: 'expectVisible', selector: 'body' },
      { type: 'goto', value: '/service-providers' },
      { type: 'expectVisible', selector: 'body' },
      { type: 'goto', value: '/requests' },
      { type: 'expectVisible', selector: 'body' }
    ]
  },
  {
    id: 'create-test-customer',
    name: 'إضافة عميل تجريبي إلى دفتر المبيعات',
    description: 'ينشئ عميلًا باسم QA فريد من واجهة CRM ويتحقق من ظهوره. يحتاج حساب بائع مخصصًا ويسجل بيانات اختبار دائمة.',
    enabled: true,
    writes: true,
    requiresAccount: true,
    accountRole: 'seller',
    tags: ['seller', 'sales', 'crm', 'write'],
    steps: [
      { type: 'goto', value: '/account/customers' },
      { type: 'expectRoleVisible', role: 'heading', name: 'إدارة العملاء CRM' },
      { type: 'clickRole', role: 'button', name: 'عميل جديد', exact: true },
      { type: 'fill', selector: 'input[placeholder="الاسم *"]', value: '{customerName}' },
      { type: 'clickRole', role: 'button', name: 'حفظ العميل', exact: true },
      { type: 'expectText', text: '{customerName}' }
    ]
  },
  {
    id: 'create-test-saved-search',
    name: 'حفظ بحث من واجهة المستخدم',
    description: 'ينفذ بحثًا فعليًا ويحفظه من مربع حوار واجهة البحث ثم يتحقق من صفحة عمليات البحث المحفوظة.',
    enabled: true,
    writes: true,
    requiresAccount: true,
    accountRole: 'buyer',
    tags: ['buyer', 'search', 'saved-search', 'write'],
    steps: [
      { type: 'goto', value: '/search?q=سيارة%20اختبار%20{user}' },
      { type: 'clickRole', role: 'button', name: 'حفظ البحث', exact: true },
      { type: 'clickRole', role: 'button', name: 'إعلان', exact: true },
      { type: 'fill', selector: '#saved-search-label', value: '{savedSearchLabel}' },
      { type: 'clickDialogRole', role: 'button', name: 'حفظ البحث', exact: true },
      { type: 'goto', value: '/saved-searches' },
      { type: 'expectText', text: '{savedSearchLabel}' }
    ]
  },
  {
    id: 'favorite-test-ad',
    name: 'إضافة إعلان QA إلى المفضلة',
    description: 'يفتح إعلانًا منشورًا محددًا ويضيفه للمفضلة ثم يتحقق من ظهور حالة الإزالة. يتطلب SIMULATOR_SEED_AD_ID.',
    enabled: true,
    writes: true,
    requiresAccount: true,
    accountRole: 'buyer',
    requiresSeedAd: true,
    tags: ['buyer', 'ads', 'favorites', 'write'],
    steps: [
      { type: 'goto', value: '/ads/{seedAdId}' },
      { type: 'clickRole', role: 'button', name: 'إضافة إلى المفضلة', exact: true, optional: true },
      { type: 'expectRoleVisible', role: 'button', name: 'إزالة من المفضلة', exact: true },
      { type: 'goto', value: '/favorites' },
      { type: 'expectVisible', selector: 'body' }
    ]
  },
  {
    id: 'follow-test-seller',
    name: 'متابعة بائع QA',
    description: 'يتابع بائعًا محددًا ويتحقق من تبدل حالة الزر. يتطلب SIMULATOR_SEED_SELLER_ID.',
    enabled: true,
    writes: true,
    requiresAccount: true,
    accountRole: 'buyer',
    requiresSeedSeller: true,
    tags: ['buyer', 'seller', 'following', 'write'],
    steps: [
      { type: 'goto', value: '/profile/{seedSellerId}' },
      { type: 'clickRole', role: 'button', name: 'متابعة', exact: true, optional: true },
      { type: 'expectRoleVisible', role: 'button', name: 'إلغاء المتابعة', exact: true },
      { type: 'goto', value: '/following' },
      { type: 'expectVisible', selector: 'body' }
    ]
  },
  {
    id: 'send-test-message',
    name: 'إرسال رسالة إلى بائع QA',
    description: 'يفتح الملف العام لبائع QA، يبدأ محادثة ويرسل رسالة مميزة ثم يتحقق من ظهورها. ينشئ محادثة/رسالة دائمة.',
    enabled: true,
    writes: true,
    requiresAccount: true,
    accountRole: 'buyer',
    requiresSeedSeller: true,
    tags: ['buyer', 'messaging', 'write'],
    steps: [
      { type: 'goto', value: '/profile/{seedSellerId}' },
      { type: 'clickRole', role: 'button', name: 'مراسلة', exact: true },
      { type: 'expectUrl', contains: '/messages/' },
      { type: 'fillRole', role: 'textbox', name: 'نص الرسالة', value: '{testMessage}' },
      { type: 'clickRole', role: 'button', name: 'إرسال', exact: true },
      { type: 'expectText', text: '{testMessage}' }
    ]
  },
  {
    id: 'edit-test-ad',
    name: 'تعديل إعلان QA مملوك للحساب',
    description: 'يعدل عنوان ووصف إعلان اختبار مملوك لحساب QA ثم يتحقق من ظهوره. استخدم إعلانًا مخصصًا للاختبار فقط.',
    enabled: true,
    writes: true,
    requiresAccount: true,
    accountRole: 'seller',
    requiresSeedAd: true,
    tags: ['seller', 'ads', 'edit', 'write'],
    steps: [
      { type: 'goto', value: '/my-ads/{seedAdId}/edit' },
      { type: 'expectVisible', selector: '#title' },
      { type: 'fill', selector: '#title', value: '{adTitle}' },
      { type: 'fill', selector: '#desc', value: 'وصف اختبار آلي من MarketPlat User Simulator.' },
      { type: 'clickRole', role: 'button', name: 'حفظ التعديلات', exact: true },
      { type: 'goto', value: '/ads/{seedAdId}' },
      { type: 'expectRoleVisible', role: 'heading', name: '{adTitle}', exact: true }
    ]
  },
  {
    id: 'edit-test-product',
    name: 'تعديل منتج QA مملوك للحساب',
    description: 'يعدل اسم ووصف منتج اختبار مملوك للحساب. استخدم منتجًا مخصصًا للاختبار فقط.',
    enabled: true,
    writes: true,
    requiresAccount: true,
    accountRole: 'seller',
    requiresSeedProduct: true,
    tags: ['seller', 'products', 'edit', 'write'],
    steps: [
      { type: 'goto', value: '/my-store/products/{seedProductId}/edit' },
      { type: 'expectVisible', selector: '#name' },
      { type: 'fill', selector: '#name', value: '{productName}' },
      { type: 'fill', selector: '#description', value: 'وصف اختبار آلي من MarketPlat User Simulator.' },
      { type: 'clickRole', role: 'button', name: 'حفظ التعديلات', exact: true },
      { type: 'goto', value: '/products/{seedProductId}' },
      { type: 'expectRoleVisible', role: 'heading', name: '{productName}', exact: true }
    ]
  },
  {
    id: 'edit-test-service',
    name: 'تعديل خدمة QA مملوكة للحساب',
    description: 'يعدل عنوان ووصف خدمة اختبار مملوكة للحساب. استخدم خدمة مخصصة للاختبار فقط.',
    enabled: true,
    writes: true,
    requiresAccount: true,
    accountRole: 'seller',
    requiresSeedService: true,
    tags: ['seller', 'services', 'edit', 'write'],
    steps: [
      { type: 'goto', value: '/my-services/{seedServiceId}/edit' },
      { type: 'expectVisible', selector: '#title' },
      { type: 'fill', selector: '#title', value: '{serviceTitle}' },
      { type: 'fill', selector: '#description', value: 'وصف اختبار آلي من MarketPlat User Simulator.' },
      { type: 'clickRole', role: 'button', name: 'حفظ التعديلات', exact: true },
      { type: 'goto', value: '/services/{seedServiceId}' },
      { type: 'expectRoleVisible', role: 'heading', name: '{serviceTitle}', exact: true }
    ]
  },
  {
    id: 'create-test-ad',
    name: 'إنشاء إعلان تجريبي ونشره من الواجهة',
    description: 'ينفذ خطوات معالج نشر الإعلان، يختار أول مدينة متاحة ويرفع صورة QA ثابتة ثم يتحقق من صفحة الإعلان المنشور. الإعلان يصبح مرئيًا على الموقع ويجب استخدام حساب QA ومحتوى تجريبي فقط.',
    enabled: true,
    writes: true,
    requiresAccount: true,
    accountRole: 'seller',
    tags: ['seller', 'ads', 'create', 'upload', 'publish'],
    steps: [
      { type: 'goto', value: '/ads/create' },
      { type: 'fill', selector: '#title', value: '{adTitle}' },
      { type: 'fill', selector: '#desc', value: 'هذا إعلان اختبار آلي معلّم بوضوح كبيانات QA لمنصة MarketPlat. لا يمثل عرضًا تجاريًا حقيقيًا.' },
      { type: 'clickRole', role: 'button', name: 'التالي', exact: true },
      { type: 'selectFirstOption', selector: '#city' },
      { type: 'clickRole', role: 'button', name: 'التالي', exact: true },
      { type: 'upload', selector: 'form input[type=\"file\"]', file: 'marketplat-qa-image.png' },
      { type: 'clickRole', role: 'button', name: 'نشر الإعلان', exact: true },
      { type: 'expectUrl', contains: '/ads/', timeoutMs: 30000 }
    ]
  }

];

export const STEP_TYPES = new Set([
  'goto', 'click', 'clickText', 'fill', 'select', 'selectFirstOption', 'check', 'uncheck',
  'hover', 'press', 'scrollIntoView', 'upload',
  'clickRole', 'clickDialogRole', 'fillRole', 'pressRole', 'expectRoleVisible',
  'expectVisible', 'expectHidden', 'expectText', 'expectUrl', 'expectNotUrl',
  'wait', 'screenshot'
]);

export function validateScenario(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Scenario must be an object');
  const id = String(input.id || '').trim();
  if (!/^[a-z0-9][a-z0-9-]{1,50}$/.test(id)) throw new Error('Scenario id must use 2-51 lowercase letters, numbers, or hyphens');
  if (!String(input.name || '').trim()) throw new Error('Scenario name is required');
  if (input.accountRole !== undefined && !['buyer', 'seller'].includes(input.accountRole)) throw new Error('accountRole must be buyer or seller');
  if (!Array.isArray(input.steps) || input.steps.length < 1 || input.steps.length > 120) throw new Error('Scenario steps must contain 1-120 steps');
  const steps = input.steps.map((step, index) => {
    if (!step || typeof step !== 'object' || !STEP_TYPES.has(step.type)) throw new Error(`Invalid step type at index ${index}`);
    if (['goto'].includes(step.type)) {
      const value = String(step.value || '');
      if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) throw new Error(`goto step ${index} must use a local path beginning with /`);
    }
    if (['click', 'fill', 'select', 'selectFirstOption', 'check', 'uncheck', 'hover', 'press', 'scrollIntoView', 'upload', 'expectVisible', 'expectHidden'].includes(step.type) && !String(step.selector || '').trim()) {
      throw new Error(`Step ${index} requires a selector`);
    }
    if (['clickText', 'expectText'].includes(step.type) && !String(step.text || '').trim()) throw new Error(`Step ${index} requires text`);
    if (['clickRole', 'clickDialogRole', 'fillRole', 'pressRole', 'expectRoleVisible'].includes(step.type) && !String(step.role || '').trim()) throw new Error(`Step ${index} requires an accessible role`);
    if (['clickRole', 'clickDialogRole', 'fillRole', 'pressRole', 'expectRoleVisible'].includes(step.type) && !String(step.name || '').trim()) throw new Error(`Step ${index} requires an accessible name`);
    if (['pressRole'].includes(step.type) && !String(step.value || '').trim()) throw new Error(`Step ${index} requires a key or key combination`);
    if (step.type === 'press' && !String(step.value || '').trim()) throw new Error(`Step ${index} requires a key or key combination`);
    if (step.type === 'upload') {
      const file = String(step.file || '');
      if (!/^[a-zA-Z0-9._-]{1,120}$/.test(file) || file.includes('..')) throw new Error(`Upload step ${index} must use a fixture filename only`);
      if (input.writes !== true) throw new Error(`Upload step ${index} requires scenario writes=true`);
    }
    if (step.optional !== undefined && typeof step.optional !== 'boolean') throw new Error(`Invalid optional flag on step ${index}`);
    if (step.type === 'clickRole' && step.optional === true && step.risk === 'destructive') throw new Error(`Destructive click cannot be optional at step ${index}`);
    if (step.risk && !['safe', 'destructive'].includes(step.risk)) throw new Error(`Invalid risk on step ${index}`);
    return structuredClone(step);
  });
  return {
    id,
    name: String(input.name).trim().slice(0, 120),
    description: String(input.description || '').trim().slice(0, 500),
    enabled: input.enabled !== false,
    writes: input.writes === true,
    requiresAccount: input.requiresAccount === true,
    accountRole: ['buyer', 'seller'].includes(input.accountRole) ? input.accountRole : undefined,
    requiresSeedAd: input.requiresSeedAd === true,
    requiresSeedSeller: input.requiresSeedSeller === true,
    requiresSeedProduct: input.requiresSeedProduct === true,
    requiresSeedService: input.requiresSeedService === true,
    tags: Array.isArray(input.tags) ? input.tags.map(String).slice(0, 20) : [],
    steps
  };
}
