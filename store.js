// ==========================================
// store.js - 全局状态与核心数据管理
// ==========================================

const DOCS_KEY = 'cute_editor_docs_v4';
const TRASH_KEY = 'cute_editor_trash';
const CONFIG_KEY = 'cute_editor_integrations';
const SNIPPETS_KEY = 'cute_editor_snippets';

let docs = [];
let trashDocs = []; 
let currentDocId = null;
let dualDocId = null;
let lastSyncTime = 0; 

let historyStack = []; 
let redoStack = []; 
let historyTimeout;
let isMarkdownMode = false; 
let isDualMode = false; 
let isTypewriterMode = false; 
let isReadMode = false;

// DOM 元素引用
const editor = document.getElementById('main-input');
const dualEditor = document.getElementById('dual-input');
const mdPreviewPane = document.getElementById('md-preview-pane');
const statusIndicator = document.getElementById('save-status');
const scratchpad = document.getElementById('scratchpad');

// ================= 初始化 Snippets =================
let customSnippets = {};
function loadCustomSnippets() {
    const saved = localStorage.getItem(SNIPPETS_KEY) || "/date === 【自动日期】\n;;bg === 【工作汇报】\n1. 今日进展：\n2. 遇到问题：\n3. 明日计划：";
    document.getElementById('custom-snippets-input').value = saved;
    customSnippets = {};
    saved.split('\n').forEach(line => {
        const parts = line.split('===');
        if(parts.length === 2 && parts[0].trim()) {
            let val = parts[1].trim();
            if(parts[0].trim() === '/date') {
                customSnippets[parts[0].trim()] = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
            } else if (parts[0].trim() === '/time') {
                customSnippets[parts[0].trim()] = () => { const d = new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; };
            } else {
                customSnippets[parts[0].trim()] = () => val.replace(/\\n/g, '\n');
            }
        }
    });
    if(!customSnippets['/date']) customSnippets['/date'] = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
}

// ================= 核心保存与读取 =================
let saveStatusTimeout;
let diskWriteTimeout; // 新增：用于防抖的定时器

function saveDocsStateSilent() {
    // 1. 仅更新 UI 状态，不立刻读写硬盘（极其轻量，不会卡顿）
    statusIndicator.style.opacity = '1';
    statusIndicator.innerText = '⏳ 待保存...'; 
    statusIndicator.classList.add('saving');

    // 2. 延迟 1.5 秒后真正写入硬盘（防抖：如果一直连续打字，就不会执行）
    clearTimeout(diskWriteTimeout);
    diskWriteTimeout = setTimeout(() => {
        performDiskWrite();
    }, 1500);
}

// 真正的硬盘读写函数
function performDiskWrite() {
    const savedData = localStorage.getItem(DOCS_KEY); let latestDocs = [...docs];
    if (savedData) { const parsed = JSON.parse(savedData); latestDocs = parsed.list || [...docs]; }
    docs.forEach(localDoc => {
        const target = latestDocs.find(d => d.id === localDoc.id);
        if (!target) latestDocs.push(localDoc);
        else if (localDoc.id === currentDocId || localDoc.id === dualDocId) {
            target.content = localDoc.content; target.title = localDoc.title; target.snapshots = localDoc.snapshots;
        }
    });
    docs = latestDocs; 
    localStorage.setItem(DOCS_KEY, JSON.stringify({ list: docs, current: currentDocId }));
    
    statusIndicator.innerText = `✅ 已保存到本地`;
    statusIndicator.classList.remove('saving');
    clearTimeout(saveStatusTimeout);
    saveStatusTimeout = setTimeout(() => { statusIndicator.style.opacity = '0'; }, 3000);
}

function saveTrashState() { 
    localStorage.setItem(TRASH_KEY, JSON.stringify(trashDocs)); 
}

// ================= 文档增删改查 =================
function newDoc() { 
    const newName = prompt('输入新文档名称 (支持 #标签名 前缀)：', '未命名文档'); 
    if (newName === null) return; 
    const id = Date.now(); 
    docs.push({ id, title: newName.trim() || '未命名文档', content: '', snapshots: [] }); 
    currentDocId = id; 
    saveDocsStateSilent(); 
    renderDocsList(); 
    renderTabs(); 
    loadDoc(id); 
    updateDualSelectOptions(); 
}

function loadDoc(id) { 
    currentDocId = id; 
    sessionStorage.setItem('cute_current_doc', id); 
    const doc = docs.find(d => d.id === id); 
    if(!doc) return; 
    editor.value = doc.content; 
    historyStack = [doc.content]; 
    redoStack = []; 
    updateStats(); 
    renderTOC(); 
    updateMinimap(); 
    if(isMarkdownMode) renderMarkdown(); 
    saveDocsStateSilent(); 
    renderDocsList(); 
    renderTabs(); 
    document.getElementById('mobile-toc-panel').classList.remove('show'); 
}

function clearAllDocs() { 
    if(confirm('⚠️ 确定要清空文档列表的所有文档吗？（清空后可在回收站找回）')) { 
        const now = Date.now();
        const timeStr = new Date().toLocaleString();
        docs.forEach(d => { 
            d.deletedAt = timeStr; 
            d.deletedTimestamp = now; 
            trashDocs.push(d); 
        });
        saveTrashState();
        docs = [{ id: Date.now(), title: '默认文档', content: '', snapshots: [] }]; 
        currentDocId = docs[0].id; 
        saveDocsStateSilent(); 
        renderDocsList(); 
        renderTabs(); 
        loadDoc(currentDocId); 
        updateDualSelectOptions(); 
        showToast('🗑️ 文档列表已清空'); 
    } 
}

function deleteDoc(id, e) {
    if(e) e.stopPropagation(); 
    if(docs.length <= 1) return showToast('⚠️ 至少保留一个文档！');
    if(confirm('确定删除该文档吗？（可在回收站找回）')) {
        const targetDoc = docs.find(d => d.id === id);
        if(targetDoc) { targetDoc.deletedAt = new Date().toLocaleString(); targetDoc.deletedTimestamp = Date.now(); trashDocs.push(targetDoc); saveTrashState(); }
        docs = docs.filter(d => d.id !== id);
        if(currentDocId === id) currentDocId = docs[0].id;
        saveDocsStateSilent(); renderDocsList(); renderTabs(); loadDoc(currentDocId); updateDualSelectOptions();
    }
}

function renameDocPrompt(id) { 
    const doc = docs.find(d => d.id === id); 
    const newName = prompt('修改文档名称 (可添加 #标签名 前缀)：', doc.title); 
    if(newName && newName.trim()) { 
        doc.title = newName.trim(); 
        saveDocsStateSilent(); 
        renderDocsList(); 
        renderTabs(); 
        updateDualSelectOptions(); 
    } 
}