import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// User site (zelinzhu-richard.github.io) — served from the domain root.
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          vendor: ['react', 'react-dom', 'gsap'],
        },
      },
    },
  },
});
