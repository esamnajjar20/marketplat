// apps/mobile/metro.config.js
// يقلل عدد الملفات التي يراقبها Metro لتجنب ENOSPC على Termux/Android.
const { getDefaultConfig } = require('expo/metro-config');
const exclusionList = require('metro-config/src/defaults/exclusionList');

const config = getDefaultConfig(__dirname);

config.resolver.blockList = exclusionList([
  /node_modules\/.*\/node_modules\/.*/,
  /.*\/node_modules\/.*\.(md|map|txt)$/,
  /.*\/\.expo\/.*/,
]);

config.watchFolders = [__dirname];

module.exports = config;
