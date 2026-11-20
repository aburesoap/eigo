import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

export default defineConfig({
  srcDir: 'src',
  // Manifest V3 for both Chrome and Firefox.
  manifestVersion: 3,
  vite: () => ({
    plugins: [preact()],
  }),
  hooks: {
    // Ship the license files inside the extension package.
    'build:publicAssets': (_wxt, files) => {
      files.push({ absoluteSrc: resolve('LICENSE'), relativeDest: 'LICENSE.txt' });
      files.push({ absoluteSrc: resolve('THIRD_PARTY_LICENSES.md'), relativeDest: 'THIRD_PARTY_LICENSES.md' });
    },
  },
  manifest: ({ browser }) => ({
    name: 'eigo — local English vocabulary helper',
    short_name: 'eigo',
    description:
      'Underlines unknown English words, shows known-word coverage, and reviews saved words with FSRS. Fully local.',
    permissions: ['storage'],
    host_permissions: ['<all_urls>'],
    ...(browser === 'firefox' && {
      browser_specific_settings: {
        gecko: {
          id: 'eigo@eigo.local',
          strict_min_version: '140.0', // CSS Custom Highlight API
          // No data is collected or transmitted.
          data_collection_permissions: { required: ['none'] },
        },
      },
    }),
  }),
});
