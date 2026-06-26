import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const legacyRuntimeModuleId = 'virtual:legacy-app-runtime';
const resolvedLegacyRuntimeModuleId = `\0${legacyRuntimeModuleId}`;
const legacyCoreFragmentNames = new Set([
  '00-runtime.fragment.js'
]);

function legacyRuntimeFragmentsPlugin() {
  const fragmentsDir = resolve(projectRoot, 'src/app/legacy-runtime/fragments');

  return {
    name: 'astra-legacy-runtime-fragments',
    resolveId(id) {
      if (id === legacyRuntimeModuleId) {
        return resolvedLegacyRuntimeModuleId;
      }
      return null;
    },
    load(id) {
      if (id !== resolvedLegacyRuntimeModuleId) {
        return null;
      }

      const fragmentPaths = readdirSync(fragmentsDir)
        .filter((file) => legacyCoreFragmentNames.has(file))
        .sort()
        .map((file) => resolve(fragmentsDir, file));

      fragmentPaths.forEach((file) => this.addWatchFile(file));

      const legacyRuntimeSource = fragmentPaths
        .map((file) => readFileSync(file, 'utf8'))
        .join('\n');

      return `${legacyRuntimeSource}\nexport { legacyRuntimeContext };\n`;
    }
  };
}

export default defineConfig({
  plugins: [legacyRuntimeFragmentsPlugin()],
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
