const expoConfig = require('eslint-config-expo/flat');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      'dist/**',
      'dist-verify/**',
      '.expo/**',
      'coverage/**',
      'android/**/build/**',
      'modules/**/build/**',
    ],
  },
]);
