/**
 * ZAAM-ASISTEN ENTERPRISE ENGINE v4.5
 * Author: Gemini AI Collaboration
 * Architecture: Modular Singleton Pattern
 */

"use strict";

// --- GLOBAL CONFIGURATION ---
const APP_CONFIG = {
    ENDPOINTS: {
        gpt: (q) => `https://api.sxtream.my.id/ai/ai-gpt4?query=${encodeURIComponent(q)}`,
        gemini: (q) => `https://api-varhad.my.id/ai/gemini?prompt=${encodeURIComponent(q)}`,
        claude: (q) => `https://api.sxtream.my.id/ai/claude?query=${encodeURIComponent(q)}`
    },
    PROXIES: [
        (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
        (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
    ],
    LOCAL_STORAGE_KEY: 'zaam_enterprise_sessions',
    WELCOME_TEXT: "Selamat datang di Zaam-Asisten Enterprise. Bagaimana saya bisa membantu riset atau proyek Anda hari ini?"
};

// --- STATE MANAGEMENT ---
let appState = {
    isProcessing: false,
    selectedFiles: [],
    currentSessionId: null,
    sessions: JSON.parse(localStorage.getItem(APP_CONFIG.LOCAL_STORAGE_KEY)) || [],
    currentEngine: 'gpt'
};

// --- DOM REFERENCES ---
const DOM = {
    messages: document.getElementById('messages-container'),
    input: document.getElementById('main-input'),
    sendBtn: document.getElementById('send-button'),
    chatWindow: document.getElementById('chat-window'),
    indicator: document.getElementById('typing-indicator'),
    history: document.getElementById('history-container'),
    fileShelf: document.getElementById('preview-shelf'),
    engineSelect: document.getElementById('engine-selector'),
    welcome: document.getElementById('welcome-screen'),
    sessionCount: document.getElementById('session-count'),
    statusLabel: document.getElementById('status-label')
};

/**
 * UI MANAGER
 * Handles all visual updates and layout logic
 */
const uiManager = {
    init() {
        this.setupMarkdown();
        this.renderSessions();
        this.updateSessionStats();
        DOM.engineSelect.addEventListener('change', (e) => {
            appState.currentEngine = e.target.value;
            this.notify(`Engine switched to ${e.target.value.toUpperCase()}`, 'info');
        });
    },

    setupMarkdown() {
        marked.setOptions({
            highlight: (code, lang) => {
                const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                return hljs.highlight(code, { language }).value;
            },
            breaks: true,
            gfm: true
        });
    },

    autoResize(el) {
        el.style.height = 'auto';
        const newHeight = Math.min(el.scrollHeight, 240);
        el.style.height = newHeight + 'px';
    },

    scrollToBottom(force = false) {
        if (force) {
            DOM.chatWindow.scrollTop = DOM.chatWindow.scrollHeight;
        } else {
            DOM.chatWindow.scrollTo({
                top: DOM.chatWindow.scrollHeight,
                behavior: 'smooth'
            });
        }
    },

    setLoading(isLoading, text = "AI sedang berpikir...") {
        appState.isProcessing = isLoading;
        DOM.indicator.classList.toggle('hidden', !isLoading);
        DOM.sendBtn.disabled = isLoading;
        document.getElementById('typing-text').innerText = text;
        
        if (isLoading) {
            DOM.statusLabel.innerText = "Processing Logic...";
            DOM.statusLabel.classList.replace('text-white', 'text-indigo-400');
        } else {
            DOM.statusLabel.innerText = "System Operational";
            DOM.statusLabel.classList.replace('text-indigo-400', 'text-white');
        }
    },

    fillPrompt(text) {
        DOM.input.value = text;
        this.autoResize(DOM.input);
        DOM.input.focus();
    },

    renderSessions() {
        DOM.history.innerHTML = '';
        if (appState.sessions.length === 0) {
            DOM.history.innerHTML = `
                <div class="flex flex-col items-center justify-center h-32 opacity-20 text-center">
                    <i class="fas fa-folder-open text-3xl mb-2"></i>
                    <p class="text-[10px]">Belum ada riwayat</p>
                </div>`;
            return;
        }

        appState.sessions.forEach(session => {
            const div = document.createElement('div');
            div.className = `history-item p-3.5 rounded-2xl border border-white/5 cursor-pointer transition-all hover:bg-white/5 flex items-center gap-3 group relative ${appState.currentSessionId === session.id ? 'active' : ''}`;
            div.onclick = () => sessionManager.load(session.id);
            
            div.innerHTML = `
                <i class="far fa-message text-xs opacity-40 group-hover:text-indigo-400 transition-colors"></i>
                <div class="flex-1 overflow-hidden">
                    <p class="text-[11px] font-medium truncate pr-4">${session.title}</p>
                    <p class="text-[8px] opacity-30 uppercase font-bold">${new Date(session.timestamp).toLocaleDateString()}</p>
                </div>
                <button onclick="event.stopPropagation(); sessionManager.delete('${session.id}')" class="absolute right-3 opacity-0 group-hover:opacity-100 p-1.5 hover:text-red-400 transition-all">
                    <i class="fas fa-xmark text-[10px]"></i>
                </button>
            `;
            DOM.history.appendChild(div);
        });
    },

    updateSessionStats() {
        DOM.sessionCount.innerText = `${appState.sessions.length} Sesi`;
    },

    notify(msg, type = 'error') {
        const modal = document.getElementById('modal-container');
        const title = document.getElementById('modal-title');
        const desc = document.getElementById('modal-desc');
        const icon = document.getElementById('modal-icon');

        modal.classList.remove('hidden');
        desc.innerText = msg;

        if (type === 'info') {
            title.innerText = "Informasi";
            icon.className = "w-16 h-16 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center mx-auto mb-6 text-2xl";
            icon.innerHTML = '<i class="fas fa-circle-info"></i>';
        } else {
            title.innerText = "Terjadi Kesalahan";
            icon.className = "w-16 h-16 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center mx-auto mb-6 text-2xl";
            icon.innerHTML = '<i class="fas fa-triangle-exclamation"></i>';
        }
    },

    closeModal() {
        document.getElementById('modal-container').classList.add('hidden');
    },

    clearCurrentChat() {
        if (confirm("Bersihkan semua pesan dalam sesi ini?")) {
            DOM.messages.innerHTML = '';
            DOM.welcome.classList.remove('hidden');
        }
    }
};

/**
 * CHAT CORE
 * Main engine for sending and receiving messages
 */
const chatCore = {
    async executeSend() {
        const text = DOM.input.value.trim();
        if ((!text && appState.selectedFiles.length === 0) || appState.isProcessing) return;

        // Hide welcome screen if first message
        DOM.welcome.classList.add('hidden');

        // Create session if none active
        if (!appState.currentSessionId) {
            sessionManager.createNew(text || "Percakapan Baru");
        }

        const userFiles = [...appState.selectedFiles];
        this.appendMessage(text, 'user', userFiles);
        this.clearInput();

        uiManager.setLoading(true);

        try {
            const engineUrl = APP_CONFIG.ENDPOINTS[appState.currentEngine](text);
            const response = await this.networkRequest(engineUrl);

            if (response) {
                this.appendMessage(response, 'ai');
                sessionManager.updateCurrentSession(text, response);
            } else {
                throw new Error("Respon AI kosong atau tidak valid.");
            }
        } catch (err) {
            console.error(err);
            this.appendMessage(`**Sistem Error:** ${err.message}`, 'system');
        } finally {
            uiManager.setLoading(false);
        }
    },

    async networkRequest(url) {
        let lastError = null;

        for (let proxyFn of APP_CONFIG.PROXIES) {
            try {
                const proxiedUrl = proxyFn(url);
                const res = await fetch(proxiedUrl, { method: 'GET' });
                
                if (!res.ok) continue;

                let data = await res.json();
                
                // Handle different API result formats
                if (data.contents) data = JSON.parse(data.contents);
                const result = data.result || data.text || data.message || (typeof data === 'string' ? data : null);
                
                if (result) return result;
            } catch (e) {
                lastError = e;
                continue;
            }
        }
        throw lastError || new Error("Gagal terhubung ke semua jalur API.");
    },

    appendMessage(content, role, files = []) {
        const isUser = role === 'user';
        const isSystem = role === 'system';
        const msgId = 'msg-' + Date.now();

        const wrapper = document.createElement('div');
        wrapper.id = msgId;
        wrapper.className = `flex gap-5 md:gap-8 msg-anim ${isUser ? 'flex-row-reverse' : ''}`;

        // Avatar Logic
        let avatarIcon = isUser ? 'fa-user' : (isSystem ? 'fa-triangle-exclamation' : 'fa-robot');
        let avatarBg = isUser ? 'bg-indigo-600' : (isSystem ? 'bg-red-500/20 text-red-500' : 'bg-zinc-800 border border-white/10');
        
        // File HTML
        let fileHtml = '';
        if (files.length > 0) {
            fileHtml = `<div class="flex flex-wrap gap-3 mb-4">`;
            files.forEach(f => {
                if (f.type.startsWith('image/')) {
                    const url = URL.createObjectURL(f);
                    fileHtml += `<img src="${url}" class="max-h-64 rounded-2xl border border-white/5 shadow-2xl">`;
                } else {
                    fileHtml += `
                        <div class="zaam-glass p-3 rounded-xl flex items-center gap-3 border-indigo-500/20">
                            <i class="fas fa-file-lines text-indigo-400"></i>
                            <div class="text-[10px]">
                                <p class="font-bold text-white truncate w-24">${f.name}</p>
                                <p class="opacity-40 uppercase">${(f.size/1024).toFixed(1)} KB</p>
                            </div>
                        </div>`;
                }
            });
            fileHtml += `</div>`;
        }

        const bubbleClass = isUser 
            ? 'bg-indigo-600/90 text-white rounded-tr-none' 
            : (isSystem ? 'bg-red-500/10 border-red-500/20 text-red-200' : 'zaam-glass border-l-4 border-l-indigo-600 rounded-tl-none shadow-2xl');

        wrapper.innerHTML = `
            <div class="w-10 h-10 rounded-2xl ${avatarBg} flex shrink-0 items-center justify-center shadow-lg">
                <i class="fas ${avatarIcon} text-[14px]"></i>
            </div>
            <div class="flex flex-col space-y-2 max-w-[85%] ${isUser ? 'items-end' : ''}">
                <div class="flex items-center gap-2 px-1">
                    <span class="text-[9px] font-black text-zinc-500 uppercase tracking-widest">
                        ${isUser ? 'Otoritas User' : (isSystem ? 'Sistem Peringatan' : `Zaam Intelligence (${appState.currentEngine.toUpperCase()})`)}
                    </span>
                </div>
                <div class="p-5 md:p-6 rounded-[24px] ${bubbleClass}">
                    ${fileHtml}
                    <div class="prose prose-sm md:prose-base prose-invert leading-relaxed">
                        ${isUser ? this.escape(content) : marked.parse(content)}
                    </div>
                </div>
            </div>
        `;

        DOM.messages.appendChild(wrapper);
        uiManager.scrollToBottom();
        
        // Apply Code Highlighting
        wrapper.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
    },

    clearInput() {
        DOM.input.value = '';
        DOM.input.style.height = 'auto';
        appState.selectedFiles = [];
        attachmentManager.render();
    },

    escape(str) {
        const d = document.createElement('div');
        d.innerText = str;
        return d.innerHTML;
    }
};

/**
 * ATTACHMENT MANAGER
 */
const attachmentManager = {
    handle(e) {
        const files = Array.from(e.target.files);
        appState.selectedFiles = [...appState.selectedFiles, ...files];
        this.render();
    },

    render() {
        DOM.fileShelf.innerHTML = '';
        if (appState.selectedFiles.length > 0) {
            DOM.fileShelf.classList.remove('hidden');
            appState.selectedFiles.forEach((file, i) => {
                const div = document.createElement('div');
                div.className = 'zaam-glass py-2 px-3 rounded-xl flex items-center gap-3 text-[10px] animate-msg';
                div.innerHTML = `
                    <i class="fas ${file.type.startsWith('image') ? 'fa-image' : 'fa-file-code'} text-indigo-400"></i>
                    <span class="max-w-[100px] truncate font-medium">${file.name}</span>
                    <button onclick="attachmentManager.remove(${i})" class="text-zinc-500 hover:text-red-400 ml-1 transition-colors">
                        <i class="fas fa-xmark"></i>
                    </button>
                `;
                DOM.fileShelf.appendChild(div);
            });
        } else {
            DOM.fileShelf.classList.add('hidden');
        }
    },

    remove(idx) {
        appState.selectedFiles.splice(idx, 1);
        this.render();
    }
};

/**
 * SESSION MANAGER
 * Manages local persistence and session switching
 */
const sessionManager = {
    createNew(title = "Percakapan Baru") {
        const id = 'sess-' + Date.now();
        const newSession = {
            id,
            title,
            timestamp: Date.now(),
            messages: []
        };
        appState.sessions.unshift(newSession);
        appState.currentSessionId = id;
        this.save();
        this.load(id);
    },

    load(id) {
        const session = appState.sessions.find(s => s.id === id);
        if (!session) return;

        appState.currentSessionId = id;
        DOM.messages.innerHTML = '';
        DOM.welcome.classList.add('hidden');

        session.messages.forEach(m => {
            chatCore.appendMessage(m.content, m.role);
        });

        uiManager.renderSessions();
        uiManager.updateSessionStats();
        
        if (window.innerWidth < 1024) toggleSidebar();
    },

    updateCurrentSession(userText, aiText) {
        const session = appState.sessions.find(s => s.id === appState.currentSessionId);
        if (!session) return;

        // Auto-update title if it's still default
        if (session.title === "Percakapan Baru") {
            session.title = userText.substring(0, 40) + "...";
        }

        session.messages.push(
            { role: 'user', content: userText },
            { role: 'ai', content: aiText }
        );
        this.save();
        uiManager.renderSessions();
    },

    delete(id) {
        if (!confirm("Hapus sesi ini secara permanen?")) return;
        appState.sessions = appState.sessions.filter(s => s.id !== id);
        if (appState.currentSessionId === id) {
            appState.currentSessionId = null;
            DOM.messages.innerHTML = '';
            DOM.welcome.classList.remove('hidden');
        }
        this.save();
        uiManager.renderSessions();
        uiManager.updateSessionStats();
    },

    save() {
        localStorage.setItem(APP_CONFIG.LOCAL_STORAGE_KEY, JSON.stringify(appState.sessions));
    }
};

// --- INITIALIZE APP ---
document.addEventListener('DOMContentLoaded', () => uiManager.init());

// Handle Ctrl+Enter to Send
DOM.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatCore.executeSend();
    }
});

console.log("Zaam Enterprise Engine initialized successfully.");
