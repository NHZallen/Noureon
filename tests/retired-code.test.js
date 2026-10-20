import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Code that was moved out of the legacy core and its shells while they were split up (2026-06 to 2026-10, tests/structure-regressions.test.js
// until NOU-74) must not come back to where it was: a helper defined again in the core, a store's state kept again in a local mirror, a call
// that now goes through a lifecycle made again by hand. Each file lists what may no longer appear in it, grouped by the step that moved it.
// These checks only forbid; moving code elsewhere, splitting a file or renaming never breaks them. Generated from the old structure tests by
// recording each of their `doesNotMatch` checks against the file it read (a check made on part of a file is kept for the whole file when the
// pattern is nowhere in it).

const RETIRED = {
  'src/app/legacy-app.js': {
    "production runtime entry composes the explicit legacy dependency facade": [
      /virtual:legacy-app-runtime/
    ],
  },
  'src/app/legacy-runtime/features/assistant-response-finalization.js': {
    "assistant response finalization is isolated from the 01 runtime submit flow": [
      /sendConversationToMail|conversation-mail|google-form-submit/,
      /fetch\s*\(/,
      /TextDecoder\b|response\.body|streamApiCall\b/,
      /indexedDB|localStorage|sessionStorage/,
      /virtual:legacy-app-runtime|vite\.config|package\.json/
    ],
  },
  'src/app/legacy-runtime/features/council-controls-lifecycle.js': {
    "council controls lifecycle is isolated from the 01 runtime shell": [
      /\belements\b/,
      /elements\.fileInputContainer/,
      /TextDecoder|response\.body|streamApiCall/,
      /indexedDB|localStorage|sessionStorage/,
      /virtual:legacy-app-runtime|vite\.config|package\.json|REFACTOR_PLAN/
    ],
  },
  'src/app/legacy-runtime/features/council-response-lifecycle.js': {
    "council response lifecycle core is isolated from the 02 runtime fragment": [
      /document\.|window\.|indexedDB|localStorage|sessionStorage/,
      /TextDecoder\b|response\.body\.getReader\(\)|virtual:legacy-app-runtime|vite\.config|package\.json/
    ],
  },
  'src/app/legacy-runtime/features/council-response-render-lifecycle.js': {
    "council response render lifecycle is isolated from the 01 runtime submit flow": [
      /fetch\s*\(/,
      /TextDecoder\b|response\.body|streamApiCall\b/,
      /saveAppData\b|indexedDB|localStorage|sessionStorage/,
      /virtual:legacy-app-runtime|vite\.config|package\.json/
    ],
  },
  'src/app/legacy-runtime/features/media-attachment-renderer.js': {
    "media renderer and preview lifecycle replace fragment-local and hidden lexical media helpers": [
      /document|window|globalThis|addEventListener|fetch\s*\(/,
      /indexedDB|localStorage|sessionStorage/
    ],
  },
  'src/app/legacy-runtime/features/media-preview-lifecycle.js': {
    "media renderer and preview lifecycle replace fragment-local and hidden lexical media helpers": [
      /indexedDB|localStorage|sessionStorage|streamApiCall/
    ],
  },
  'src/app/legacy-runtime/features/message-markup-renderer.js': {
    "general message markup rendering is isolated from the 01 runtime DOM shell": [
      /document|window|globalThis|addEventListener|fetch\s*\(/
    ],
  },
  'src/app/legacy-runtime/features/model-message-post-response-actions.js': {
    "model message post-response actions remove the 01 to 02 last message lexical continuation": [
      /fetch\s*\(/,
      /TextDecoder\b|response\.body|streamApiCall\b/,
      /indexedDB|localStorage|sessionStorage/,
      /virtual:legacy-app-runtime|vite\.config|package\.json/
    ],
  },
  'src/app/legacy-runtime/features/model-switcher-lifecycle.js': {
    "model switcher preparation and lifecycle are isolated from the 01 runtime shell": [
      /\belements\b/,
      /\bALL_ELEMENTS\b/,
      /providerView|modelListView|model-options-popover/,
      /TextDecoder|response\.body|streamApiCall/,
      /indexedDB|localStorage|sessionStorage/,
      /virtual:legacy-app-runtime|vite\.config|package\.json|REFACTOR_PLAN/
    ],
  },
  'src/app/legacy-runtime/features/provider-request-support.js': {
    "provider request support helpers are isolated from the 02 runtime fragment": [
      /document\.|window\.|indexedDB|localStorage|sessionStorage/,
      /virtual:legacy-app-runtime|vite\.config|package\.json/
    ],
  },
  'src/app/legacy-runtime/features/single-model-response-lifecycle.js': {
    "single-model response lifecycle is isolated from the 01 runtime submit flow": [
      /runModelCouncil\b/,
      /saveAppData\b/,
      /fetch\s*\(/,
      /TextDecoder\b/,
      /indexedDB\b/
    ],
  },
  'src/app/legacy-runtime/features/stream-api-call.js': {
    "sensitive config export redaction boundary is explicit": [
      /:streamGenerateContent\?key=|\?key=\$\{apiKey\}/
    ],
  },
  'src/app/legacy-runtime/features/streaming-markdown-renderer.js': {
    "streaming text frame queue helper is isolated from the 01 runtime stream response": [
      /\blet\s+textQueue\s*=/,
      /\blet\s+isFrameRequested\s*=/,
      /\blet\s+hasReceivedFirstChunk\s*=/,
      /\bconst\s+renderFrame\s*=/
    ],
  },
  'src/app/legacy-runtime/features/submit-final-cleanup-lifecycle.js': {
    "submit final cleanup lifecycle is isolated from the 01 runtime submit flow": [
      /fetch\s*\(/,
      /TextDecoder\b|response\.body|streamApiCall\b/,
      /indexedDB|localStorage|sessionStorage/,
      /virtual:legacy-app-runtime|vite\.config|package\.json/
    ],
  },
  'src/app/legacy-runtime/runtime/runtime-dom-access.js': {
    "runtime DOM access owns selected element reads through the extracted DOM registry": [
      /document\.|querySelector|getElementById|addEventListener/
    ],
  },
  'src/app/runtime-app.js': {
    "production runtime entry composes the explicit legacy dependency facade": [
      /runtime-entry|virtual:legacy-app-runtime/
    ],
    "runtime DOM registry ownership moves into the non-live runtime kernel": [
      /virtual:legacy-app-runtime|legacy-runtime\/fragments/
    ],
    "runtime config ownership moves into a narrow non-live kernel store": [
      /addEventListener|DOMContentLoaded|bootstrap\(|initChatApp|initializeApp/,
      /config-persistence|loadConfig|saveConfig|indexedDB/
    ],
    "runtime app data normalization moves into a pure non-live kernel helper": [
      /app-data-normalization|app-data-persistence|loadAppData|saveAppData|indexedDB/
    ],
    "startup lifecycle and runtime entry own the retired 06 startup shell": [
      /startup-lifecycle|initializeApp/
    ],
    "legacy IndexedDB ownership moves into a narrow storage adapter": [
      /storage-adapter|indexedDB|openDB|getItem|setItem|removeItem/
    ],
  },
  'src/app/runtime-entry.js': {
    "production runtime entry composes the explicit legacy dependency facade": [
      /virtual:legacy-app-runtime|legacy-runtime\/fragments/,
      /(?:^|\n)\s*(?:void\s+)?(?:start|initializeApp|initChatApp)\(\);/
    ],
    "runtime app data store ownership covers 00 and selected linked replacements": [
      /runtimeAppDataStore|createLegacyRuntimeAppDataStore|app-data-store/
    ],
  },
  'src/app/runtime/features/app-bootstrap-lifecycle.js': {
    "app bootstrap composition owns late bootstrap event-binding tail": [
      /\bhtml5QrcodeScanner\b/,
      /setupHistorySidebarInteractions\(\);\s*setupHistorySidebarTriggers\(\);/,
      /document\.getElementById\('p2p-start-scan-btn'\)\.addEventListener\('click'/
    ],
    "app bootstrap lifecycle and runtime entry own the retired 05 listener shell": [
      /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/,
      /loadConfig|loadAppData|getItem\(|setItem\(/,
      /function\s+handleLogin|const\s+handleLogin|function\s+handleLogout|const\s+handleLogout/
    ],
    "store navigation lifecycle owns only the selected bootstrap listeners": [
      /ALL_ELEMENTS\.openStoreBtn\.addEventListener\('click',\s*openStore\)/,
      /ALL_ELEMENTS\.backToChatBtn\.addEventListener\('click',\s*closeStore\)/
    ],
  },
  'src/app/runtime/features/auth-import-lifecycle.js': {
    "auth import lifecycle ownership moves out of 03 into a real runtime module": [
      /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app|legacyRuntimeContext|initializeApp|handleLogin|handleLogout/,
      /(?:^|\n)\s*currentUser\s*=/
    ],
  },
  'src/app/runtime/features/dialog-notification-lifecycle.js': {
    "runtime dialog coordinator forwards the extracted dialog notification lifecycle": [
      /registerLazyBinding|resolveBinding|resolveOptionalBinding/
    ],
  },
  'src/app/runtime/features/folder-lifecycle.js': {
    "folder CRUD lifecycle ownership stays in a real module with legacy core wiring": [
      /legacy-runtime\/fragments|virtual:legacy-app-runtime|storage-adapter|runtime-app|indexedDB|localStorage|sessionStorage|currentUser|loadConfig|loadAppData|initChatApp|initializeApp|Peer|P2P|JSZip/
    ],
    "runtime render coordinator keeps sidebar-only updates out of the chat renderer": [
      /runtimeRenderCoordinator/
    ],
  },
  'src/app/runtime/features/import-export-lifecycle.js': {
    "normal import/export lifecycle ownership moves out of 03 into a real runtime module": [
      /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app|initChatApp|initializeApp|chat_lastUser|createPasswordRecord|getUserKey/,
      /(?:^|\n)\s*currentUser\s*=/
    ],
  },
  'src/app/runtime/features/input-media-placement.js': {
    "runtime DOM access owns selected element reads through the extracted DOM registry": [
      /runtimeDomAccess|ALL_ELEMENTS|registerLazyBinding|resolveBinding/
    ],
  },
  'src/app/runtime/features/p2p-lifecycle.js': {
    "P2P lifecycle owns Peer, QR, scanner, and transfer implementation after 05 retirement": [
      /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app|storage-adapter|indexedDB|localStorage|sessionStorage|currentUser|initializeApp|initChatApp/
    ],
  },
  'src/app/runtime/features/startup-lifecycle.js': {
    "startup lifecycle and runtime entry own the retired 06 startup shell": [
      /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/,
      /legacyRuntimeContext|indexedDB|createLegacyRuntimeStorageAdapter/,
      /function\s+handleLogin|function\s+handleImportOnAuth|function\s+processAuthImport/
    ],
    "initChatApp callers use the required runtime handoff without changing legacy order": [
      /legacyRuntimeContext/
    ],
  },
  'src/app/runtime/features/trash-lifecycle.js': {
    "trash lifecycle ownership moves out of 04 into a real runtime module": [
      /legacy-runtime\/fragments|virtual:legacy-app-runtime|storage-adapter|runtime-app|indexedDB|localStorage|sessionStorage|currentUser|loadConfig|loadAppData|initChatApp|initializeApp|Peer|P2P|JSZip/
    ],
    "media renderer and preview lifecycle replace fragment-local and hidden lexical media helpers": [
      /typeof\s+renderMediaAttachmentGrid/,
      /typeof\s+bindMediaPreviewButtons/,
      /conv\.messages\.forEach\(msg\s*=>/
    ],
  },
  'src/app/runtime/kernel/active-conversation-store.js': {
    "active conversation id ownership lives in a small kernel store": [
      /document|window|indexedDB|localStorage|sessionStorage/,
      /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-entry|legacy-core\.js/
    ],
  },
  'src/app/runtime/kernel/app-data-normalization.js': {
    "runtime app data normalization moves into a pure non-live kernel helper": [
      /virtual:legacy-app-runtime|legacy-runtime\/fragments|runtimeContext/,
      /getItem|setItem|removeItem|openDB|indexedDB|localStorage|sessionStorage|currentUser/,
      /showNotification|renderAll|toggleModal|initChatApp|initializeApp/
    ],
    "runtime app data store ownership covers 00 and selected linked replacements": [
      /showNotification|renderAll|toggleModal|currentUser|getItem|setItem|removeItem|openDB/
    ],
  },
  'src/app/runtime/kernel/app-data-persistence.js': {
    "runtime app data normalization moves into a pure non-live kernel helper": [
      /virtual:legacy-app-runtime|legacy-runtime\/fragments|app-data-normalization/,
      /getItem|removeItem|openDB|loadAppData|indexedDB|localStorage|sessionStorage/,
      /showNotification|renderAll|toggleModal|initChatApp|initializeApp/
    ],
    "runtime app data store ownership covers 00 and selected linked replacements": [
      /loadAppData|getItem|removeItem|openDB|normalizeLoadedLegacyAppData/
    ],
    "legacy IndexedDB ownership moves into a narrow storage adapter": [
      /storage-adapter|indexedDB|openDB|getItem|removeItem/
    ],
  },
  'src/app/runtime/kernel/app-data-store.js': {
    "runtime app data store ownership covers 00 and selected linked replacements": [
      /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtimeContext/,
      /getItem|setItem|removeItem|openDB|indexedDB|localStorage|sessionStorage|currentUser/,
      /showNotification|renderAll|toggleModal|initChatApp|initializeApp/,
      /appendConversations|appendAstras|syncFromLexical/
    ],
  },
  'src/app/runtime/kernel/config-normalization.js': {
    "runtime config ownership moves into a narrow non-live kernel store": [
      /virtual:legacy-app-runtime|legacy-runtime\/fragments|config-store|runtimeConfigStore/,
      /getItem|setItem|removeItem|openDB|indexedDB|localStorage|sessionStorage/
    ],
  },
  'src/app/runtime/kernel/config-persistence.js': {
    "runtime config ownership moves into a narrow non-live kernel store": [
      /virtual:legacy-app-runtime|legacy-runtime\/fragments|config-store/,
      /getItem|removeItem|openDB|loadConfig|indexedDB|localStorage|sessionStorage/,
      /config-normalization|normalizeLoadedLegacyConfig/
    ],
    "legacy IndexedDB ownership moves into a narrow storage adapter": [
      /storage-adapter|indexedDB|openDB|getItem|removeItem/
    ],
  },
  'src/app/runtime/kernel/config-store.js': {
    "runtime config ownership moves into a narrow non-live kernel store": [
      /virtual:legacy-app-runtime|legacy-runtime\/fragments/,
      /import[\s\S]*\bMODELS\b/,
      /indexedDB|localStorage|sessionStorage|getItem|setItem|removeItem|JSON\.parse|JSON\.stringify/
    ],
  },
  'src/app/runtime/kernel/live-conversations-bridge.js': {
    "live conversations bridge owns access without a legacy conversations mirror": [
      /syncLegacyMirror/
    ],
  },
  'src/app/runtime/kernel/storage-adapter.js': {
    "legacy IndexedDB ownership moves into a narrow storage adapter": [
      /objectStoreNames\.contains/
    ],
  },
  'src/app/runtime/legacy-core/batch-import-voice-lifecycle.js': {
    "batch import voice lifecycle moves batch import and voice ownership out of 03": [
      /legacy-runtime\/fragments|virtual:legacy-app-runtime/
    ],
    "conversation state access owns selected active conversation lookups without stale snapshots": [
      /\bactiveConversationId\b/
    ],
  },
  'src/app/runtime/legacy-core/core-tail-lifecycle.js': {
    "runtime config ownership moves into a narrow non-live kernel store": [
      /state\.config\s*=/
    ],
    "runtime app data store ownership covers 00 and selected linked replacements": [
      /from\s+['"][^'"]*app-data-store\.js['"]/
    ],
    "trash lifecycle ownership moves out of 04 into a real runtime module": [
      /runtimeAppDataStore\.replaceConversations\(/
    ],
    "legacy core tail ownership stays in runtime entry with transition bus bridges": [
      /legacy-runtime\/fragments|virtual:legacy-app-runtime/
    ],
    "color contrast helper is shared without later-fragment lexical ownership": [
      /getThemeTextColorForBackground/,
      /const\s+hexToRgb\s*=/,
      /const\s+getTextColorForBackground\s*=/
    ],
    "settings sidebar button remains wired to initialize and open the settings modal": [
      /const\s+resolveTrashUpdateInputState\b/
    ],
    "time distribution chart data helper is isolated from the 04 runtime fragment": [
      /import\('\/src\/app\/legacy-runtime\/features\/time-distribution-chart-data\.js'\)/,
      /timeDistributionChartDataModulePromise/,
      /\blet\s+labels,\s*data,\s*chartType,\s*label\b/,
      /data\s*=\s*years\.map\(y\s*=>\s*allMessages\.filter/,
      /const\s+updateTimeDistributionChart\s*=\s*async\s*\(\)\s*=>/
    ],
    "mobile context menu markup helpers are isolated from the 04 runtime fragment": [
      /const\s+menuHeader\s*=/,
      /let\s+menuOptions\s*=/,
      /const\s+moveOptionsHTML\s*=/
    ],
    "version compare helper is isolated from the 00 runtime fragment and remains available to update logs": [
      /compareVersions\(log\.version,\s*max\)/
    ],
  },
  'src/app/runtime/legacy-core/history-sidebar-helpers.js': {
    "color contrast helper is shared without later-fragment lexical ownership": [
      /style\.(?:color|backgroundColor)/
    ],
    "runtime DOM access owns selected element reads through the extracted DOM registry": [
      /ALL_ELEMENTS\.historyList/,
      /const\s+\{\s*historySidebarList\s*\}\s*=\s*ALL_ELEMENTS/
    ],
  },
  'src/app/runtime/legacy-core/legacy-core.js': {
    "legacy model registry owns static model metadata and capability helpers": [
      /const\s+MODELS\s*=\s*\[/,
      /const\s+OPENROUTER_VISION_MODELS\s*=\s*\[/,
      /const\s+NVIDIA_VISION_MODELS\s*=\s*\[/,
      /const\s+GEMINI_DOCUMENT_MODELS\s*=\s*\[/
    ],
    "active conversation id ownership lives in a small kernel store": [
      /let\s+activeConversationId\s*=/,
      /activeConversationId\s*=/,
      /let\s+astras\s*=/,
      /let\s+personalMemories\s*=/
    ],
    "live conversations bridge owns access without a legacy conversations mirror": [
      /syncLegacyMirror/,
      /let\s+conversations\s*=/,
      /\bconversations\s*=\s*runtimeAppDataStore\.getConversations\(\)/,
      /let\s+(activeConversationId|config|personalMemories|astras|folders)\s*=/
    ],
    "config and all app data collections use stores without legacy local mirrors": [
      /syncConfig\s*:/,
      /let\s+(chatHistory|folderList|astraList|memoryList|runtimeConfig)\s*=/,
      /folders\s*=\s*runtimeAppDataStore\.replaceFolders\(nextFolders\)/,
      /folders\s*=\s*latestAppData\.folders/,
      /astras\s*=\s*latestAppData\.astras/,
      /set config\(next\)\s*\{\s*config\s*=\s*next;\s*\}/,
      /getAppData:\s*\(\)\s*=>\s*\(\{\s*conversations,\s*folders,\s*astras,\s*personalMemories\s*\}\)/,
      /\blet\s+conversations\s*=/,
      /\blet\s+folders\s*=/,
      /\blet\s+astras\s*=/,
      /\blet\s+personalMemories\s*=/,
      /\blet\s+config\s*=/
    ],
    "runtime entry cutover helpers no longer rely on 05 lexical ownership": [
      /conversation-mail|createLegacyConversationMailSender|sendConversationToMail/
    ],
    "runtime DOM registry ownership moves into the non-live runtime kernel": [
      /const\s+ALL_ELEMENTS\s*=\s*\{/
    ],
    "runtime config ownership moves into a narrow non-live kernel store": [
      /createLegacyRuntimeConfigStore\(/,
      /let\s+config\s*=\s*\{\s*apiKeys:/,
      /async\s+function\s+(?:openDB|getItem|setItem|removeItem)/
    ],
    "runtime app data normalization moves into a pure non-live kernel helper": [
      /personalMemories\s*=\s*latestAppData\.personalMemories/
    ],
    "runtime app data store ownership covers 00 and selected linked replacements": [
      /createLegacyRuntimeAppDataStore\(/,
      /\bconversations\.(?:length|filter|unshift)\b/,
      /\bconversations\.filter\(/,
      /from\s+['"][^'"]*app-data-store\.js['"]/,
      /getAppData:[\s\S]{0,120}\bactiveConversationId\b/
    ],
    "folder CRUD lifecycle ownership stays in a real module with legacy core wiring": [
      /const\s+createNewFolder\s*=\s*(?:async\s*)?\(/,
      /const\s+moveConversationToFolder\s*=\s*(?:async\s*)?\(/,
      /const\s+deleteFolder\s*=\s*(?:async\s*)?\(/,
      /const\s+showFolderSettingsModal\s*=\s*(?:async\s*)?\(/,
      /const\s+handleSaveFolderSettings\s*=\s*(?:async\s*)?\(/,
      /const\s+createFolderMenu\s*=\s*(?:async\s*)?\(/,
      /\bfolderToCustomize\b/
    ],
    "sidebar chat Astra render lifecycle ownership stays in a real module with legacy core wiring": [
      /const\s+renderFolders\s*=\s*\(\)\s*=>\s*\{/,
      /const\s+createConversationElement\s*=\s*\(conv\)\s*=>\s*\{/,
      /const\s+renderArchivedChats\s*=\s*\(\)\s*=>\s*\{/,
      /const\s+createAstras\s*=\s*async\s*\(\)\s*=>\s*\{/,
      /const\s+handleSaveAstras\s*=\s*async\s*\(\)\s*=>\s*\{/,
      /const\s+deleteAstras\s*=\s*async\s*\(id\)\s*=>\s*\{/,
      /createMessageListLifecycle\(\{/
    ],
    "trash lifecycle ownership moves out of 04 into a real runtime module": [
      /\bisTrashSelectionMode\b|\bselectedTrashIds\b/
    ],
    "sidebar Astras lifecycle breaks the 00 to 01 renderAstras continuation boundary": [
      /astras\.forEach\(ast\s*=>/,
      /^\s*astras\.forEach\(ast\s*=>/
    ],
    "batch action bar lifecycle breaks the 02 to 03 renderBatchActionBar continuation boundary": [
      /const\s+\{\s*batchActionBar,\s*userControls,\s*selectionCount,\s*batchDeleteBtn,\s*batchArchiveBtn,\s*batchMoveBtn\s*\}\s*=\s*ALL_ELEMENTS;/
    ],
    "startup lifecycle and runtime entry own the retired 06 startup shell": [
      /return\s+adjustTextareaHeight;/
    ],
    "legacy IndexedDB ownership moves into a narrow storage adapter": [
      /const\s+(?:DB_NAME|STORE_NAME)\b|async\s+function\s+(?:openDB|getItem|setItem|removeItem)/,
      /\bSTORE_NAME\b|\bopenDB\(\)|store\.clear\(\)/
    ],
    "initChatApp callers use the required runtime handoff without changing legacy order": [
      /(^|[^\w.])initChatApp\(\)/,
      /resolveOptionalBinding\('app\.initChatApp'/
    ],
    "loadChat resolves updateFunctionButtonsState through the required runtime handoff": [
      /(^|[^\w.])updateFunctionButtonsState\(\)/,
      /resolveOptionalBinding\('input\.updateFunctionButtonsState'\)/,
      /await\s+legacyRuntimeContext\.resolveBinding\('input\.updateFunctionButtonsState'\)/
    ],
    "selected toggleSidebar callers use the required runtime handoff without changing sidebar behavior": [
      /(^|[^\w.])toggleSidebar\(false\)/,
      /resolveOptionalBinding\('sidebar\.toggleSidebar'/,
      /await\s+legacyRuntimeContext\.resolveBinding\('sidebar\.toggleSidebar'/
    ],
    "runtime render coordinator keeps sidebar-only updates out of the chat renderer": [
      /runtimeRenderCoordinator\.renderAll\(\)/
    ],
    "runtime dialog coordinator forwards the extracted dialog notification lifecycle": [
      /const\s+showNotification\s*=\s*\(message,/,
      /const\s+toggleModal\s*=\s*\(modalElement,/
    ],
    "runtime config access owns selected uiLanguage reads through the config store": [
      /let\s+config\s*=/,
      /getConfig:\s*config\b/,
      /config\.uiLanguage/
    ],
    "runtime DOM access owns selected element reads through the extracted DOM registry": [
      /getElements:\s*ALL_ELEMENTS\b/,
      /ALL_ELEMENTS\.(?:filePreviewContainer|settingsBtn)/
    ],
    "conversation state access owns selected active conversation lookups without stale snapshots": [
      /\bactiveConversationId\b/,
      /const\s+getActiveConversation\s*=\s*\(\)\s*=>\s*\{\s*const\s+conv\s*=\s*conversations\.find\(c\s*=>\s*c\.id\s*===\s*activeConversationId\)/,
      /conv\.id\s*===\s*activeConversationId/
    ],
    "settings sidebar button remains wired to initialize and open the settings modal": [
      /const\s+resolveMainUpdateInputState\b/
    ],
    "legacy provider request formatting helpers are isolated from the 02 runtime fragment": [
      /getSearchCurrentDate/
    ],
    "stream API provider request and parser core is isolated from the 02 runtime fragment": [
      /async\s+function\s+streamApiCall\b/,
      /function\s+cleanGeminiHistory\b/,
      /openrouter\.ai\/api\/v1\/chat\/completions/,
      /:streamGenerateContent\?key=/,
      /\/api\/nvidia-chat/,
      /response\.body\.getReader\(\)/,
      /new\s+TextDecoder\(\)/,
      /line\.startsWith\('data: '\)/,
      /parsed\?\.candidates\?\.\[0\]\?\.content\?\.parts\?\.\[0\]\?\.text/
    ],
    "provider request support helpers are isolated from the 02 runtime fragment": [
      /const\s+waitCouncilRetryDelay\s*=/,
      /const\s+streamCouncilApiCallWithRetry\s*=\s*async/,
      /const\s+getUnsupportedSingleDocumentParts\s*=/,
      /const\s+buildSingleDocumentTranslationPrompt\s*=/,
      /const\s+getTavilyApiKey\s*=/,
      /const\s+fetchTavilySearchPacket\s*=\s*async/,
      /const\s+buildTavilyContextPart\s*=/,
      /const\s+buildSingleSearchTranslationPrompt\s*=/,
      /const\s+buildSingleModelTranslatedRequestParts\s*=\s*async/
    ],
    "council response lifecycle core is isolated from the 02 runtime fragment": [
      /async\s+function\s+runModelCouncil\b/,
      /const\s+formatCouncilResponses\s*=/,
      /const\s+buildCouncilSharedSearchPrompt\s*=/,
      /const\s+buildCouncilSecondSearchPrompt\s*=/,
      /const\s+buildCouncilAttachmentTranslationPackets\s*=/,
      /const\s+buildCouncilMemberInstruction\s*=/,
      /const\s+buildCouncilDeliberationPrompt\s*=/,
      /const\s+buildCouncilSynthesisPrompt\s*=/,
      /const\s+buildCouncilAppendix\s*=/
    ],
    "settings mobile metadata helpers are isolated from the 02 runtime fragment": [
      /const\s+SETTINGS_MOBILE_ICON_MAP\s*=/
    ],
    "message type icon helper is isolated from the 00 runtime fragment": [
      /\b(?:const|function)\s+getMessageTypeIcon\b/
    ],
    "date formatting helper is isolated from the 00 runtime fragment and remains available to timestamp call sites": [
      /\bconst\s+formatFullTimestamp\s*=/
    ],
    "streaming markdown render state helper is isolated from the 01 runtime renderer": [
      /import\s*\{[^}]*\bcreateStreamingMarkdownRenderState\b/
    ],
    "model message post-response actions remove the 01 to 02 last message lexical continuation": [
      /\blastMessageDiv\b/,
      /copy-content-btn[\s\S]*insertAdjacentHTML\('beforeend'/,
      /classList\.contains\('model-message'\)/
    ],
    "media renderer and preview lifecycle replace fragment-local and hidden lexical media helpers": [
      /conv\.messages\.forEach\(msg\s*=>/
    ],
    "version compare helper is isolated from the 00 runtime fragment and remains available to update logs": [
      /\b(?:const|function)\s+compareVersions\b/
    ],
  },
  'src/app/runtime/legacy-core/model-memory-dashboard-lifecycle.js': {
    "model memory dashboard lifecycle moves model usage chart ownership out of 03": [
      /renderModelManagementUI|moveModelOrder/,
      /legacy-runtime\/fragments|virtual:legacy-app-runtime/
    ],
  },
  'src/app/runtime/legacy-core/model-registry.js': {
    "legacy model registry owns static model metadata and capability helpers": [
      /virtual:legacy-app-runtime|legacy-runtime\/fragments|runtime-entry|legacy-app\.js/
    ],
  },
  'src/app/runtime/legacy-core/search-upload-sidebar-lifecycle.js': {
    "search upload sidebar lifecycle moves search upload sidebar ownership out of 03": [
      /showConversationInViewModal|search-view-btn/,
      /legacy-runtime\/fragments|virtual:legacy-app-runtime/
    ],
    "media renderer and preview lifecycle replace fragment-local and hidden lexical media helpers": [
      /createConversationViewRenderer|searchConversationViewRenderer/,
      /renderSearchMediaAttachmentGrid|bindSearchMediaPreviewButtons/
    ],
  },
  'src/app/runtime/legacy-core/settings-api-key-controls.js': {
    "sensitive config export redaction boundary is explicit": [
      /dataset\.[A-Za-z0-9_$]*\s*=\s*rawValue/,
      /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-entry|legacy-core\.js/
    ],
  },
  'src/app/runtime/legacy-core/settings-auth-actions-helper.js': {
    "initChatApp callers use the required runtime handoff without changing legacy order": [
      /await\s+legacyRuntimeContext\.resolveBinding\('app\.initChatApp'\)/
    ],
  },
  'src/app/runtime/legacy-core/settings-auth-provider-lifecycle.js': {
    "sensitive config export redaction boundary is explicit": [
      /readApiKeyInputIntent|markApiKeyInputCleared/,
      /:generateContent\?key=|\?key=\$\{apiKey\}/
    ],
    "legacy IndexedDB ownership moves into a narrow storage adapter": [
      /\bSTORE_NAME\b|\bopenDB\(\)|store\.clear\(\)/
    ],
    "initChatApp callers use the required runtime handoff without changing legacy order": [
      /(^|[^\w.])initChatApp\(\)/,
      /resolveOptionalBinding\('app\.initChatApp'/
    ],
    "runtime config access owns selected uiLanguage reads through the config store": [
      /config\.uiLanguage\s*=\s*ALL_ELEMENTS\.uiLanguageSelect\.value;/
    ],
    "settings sidebar button remains wired to initialize and open the settings modal": [
      /const\s+updateInputState\s*=\s*\(\)\s*=>\s*\{/
    ],
  },
  'src/app/runtime/legacy-core/settings-provider-structured-helpers.js': {
    "sensitive config export redaction boundary is explicit": [
      /:generateContent\?key=|\?key=\$\{apiKey\}/
    ],
  },
  'src/app/runtime/legacy-core/sidebar-chat-astra-render-lifecycle.js': {
    "sidebar chat Astra render lifecycle ownership stays in a real module with legacy core wiring": [
      /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/
    ],
    "selected toggleSidebar callers use the required runtime handoff without changing sidebar behavior": [
      /(^|[^\w.])toggleSidebar\(false\)/,
      /resolveOptionalBinding\('sidebar\.toggleSidebar'/,
      /await\s+legacyRuntimeContext\.resolveBinding\('sidebar\.toggleSidebar'/
    ],
    "runtime render coordinator keeps sidebar-only updates out of the chat renderer": [
      /runtimeRenderCoordinator\.renderAll\(\)/
    ],
    "runtime config access owns selected uiLanguage reads through the config store": [
      /config\.uiLanguage/
    ],
    "runtime DOM access owns selected element reads through the extracted DOM registry": [
      /ALL_ELEMENTS\.archivedChatsContainer/,
      /ALL_ELEMENTS\.folderList/
    ],
    "conversation state access owns selected active conversation lookups without stale snapshots": [
      /conv\.id\s*===\s*activeConversationId/
    ],
    "settings sidebar button remains wired to initialize and open the settings modal": [
      /\n\s*updateInputState,\s*\n/
    ],
    "general message markup rendering is isolated from the 01 runtime DOM shell": [
      /const\s+isUser\s*=\s*msg\.role\s*===\s*'user'/,
      /const\s+isLoadingMessage\s*=\s*!isUser/,
      /let\s+textPartsContent\s*=\s*\[\]/,
      /const\s+messageBubble\s*=\s*`/,
      /copy-content-btn[\s\S]*contentPaddingClass\s*=\s*'pb-8'/,
      /const\s+addMessageToUI\s*=\s*\(msg,\s*index,/,
      /const\s+renderChat\s*=\s*\(\)\s*=>/
    ],
    "media renderer and preview lifecycle replace fragment-local and hidden lexical media helpers": [
      /\bconst\s+getInlineMediaSrc\s*=/,
      /\bconst\s+renderMediaAttachmentGrid\s*=/,
      /\bconst\s+openMediaPreview\s*=/,
      /\bconst\s+bindMediaPreviewButtons\s*=/
    ],
  },
  'src/app/runtime/legacy-core/submit-input-council-lifecycle.js': {
    "streaming council details helpers are isolated from the 01 runtime fragment": [
      /\bconst\s+getOpenCouncilDetailKeys\s*=/,
      /\bconst\s+restoreOpenCouncilDetails\s*=/,
      /\bconst\s+isCouncilComparisonSummary\s*=/,
      /\bconst\s+normalizeCouncilComparisonDetails\s*=/,
      /\bconst\s+hasUnclosedCouncilDetails\s*=/,
      /const\s+createStreamingMarkdownRenderer\s*=\s*\(/,
      /async\s+function\s+streamMarkdownResponse\b/
    ],
    "streaming markdown render state helper is isolated from the 01 runtime renderer": [
      /let\s+fullText\s*=\s*'';\s*let\s+finalizedText\s*=\s*'';\s*let\s+pendingText\s*=\s*'';\s*let\s+currentLineText\s*=\s*'';\s*let\s+isFinalized\s*=\s*false;/s,
      /currentLineNode\.innerHTML\s*=\s*''/,
      /streaming-markdown-root/
    ],
    "streaming markdown renderer and response core is isolated from the 01 runtime fragment": [
      /const\s+renderFinalized\s*=/,
      /const\s+appendFadedText\s*=/,
      /const\s+flushPendingLines\s*=/,
      /const\s+ensureRenderer\s*=/,
      /const\s+frameQueue\s*=\s*createStreamingTextFrameQueue\(\{/,
      /targetElement\.dataset\.streamRendered\s*=\s*'true'/,
      /streaming-markdown-finalized/,
      /streaming-current-line/
    ],
    "single-model response lifecycle is isolated from the 01 runtime submit flow": [
      /let\s+latestSingleProgress\s*=/,
      /const\s+renderSingleProgressState\s*=/,
      /const\s+updateSingleStreamingProgress\s*=/,
      /const\s+runSingleApiStream\s*=/,
      /const\s+hasTranslationInputs\s*=/,
      /let\s+requestParts\s*=\s*userParts/,
      /let\s+receivedChars\s*=\s*0/,
      /let\s+lastSingleProgressAt\s*=\s*0/,
      /let\s+singleProgressTimer\s*=\s*null/
    ],
    "response progress renderers and submit preparation are isolated from the 01 runtime shell": [
      /\n\s*updateSubmitButtonState,\s*\n/,
      /\n\s*generateTitleAndSummary,\s*\n/,
      /\n\s*renderFilePreviews,\s*\n/,
      /\n\s*adjustTextareaHeight,\s*\n/,
      /const\s+renderCouncilProgress\s*=\s*\(progress\)\s*=>/,
      /const\s+renderSingleModelProgress\s*=\s*\(progress\)\s*=>/,
      /const\s+renderSingleModelError\s*=\s*\(progress\s*=\s*\{\},\s*errorMessage\s*=\s*''\)\s*=>/,
      /const\s+userParts\s*=\s*\[\];/,
      /uploadedFiles\.forEach\(file\s*=>\s*\{\s*userParts\.push/s,
      /const\s+councilValidation\s*=\s*getCouncilValidation\(conv,\s*uploadedFiles\);/,
      /ALL_ELEMENTS\.messageInput\.value\s*=\s*'';\s*uploadedFiles\s*=\s*\[\];/s
    ],
    "model switcher preparation and lifecycle are isolated from the 01 runtime shell": [
      /const\s+renderModelSwitcher\s*=\s*\(\)\s*=>/,
      /const\s+processedModels\s*=\s*MODELS\.map\(model\s*=>/,
      /const\s+popoverHTML\s*=\s*`/,
      /providerView\.innerHTML\s*=/,
      /modelListView\.addEventListener\('click'/
    ],
    "council controls lifecycle is isolated from the 01 runtime shell": [
      /getFileInputContainer:\s*ALL_ELEMENTS\.fileInputContainer/,
      /const\s+renderCouncilControls\s*=\s*\(\)\s*=>/,
      /id="model-council-enabled"/,
      /data-council-participant=/,
      /const\s+applyCouncilModelSearch\s*=/
    ],
    "assistant response finalization is isolated from the 01 runtime submit flow": [
      /if\s*\(!String\(fullResponse\s*\|\|\s*''\)\.trim\(\)\)\s*\{/,
      /sendConversationToMail\(userMessageObject,\s*fullResponse\)/,
      /finalAiMessage\.parts\s*=\s*\[\{\s*text:\s*fullResponse\s*\}\]/,
      /conv\.messages\.push\(finalAiMessage\)/,
      /const\s+errorMessage\s*=/,
      /const\s+currentProgress\s*=/,
      /contentDiv\.innerHTML\s*=\s*renderSingleModelError\(/,
      /const\s+finalAiMessage\s*=\s*\{\s*role:\s*'model',\s*parts:\s*\[\{\s*text:\s*errorMessage\s*\}\]/,
      /await\s+extractPersonalMemory\(userMessage,\s*fullResponse\)/,
      /sendConversationToMail/
    ],
    "submit final cleanup lifecycle is isolated from the 01 runtime submit flow": [
      /singleModelResponseLifecycle\.stop\(\);\s*isCouncilRunning\s*=\s*false;\s*abortController\s*=\s*null;\s*updateSubmitButtonState\(false\);\s*updateInputState\(\);\s*renderCouncilControls\(\);\s*renderInputIndicators\(\);/s
    ],
    "model message post-response actions remove the 01 to 02 last message lexical continuation": [
      /\blastMessageDiv\b/
    ],
    "council response render lifecycle is isolated from the 01 runtime submit flow": [
      /let\s+latestCouncilProgress\s*=/,
      /let\s+realtimeCouncilText\s*=/,
      /let\s+realtimeCouncilRenderer\s*=/,
      /const\s+renderCouncilProgressState\s*=/,
      /const\s+renderCouncilSynthesisChunk\s*=/,
      /let\s+councilProgressTimer\s*=/,
      /const\s+remainingCouncilText\s*=/
    ],
    "typewriter stream uses the shared streaming text frame queue boundary": [
      /\blet\s+textQueue\s*=/,
      /\blet\s+isFrameRequested\s*=/,
      /\bconst\s+renderFrame\s*=/
    ],
    "typewriter playback controller is isolated from the 01 runtime playback loops": [
      /\blet\s+currentIndex\s*=/,
      /\bconst\s+type\s*=\s*\(\)\s*=>/,
      /setTimeout\(type,\s*typingSpeed\)/
    ],
    "renderer gradual append controller is isolated from the 01 runtime RAF append loop": [
      /const\s+appendRendererTextGradually\s*=\s*async/
    ],
  },
  'src/app/runtime/legacy-core/transition-bus-lifecycle.js': {
    "production runtime entry composes the explicit legacy dependency facade": [
      /\binitChatApp\(\);|\binitializeApp\(\);/
    ],
    "runtime entry cutover helpers no longer rely on 05 lexical ownership": [
      /\bcompressImage\b/
    ],
    "runtime app data store ownership covers 00 and selected linked replacements": [
      /from\s+['"][^'"]*app-data-store\.js['"]/,
      /appendConversations|appendAstras|syncFromLexical/
    ],
    "trash lifecycle ownership moves out of 04 into a real runtime module": [
      /\blet\s+isTrashSelectionMode\b|\bselectedTrashIds\s*=\s*new\s+Set\(\)/
    ],
    "normal import/export lifecycle ownership moves out of 03 into a real runtime module": [
      /createLegacyImportExportLifecycle/,
      /const\s+handleExport\s*=\s*(?:async\s*)?\(/,
      /const\s+performImport\s*=\s*(?:async\s*)?\(/,
      /const\s+handleImport\s*=\s*(?:async\s*)?\(/
    ],
    "auth import lifecycle ownership moves out of 03 into a real runtime module": [
      /createLegacyAuthImportLifecycle/,
      /const\s+handleImportOnAuth\s*=\s*(?:async\s*)?\(/,
      /const\s+processAuthImport\s*=\s*(?:async\s*)?\(/
    ],
    "model memory dashboard lifecycle moves model usage chart ownership out of 03": [
      /const\s+renderPersonalMemoryList\s*=\s*\(\)\s*=>\s*\{/,
      /const\s+openDashboard\s*=\s*\(\)\s*=>\s*\{/,
      /createModelUsageChartLifecycle\(\{/,
      /modelPieChart\s*=\s*new Chart\(ctx,/
    ],
    "search upload sidebar lifecycle moves search upload sidebar ownership out of 03": [
      /const\s+performSearchAndRenderResults\s*=\s*async\s*\(\)\s*=>\s*\{/,
      /const\s+showConversationInViewModal\s*=\s*\(convId\)\s*=>\s*\{/,
      /const\s+generateSearchKeywords\s*=\s*async\s*\(naturalQuery\)\s*=>\s*\{/,
      /createUploadedFilePreviewLifecycle\(\{/,
      /function\s+toggleSidebar\(show\)\s*\{/
    ],
    "batch import voice lifecycle moves batch import and voice ownership out of 03": [
      /const\s+handleBatchDelete\s*=\s*async\s*\(\)\s*=>\s*\{/,
      /const\s+handleBatchArchive\s*=\s*async\s*\(\)\s*=>\s*\{/,
      /const\s+setupVoiceInput\s*=\s*\(\)\s*=>\s*\{/,
      /const\s+toggleVoiceInput\s*=\s*(?:async\s*)?\(target\)\s*=>\s*\{/,
      /createLegacyImportExportLifecycle|createLegacyAuthImportLifecycle/
    ],
    "batch action bar lifecycle breaks the 02 to 03 renderBatchActionBar continuation boundary": [
      /^\s*userControls\.classList\.add\('hidden'\);/
    ],
    "initChatApp callers use the required runtime handoff without changing legacy order": [
      /(^|[^\w.])initChatApp\(\)/,
      /resolveOptionalBinding\('app\.initChatApp'/
    ],
    "settings sidebar button remains wired to initialize and open the settings modal": [
      /const\s+resolveSearchSetupSettingsModal\b/
    ],
    "search text formatting helper is isolated from the transition bus": [
      /\b(?:const|function)\s+highlightText\b/,
      /search-text-formatting\.js/
    ],
    "media renderer and preview lifecycle replace fragment-local and hidden lexical media helpers": [
      /typeof\s+renderMediaAttachmentGrid/,
      /typeof\s+bindMediaPreviewButtons/,
      /\bopenMediaPreview\(/,
      /const\s+renderFilePreviews\s*=\s*\(\)\s*=>/,
      /const\s+removeFile\s*=\s*\(fileId\)\s*=>/,
      /conv\.messages\.forEach\(msg\s*=>/
    ],
  },
  'src/app/runtime/runtime-entry-dependencies.js': {
    "production runtime entry composes the explicit legacy dependency facade": [
      /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/
    ],
  },
  'src/app/runtime/security/api-key-input-intent.js': {
    "sensitive config export redaction boundary is explicit": [
      /dataset\.[A-Za-z0-9_$]*\s*=\s*rawValue/,
      /input\.dataset\.raw|dataset\.raw|secretValue/,
      /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-entry|legacy-core\.js/
    ],
  },
  'src/app/runtime/security/sensitive-config-redaction.js': {
    "sensitive config export redaction boundary is explicit": [
      /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-entry|legacy-core\.js/
    ],
  },
  'src/app/runtime/security/sensitive-config-store.js': {
    "sensitive config export redaction boundary is explicit": [
      /crypto\.subtle|AES-GCM/
    ],
  },
  'src/app/runtime/utils/image-compression.js': {
    "runtime entry cutover helpers no longer rely on 05 lexical ownership": [
      /legacy-runtime\/fragments|virtual:legacy-app-runtime|runtime-app/
    ],
  },
  'src/main.js': {
    "production runtime entry composes the explicit legacy dependency facade": [
      /runtime-entry/
    ],
    "main bootstrap delegates vendor bridge, shell mount, and vendor script loading in order": [
      /import\s+katex\s+from\s+'katex\/dist\/katex\.min\.js';/
    ],
  },
  'src/utils/color-contrast.js': {
    "color contrast helper is shared without later-fragment lexical ownership": [
      /export\s+(?:const|function)\s+hexToRgb|export\s*\{[^}]*hexToRgb/
    ],
  },
  'vite.config.js': {
    "production runtime entry composes the explicit legacy dependency facade": [
      /legacyRuntimeContext|virtual:legacy-app-runtime|legacyRuntimeFragmentsPlugin/
    ],
    "runtime entry cutover helpers no longer rely on 05 lexical ownership": [
      /readdirSync\(fragmentsDir\)|readFileSync|legacyCoreFragmentNames/,
      /legacyCoreFragmentNames/,
      /legacyCoreFragmentNames\s*=\s*new Set\(\[[\s\S]*?(?:05|06)-runtime\.fragment\.js[\s\S]*?\]\)/
    ],
    "runtime DOM registry ownership moves into the non-live runtime kernel": [
      /legacyRuntimeFragmentsPlugin/
    ],
    "runtime app data store ownership covers 00 and selected linked replacements": [
      /legacyRuntimeModuleId|virtual:legacy-app-runtime/
    ],
    "legacy core tail ownership stays in runtime entry with transition bus bridges": [
      /(?:04|05|06)-runtime\.fragment\.js/
    ],
  },
};

for (const [file, groups] of Object.entries(RETIRED)) {
  test(`retired code stays out of ${file}`, () => {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    for (const [reason, patterns] of Object.entries(groups)) {
      for (const pattern of patterns) assert.doesNotMatch(source, pattern, `${file}: ${reason}`);
    }
  });
}
