const fs = require('node:fs');
const path = require('node:path');
const appJson = require('./app.json');
const expo = { ...appJson.expo };
const plugins = [...(expo.plugins || [])];

if (!plugins.some((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === 'expo-notifications')) {
  plugins.push(['expo-notifications', { defaultChannel: 'default' }]);
}
const sentryOrg = process.env.SENTRY_ORG?.trim();
const sentryProject = process.env.SENTRY_PROJECT?.trim();
const sentryPluginConfigured = plugins.some((plugin) => (Array.isArray(plugin) ? plugin[0] : plugin) === '@sentry/react-native/expo');
// Runtime crash capture works with the SDK/DSN. Source-map and native-symbol
// upload configuration is added only when real project identifiers exist.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN?.trim();
if (!sentryPluginConfigured && sentryOrg && sentryProject && sentryAuthToken) {
  plugins.push(['@sentry/react-native/expo', {
    url: process.env.SENTRY_URL?.trim() || 'https://sentry.io/',
    organization: sentryOrg,
    project: sentryProject,
  }]);
}
expo.plugins = plugins;

const DEFAULT_WEB_ORIGIN = 'https://marketplat.esamnajjar6.workers.dev';
let appLinkHost = 'marketplat.esamnajjar6.workers.dev';
try {
  const webUrl = new URL(process.env.EXPO_PUBLIC_WEB_URL?.trim() || DEFAULT_WEB_ORIGIN);
  if (webUrl.protocol === 'https:' && !webUrl.username && !webUrl.password) appLinkHost = webUrl.host;
} catch {
  // Keep the known production domain when a malformed environment value is supplied.
}
expo.android = {
  ...expo.android,
  intentFilters: [
    ...(expo.android?.intentFilters || []).filter((filter) => !filter.data?.some((entry) => entry.scheme === 'https' && entry.host === appLinkHost)),
    {
      action: 'VIEW',
      autoVerify: true,
      data: [{ scheme: 'https', host: appLinkHost }],
      category: ['BROWSABLE', 'DEFAULT'],
    },
  ],
};
expo.ios = {
  ...expo.ios,
  associatedDomains: [...new Set([...(expo.ios?.associatedDomains || []), `applinks:${appLinkHost}`])],
};

const androidGoogleServices = path.join(__dirname, 'google-services.json');
if (fs.existsSync(androidGoogleServices)) {
  expo.android = { ...expo.android, googleServicesFile: './google-services.json' };
}

const iosGoogleServices = path.join(__dirname, 'GoogleService-Info.plist');
if (fs.existsSync(iosGoogleServices)) {
  expo.ios = { ...expo.ios, googleServicesFile: './GoogleService-Info.plist' };
}

module.exports = { ...appJson, expo };
