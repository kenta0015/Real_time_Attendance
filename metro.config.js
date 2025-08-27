// metro.config.js
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { resolve } = require('metro-resolver');

const config = getDefaultConfig(__dirname);

// ws 配下のどのサブパスでも empty.js に差し替える
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'ws' || moduleName.startsWith('ws/')) {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'shims/empty.js'),
    };
  }
  // 念のため Node コア系も空シム
  if (
    moduleName === 'events' ||
    moduleName === 'stream' ||
    moduleName === 'buffer' ||
    moduleName === 'util'
  ) {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'shims/empty.js'),
    };
  }
  return resolve(context, moduleName, platform);
};

// CJS/MJS を解決対象に追加
config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  'cjs',
  'mjs',
];

module.exports = config;
