const getText = (i18n, language, key, fallback) => i18n?.[language]?.[key] || fallback;

export function createLegacyAuthImportLifecycle({
  elements,
  JSZip,
  getConfig,
  mutateConfig,
  mergeSensitiveApiKeys = (apiKeys) => {
    if (!apiKeys) return;
    mutateConfig((config) => {
      config.apiKeys = { ...config.apiKeys, ...apiKeys };
      return config;
    });
  },
  setCurrentUser,
  createPasswordRecord,
  getUserKey,
  setItem,
  replaceAllAppData,
  replaceFolders,
  replacePersonalMemories,
  saveAppData,
  saveConfig,
  saveSensitiveConfig = async () => {},
  processInChunks,
  getBackupUsername,
  hashString,
  constantTimeEqual,
  showNotification,
  toggleModal,
  requestAnimationFrame,
  scheduleTimeout,
  delay,
  initChatApp,
  i18n,
  logger = console
} = {}) {
  const language = () => getConfig().uiLanguage;
  const text = (key, fallback) => getText(i18n, language(), key, fallback);

  function handleImportOnAuth() {
    toggleModal(elements.importDataModalAuth, true);
  }

  async function processAuthImport() {
    const username = elements.usernameInput.value.trim();
    const password = elements.passwordInput.value;
    const file = elements.importFileInputAuth.files[0];

    if (!file) {
      showNotification(text('selectFileError', 'Select a file.'), 'error');
      return;
    }

    const {
      importProgressContainerAuth,
      importProgressBarAuth,
      importStatusTextAuth,
      importPercentageAuth,
      confirmImportBtnAuth
    } = elements;

    importProgressContainerAuth.classList.remove('hidden');
    confirmImportBtnAuth.disabled = true;
    confirmImportBtnAuth.textContent = 'Processing...';

    const updateProgress = (percent, statusText) => {
      importProgressBarAuth.style.width = `${percent}%`;
      importPercentageAuth.textContent = `${Math.round(percent)}%`;
      if (statusText) importStatusTextAuth.textContent = statusText;
    };

    try {
      updateProgress(5, 'Reading import file...');
      await delay(1000);

      let rawData = null;
      let zip = null;

      if (file.name.endsWith('.zip') || file.type.includes('zip')) {
        updateProgress(10, 'Extracting ZIP...');
        zip = await JSZip.loadAsync(file);

        let jsonFile = zip.file('data.json');
        if (!jsonFile) {
          const files = Object.keys(zip.files);
          const jsonFileName = files.find((name) => name.endsWith('.json'));
          if (jsonFileName) jsonFile = zip.file(jsonFileName);
        }

        if (!jsonFile) throw new Error('ZIP file does not contain JSON data.');

        updateProgress(15, 'Parsing import data...');
        const jsonContent = await jsonFile.async('string');
        rawData = JSON.parse(jsonContent);
      } else {
        updateProgress(10, 'Parsing JSON...');
        const fileText = await file.text();
        rawData = JSON.parse(fileText);
      }

      updateProgress(20, 'Verifying identity...');

      const backupUsername = getBackupUsername(rawData);
      if (!backupUsername) {
        throw new Error(text('importInvalidFile', 'Invalid import file.'));
      }

      if (backupUsername !== username) {
        throw new Error(text('importAuthMismatch', 'Account or password does not match the import file.'));
      }

      if (rawData.user_credentials?.passwordHash) {
        const legacyHash = await hashString(password);
        if (!constantTimeEqual(rawData.user_credentials.passwordHash, legacyHash)) {
          throw new Error(text('importAuthMismatch', 'Account or password does not match the import file.'));
        }
      }

      const importTargetUserJson = elements.authForm?.dataset?.importTargetUser;
      let persistedUserForImport;
      if (importTargetUserJson) {
        persistedUserForImport = setCurrentUser(JSON.parse(importTargetUserJson));
        await setItem(getUserKey(persistedUserForImport.username), JSON.stringify(persistedUserForImport));
        await setItem('chat_lastUser', persistedUserForImport.username);
      } else {
        const userKey = getUserKey(username);
        const nextUser = await createPasswordRecord(username, password);
        const persistedUser = setCurrentUser(nextUser);
        persistedUserForImport = persistedUser;
        await setItem(userKey, JSON.stringify(persistedUser));
        await setItem('chat_lastUser', username);
      }
      if (elements.authForm?.dataset?.importTargetUser) {
        delete elements.authForm.dataset.importTargetUser;
      }

      updateProgress(30, 'Identity verified. Restoring data...');

      const activeAppData = replaceAllAppData({
        conversations: [],
        folders: [],
        astras: [],
        personalMemories: []
      });

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
              logger.warn('Astra avatar restore failed', error);
            }
          }
          activeAppData.astras.push(astra);
        }, 10, (current, total) => {
          const percent = 30 + (current / total) * 10;
          updateProgress(percent, `Restoring Astras (${current}/${total})...`);
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
                    logger.warn('Attachment restore failed', error);
                  }
                }
              }
            }
          }
          activeAppData.conversations.push(conversation);
        }, 5, (current, total) => {
          const percent = 40 + (current / total) * 50;
          updateProgress(percent, `Restoring conversations (${current}/${total})...`);
        });
      }

      updateProgress(95, 'Saving imported data...');

      await saveAppData();
      if (rawData.settings) {
        mutateConfig((config) => {
          Object.assign(config, rawData.settings);
          return config;
        });
      }
      if (rawData.apiKeys) {
        mergeSensitiveApiKeys(rawData.apiKeys);
        await saveSensitiveConfig();
      }
      await saveConfig();

      updateProgress(100, 'Import successful.');
      await delay(500);

      toggleModal(elements.importDataModalAuth, false);

      elements.authContainer.classList.add('fade-out');
      elements.appContainer.classList.remove('hidden');
      requestAnimationFrame(() => {
        elements.appContainer.classList.add('visible');
      });

      const hideAuthContainer = () => {
        elements.authContainer.style.display = 'none';
        elements.authContainer.classList.remove('visible');
      };
      elements.authContainer.addEventListener('transitionend', hideAuthContainer, { once: true });
      scheduleTimeout(hideAuthContainer, 500);

      initChatApp();
      showNotification(text('importSuccess', 'Import success.'), 'success');
    } catch (error) {
      logger.error(error);
      showNotification(`${text('importFailed', 'Import failed')}: ${error.message}`, 'error');
      updateProgress(0, 'Error');
      importProgressBarAuth.classList.add('bg-red-500');
      importStatusTextAuth.classList.add('text-red-500');
    } finally {
      confirmImportBtnAuth.disabled = false;
      confirmImportBtnAuth.textContent = text('confirmAndImport', 'Confirm and import');
    }
  }

  return {
    handleImportOnAuth,
    processAuthImport
  };
}
