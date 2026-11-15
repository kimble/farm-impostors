import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the built game works wherever it is served from:
  // GitHub Pages puts it under /farm-impostors/ rather than at the root.
  base: './',
});
