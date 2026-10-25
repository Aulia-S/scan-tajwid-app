const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Bundle the prebuilt Quran database (assets/db/quran.db) as an asset.
config.resolver.assetExts.push('db');

module.exports = withNativeWind(config, { input: './src/global.css', inlineRem: 16 });
