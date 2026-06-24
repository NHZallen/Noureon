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
    getP2pShareModal,
    scheduleTimeout = setTimeout,
    logger = console
} = {}) {
    const processReceivedData = async (buffers, type) => {
        try {
            const blob = new BlobCtor(buffers);
            const zip = await JSZip.loadAsync(blob);
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
                            astraData.name += " (匯入)";
                        }
                        astraData.officialId = null;

                        astras.unshift(astraData);
                        count++;
                    }
                }
                showNotification(`成功接收 ${count} 個 Astras！`, 'success');
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
                        folderName += " (分享)";
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

                showNotification(`成功接收 ${importedFolders.length} 個資料夾與 ${importedConvs.length} 則對話！`, 'success');
            }

            await saveAppData();
            renderAll();
            scheduleTimeout(() => {
                toggleModal(getP2pShareModal(), false);
            }, 1500);
        } catch (e) {
            logger.error(e);
            showNotification("資料解析失敗", "error");
        }
    };

    return { processReceivedData };
}
