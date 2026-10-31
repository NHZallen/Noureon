import { createExportSafeConfig } from '../security/sensitive-config-redaction.js';
import { setButtonBusy } from '../../ui/motion/busy-button.js';
import { getRuntimeText } from '../i18n/runtime-texts.js';
import { createBackupFileName } from '../../ui/files/file-name-policy.js';
import {
  decryptSyncVaultPayload,
  encryptSyncVaultPayload,
  getUnlockedSyncVaultKey,
  readSyncVaultRecord,
  unlockSyncVaultRecord
} from '../../sync/sync-vault.js';

const IMPORT_CANCELLED = 'IMPORT_CANCELLED';

const getLocaleText = (i18n, language, key, fallback) => i18n?.[language]?.[key] || fallback;

export function createImportExportLifecycle({
  document,
  window,
  navigator,
  URL,
  File,
  loadArchiveVendor,
  JSZip,
  elements,
  getCurrentUser,
  getConfig,
  getSensitiveApiKeys = () => getConfig()?.apiKeys || {},
  mutateConfig,
  mergeSensitiveApiKeys = (apiKeys) => {
    if (!apiKeys) return;
    mutateConfig((config) => {
      config.apiKeys = { ...config.apiKeys, ...apiKeys };
      return config;
    });
  },
  getConversations,
  getFolders,
  getAstras,
  getPersonalMemories,
  replaceAllAppData,
  replaceFolders,
  replacePersonalMemories,
  saveAppData,
  saveConfig,
  saveSensitiveConfig = async () => {},
  processInChunks,
  getBackupUsername,
  compressImage,
  applyUiTheme,
  applyLanguage,
  loadChat,
  startNewChat,
  showCustomConfirm,
  showCustomPrompt,
  showNotification,
  toggleModal,
  getOutputMode,
  resolveSearchSetupSettingsModal,
  i18n,
  randomUUID,
  getGeneratedImageBlob = async () => null,
  saveGeneratedImageBlob = async () => {},
  storage = null,
  syncVault = {
    decryptPayload: decryptSyncVaultPayload,
    encryptPayload: encryptSyncVaultPayload,
    getUnlockedKey: getUnlockedSyncVaultKey,
    readRecord: readSyncVaultRecord,
    unlockRecord: unlockSyncVaultRecord
  },
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  logger = console
} = {}) {
  const getLanguage = () => getConfig().uiLanguage;
  const text = (key, fallback) => getLocaleText(i18n, getLanguage(), key, fallback);
  const resolveArchiveVendor = typeof loadArchiveVendor === 'function'
    ? loadArchiveVendor
    : () => Promise.resolve(JSZip);
  const requireArchiveVendor = async () => {
    const loadedVendor = await resolveArchiveVendor();
    const JSZipCtor = loadedVendor?.JSZip || loadedVendor?.default || loadedVendor;
    if (typeof JSZipCtor !== 'function') {
      throw new TypeError('JSZip did not expose a usable constructor.');
    }
    return JSZipCtor;
  };

  function applySettings(settings) {
    if (!settings) return;
    const { theme: _retiredTheme, ...safeSettings } = settings;
    mutateConfig((config) => {
      delete config.theme;
      Object.assign(config, safeSettings);
      return config;
    });
  }

  async function mergeApiKeys(apiKeys) {
    if (!apiKeys) return;
    mergeSensitiveApiKeys(apiKeys);
    await saveSensitiveConfig();
  }

  async function promptForVaultKey(record, { mode }) {
    const isExport = mode === 'export';
    while (true) {
      const password = await showCustomPrompt(
        text(
          isExport ? 'exportApiKeysPasswordPrompt' : 'importApiKeysPasswordPrompt',
          isExport
            ? 'Enter your sync password to encrypt the API keys in this backup.'
            : 'Enter the sync password used when this backup was created.'
        ),
        text(
          isExport ? 'exportApiKeysPasswordTitle' : 'importApiKeysPasswordTitle',
          isExport ? 'Unlock API key export' : 'Unlock API keys'
        ),
        'password'
      );
      if (password == null) return null;
      try {
        return await syncVault.unlockRecord(password, record);
      } catch {
        showNotification(text('importApiKeysPasswordIncorrect', 'The sync password is incorrect.'), 'error');
      }
    }
  }

  async function createEncryptedApiKeyBackup(apiKeys) {
    const user = getCurrentUser();
    const record = storage && user?.username
      ? await syncVault.readRecord(storage, user.username)
      : null;
    if (!record) {
      showNotification(
        text('exportApiKeysRequiresSyncVault', 'Create a sync password before exporting API keys.'),
        'warning'
      );
      return null;
    }

    const key = syncVault.getUnlockedKey(user.username)
      || await promptForVaultKey(record, { mode: 'export' });
    if (!key) return null;

    return {
      version: 1,
      vaultRecord: record,
      payload: await syncVault.encryptPayload({ apiKeys }, key)
    };
  }

  async function resolveImportedApiKeys(data) {
    if (!data?.encryptedApiKeys) return data?.apiKeys || null;
    const encrypted = data.encryptedApiKeys;
    const currentUsername = getCurrentUser()?.username;
    const currentKey = currentUsername ? syncVault.getUnlockedKey(currentUsername) : null;

    if (currentKey) {
      try {
        const decrypted = await syncVault.decryptPayload(encrypted.payload, currentKey);
        return decrypted?.apiKeys || null;
      } catch {
        // The backup may use an older sync password or come from another device.
      }
    }

    while (true) {
      const key = await promptForVaultKey(encrypted.vaultRecord, { mode: 'import' });
      if (!key) {
        const skipApiKeys = await showCustomConfirm(
          text('importWithoutApiKeysWarning', 'Continue importing the backup without its API keys?'),
          text('importWithoutApiKeysTitle', 'Skip API keys?')
        );
        if (skipApiKeys) return null;
        throw new Error(IMPORT_CANCELLED);
      }
      try {
        const decrypted = await syncVault.decryptPayload(encrypted.payload, key);
        return decrypted?.apiKeys || null;
      } catch {
        showNotification(text('importApiKeysPasswordIncorrect', 'The sync password is incorrect.'), 'error');
      }
    }
  }

  async function handleExport() {
    const currentUser = getCurrentUser();
    const config = getConfig();
    const dataToExport = {
      backup_identity: {
        username: currentUser.username,
        exportedAt: new Date().toISOString(),
        authVersion: currentUser.passwordKdf === 'PBKDF2-SHA-256' ? 2 : 1
      }
    };

    const rawData = {};
    if (elements.exportHistoryCheck.checked) {
      rawData.conversations = getConversations().filter(conversation => conversation?.retentionMode !== 'ephemeral');
      rawData.folders = getFolders();
    }
    if (elements.exportAstrasCheck.checked) {
      rawData.astras = getAstras();
    }
    if (elements.exportSettingsCheck.checked) {
      rawData.settings = createExportSafeConfig({
        defaultModel: config.defaultModel,
        modelSettings: config.modelSettings,
        autoNaming: config.autoNaming,
        enableAutoWebSearch: config.enableAutoWebSearch,
        visionCheckEnabled: config.visionCheckEnabled !== false,
        fileModeDefault: config.fileModeDefault === 'standard' ? 'standard' : 'advanced',
        replyRunLocation: config.replyRunLocation === 'local' ? 'local' : 'server',
        uiTheme: config.uiTheme,
        uiLanguage: config.uiLanguage,
        aiDefaultLanguage: config.aiDefaultLanguage,
        isLearningMode: config.isLearningMode,
        outputMode: getOutputMode()
      });
    }
    const shouldExportApiKeys = document.getElementById('export-api-check')?.checked === true;
    if (shouldExportApiKeys) {
      const confirmed = await showCustomConfirm(
        text(
          'exportApiKeysWarning',
          'The API keys will be encrypted with your sync password before they are added to the backup.'
        ),
        text('exportApiKeysWarningTitle', 'Export API keys?')
      );
      if (!confirmed) return;
      const apiKeys = createExportSafeConfig(
        { apiKeys: getSensitiveApiKeys() },
        { includeSecrets: true }
      ).apiKeys || {};
      const encryptedApiKeys = await createEncryptedApiKeyBackup(apiKeys);
      if (!encryptedApiKeys) return;
      rawData.encryptedApiKeys = encryptedApiKeys;
    }
    if (elements.exportMemoryCheck.checked) {
      // The notes of the memory (and the words of the ones the person deleted); the old list of personal memories is not written any more.
      const notes = await (await import('../memory-store/notes-transfer.js')).exportNotes().catch(() => null);
      if (notes) rawData.memoryNotes = notes;
    }

    if (Object.keys(rawData).length === 0) {
      showNotification(text('selectDataToExportNotice', '請至少選擇一項要匯出的資料。'), 'warning');
      return;
    }

    const originalBtnText = elements.confirmExportBtn.textContent;
    elements.confirmExportBtn.textContent = getRuntimeText(getConfig().uiLanguage, 'processingFile');
    elements.confirmExportBtn.disabled = true;
    setButtonBusy(elements.confirmExportBtn, true);

    const dataClone = JSON.parse(JSON.stringify(rawData));
    Object.assign(dataToExport, dataClone);

    const fileName = createBackupFileName(currentUser.username);

    try {
      const JSZipCtor = await requireArchiveVendor();
      const zip = new JSZipCtor();
      const imagesFolder = zip.folder('images');
      const filesFolder = zip.folder('files');

      if (dataToExport.conversations) {
        for (const conversation of dataToExport.conversations) {
          for (const message of conversation.messages) {
            if (message.parts) {
              for (const part of message.parts) {
                if (part.inlineData && part.inlineData.data) {
                  const originalMime = part.inlineData.mimeType;
                  if (originalMime.startsWith('image/')) {
                    const processed = await compressImage(part.inlineData.data, originalMime, 1920, 0.6);
                    const imageName = `img_${randomUUID().slice(0, 8)}.${processed.ext}`;
                    imagesFolder.file(imageName, processed.data, { base64: true });
                    part.inlineData._zipRef = `images/${imageName}`;
                    part.inlineData.mimeType = processed.mimeType;
                  } else {
                    let ext = 'bin';
                    if (originalMime.includes('pdf')) ext = 'pdf';
                    else if (originalMime.includes('text') || originalMime.includes('plain')) ext = 'txt';
                    else if (originalMime.includes('csv')) ext = 'csv';
                    else if (originalMime.includes('json')) ext = 'json';

                    const attachmentName = `file_${randomUUID().slice(0, 8)}.${ext}`;
                    filesFolder.file(attachmentName, part.inlineData.data, { base64: true });
                    part.inlineData._zipRef = `files/${attachmentName}`;
                  }
                  delete part.inlineData.data;
                } else if (part.generatedImage) {
                  const blob = await getGeneratedImageBlob(part.generatedImage);
                  if (blob) {
                    const extension = part.generatedImage.mediaType === 'image/webp'
                      ? 'webp'
                      : part.generatedImage.mediaType === 'image/jpeg' ? 'jpg'
                        : part.generatedImage.mediaType === 'image/svg+xml' ? 'svg' : 'png';
                    const imageName = `generated_${part.generatedImage.id}.${extension}`;
                    imagesFolder.file(imageName, blob);
                    part.generatedImage._zipRef = `images/${imageName}`;
                  }
                }
              }
            }
          }
        }
      }

      if (dataToExport.astras) {
        for (const astra of dataToExport.astras) {
          if (astra.avatarUrl && astra.avatarUrl.startsWith('data:image')) {
            const matches = astra.avatarUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
              const mimeType = matches[1];
              const base64Data = matches[2];
              const processed = await compressImage(base64Data, mimeType, 256, 0.7);
              const imageName = `avatar_${astra.id.slice(0, 8)}.${processed.ext}`;
              imagesFolder.file(imageName, processed.data, { base64: true });
              astra._avatarZipRef = `images/${imageName}`;
              delete astra.avatarUrl;
            }
          }
        }
      }

      zip.file('data.json', JSON.stringify(dataToExport));

      const blob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 }
      });

      if ('showSaveFilePicker' in window) {
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: fileName,
            types: [{ description: 'Noureon Backup (ZIP)', accept: { 'application/zip': ['.zip'] } }]
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          toggleModal(elements.exportDataModal, false);
          showNotification(text('exportSuccess', '資料匯出成功！'), 'success');
          return;
        } catch (error) {
          logger.log('File System API skipped.');
        }
      }

      const shareFile = new File([blob], fileName, { type: 'application/zip' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [shareFile] }) && /Mobi|Android/i.test(navigator.userAgent)) {
        // Only the file: a title or a text beside it is put into the message as words by the apps that take it.
        await navigator.share({ files: [shareFile] });
      } else {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.style.display = 'none';
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(anchor);
      }

      toggleModal(elements.exportDataModal, false);
      showNotification(text('exportSuccess', '資料匯出成功！'), 'success');
    } catch (error) {
      logger.error('Export failed:', error);
      showNotification(`${text('exportFailed', '匯出失敗')}: ${error.message}`, 'error');
    } finally {
      elements.confirmExportBtn.textContent = originalBtnText;
      elements.confirmExportBtn.disabled = false;
      setButtonBusy(elements.confirmExportBtn, false);
    }
  }

  // The notes of a backup go into the memory, checked as every write is; a backup without them, or a memory that is not loaded, is left as it is.
  async function importMemoryNotes(data, { selected = true } = {}) {
    if (!data?.memoryNotes || !selected) return null;
    try {
      const result = await (await import('../memory-store/notes-transfer.js')).importNotes({ data: data.memoryNotes });
      if (result.ok) showNotification(text('mnImportDone', 'Memory notes imported: {added} added, {skipped} left out.').replace('{added}', result.added).replace('{skipped}', Object.values(result.skipped).reduce((sum, count) => sum + count, 0)), 'success');
      else showNotification(text('mnImportBad', 'The memory notes in this file could not be imported.'), 'warning');
      return result;
    } catch (error) {
      logger.warn?.('The memory notes of the backup could not be imported.', error);
      return null;
    }
  }

  // What the file holds, as a list the person ticks before anything is replaced (only what is ticked is replaced; the rest of the app stays as it is).
  // Resolves { accepted, chosen: { chats, folders, astras, settings, keys, notes } }.
  async function confirmImportOf(data, message, title) {
    const held = data?.memoryNotes;
    const has = (list) => Array.isArray(list) && list.length > 0;
    const items = [
      has(data?.conversations) && { id: 'chats', label: text('importHasChats', '對話 {n}').replace('{n}', data.conversations.length) },
      has(data?.folders) && { id: 'folders', label: text('importHasFolders', '專案 {n}').replace('{n}', data.folders.length) },
      has(data?.astras) && { id: 'astras', label: text('importHasAstras', 'Nouras {n}').replace('{n}', data.astras.length) },
      data?.settings && { id: 'settings', label: text('importHasSettings', '設定') },
      (data?.encryptedApiKeys || data?.apiKeys) && { id: 'keys', label: text('importHasApiKeys', 'API 金鑰') },
      Array.isArray(held?.notes) && { id: 'notes', label: text('importMemoryChoice', '記憶筆記（{n} 條，忘記的關鍵字 {m} 個）').replace('{n}', held.notes.length).replace('{m}', Array.isArray(held.blocked) ? held.blocked.length : 0) }
    ].filter(Boolean).map((item) => ({ ...item, checked: true }));
    const everything = Object.fromEntries(['chats', 'folders', 'astras', 'settings', 'keys', 'notes'].map((id) => [id, items.some((item) => item.id === id)]));
    if (!items.length) return { accepted: Boolean(await showCustomConfirm(message, title)), chosen: everything };
    const answer = await showCustomConfirm(`${message}\n\n${text('importChooseItems', '勾選要匯入的項目；沒勾的維持現狀。')}`, title, { preformatted: true, checklist: items });
    // (A confirm that only answers yes or no takes everything along.)
    if (typeof answer === 'boolean') return { accepted: answer, chosen: everything };
    const picked = new Set(Array.isArray(answer?.selected) ? answer.selected : []);
    return { accepted: Boolean(answer?.accepted), chosen: Object.fromEntries(Object.keys(everything).map((id) => [id, picked.has(id)])) };
  }

  // After the import: which notes came in and which were left out, and why.
  async function showMemoryImportDetail(result) {
    if (!result?.ok) return;
    const lines = [text('importMemoryAdded', '新增 {n} 條').replace('{n}', result.added)];
    for (const note of result.details?.added || []) lines.push(`・${note}`);
    const left = Object.values(result.skipped).reduce((sum, count) => sum + count, 0);
    if (left) {
      lines.push('', text('importMemorySkipped', '略過 {n} 條').replace('{n}', left));
      for (const item of result.details?.skipped || []) lines.push(`・${item.text}（${text(`importSkip_${item.reason}`, item.reason)}）`);
    }
    if (result.blocked) lines.push('', text('importMemoryBlocked', '另外加入 {n} 個「不要再學」的關鍵字').replace('{n}', result.blocked));
    await showCustomConfirm(lines.join('\n'), text('importMemoryTitle', '記憶匯入結果'), { preformatted: true, okOnly: true });
  }

  async function performImport(data) {
    if (!getCurrentUser()) {
      throw new Error(text('importNoUser', 'Data cannot be imported without a signed-in user.'));
    }
    replaceAllAppData({
      conversations: data.conversations || [],
      folders: data.folders || [],
      astras: data.astras || [],
      personalMemories: data.personalMemories || []
    });
    await saveAppData();
    applySettings(data.settings);
    const memoryResult = await importMemoryNotes(data);
    await mergeApiKeys(await resolveImportedApiKeys(data));
    await saveConfig();
    await showMemoryImportDetail(memoryResult);
  }

  async function handleImport() {
    const file = elements.importFileInput.files[0];
    if (!file) {
      showNotification(text('selectFileError', 'Select a file.'), 'error');
      return;
    }

    const {
      importProgressContainer,
      importProgressBar,
      importStatusText,
      importPercentage,
      importWarningText,
      confirmImportBtn
    } = elements;

    importProgressContainer.classList.remove('hidden');
    importWarningText.classList.remove('hidden');
    confirmImportBtn.disabled = true;
    setButtonBusy(confirmImportBtn, true);
    confirmImportBtn.textContent = getRuntimeText(getConfig().uiLanguage, 'processing');

    const updateProgress = (percent, message) => {
      importProgressBar.style.width = `${percent}%`;
      importPercentage.textContent = `${Math.round(percent)}%`;
      if (message) importStatusText.textContent = message;
    };

    try {
      updateProgress(5, text('importReadingFile', 'Reading the file...'));
      await delay(1000);

      let rawData = null;
      let zip = null;

      if (file.name.endsWith('.zip') || file.type.includes('zip')) {
        updateProgress(10, text('importUnzipping', 'Unzipping...'));
        const JSZipCtor = await requireArchiveVendor();
        zip = await JSZipCtor.loadAsync(file);

        let jsonFile = zip.file('data.json');
        if (!jsonFile) {
          const files = Object.keys(zip.files);
          const jsonFileName = files.find((name) => name.endsWith('.json'));
          if (jsonFileName) jsonFile = zip.file(jsonFileName);
        }

        if (!jsonFile) throw new Error(text('importZipNoJson', 'No JSON data was found in the ZIP file.'));

        updateProgress(20, text('importParsingStructure', 'Reading the JSON structure...'));
        const jsonContent = await jsonFile.async('string');
        rawData = JSON.parse(jsonContent);
      } else {
        updateProgress(10, text('importParsingJson', 'Reading the JSON...'));
        const textContent = await file.text();
        rawData = JSON.parse(textContent);
      }

      const backupUsername = getBackupUsername(rawData);
      const confirmedImport = backupUsername && backupUsername !== getCurrentUser().username
        ? await confirmImportOf(
          rawData,
          text('importUserMismatch', '備份使用者 {backupUser} 與目前使用者 {currentUser} 不同。')
            .replace('{backupUser}', backupUsername)
            .replace('{currentUser}', getCurrentUser().username),
          text('importUserMismatchTitle', '使用者不符')
        )
        : await confirmImportOf(rawData, text('importOverwriteWarning', '匯入將覆蓋目前資料。'), text('importConfirmation', '確認匯入'));
      if (!confirmedImport.accepted) throw new Error(IMPORT_CANCELLED);
      const chosen = confirmedImport.chosen;
      if (!Object.values(chosen).some(Boolean) && !Array.isArray(rawData.personalMemories)) {
        showNotification(text('importNothingChosen', '沒有勾選任何要匯入的項目。'), 'info');
        throw new Error(IMPORT_CANCELLED);
      }

      const importedApiKeys = chosen.keys ? await resolveImportedApiKeys(rawData) : null;

      updateProgress(30, text('importPreparing', 'Getting ready to import...'));

      // What was not ticked stays as it is; what was ticked is replaced by the file's.
      const activeAppData = replaceAllAppData({
        conversations: chosen.chats ? [] : getConversations(),
        folders: chosen.folders ? [] : getFolders(),
        astras: chosen.astras ? [] : getAstras(),
        personalMemories: []
      });

      if (chosen.settings) applySettings(rawData.settings);
      await mergeApiKeys(importedApiKeys);
      await saveConfig();
      const memoryResult = await importMemoryNotes(rawData, { selected: chosen.notes });

      const astrasToImport = chosen.astras ? rawData.astras || [] : [];
      if (astrasToImport.length > 0) {
        await processInChunks(astrasToImport, async (astra) => {
          if (astra._avatarZipRef && zip) {
            try {
              const fileInZip = zip.file(astra._avatarZipRef);
              if (fileInZip) {
                const base64 = await fileInZip.async('base64');
                let mime = 'image/png';
                if (astra._avatarZipRef.endsWith('.jpg') || astra._avatarZipRef.endsWith('.jpeg')) mime = 'image/jpeg';
                astra.avatarUrl = `data:${mime};base64,${base64}`;
                delete astra._avatarZipRef;
              }
            } catch (error) {
              logger.warn('Noura 頭像還原失敗', error);
            }
          }
          activeAppData.astras.push(astra);
        }, 10, (current, total) => {
          const percent = 30 + (current / total) * 10;
          updateProgress(percent, text('importingNouras', 'Importing Nouras ({current}/{total})...').replace('{current}', current).replace('{total}', total));
        });
      }

      if (chosen.folders && rawData.folders) {
        activeAppData.folders = replaceFolders(rawData.folders);
      }

      if (rawData.personalMemories) {
        activeAppData.personalMemories = replacePersonalMemories(rawData.personalMemories);
      }

      const conversationsToImport = chosen.chats ? rawData.conversations || [] : [];
      if (conversationsToImport.length > 0) {
        await processInChunks(conversationsToImport, async (conversation) => {
          for (const message of conversation.messages) {
            if (message.parts) {
              for (const part of message.parts) {
                if (part.inlineData && part.inlineData._zipRef && zip) {
                  try {
                    const fileName = part.inlineData._zipRef;
                    const fileInZip = zip.file(fileName);
                    if (fileInZip) {
                      const base64 = await fileInZip.async('base64');
                      part.inlineData.data = base64;
                      delete part.inlineData._zipRef;
                    }
                  } catch (error) {
                    logger.warn('附件還原失敗', error);
                  }
                }
                if (part.generatedImage?._zipRef && zip) {
                  try {
                    const fileInZip = zip.file(part.generatedImage._zipRef);
                    if (fileInZip) {
                      const blob = await fileInZip.async('blob');
                      await saveGeneratedImageBlob(part.generatedImage, blob);
                      delete part.generatedImage._zipRef;
                    }
                  } catch (error) {
                    logger.warn('Generated image import failed', error);
                  }
                }
              }
            }
          }
          activeAppData.conversations.push(conversation);
        }, 5, (current, total) => {
          const percent = 40 + (current / total) * 50;
          updateProgress(percent, text('importingChats', 'Restoring chats ({current}/{total})...').replace('{current}', current).replace('{total}', total));
        });
      }

      updateProgress(90, text('importWriting', 'Saving to the database...'));
      await saveAppData();

      updateProgress(100, text('importDone', 'Import complete!'));
      await delay(500);

      toggleModal(elements.importDataModal, false);
      showNotification(text('importSuccess', '匯入成功！'), 'success');

      applyUiTheme();
      applyLanguage(getConfig().uiLanguage);
      resolveSearchSetupSettingsModal();

      const firstConversation = getConversations().find((conversation) => !conversation.archived && !conversation.deletedAt);
      if (firstConversation) loadChat(firstConversation.id);
      else startNewChat();
      await showMemoryImportDetail(memoryResult);
    } catch (error) {
      if (error.message === IMPORT_CANCELLED) {
        showNotification(getRuntimeText(getConfig().uiLanguage, 'importCancelled'), 'info');
      } else {
        logger.error(error);
        showNotification(`${text('importFailed', '匯入失敗')}: ${error.message}`, 'error');
        updateProgress(0, text('importFailed', 'Import failed'));
        importProgressBar.classList.add('bg-red-500');
      }
    } finally {
      confirmImportBtn.disabled = false;
      setButtonBusy(confirmImportBtn, false);
      confirmImportBtn.textContent = text('confirmAndImport', '確認並匯入');
    }
  }

  // The tick box of the notes says how many there are when the export opens.
  async function showExportMemoryCount() {
    try {
      const data = await (await import('../memory-store/notes-transfer.js')).exportNotes();
      const label = elements.exportMemoryCheck?.closest?.('label')?.querySelector?.('span');
      if (data && label) label.textContent = `${text('exportPersonalMemory', '記憶筆記')}（${data.notes.length}）`;
    } catch {
      // The label stays as it is.
    }
  }
  elements.exportDataBtn?.addEventListener?.('click', () => { void showExportMemoryCount(); });

  return {
    handleExport,
    performImport,
    handleImport,
    resolveImportedApiKeys
  };
}
