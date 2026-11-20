import { defineConfig } from 'wxt';
import preact from '@preact/preset-vite';

export default defineConfig({
  srcDir: 'src',
  vite: () => ({
    plugins: [preact()],
  }),
  manifest: {
    name: 'eigo — local English vocabulary helper',
    short_name: 'eigo',
    description:
      'Underlines unknown English words, shows known-word coverage, and reviews saved words with FSRS. Fully local.',
    permissions: ['storage'],
    host_permissions: ['<all_urls>'],
  },
});
