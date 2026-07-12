import {
    EXTERNAL_DATA_LIMITS,
    parseExternalJson,
    validateExternalAstra,
    validateExternalConversation,
    validateExternalFolder,
    validateZipFileCount
} from '../../runtime/security/external-data-validation.js';
import { validateAvatarSourceContent } from '../../runtime/security/image-content-validation.js';

export function createReceivedDataLifecycle({
    BlobCtor = Blob,
    JSZip,
    getAstras = () => [],
    getConversations = () => [],
    getFolders = () => [],
    getDefaultFolder,
    randomUUID = () => crypto.randomUUID(),
    saveAppData,
    renderAll,
    showNotification,
    toggleModal,
    getText = (_key, fallback) => fallback,
    getP2pShareModal,
    scheduleTimeout = setTimeout,
    logger = console
} = {}) {
    const processReceivedData = async (buffers, type) => {
        try {
            const blob = new BlobCtor(buffers);
            if (Number.isFinite(blob.size) && blob.size > EXTERNAL_DATA_LIMITS.maxArchiveBytes) {
                throw new Error('Received archive exceeds the size limit');
            }
            const zip = await JSZip.loadAsync(blob);
            validateZipFileCount(zip);
            const astras = getAstras();
            const conversations = getConversations();
            const folders = getFolders();
            let totalJsonBytes = 0;
            const readJson = async (filename) => {
                const file = zip.file(filename);
                if (!file) throw new Error(`Missing required file: ${filename}`);
                const content = await file.async('string');
                const parsed = parseExternalJson(content, { path: filename });
                totalJsonBytes += parsed.size;
                if (totalJsonBytes > EXTERNAL_DATA_LIMITS.maxTotalJsonBytes) {
                    throw new Error('Received JSON exceeds the total size limit');
                }
                return parsed.value;
            };

            if (type === 'astras') {
                const files = Object.keys(zip.files);
                const importedAstras = [];
                for (const filename of files) {
                    if (filename.startsWith('astra_') && filename.endsWith('.json')) {
                        const astraData = validateExternalAstra(await readJson(filename));
                        astraData.avatarUrl = await validateAvatarSourceContent(astraData.avatarUrl);

                        if (astras.some(a => a.id === astraData.id)) {
                            astraData.id = randomUUID();
                            astraData.name += ` (${getText('imported', 'Imported')})`;
                        }
                        importedAstras.push(astraData);
                    }
                }
                importedAstras.forEach(astra => astras.unshift(astra));
                const count = importedAstras.length;
                showNotification(getText('p2pReceivedAstrasSuccess', 'Received {count} Nouras.').replace('{count}', count), 'success');
            } else {
                if (type !== 'conversations') throw new Error('Unsupported received data type');
                const rawFolders = await readJson('folders.json');
                const rawConversations = await readJson('conversations.json');
                if (!Array.isArray(rawFolders) || !Array.isArray(rawConversations)) {
                    throw new Error('Received folders and conversations must be arrays');
                }
                const importedFolders = rawFolders.map(validateExternalFolder);
                const importedConvs = rawConversations.map(validateExternalConversation);
                const idMap = {};

                importedConvs.forEach(conv => {
                    const oldId = conv.id;
                    const newId = randomUUID();
                    idMap[oldId] = newId;
                    conv.id = newId;
                    conv.folderId = null;

                    if (conv.astrasId && !astras.find(a => a.id === conv.astrasId)) {
                        conv.astrasId = null;
                    }

                    conversations.unshift(conv);
                });

                importedFolders.forEach(folder => {
                    let folderName = folder.name;
                    if (folders.some(f => f.name === folderName)) {
                        folderName += ` (${getText('shared', 'Shared')})`;
                    }

                    const newFolder = {
                        id: randomUUID(),
                        name: folderName,
                        conversationIds: [],
                        ...getDefaultFolder()
                    };
                    folders.push(newFolder);
                    const newFolderId = newFolder.id;

                    newFolder.color = folder.color;
                    newFolder.icon = folder.icon;
                    newFolder.textColor = folder.textColor;

                    folder.conversationIds.forEach(oldConvId => {
                        const newConvId = idMap[oldConvId];
                        if (newConvId) {
                            const conv = conversations.find(c => c.id === newConvId);
                            if (conv) {
                                conv.folderId = newFolderId;
                                if (!newFolder.conversationIds.includes(newConvId)) {
                                    newFolder.conversationIds.push(newConvId);
                                }
                            }
                        }
                    });
                });

                showNotification(
                    getText('p2pReceivedFoldersSuccess', 'Received {folders} folders and {conversations} conversations.')
                        .replace('{folders}', importedFolders.length)
                        .replace('{conversations}', importedConvs.length),
                    'success'
                );
            }

            await saveAppData();
            renderAll();
            scheduleTimeout(() => {
                toggleModal(getP2pShareModal(), false);
            }, 1500);
        } catch (e) {
            logger.error(e);
            showNotification(getText('p2pDataParseFailed', 'Failed to parse received data.'), "error");
        }
    };

    return { processReceivedData };
}
