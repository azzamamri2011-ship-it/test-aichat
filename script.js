/**
 * ZAAM-ASISTEN PRO - SCRIPT ENGINE
 */

const CONFIG = {
    PROXY_LIST: [
        (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
        (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
    ],
    API_GPT: (q) => `https://api.sxtream.my.id/ai/ai-gpt4?query=${encodeURIComponent(q)}`,
    API_GEMINI: (p) => `https://api-varhad.my.id/ai/gemini?prompt=${encodeURIComponent(p)}`
};

let state = {
    isProcessing: false,
    selectedFiles: [],
    history: JSON.parse(localStorage.getItem('zaam_history_pro')) || [],
    currentEngine: 'gpt'
};

// --- DOM References (Fixed IDs) ---
const ui = {
    msgList: document.getElementById('messages-container'),
    input: document.getElementById('user-input'),
    sendBtn: document.getElementById('send-btn'),
    chatWindow: document.getElementById('chat-window'),
    typingBox: document.getElementById('typing-box'),
    historyList: document.getElementById('history-list'),
    fileShelf: document.getElementById('file-shelf'),
    engineSelector: document.getElementById('engine-selector')
};

document.addEventListener('DOMContentLoaded', () => {
    marked.setOptions({
        highlight: (code, lang) => {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
        breaks: true,
        gfm: true
    });

    renderHistory();
    if (state.history.length === 0) {
        showWelcomeMessage();
    } else {
        createNewChat();
    }

    ui.engineSelector.addEventListener('change', (e) => {
        state.currentEngine = e.target.value;
        updateStatus(`Engine: ${state.currentEngine.toUpperCase()}`);
    });
});

async function handleSend() {
    const prompt = ui.input.value.trim();
    if ((!prompt && state.selectedFiles.length === 0) || state.isProcessing) return;

    addMessage(prompt, 'user', [...state.selectedFiles]);
    const currentPrompt = prompt;
    
    clearInput();
    setProcessing(true);

    const targetUrl = state.currentEngine === 'gemini' 
        ? CONFIG.API_GEMINI(currentPrompt) 
        : CONFIG.API_GPT(currentPrompt);

    const aiResponse = await fetchWithProxy(targetUrl);

    setProcessing(false);
    if (aiResponse) {
        addMessage(aiResponse, 'ai', [], state.currentEngine);
        addToHistory(currentPrompt);
    } else {
        addMessage("⚠️ Gagal terhubung ke inti AI. Silakan ganti Engine.", 'error');
    }
}

async function fetchWithProxy(url) {
    for (let proxyFn of CONFIG.PROXY_LIST) {
        try {
            const response = await fetch(proxyFn(url));
            if (!response.ok) continue;

            let data = await response.json();
            if (data.contents) {
                try { data = JSON.parse(data.contents); } catch(e) { data = data.contents; }
            }

            const result = data.result || data.text || data.message || (typeof data === 'string' ? data : null);
            if (result) return result;
        } catch (e) {
            console.warn("Proxy retry...");
        }
    }
    return null;
}

function addMessage(content, role, files = [], engineName = '') {
    const isUser = role === 'user';
    const wrapper = document.createElement('div');
    wrapper.className = `flex gap-4 md:gap-6 ${isUser ? 'flex-row-reverse' : ''}`;
    
    const avatar = isUser 
        ? `<div class="w-10 h-10 rounded-2xl bg-indigo-600 flex shrink-0 items-center justify-center"><i class="fas fa-user text-xs"></i></div>`
        : `<div class="w-10 h-10 rounded-2xl bg-zinc-800 border border-white/5 flex shrink-0 items-center justify-center"><i class="fas fa-robot text-indigo-400 text-xs"></i></div>`;

    let fileHtml = '';
    if (files.length > 0) {
        fileHtml = `<div class="flex flex-wrap gap-2 mb-3">`;
        files.forEach(file => {
            if (file.type.startsWith('image/')) {
                const url = URL.createObjectURL(file);
                fileHtml += `<img src="${url}" class="h-44 rounded-xl border border-white/10 object-cover">`;
            }
        });
        fileHtml += `</div>`;
    }

    const nameLabel = isUser ? 'Anda' : (role === 'error' ? 'Sistem' : `Zaam AI (${engineName.toUpperCase()})`);
    const bubbleStyle = isUser 
        ? 'bg-indigo-600/90 text-white' 
        : (role === 'error' ? 'bg-red-500/10 text-red-200' : 'zaam-glass border-l-4 border-l-indigo-600');

    wrapper.innerHTML = `
        ${avatar}
        <div class="flex flex-col space-y-2 max-w-[85%] ${isUser ? 'items-end' : ''}">
            <span class="text-[9px] font-bold text-zinc-500 uppercase tracking-widest px-1">${nameLabel}</span>
            <div class="p-4 rounded-2xl ${bubbleStyle}">
                ${fileHtml}
                <div class="prose prose-invert max-w-none">
                    ${isUser ? escapeHtml(content) : marked.parse(content)}
                </div>
            </div>
        </div>
    `;

    ui.msgList.appendChild(wrapper);
    scrollToBottom();
    wrapper.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    state.selectedFiles = [...state.selectedFiles, ...files];
    renderFilePreviews();
}

function renderFilePreviews() {
    ui.fileShelf.innerHTML = '';
    if (state.selectedFiles.length > 0) {
        ui.fileShelf.classList.remove('hidden');
        state.selectedFiles.forEach((file, idx) => {
            const div = document.createElement('div');
            div.className = 'zaam-glass p-2 rounded-lg flex items-center gap-2 text-[10px]';
            div.innerHTML = `
                <i class="fas ${file.type.startsWith('image') ? 'fa-image' : 'fa-file'} text-indigo-400"></i>
                <span class="max-w-[70px] truncate">${file.name}</span>
                <button onclick="removeFile(${idx})" class="text-red-400 ml-1"><i class="fas fa-times"></i></button>
            `;
            ui.fileShelf.appendChild(div);
        });
    } else {
        ui.fileShelf.classList.add('hidden');
    }
}

function removeFile(idx) {
    state.selectedFiles.splice(idx, 1);
    renderFilePreviews();
}

function addToHistory(title) {
    const cleanTitle = title.substring(0, 35) + (title.length > 35 ? '...' : '');
    const entry = { id: Date.now(), title: cleanTitle };
    state.history.unshift(entry);
    if (state.history.length > 15) state.history.pop();
    localStorage.setItem('zaam_history_pro', JSON.stringify(state.history));
    renderHistory();
}

function renderHistory() {
    ui.historyList.innerHTML = '<p class="text-[10px] text-zinc-600 font-bold uppercase tracking-widest ml-2 mb-4">Riwayat Terbaru</p>';
    state.history.forEach(item => {
        const btn = document.createElement('button');
        btn.className = 'w-full p-3 rounded-xl flex items-center gap-3 text-zinc-400 text-xs hover:bg-white/5 transition-all text-left';
        btn.innerHTML = `<i class="far fa-message text-[10px]"></i> <span class="truncate">${item.title}</span>`;
        ui.historyList.appendChild(btn);
    });
}

function showWelcomeMessage() {
    addMessage("Selamat datang di **Zaam-Asisten Pro**. Saya siap membantu Anda.", "ai", [], "system");
}

function createNewChat() {
    ui.msgList.innerHTML = '';
    showWelcomeMessage();
}

function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}

function setProcessing(val) {
    state.isProcessing = val;
    ui.typingBox.classList.toggle('hidden', !val);
    ui.sendBtn.disabled = val;
    updateStatus(val ? "Sedang Memproses..." : "Sistem Siap");
}

function clearInput() {
    ui.input.value = '';
    ui.input.style.height = 'auto';
    state.selectedFiles = [];
    renderFilePreviews();
}

function scrollToBottom() {
    ui.chatWindow.scrollTo({ top: ui.chatWindow.scrollHeight, behavior: 'smooth' });
}

function updateStatus(txt) {
    const statusEl = document.getElementById('status-text');
    if(statusEl) statusEl.innerText = txt;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

ui.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
    }
});
