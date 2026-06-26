import { createExportSafeConfig } from '../security/sensitive-config-redaction.js';

const IMPORT_CANCELLED = 'IMPORT_CANCELLED';

const getLocaleText = (i18n, language, key, fallback) => i18n?.[language]?.[key] || fallback;

export function createLegacyImportExportLifecycle({
  document,
  window,
  navigator,
  URL,
  File,
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
  analyzeImageBrightness,
  getDominantColorPalette,
  applyCustomWallpaper,
  applyUiTheme,
  applyLanguage,
  setAiBubbleColor,
  setUserBubbleColor,
  loadChat,
  startNewChat,
  showCustomConfirm,
  showNotification,
  toggleModal,
  getOutputMode,
  resolveSearchSetupSettingsModal,
  i18n,
  randomUUID,
  delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  logger = console
} = {}) {
  const getLanguage = () => getConfig().uiLanguage;
  const text = (key, fallback) => getLocaleText(i18n, getLanguage(), key, fallback);

  function applySettings(settings) {
    if (!settings) return;
    mutateConfig((config) => {
      Object.assign(config, settings);
      return config;
    });
  }

  async function mergeApiKeys(apiKeys) {
    if (!apiKeys) return;
    mergeSensitiveApiKeys(apiKeys);
    await saveSensitiveConfig();
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
      rawData.conversations = getConversations();
      rawData.folders = getFolders();
    }
    if (elements.exportAstrasCheck.checked) {
      rawData.astras = getAstras();
    }
    if (elements.exportSettingsCheck.checked) {
      rawData.settings = createExportSafeConfig({
        defaultModel: config.defaultModel,
        theme: config.theme,
        modelSettings: config.modelSettings,
        aiBubbleColor: config.aiBubbleColor,
        userBubbleColor: config.userBubbleColor,
        autoNaming: config.autoNaming,
        enableAutoWebSearch: config.enableAutoWebSearch,
        memoryEnabled1: config.memoryEnabled1,
        enableAutoMemory: config.enableAutoMemory,
        customWallpaper: config.customWallpaper,
        wallpaperBrightness: config.wallpaperBrightness,
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
          'This export will include full API keys. Only continue if you will store the backup securely.'
        ),
        text('exportApiKeysWarningTitle', 'Export API keys?')
      );
      if (!confirmed) return;
      rawData.apiKeys = createExportSafeConfig(
        { apiKeys: getSensitiveApiKeys() },
        { includeSecrets: true }
      ).apiKeys || {};
    }
    if (elements.exportMemoryCheck.checked) {
      rawData.personalMemories = getPersonalMemories();
    }

    if (Object.keys(rawData).length === 0) {
      showNotification(text('selectDataToExportNotice', '請至少選擇一項要匯出的資料。'), 'warning');
      return;
    }

    const originalBtnText = elements.confirmExportBtn.textContent;
    elements.confirmExportBtn.textContent = '正在處理檔案...';
    elements.confirmExportBtn.disabled = true;

    const dataClone = JSON.parse(JSON.stringify(rawData));
    Object.assign(dataToExport, dataClone);

    const timestamp = new Date().toISOString().split('T')[0];
    const fileName = `chatbot_backup_${currentUser.username}_${timestamp}.zip`;

    try {
      const zip = new JSZip();
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
            types: [{ description: 'Astra Backup (ZIP)', accept: { 'application/zip': ['.zip'] } }]
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
        await navigator.share({ files: [shareFile], title: 'Astra Backup', text: 'Chat backup.' });
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
    }
  }

  async function performImport(data) {
    if (!getCurrentUser()) {
      throw new Error('無法在沒有登入使用者的情況下匯入資料。');
    }
    replaceAllAppData({
      conversations: data.conversations || [],
      folders: data.folders || [],
      astras: data.astras || [],
      personalMemories: data.personalMemories || []
    });
    await saveAppData();
    applySettings(data.settings);
    await mergeApiKeys(data.apiKeys);
    await saveConfig();
  }

  async function handleImport() {
    const file = elements.importFileInput.files[0];
    if (!file) {
      showNotification(text('selectFileError', '請選擇檔案。'), 'error');
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
    confirmImportBtn.textContent = '處理中...';

    const updateProgress = (percent, message) => {
      importProgressBar.style.width = `${percent}%`;
      importPercentage.textContent = `${Math.round(percent)}%`;
      if (message) importStatusText.textContent = message;
    };

    try {
      updateProgress(5, '正在讀取檔案...');
      await delay(1000);

      let rawData = null;
      let zip = null;

      if (file.name.endsWith('.zip') || file.type.includes('zip')) {
        updateProgress(10, '正在解壓縮 ZIP...');
        zip = await JSZip.loadAsync(file);

        let jsonFile = zip.file('data.json');
        if (!jsonFile) {
          const files = Object.keys(zip.files);
          const jsonFileName = files.find((name) => name.endsWith('.json'));
          if (jsonFileName) jsonFile = zip.file(jsonFileName);
        }

        if (!jsonFile) throw new Error('ZIP 檔案中找不到 JSON 資料。');

        updateProgress(20, '正在解析 JSON 結構...');
        const jsonContent = await jsonFile.async('string');
        rawData = JSON.parse(jsonContent);
      } else {
        updateProgress(10, '正在解析 JSON...');
        const textContent = await file.text();
        rawData = JSON.parse(textContent);
      }

      const backupUsername = getBackupUsername(rawData);
      if (backupUsername && backupUsername !== getCurrentUser().username) {
        const confirmed = await showCustomConfirm(
          text('importUserMismatch', '備份使用者 {backupUser} 與目前使用者 {currentUser} 不同。')
            .replace('{backupUser}', backupUsername)
            .replace('{currentUser}', getCurrentUser().username),
          text('importUserMismatchTitle', '使用者不符')
        );
        if (!confirmed) throw new Error(IMPORT_CANCELLED);
      } else if (!(await showCustomConfirm(text('importOverwriteWarning', '匯入將覆蓋目前資料。'), text('importConfirmation', '確認匯入')))) {
        throw new Error(IMPORT_CANCELLED);
      }

      updateProgress(30, '準備匯入資料...');

      const activeAppData = replaceAllAppData({
        conversations: [],
        folders: [],
        astras: [],
        personalMemories: []
      });

      applySettings(rawData.settings);
      await mergeApiKeys(rawData.apiKeys);
      await saveConfig();

      const astrasToImport = rawData.astras || [];
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
              logger.warn('Astra 頭像還原失敗', error);
            }
          }
          activeAppData.astras.push(astra);
        }, 10, (current, total) => {
          const percent = 30 + (current / total) * 10;
          updateProgress(percent, `正在匯入 Astras (${current}/${total})...`);
        });
      }

      if (rawData.folders) {
        activeAppData.folders = replaceFolders(rawData.folders);
      }

      if (rawData.personalMemories) {
        activeAppData.personalMemories = replacePersonalMemories(rawData.personalMemories);
      }

      const conversationsToImport = rawData.conversations || [];
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
              }
            }
          }
          activeAppData.conversations.push(conversation);
        }, 5, (current, total) => {
          const percent = 40 + (current / total) * 50;
          updateProgress(percent, `正在還原對話 (${current}/${total})...`);
        });
      }

      updateProgress(90, '正在寫入資料庫...');
      await saveAppData();

      updateProgress(100, '匯入完成！');
      await delay(500);

      toggleModal(elements.importDataModal, false);
      showNotification(text('importSuccess', '匯入成功！'), 'success');

      const config = getConfig();
      if (config.customWallpaper) {
        try {
          const brightness = await analyzeImageBrightness(config.customWallpaper);
          mutateConfig((currentConfig) => {
            currentConfig.wallpaperBrightness = brightness;
            return currentConfig;
          });
          if (getConfig().uiTheme.mode === 'adaptive') {
            const palette = await getDominantColorPalette(config.customWallpaper);
            mutateConfig((currentConfig) => {
              currentConfig.uiTheme.adaptivePalette = palette;
              currentConfig.uiTheme.adaptiveColor = palette[0] || '#3b82f6';
              return currentConfig;
            });
          }
          await saveConfig();
        } catch (error) {
          // Preserve the legacy silent wallpaper-analysis failure boundary.
        }
      }

      applyCustomWallpaper();
      applyUiTheme();
      setAiBubbleColor();
      setUserBubbleColor();
      applyLanguage(getConfig().uiLanguage);
      resolveSearchSetupSettingsModal();

      const firstConversation = getConversations().find((conversation) => !conversation.archived && !conversation.deletedAt);
      if (firstConversation) loadChat(firstConversation.id);
      else startNewChat();
    } catch (error) {
      if (error.message === IMPORT_CANCELLED) {
        showNotification('已取消匯入。', 'info');
      } else {
        logger.error(error);
        showNotification(`${text('importFailed', '匯入失敗')}: ${error.message}`, 'error');
        updateProgress(0, '匯入失敗');
        importProgressBar.classList.add('bg-red-500');
      }
    } finally {
      confirmImportBtn.disabled = false;
      confirmImportBtn.textContent = text('confirmAndImport', '確認並匯入');
    }
  }

  return {
    handleExport,
    performImport,
    handleImport
  };
}
