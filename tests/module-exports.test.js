import assert from 'node:assert/strict';
import test from 'node:test';

// The modules the legacy core and its shells are made from export what the core builds them with (each was split out of the core; the
// structure tests checked it until NOU-74). Importing a module also checks that it loads outside the page.

const EXPORTS = {
  'src/templates/app-shell.js': [
    'default'
  ],
  'src/app/legacy-runtime/features/stream-api-call.js': [
    'createStreamApiCall'
  ],
  'src/app/legacy-runtime/features/provider-request-support.js': [
    'createProviderRequestSupport'
  ],
  'src/app/legacy-runtime/features/council-response-lifecycle.js': [
    'createCouncilResponseLifecycle'
  ],
  'src/app/legacy-runtime/features/settings-mobile-metadata.js': [
    'getSettingsMobileGroups'
  ],
  'src/app/legacy-runtime/features/search-text-formatting.js': [
    'highlightText'
  ],
  'src/app/legacy-runtime/features/message-type-icon.js': [
    'getMessageTypeIcon'
  ],
  'src/app/legacy-runtime/features/date-formatting.js': [
    'formatFullTimestamp'
  ],
  'src/app/legacy-runtime/features/time-distribution-chart-data.js': [
    'buildTimeDistributionChartData'
  ],
  'src/app/legacy-runtime/features/mobile-context-menu-markup.js': [
    'buildAstraMobileContextMenuMarkup',
    'buildConversationMobileContextMenuMarkup',
    'buildFolderMobileContextMenuMarkup'
  ],
  'src/app/legacy-runtime/features/streaming-markdown-render-state.js': [
    'createStreamingMarkdownRenderState'
  ],
  'src/app/legacy-runtime/features/streaming-markdown-renderer.js': [
    'createStreamingMarkdownFeature'
  ],
  'src/app/legacy-runtime/features/single-model-response-lifecycle.js': [
    'createSingleModelResponseLifecycle'
  ],
  'src/app/legacy-runtime/runtime/legacy-runtime-context.js': [
    'createLegacyRuntimeContext'
  ],
  'src/app/legacy-runtime/features/response-progress-renderers.js': [
    'createResponseProgressRenderers'
  ],
  'src/app/legacy-runtime/features/submit-input-preparation-lifecycle.js': [
    'createSubmitInputPreparationLifecycle'
  ],
  'src/app/legacy-runtime/features/model-switcher-lifecycle.js': [
    'createModelSwitcherLifecycle',
    'prepareModelSwitcherModels'
  ],
  'src/app/legacy-runtime/features/council-controls-lifecycle.js': [
    'createCouncilControlsLifecycle'
  ],
  'src/app/legacy-runtime/features/assistant-response-finalization.js': [
    'finalizeAssistantResponse',
    'persistAssistantResponseError'
  ],
  'src/app/legacy-runtime/features/submit-final-cleanup-lifecycle.js': [
    'runSubmitFinalCleanupLifecycle'
  ],
  'src/app/legacy-runtime/features/model-message-post-response-actions.js': [
    'applyModelMessagePostResponseActions'
  ],
  'src/app/legacy-runtime/features/message-markup-renderer.js': [
    'buildMessageRenderView'
  ],
  'src/app/legacy-runtime/features/message-list-lifecycle.js': [
    'createMessageListLifecycle'
  ],
  'src/app/legacy-runtime/features/media-attachment-renderer.js': [
    'createMediaAttachmentRenderer'
  ],
  'src/app/legacy-runtime/features/media-preview-lifecycle.js': [
    'createMediaPreviewLifecycle'
  ],
  'src/app/legacy-runtime/features/conversation-view-renderer.js': [
    'createConversationViewRenderer'
  ],
  'src/app/legacy-runtime/features/uploaded-file-preview-lifecycle.js': [
    'createUploadedFilePreviewLifecycle'
  ],
  'src/app/legacy-runtime/features/council-response-render-lifecycle.js': [
    'runCouncilResponseRenderLifecycle'
  ],
  'src/app/legacy-runtime/features/streaming-text-frame-queue.js': [
    'createStreamingTextFrameQueue'
  ],
  'src/app/legacy-runtime/features/typewriter-playback-controller.js': [
    'createTypewriterPlaybackController'
  ],
  'src/app/legacy-runtime/features/renderer-gradual-append-controller.js': [
    'appendRendererTextGradually'
  ],
  'src/app/legacy-runtime/features/version-compare.js': [
    'compareVersions'
  ]
};

for (const [path, names] of Object.entries(EXPORTS)) {
  test(`${path} exports ${names.join(', ')}`, async () => {
    const module = await import(new URL(`../${path}`, import.meta.url));
    for (const name of names) {
      if (name === 'default') assert.notEqual(module.default, undefined, `${path} has a default export`);
      else assert.equal(typeof module[name], 'function', `${path} exports the function ${name}`);
    }
  });
}
