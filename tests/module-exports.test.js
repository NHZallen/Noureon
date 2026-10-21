import assert from 'node:assert/strict';
import test from 'node:test';

// The modules the legacy core and its shells are made from export what the core builds them with (each was split out of the core; the
// structure tests checked it until NOU-74). Importing a module also checks that it loads outside the page.

const EXPORTS = {
  'src/templates/app-shell.js': [
    'default'
  ],
  'src/app/runtime/reply/stream-api-call.js': [
    'createStreamApiCall'
  ],
  'src/app/runtime/reply/provider-request-support.js': [
    'createProviderRequestSupport'
  ],
  'src/app/runtime/council/council-response-lifecycle.js': [
    'createCouncilResponseLifecycle'
  ],
  'src/app/runtime/features/settings-mobile-metadata.js': [
    'getSettingsMobileGroups'
  ],
  'src/app/runtime/reply/search-text-formatting.js': [
    'highlightText'
  ],
  'src/app/runtime/messages/message-type-icon.js': [
    'getMessageTypeIcon'
  ],
  'src/app/runtime/messages/date-formatting.js': [
    'formatFullTimestamp'
  ],
  'src/app/runtime/features/time-distribution-chart-data.js': [
    'buildTimeDistributionChartData'
  ],
  'src/app/runtime/features/mobile-context-menu-markup.js': [
    'buildAstraMobileContextMenuMarkup',
    'buildConversationMobileContextMenuMarkup',
    'buildFolderMobileContextMenuMarkup'
  ],
  'src/app/runtime/reply/streaming-markdown-render-state.js': [
    'createStreamingMarkdownRenderState'
  ],
  'src/app/runtime/reply/streaming-markdown-renderer.js': [
    'createStreamingMarkdownFeature'
  ],
  'src/app/runtime/reply/single-model-response-lifecycle.js': [
    'createSingleModelResponseLifecycle'
  ],
  'src/app/runtime/reply/response-progress-renderers.js': [
    'createResponseProgressRenderers'
  ],
  'src/app/runtime/features/submit-input-preparation-lifecycle.js': [
    'createSubmitInputPreparationLifecycle'
  ],
  'src/app/runtime/features/model-switcher-lifecycle.js': [
    'createModelSwitcherLifecycle',
    'prepareModelSwitcherModels'
  ],
  'src/app/runtime/council/council-controls-lifecycle.js': [
    'createCouncilControlsLifecycle'
  ],
  'src/app/runtime/reply/assistant-response-finalization.js': [
    'finalizeAssistantResponse',
    'persistAssistantResponseError'
  ],
  'src/app/runtime/reply/submit-final-cleanup-lifecycle.js': [
    'runSubmitFinalCleanupLifecycle'
  ],
  'src/app/runtime/reply/model-message-post-response-actions.js': [
    'applyModelMessagePostResponseActions'
  ],
  'src/app/runtime/messages/message-markup-renderer.js': [
    'buildMessageRenderView'
  ],
  'src/app/runtime/messages/message-list-lifecycle.js': [
    'createMessageListLifecycle'
  ],
  'src/app/runtime/messages/media-attachment-renderer.js': [
    'createMediaAttachmentRenderer'
  ],
  'src/app/runtime/messages/media-preview-lifecycle.js': [
    'createMediaPreviewLifecycle'
  ],
  'src/app/runtime/messages/conversation-view-renderer.js': [
    'createConversationViewRenderer'
  ],
  'src/app/runtime/features/uploaded-file-preview-lifecycle.js': [
    'createUploadedFilePreviewLifecycle'
  ],
  'src/app/runtime/council/council-response-render-lifecycle.js': [
    'runCouncilResponseRenderLifecycle'
  ],
  'src/app/runtime/reply/streaming-text-frame-queue.js': [
    'createStreamingTextFrameQueue'
  ],
  'src/app/runtime/features/typewriter-playback-controller.js': [
    'createTypewriterPlaybackController'
  ],
  'src/app/runtime/reply/renderer-gradual-append-controller.js': [
    'appendRendererTextGradually'
  ],
  'src/app/runtime/features/version-compare.js': [
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
