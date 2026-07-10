import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api/nvidia-chat': {
        target: 'https://integrate.api.nvidia.com',
        changeOrigin: true,
        rewrite: () => '/v1/chat/completions'
      },
      '/api/step-plan-chat': {
        target: 'https://api.stepfun.com',
        changeOrigin: true,
        rewrite: () => '/v1/chat/completions'
      },
      '/api/tavily-search': {
        target: 'https://api.tavily.com',
        changeOrigin: true,
        rewrite: () => '/search'
      }
    }
  },
  preview: {
    host: '0.0.0.0'
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/src/app/runtime/legacy-core/council-runtime-texts.js')) return 'legacy-council-texts';
          if (id.includes('/src/app/runtime/legacy-core/submit-input-council-lifecycle.js')) return 'legacy-submit-input';
          if (id.includes('/src/app/runtime/legacy-core/model-registry.js')) return 'legacy-model-registry';
          if (!id.includes('node_modules')) {
            return undefined;
          }
          if (id.includes('chart.js')) return 'vendor-chart';
          if (id.includes('katex')) return 'vendor-katex';
          if (id.includes('cropperjs')) return 'vendor-cropper';
          if (id.includes('peerjs') || id.includes('html5-qrcode') || id.includes('qrcode')) {
            return 'vendor-sharing';
          }
          if (id.includes('marked') || id.includes('dompurify')) return 'vendor-markdown';
          return 'vendor';
        }
      }
    }
  }
});
