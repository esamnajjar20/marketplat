/** Static guardrails for the shared loading system. No dependencies required. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(frontendRoot, relative), 'utf8');
const pkg = JSON.parse(read('package.json'));
const spinner = read('components/ui/spinner.tsx');
const gate = read('components/shared/feedback/LoadingGate.tsx');
const pageState = read('components/shared/feedback/PageLoadingState.tsx');
const sharedLoadingState = read('components/shared/feedback/LoadingState.tsx');
const routeLoadingState = read('components/shared/RouteLoadingState.tsx');
const loadingSpinner = read('components/shared/feedback/LoadingSpinner.tsx');
const session = read('components/shared/SessionRestorationStatus.tsx');
const pullToRefresh = read('components/shared/ui/PullToRefresh.tsx');
const updatePage = read('app/update/page.tsx');
const docs = read('docs/LOADING_SYSTEM.md');
const favoriteButton = read('components/shared/FavoriteButton.tsx');
const saveSearchButton = read('components/ads/SaveSearchButton.tsx');
const serviceRequestButton = read('components/services/ServiceRequestButton.tsx');
const myStoreCard = read('components/stores/MyStoreCard.tsx');
const adDetail = read('components/ads/AdDetail.tsx');
const sellerProfile = read('components/sellers/MySellerProfileCard.tsx');
const becomeSeller = read('components/sellers/BecomeSellerCard.tsx');
const becomeProvider = read('components/services/BecomeServiceProviderCard.tsx');
const providerContact = read('components/services/ProviderContactCard.tsx');
const notificationsPage = read('components/notifications/NotificationsPage.tsx');
const salesCost = read('components/sales/SalesCostSection.tsx');
const returnSale = read('components/sales/ReturnSaleDialog.tsx');
const addSale = read('components/sales/AddSaleDialog.tsx');
const posDialog = read('components/sales/POSDialog.tsx');
const profileSettings = read('components/profile/ProfileSettingsForm.tsx');
const securitySettings = read('components/profile/SecuritySettingsForm.tsx');
const deleteAccount = read('components/profile/DeleteAccountSection.tsx');
const emailVerification = read('components/layout/EmailVerificationBanner.tsx');
const serviceReview = read('components/services/ReviewServiceRequestDialog.tsx');
const appointmentDialog = read('components/services/CreateAppointmentDialog.tsx');
const serviceListingForm = read('components/services/ServiceListingForm.tsx');
const requestOfferForm = read('components/requests/RequestOfferForm.tsx');
const createRequestForm = read('components/requests/CreateRequestForm.tsx');
const adForm = read('components/ads/AdForm.tsx');
const becomeStoreOwner = read('components/stores/BecomeStoreOwnerCard.tsx');
const collectionForm = read('components/stores/CollectionForm.tsx');
const storeReview = read('components/stores/StoreReviewDialog.tsx');
const productForm = read('components/stores/ProductForm.tsx');
const promotionForm = read('components/stores/PromotionForm.tsx');
const reportButton = read('components/shared/ReportButton.tsx');
const adminExportButton = read('components/admin/AdminExportButton.tsx');
const createCategoryButton = read('components/admin/CreateCategoryButton.tsx');
const editCategoryButton = read('components/admin/EditCategoryButton.tsx');
const createEntityCategoryDialog = read('components/admin/CreateEntityCategoryDialog.tsx');
const editEntityCategoryDialog = read('components/admin/EditEntityCategoryDialog.tsx');
const broadcastNotificationButton = read('components/admin/BroadcastNotificationButton.tsx');
const pushNotificationToggle = read('components/pwa/PushNotificationToggle.tsx');
const offlineHub = read('components/offline/OfflineHub.tsx');
const authLoadingFiles = ['components/auth/LoginForm.tsx', 'components/auth/RegisterForm.tsx', 'components/auth/ForgotPasswordForm.tsx', 'components/auth/ResetPasswordForm.tsx', 'components/auth/CompleteProfileForm.tsx'];
const authLoadingSources = authLoadingFiles.map((file) => [file, read(file)]);

const checks = [
  ['Spinner is the shared indicator component', spinner.includes('function Spinner') && spinner.includes('motion-reduce:animate-none')],
  ['Spinner is decorative unless an accessible label is provided', spinner.includes("{ 'aria-hidden': true }") && spinner.includes("role: 'status'")],
  ['LoadingGate delegates timing to useDelayedLoading', gate.includes('useDelayedLoading(loading')],
  ['LoadingGate keeps the caller-provided content fallback', gate.includes('fallback: ReactNode') && gate.includes('{fallback}')],
  ['Page skeleton variants use the shared LoadingState and preserve specialized layouts', pageState.includes("import { LoadingState } from '@/components/shared/feedback/LoadingState'") && pageState.includes('variant === \'cards\'') && pageState.includes('announce={false}')],
  ['LoadingState is the shared accessible presentation layer for loading UI', sharedLoadingState.includes('export function LoadingState') && sharedLoadingState.includes("role: 'status'") && sharedLoadingState.includes("'aria-live': 'polite'") && sharedLoadingState.includes("'aria-busy': true")],
  ['RouteLoadingState delegates to the shared LoadingState', routeLoadingState.includes('LoadingState') && routeLoadingState.includes('variant=\"page\"')],
  ['LoadingSpinner is a compatibility facade over the shared LoadingState', loadingSpinner.includes('LoadingState') && !/import\s*\{\s*Spinner\s*\}/.test(loadingSpinner)],
  ['Session restoration uses the shared Spinner', session.includes("import { Spinner } from '@/components/ui/spinner'") && session.includes('<Spinner size="lg"') && !session.includes('animate-spin')],
  ['Pull-to-refresh uses the shared Spinner, not a Lucide loader', pullToRefresh.includes("import { Spinner } from '@/components/ui/spinner'") && pullToRefresh.includes('<Spinner') && !/import\s+\{[^}]*Loader(?:2|Circle)[^}]*\}\s+from\s+['"]lucide-react['"]/.test(pullToRefresh)],
  ['Update progress uses the shared Spinner', updatePage.includes('<Spinner size="xl"') && !/import\s+\{[^}]*Loader(?:2|Circle)[^}]*\}\s+from\s+['"]lucide-react['"]/.test(updatePage)],
  ['Loading conventions are documented', docs.includes('## القواعد') && docs.includes('LoadingGate') && docs.includes('PageLoadingState')],
  ['Audit command is registered', pkg.scripts?.['ux:loading-system-audit'] === 'node scripts/loading-system-audit.mjs'],
  ['Auth submit buttons use the shared loading prop', authLoadingSources.every(([, source]) => /<Button[\s\S]*?loading=\{(?:isPending|updateProfile\.isPending)\}[\s\S]*?loadingText=/.test(source))],
  ['Auth submit labels are stable children, not manual pending ternaries', authLoadingSources.every(([, source]) => !/\{(?:isPending|updateProfile\.isPending)\s*\?/.test(source))],
  ['Favorite actions show the shared Spinner while mutation is pending', favoriteButton.includes("import { Spinner } from '@/components/ui/spinner'") && (favoriteButton.match(/toggleFavorite\.isPending \? <Spinner size=\"xs\" \/>/g) ?? []).length === 2],
  ['Save-search submit uses shared Button loading state', /<Button onClick={handleSubmit} loading=\{createSavedSearch\.isPending\} loadingText=/.test(saveSearchButton) && !/createSavedSearch\.isPending \? 'جارٍ الحفظ/.test(saveSearchButton)],
  ['Service-request submit uses shared Button loading and preserves validation guard', /disabled=\{details\.trim\(\)\.length < MIN_DETAILS_LENGTH\}[\s\S]*?loading=\{createRequest\.isPending\}[\s\S]*?loadingText=/.test(serviceRequestButton)],
  ['Store upload and save actions use shared Button loading states', (myStoreCard.match(/loading=\{(?:uploadLogo|uploadCover|updateStore)\.isPending\}/g) ?? []).length === 3 && !/upload(?:Logo|Cover)\.isPending \? 'جارٍ الرفع/.test(myStoreCard)],
  ['Ad detail favorite and contact actions use shared Button loading states', /loading=\{toggleFavorite\.isPending\}/.test(adDetail) && /loading=\{startConversation\.isPending\}/.test(adDetail) && !/startConversation\.isPending \? 'جارٍ/.test(adDetail)],
  ['Seller profile save and verification actions use shared Button loading states', (sellerProfile.match(/loading=\{(?:updateProfile|requestVerification)\.isPending\}/g) ?? []).length === 4 && !/\{(?:updateProfile|requestVerification)\.isPending \? 'جارٍ/.test(sellerProfile)],
  ['Seller and service-provider registration use shared Button loading states', /loading=\{createProfile\.isPending\}/.test(becomeSeller) && /loading=\{createProvider\.isPending\}/.test(becomeProvider) && !/create(?:Profile|Provider)\.isPending \? 'جارٍ/.test(becomeSeller + becomeProvider)],
  ['Provider contact action uses shared Button loading state', /loading=\{startConversation\.isPending\}/.test(providerContact) && !/startConversation\.isPending \? 'جاري الفتح/.test(providerContact)],
  ['Notification bulk actions use shared Button loading states', /loading=\{markAllRead\.isPending\}/.test(notificationsPage) && /loading=\{deleteAllRead\.isPending\}/.test(notificationsPage) && !/markAllRead\.isPending \? \(/.test(notificationsPage)],
  ['Sales cost save uses shared icon-button loading state', /loading=\{updateCost\.isPending\}/.test(salesCost) && !/updateCost\.isPending \?/.test(salesCost)],
  ['Return-sale action uses shared Button loading state', /loading=\{mutation\.isPending\}/.test(returnSale) && /loadingText=\"جارٍ الحفظ…\"/.test(returnSale) && !/mutation\.isPending\s*\?/.test(returnSale)],
  ['Add-sale submit uses shared Button loading while preserving validation', /loading=\{create\.isPending\}/.test(addSale) && /!entityTitle\.trim\(\)/.test(addSale) && !/create\.isPending\s*\?/.test(addSale)],
  ['POS submit uses shared Button loading while preserving sale guards', /loading=\{create\.isPending\}/.test(posDialog) && /stockIssues\.length > 0/.test(posDialog) && !/create\.isPending\s*\?/.test(posDialog)],
  ['Profile save and avatar upload use shared Button loading', /loading=\{updateProfile\.isPending\}/.test(profileSettings) && /loading=\{uploadAvatar\.isPending\}/.test(profileSettings) && !/updateProfile\.isPending \?/.test(profileSettings)],
  ['Password change uses shared Button loading', /loading=\{changePassword\.isPending\}/.test(securitySettings) && !/changePassword\.isPending \?/.test(securitySettings)],
  ['Account deletion uses shared destructive Button loading', /loading=\{deleteAccount\.isPending\}/.test(deleteAccount) && /confirmText !== CONFIRM_WORD/.test(deleteAccount) && !/deleteAccount\.isPending \?/.test(deleteAccount)],
  ['Email verification resend uses shared Button loading', /loading=\{resend\.isPending\}/.test(emailVerification) && !/resend\.isPending \?/.test(emailVerification)],
  ['Service review submit uses shared Button loading', /loading=\{createReview\.isPending\}/.test(serviceReview) && !/createReview\.isPending \?/.test(serviceReview)],
  ['Appointment confirmation uses shared Button loading and keeps date guard', /loading=\{createAppointment\.isPending\}/.test(appointmentDialog) && /disabled=\{!selectedRange\}/.test(appointmentDialog) && !/createAppointment\.isPending \?/.test(appointmentDialog)],
  ['Service listing form uses shared Button loading with form validation', /loading=\{isPending\}/.test(serviceListingForm) && /disabled=\{isFormIncomplete\}/.test(serviceListingForm) && !/isPending \? 'جارٍ الحفظ/.test(serviceListingForm)],
  ['Request offer submit uses shared Button loading and price guard', /loading=\{submit\.isPending\}/.test(requestOfferForm) && /Number\(price\) <= 0/.test(requestOfferForm) && !/submit\.isPending \?/.test(requestOfferForm)],
  ['Create-request submit uses shared Button loading and title/category guards', /loading=\{create\.isPending\}/.test(createRequestForm) && /title\.trim\(\)\.length < 5/.test(createRequestForm) && /!categoryId/.test(createRequestForm) && !/create\.isPending \? 'جاري النشر/.test(createRequestForm)],
  ['Ad form uses shared Button loading while preserving image-operation pending state', /loading=\{isPending\}/.test(adForm) && /addImages\.isPending/.test(adForm) && /disabled=\{isFormIncomplete\}/.test(adForm)],
  ['Store-owner creation uses shared Button loading and form guard', /loading=\{createStore\.isPending\}/.test(becomeStoreOwner) && /disabled=\{isFormIncomplete\}/.test(becomeStoreOwner) && !/createStore\.isPending \?/.test(becomeStoreOwner)],
  ['Collection save uses shared Button loading and validation', /loading=\{mutation\.isPending\}/.test(collectionForm) && /disabled=\{isFormIncomplete\}/.test(collectionForm) && !/mutation\.isPending \?/.test(collectionForm)],
  ['Store review submit uses shared Button loading and score guard', /loading=\{createReview\.isPending\}/.test(storeReview) && /disabled=\{score < 1\}/.test(storeReview) && !/createReview\.isPending \?/.test(storeReview)],
  ['Product form uses shared Button loading while preserving image-operation pending state', /loading=\{isPending\}/.test(productForm) && /reorderImages\.isPending/.test(productForm) && /disabled=\{isFormIncomplete\}/.test(productForm)],
  ['Promotion creation uses shared Button loading and form guard', /loading=\{create\.isPending\}/.test(promotionForm) && /disabled=\{isFormIncomplete\}/.test(promotionForm) && !/create\.isPending \?/.test(promotionForm)],
  ['Report submit uses shared destructive Button loading', /loading=\{mutation\.isPending\}/.test(reportButton) && !/mutation\.isPending \? 'جارٍ الإرسال/.test(reportButton)],
  ['Admin export uses shared Button loading while preserving its label', /loading=\{pending\}/.test(adminExportButton) && /loadingText="جارٍ التصدير…"/.test(adminExportButton) && !/pending \? 'جارٍ التصدير/.test(adminExportButton)],
  ['Create and edit category dialogs use shared Button loading', /loading=\{createCategory\.isPending\}/.test(createCategoryButton) && /loading=\{updateCategory\.isPending\}/.test(editCategoryButton) && /loading=\{createCategory\.isPending\}/.test(createEntityCategoryDialog) && /loading=\{updateCategory\.isPending\}/.test(editEntityCategoryDialog)],
  ['Admin category forms no longer switch button text manually', !/createCategory\.isPending \? 'جارٍ الإنشاء/.test(createCategoryButton + createEntityCategoryDialog) && !/updateCategory\.isPending \? 'جارٍ الحفظ/.test(editCategoryButton + editEntityCategoryDialog)],
  ['Broadcast submit uses shared Button loading and preserves confirm flow', /loading=\{broadcast\.isPending\}/.test(broadcastNotificationButton) && /isPending=\{broadcast\.isPending\}/.test(broadcastNotificationButton) && !/broadcast\.isPending \? 'جارٍ الإرسال/.test(broadcastNotificationButton)],
  ['Push test notification uses shared Button loading', /loading=\{testing\}/.test(pushNotificationToggle) && /loadingText="جارٍ الإرسال…"/.test(pushNotificationToggle) && !/testing \? 'جارٍ الإرسال/.test(pushNotificationToggle)],
  ['Offline queue retry uses shared Button loading', /loading=\{retrying\}/.test(offlineHub) && /loadingText="جاري الإرسال…"/.test(offlineHub) && !/retrying \? 'جاري الإرسال/.test(offlineHub)],
];

for (const [name, ok] of checks) console.log(`[loading-system] ${ok ? 'PASS' : 'FAIL'} ${name}`);
if (checks.some(([, ok]) => !ok)) process.exit(1);

const sourceFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '__tests__' || entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(tsx?|jsx?)$/.test(entry.name)) sourceFiles.push(full);
  }
}
walk(frontendRoot);
const directLoaderImports = [];
const rawSpinFiles = [];
const pulseFiles = [];
for (const file of sourceFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const relative = path.relative(frontendRoot, file).split(path.sep).join('/');
  if (/import\s+\{[^}]*\bLoader(?:2|Circle)\b[^}]*\}\s+from\s+['"]lucide-react['"]/.test(content)) directLoaderImports.push(relative);
  if (/animate-spin/.test(content) && relative !== 'components/ui/spinner.tsx') rawSpinFiles.push(relative);
  if (/animate-pulse/.test(content)) pulseFiles.push(relative);
}
const allowedActionIconSpin = new Set([
  'app/(protected)/stories/page.tsx',
  'components/admin/AdminMonitoringCenter.tsx',
  'components/messages/MessageQueuedActions.tsx',
  'components/settings/DraftsCenterClient.tsx',
  'components/settings/StorageManagementClient.tsx',
  'components/settings/SyncCenterClient.tsx',
]);
const unexpectedSpin = rawSpinFiles.filter((file) => !allowedActionIconSpin.has(file));
const missingExpectedSpin = [...allowedActionIconSpin].filter((file) => !rawSpinFiles.includes(file));
const noDirectLoaderImports = directLoaderImports.length === 0;
console.log(`[loading-system] ${noDirectLoaderImports ? 'PASS' : 'FAIL'} no direct Loader2/LoaderCircle imports${directLoaderImports.length ? `: ${directLoaderImports.join(', ')}` : ''}`);
console.log(`[loading-system] ${unexpectedSpin.length === 0 ? 'PASS' : 'FAIL'} raw spin animations are limited to intentional refresh/retry action icons${unexpectedSpin.length ? `: ${unexpectedSpin.join(', ')}` : ''}`);
console.log(`[loading-system] ${missingExpectedSpin.length === 0 ? 'PASS' : 'FAIL'} intentional action-icon spin allowlist is current${missingExpectedSpin.length ? `; no longer present: ${missingExpectedSpin.join(', ')}` : ''}`);
if (!noDirectLoaderImports || unexpectedSpin.length || missingExpectedSpin.length) process.exit(1);
console.log(`[loading-system] INFO source files scanned: ${sourceFiles.length}`);
console.log(`[loading-system] INFO files with animate-spin in action icons: ${rawSpinFiles.length}`);
console.log(`[loading-system] INFO files with animate-pulse (mostly skeletons; requires contextual review): ${pulseFiles.length}`);
console.log(`[loading-system] PASS ${checks.length + 3} checks`);
