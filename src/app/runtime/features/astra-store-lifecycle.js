// The Noura store (official and own Nouras by category, subscribing and unsubscribing) and the editor of a Noura's picture.

export function createAstraStoreLifecycle({
    document, elements: ALL_ELEMENTS, i18n, OFFICIAL_ASTRAS, getUiLanguage, getAstras, replaceAstras, requestAnimationFrame, crypto,
    console, FileReader, Cropper, escapeHTML, deleteAstrasFromCloud = async () => {}, showNotification, toggleModal, saveAppData, renderAstras
}) {
    // The category shown in the store, and the picture editor: its cropper and the Noura whose picture it changes.
    let currentStoreCategory = 'all';
    let cropperInstance = null;
    let editingAstraForAvatarId = null;
    const texts = () => i18n[getUiLanguage()] || {};
    const openStore = () => {
        ALL_ELEMENTS.appContainer.classList.remove('visible');
        ALL_ELEMENTS.storeContainer.classList.remove('hidden');
        requestAnimationFrame(() => {
            ALL_ELEMENTS.storeContainer.classList.add('visible');
        });
        ALL_ELEMENTS.appContainer.addEventListener('transitionend', () => {
            ALL_ELEMENTS.appContainer.classList.add('hidden');
        }, { once: true });
        currentStoreCategory = 'all';
        const mainContent = document.querySelector('#store-main-content');
        if (mainContent) {
            mainContent.scrollTop = 0;
        }
        renderStore();
    };
    const closeStore = () => {
        ALL_ELEMENTS.storeContainer.classList.remove('visible');
        ALL_ELEMENTS.appContainer.classList.remove('hidden');
        requestAnimationFrame(() => {
            ALL_ELEMENTS.appContainer.classList.add('visible');
        });
        ALL_ELEMENTS.storeContainer.addEventListener('transitionend', () => {
            ALL_ELEMENTS.storeContainer.classList.add('hidden');
        }, { once: true });
    };
    const renderStore = () => {
        const mainContent = document.querySelector('#store-main-content');
        if (mainContent) {
            mainContent.scrollTop = 0;
        }
        const grid = ALL_ELEMENTS.storeGrid;
        const categoryList = document.getElementById('store-category-list');
        if (!grid || !categoryList) return;
        grid.innerHTML = '';
        categoryList.innerHTML = '';
        const translations = i18n[getUiLanguage()] || i18n['zh-TW'];
        const translatedOfficialAstras = OFFICIAL_ASTRAS.map(ast => ({
            ...ast,
            name: translations['astras_' + ast.id.replace(/-/g, '_') + '_name'] || ast.name,
            description: translations['astras_' + ast.id.replace(/-/g, '_') + '_desc'] || ast.description
        }));
        const userCreatedAstras = getAstras().filter(a => !a.officialId);
        const categoryTranslationKeys = {
            '生產力': 'astrasCategoryProductivity',
            '規劃': 'astrasCategoryPlanning',
            '語言學習': 'astrasCategoryLanguageLearning',
            '心理健康': 'astrasCategoryMentalHealth',
            '遊戲': 'astrasCategoryGames'
        };
        const getCategoryLabel = (category) => {
            if (category === 'all') return translations.all || 'All';
            const translationKey = categoryTranslationKeys[category];
            return translationKey ? (translations[translationKey] || category) : category;
        };
        const allCategories = ['all', ...new Set([
            ...translatedOfficialAstras.map(a => a.category),
            ...userCreatedAstras.map(a => a.category)
        ].filter(Boolean))];
        allCategories.forEach(category => {
            const btn = document.createElement('button');
            btn.className = 'store-category-btn';
            btn.textContent = getCategoryLabel(category);
            if (category === currentStoreCategory) {
                btn.classList.add('active');
            }
            btn.addEventListener('click', () => {
                currentStoreCategory = category;
                renderStore();
            });
            categoryList.appendChild(btn);
        });
        const allStoreAstras = [...translatedOfficialAstras, ...userCreatedAstras];
        const filteredAstras = currentStoreCategory === 'all'
        ? allStoreAstras
        : allStoreAstras.filter(a => a.category === currentStoreCategory);
        filteredAstras.forEach(ast => {
            const card = document.createElement('div');
            card.className = 'astras-store-card';
            const originalId = ast.officialId || ast.id;
            const isSubscribed = getAstras().some(userAstra => userAstra.officialId === originalId);
            const isUserCreated = !ast.officialId && getAstras().some(userAstra => userAstra.id === originalId);
            const avatarUrl = ast.avatarUrl;
            const initials = escapeHTML(ast.name.charAt(0));
            const avatarElement = `<div class="astras-card-avatar">${avatarUrl ? `<img src="${escapeHTML(avatarUrl)}" alt="${escapeHTML(ast.name)}">` : initials}</div>`;
            card.innerHTML = `
            ${avatarElement}
            <h3 class="astras-card-name">${escapeHTML(ast.name)}</h3>
            <p class="astras-card-desc">${escapeHTML(ast.description)}</p>
            <button class="subscribe-btn btn-primary" data-id="${escapeHTML(originalId)}"></button>
        `;
            const btn = card.querySelector('.subscribe-btn');
            if (isSubscribed) {
                btn.textContent = translations.unsubscribe || '取消訂閱';
                btn.classList.add('subscribed');
            } else if (isUserCreated) {
                btn.textContent = translations.manage || '管理';
                btn.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                btn.textContent = translations.subscribe || '訂閱';
            }
            btn.addEventListener('click', async () => {
                await handleSubscription(originalId);
            });
            grid.appendChild(card);
        });
    };
    const handleSubscription = async (officialId) => {
        const isSubscribed = getAstras().some(a => a.officialId === officialId);
        if (isSubscribed) {
            const subscribedAstras = getAstras().filter(a => a.officialId === officialId);
            try {
                await deleteAstrasFromCloud(
                    subscribedAstras.map(astra => astra.id),
                    { astras: subscribedAstras }
                );
            } catch (error) {
                try { console.warn('Noureon cloud Noura unsubscribe failed; keeping the local Noura.', error); } catch {}
                showNotification(texts().cloudDeleteFailed || '雲端刪除失敗，請稍後再試。', 'error');
                return;
            }
            replaceAstras(getAstras().filter(a => a.officialId !== officialId));
            showNotification(texts().unsubscribed || '已取消訂閱', 'success');
        } else {
            const officialAstra = OFFICIAL_ASTRAS.find(a => a.id === officialId);
            if (officialAstra) {
                const newAstra = {
                    ...officialAstra,
                    id: crypto.randomUUID(),
                    officialId: officialAstra.id,
                };
                getAstras().unshift(newAstra);
                showNotification(texts().subscribed || '訂閱成功！', 'success');
            }
        }
        await saveAppData();
        renderStore();
        renderAstras();
    };
    const openAvatarEditor = (astrasId) => {
        editingAstraForAvatarId = astrasId;
        ALL_ELEMENTS.astrasAvatarInput.click();
    };
    const handleAvatarUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const imageUrl = e.target.result;
            ALL_ELEMENTS.avatarCropImage.src = imageUrl;
            toggleModal(ALL_ELEMENTS.astrasAvatarModal, true);
            if (cropperInstance) {
                cropperInstance.destroy();
            }
            cropperInstance = new Cropper(ALL_ELEMENTS.avatarCropImage, {
                aspectRatio: 1,
                viewMode: 1,
                background: false,
                autoCropArea: 1,
            });
        };
        reader.readAsDataURL(file);
        event.target.value = '';
    };
    const handleConfirmAvatarCrop = async () => {
        if (!cropperInstance || !editingAstraForAvatarId) return;
        const canvas = cropperInstance.getCroppedCanvas({
            width: 128,
            height: 128,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
        });
        const imageDataUrl = canvas.toDataURL('image/png');
        const astra = getAstras().find(a => a.id === editingAstraForAvatarId);
        if (astra) {
            astra.avatarUrl = imageDataUrl;
            await saveAppData();
            renderAstras();
            showNotification(texts().avatarUpdated || '頭像已更新', 'success');
        }
        toggleModal(ALL_ELEMENTS.astrasAvatarModal, false);
        editingAstraForAvatarId = null;
    };
    // Closing the picture editor without saving: the cropper is let go and no Noura is being changed.
    const cancelAvatarCrop = () => {
        toggleModal(ALL_ELEMENTS.astrasAvatarModal, false);
        cropperInstance?.destroy();
        cropperInstance = null;
        editingAstraForAvatarId = null;
    };
    return { openStore, closeStore, renderStore, handleSubscription, openAvatarEditor, handleAvatarUpload, handleConfirmAvatarCrop, cancelAvatarCrop };
}
