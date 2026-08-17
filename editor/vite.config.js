import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset URLs. The default is absolute (`/assets/…`), which 404s the
  // moment the app is served from anywhere but the domain root — and it lives
  // at /knot-and-link-editor/ on the live site. Relative also means the built
  // folder can be opened straight off disk.
  base: './',
});
