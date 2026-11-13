// apps/mobile/metro.config.js
// pnpm monorepo: الحزم تُحلّ من جذر المستودع (node-linker=hoisted في .npmrc).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// نُبقي watchFolders على جذر المستودع لأن Metro يحتاج رؤية
// /workspaces/marketplat/node_modules لحل expo-router/entry.
config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// metro-config في Metro 0.83+ لم يعد يصدّر exclusionList علناً.
const EXCLUSIONS = [
  /node_modules\/.*\/node_modules\/.*/,
  /.*\/node_modules\/.*\.(md|map|txt)$/,
  /.*\/\.expo\/.*/,
];
config.resolver.blockList = new RegExp(
  `(${EXCLUSIONS.map((re) => re.source).join('|')})$`,
);

module.exports = config;
