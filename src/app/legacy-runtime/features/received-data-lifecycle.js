export function createReceivedDataLifecycle({
    BlobCtor = Blob,
    loadArchiveVendor,
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
    const resolveArchiveVendor = typeof loadArchiveVendor === 'function'
        ? loadArchiveVendor
        : () => Promise.resolve(JSZip);

    const processReceivedData = async (buffers, type) => {
        try {
            const blob = new BlobCtor(buffers);
            const loadedVendor = await resolveArchiveVendor();
            const JSZipCtor = loadedVendor?.JSZip || loadedVendor?.default || loadedVendor;
            if (typeof JSZipCtor?.loadAsync !== 'function') {
                throw new TypeError('JSZip did not expose a usable constructor.');
            }
            const zip = await JSZipCtor.loadAsync(blob);
            const astras = getAstras();
            const conversations = getConversations();
            const folders = getFolders();

            if (type === 'astras') {
                let count = 0;
                const files = Object.keys(zip.files);
                for (const filename of files) {
                    if (filename.startsWith('astra_') && filename.endsWith('.json')) {
                        const content = await zip.file(filename).async("string");
                        const astraData = JSON.parse(content);

                        if (astras.some(a => a.id === astraData.id)) {
                            astraData.id = randomUUID();
                            astraData.name += ` (${getText('imported', 'Imported')})`;
                        }
                        astraData.officialId = null;

                        astras.unshift(astraData);
                        count++;
                    }
                }
                showNotification(getText('p2pReceivedAstrasSuccess', 'Received {count} Nouras.').replace('{count}', count), 'success');
            } else {
                const foldersContent = await zip.file('folders.json').async("string");
                const convsContent = await zip.file('conversations.json').async("string");

                const importedFolders = JSON.parse(foldersContent);
                const importedConvs = JSON.parse(convsContent);
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
