import { defineConfig } from 'vite';

// The Python sandbox (public/sandbox/) gets the same enforced CSP as on
// run.noureon.com (vercel.json), except that in development it is framed by
// the app on the other local host name (localhost ↔ 127.0.0.1).
const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';
export const SANDBOX_DEV_CSP = `default-src 'none'; script-src 'self' 'wasm-unsafe-eval' ${PYODIDE_CDN}; connect-src 'self' ${PYODIDE_CDN}; worker-src 'self'; frame-ancestors http://localhost:* http://127.0.0.1:*; base-uri 'none'; form-action 'none'`;

const sandboxHeaders = (request, response, next) => {
  if (request.url?.startsWith('/sandbox/')) {
    response.setHeader('Content-Security-Policy', SANDBOX_DEV_CSP);
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
  }
  next();
};

export default defineConfig({
  plugins: [{
    name: 'noureon-sandbox-headers',
    configureServer: (server) => { server.middlewares.use(sandboxHeaders); },
    configurePreviewServer: (server) => { server.middlewares.use(sandboxHeaders); }
  }],
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
        rewrite: () => '/step_plan/v1/chat/completions'
      },
      '/api/step-plan-images': {
        target: 'https://api.stepfun.com',
        changeOrigin: true,
        rewrite: (path) => path.includes('operation=edits')
          ? '/step_plan/v1/images/edits'
          : '/step_plan/v1/images/generations'
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
    manifest: 'build-manifest.json',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/src/app/runtime/legacy-core/council-runtime-texts.js')) return 'legacy-council-texts';
          if (id.includes('/src/app/runtime/legacy-core/submit-input-council-lifecycle.js')) return 'legacy-submit-input';
          if (id.includes('/src/app/runtime/legacy-core/model-registry.js')) return 'legacy-model-registry';
          // Memory is loaded after the application shell and has its own lifecycle.
          // Keep it out of the legacy shell chunk so adding memory capabilities does
          // not make first-load chat startup heavier.
          if (id.includes('/src/app/runtime/memory/')) return 'runtime-memory';
          // File cards are rendered synchronously with Markdown, so their small
          // eager core ships in its own chunk instead of growing the legacy
          // shell. Generators, the design system, the preview dialog and the
          // authoring guidance stay dynamic imports and must not be pulled
          // into this chunk.
          if (
            id.includes('/src/app/ui/files/')
            && !id.includes('/src/app/ui/files/generators/')
            && !id.includes('/src/app/ui/files/previews/')
            && !id.includes('/src/app/ui/files/design/')
            && !id.includes('/src/app/ui/files/vision/')
            && !id.includes('/src/app/ui/files/file-preview-dialog.js')
            && !id.includes('/src/app/ui/files/file-authoring-guidance.js')
          ) {
            return 'runtime-files';
          }
          if (id.includes('/src/app/legacy-runtime/features/message-list-lifecycle.js')) return 'legacy-message-list';
          if (!id.includes('node_modules')) {
            return undefined;
          }
          if (id.includes('@supabase')) return undefined;
          if (id.includes('chart.js')) return 'vendor-chart';
          if (id.includes('katex')) return 'vendor-katex';
          if (id.includes('cropperjs')) return 'vendor-cropper';
          if (id.includes('peerjs') || id.includes('html5-qrcode') || id.includes('qrcode')) {
            return 'vendor-sharing';
          }
          if (id.includes('jszip')) return 'vendor-archive';
          // The Word page preview is loaded only when a preview is opened.
          if (id.includes('/node_modules/docx-preview/')) return 'vendor-docx-preview';
          // Word generation is loaded only when a .docx file is downloaded.
          // Its small transitive dependencies must stay with it, or the
          // catch-all vendor chunk would pull them into startup.
          if (/\/node_modules\/(?:docx|xml|xml-js|sax|nanoid|hash\.js|inherits|minimalistic-assert)\//.test(id)) return 'vendor-docx';
          // PowerPoint generation is loaded only when a .pptx file is made.
          if (id.includes('/node_modules/pptxgenjs/')) return 'vendor-pptx';
          // Excel generation is loaded only when a .xlsx file is made.
          if (/\/node_modules\/(?:write-excel-file|fflate)\//.test(id)) return 'vendor-xlsx';
          // PDF generation (pdfmake bundles PDFKit and fontkit) and the PDF
          // preview (PDF.js) load only when a .pdf file is made or previewed.
          if (id.includes('/node_modules/pdfmake/')) return 'vendor-pdf';
          if (id.includes('/node_modules/pdfjs-dist/')) return 'vendor-pdf-preview';
          // Syntax colouring, loaded the first time a code block is shown.
          if (id.includes('/node_modules/highlight.js/')) return 'vendor-highlight';
          // Formula typesetting for PDFs, loaded for documents with formulas.
          if (/\/node_modules\/(?:mathjax-full|mhchemparser|mj-context-menu|speech-rule-engine)\//.test(id)) return 'vendor-pdf-math';
          if (id.includes('marked') || id.includes('dompurify')) return 'vendor-markdown';
          return 'vendor';
        }
      }
    }
  }
});
