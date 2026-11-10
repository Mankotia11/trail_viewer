const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes('kml')) {
  config.resolver.assetExts.push('kml');
}

module.exports = config;
