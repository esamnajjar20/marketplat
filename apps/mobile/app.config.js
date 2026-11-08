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
const sentryUrl = process.env.SENTRY_URL?.trim();

const sentryPluginIndex = plugins.findIndex((plugin) => {
  const name = Array.isArray(plugin) ? plugin[0] : plugin;
  return name === '@sentry/react-native' || name === '@sentry/react-native/expo';
});

const sentryPluginOptions = sentryPluginIndex >= 0 && Array.isArray(plugins[sentryPluginIndex])
  ? { ...plugins[sentryPluginIndex][1] }
  : {};

if (sentryOrg) sentryPluginOptions.organization = sentryOrg;
if (sentryProject) sentryPluginOptions.project = sentryProject;
if (sentryUrl) sentryPluginOptions.url = sentryUrl;
if (!sentryPluginOptions.url) sentryPluginOptions.url = 'https://sentry.io/';

// Register the plugin for Debug and Release builds.
// Authentication tokens must remain environment secrets, never config values.
const sentryPlugin = ['@sentry/react-native', sentryPluginOptions];

if (sentryPluginIndex >= 0) {
  plugins[sentryPluginIndex] = sentryPlugin;
} else {
  plugins.push(sentryPlugin);
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
