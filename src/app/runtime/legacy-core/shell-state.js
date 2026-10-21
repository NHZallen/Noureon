// The state the parts of the application shell share (legacy-core.js), as small stores: each is read and changed only through its
// named functions, so every change of who is signed in, the files waiting to be sent, the reply being made, the batch selection,
// the quoted text or the sidebar goes through one place (NOU-78). The settings and the workspace data stay in their own stores
// (runtimeConfigAccess, runtimeAppDataStore); a state only one part uses stays inside that part.

/** Who is signed in. */
export function createSessionStore() {
    let currentUser = null;
    return Object.freeze({
        getCurrentUser: () => currentUser,
        setCurrentUser: (user) => {
            currentUser = user ?? null;
            return currentUser;
        }
    });
}

/** The files waiting to be sent with the next message. */
export function createUploadsStore() {
    let uploadedFiles = [];
    return Object.freeze({
        getUploadedFiles: () => uploadedFiles,
        setUploadedFiles: (files) => {
            uploadedFiles = Array.isArray(files) ? files : [];
            return uploadedFiles;
        },
        clearUploadedFiles: () => {
            uploadedFiles = [];
        }
    });
}

/** The reply being made: how to stop it, whether a council is meeting, and whether the person confirmed sending. */
export function createReplyStore() {
    let abortController = null;
    let councilRunning = false;
    let sendConfirmed = false;
    return Object.freeze({
        getAbortController: () => abortController,
        setAbortController: (controller) => {
            abortController = controller ?? null;
        },
        isCouncilRunning: () => councilRunning,
        setCouncilRunning: (running) => {
            councilRunning = Boolean(running);
        },
        isSendConfirmed: () => sendConfirmed,
        setSendConfirmed: (confirmed) => {
            sendConfirmed = Boolean(confirmed);
            return sendConfirmed;
        }
    });
}

/** The batch selection of conversations in the sidebar. The ids are handed out as a copy; only the functions here change them. */
export function createSelectionStore() {
    let selectionMode = false;
    const selectedIds = new Set();
    return Object.freeze({
        isSelectionMode: () => selectionMode,
        setSelectionMode: (on) => {
            selectionMode = Boolean(on);
        },
        getSelectedConversationIds: () => new Set(selectedIds),
        selectConversation: (id, selected = true) => {
            if (selected) selectedIds.add(id);
            else selectedIds.delete(id);
        },
        clearSelectedConversations: () => {
            selectedIds.clear();
        }
    });
}

/** The text quoted from a reply into the next message. */
export function createQuoteStore() {
    let quoteReference = null;
    return Object.freeze({
        getQuoteReference: () => quoteReference,
        setQuoteReference: (reference) => {
            quoteReference = reference ?? null;
        }
    });
}

/** Whether the sidebar is open. */
export function createSidebarStore() {
    let sidebarOpen = false;
    return Object.freeze({
        isSidebarOpen: () => sidebarOpen,
        setSidebarOpen: (open) => {
            sidebarOpen = Boolean(open);
            return sidebarOpen;
        }
    });
}

export function createShellState() {
    return Object.freeze({
        session: createSessionStore(),
        uploads: createUploadsStore(),
        reply: createReplyStore(),
        selection: createSelectionStore(),
        quote: createQuoteStore(),
        sidebar: createSidebarStore()
    });
}
