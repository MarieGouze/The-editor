// ==========================================
// ui.js - 界面渲染、弹窗与交互逻辑
// ==========================================

function showToast(msg) { 
    const t = document.getElementById('sys-toast'); 
    t.innerText = msg; 
    t.classList.add('show'); 
    setTimeout(() => t.classList.remove('show'), 2500); 
}

// ================= 移动端适配 =================
function adaptMobileUI() {
    const isMobile = window.innerWidth <= 800;
    const sidebar = document.getElementById('sidebar-drawer');
    const accessBar = document.getElementById('desktop-access-bar');

    if (isMobile) {
        if (!sidebar.contains(accessBar)) sidebar.insertBefore(accessBar, sidebar.firstChild);
    } else {
        if (sidebar.contains(accessBar)) {
            const layout = document.querySelector('.app-layout');
            layout.parentNode.insertBefore(accessBar, layout);
        }
        sidebar.classList.remove('show');
        document.getElementById('sidebar-overlay')?.classList.remove('show');
        document.getElementById('mobile-toc-panel').classList.remove('show');
    }
}
window.addEventListener('resize', adaptMobileUI);

function toggleSidebar() {
    document.getElementById('sidebar-drawer').classList.toggle('show');
    document.getElementById('sidebar-overlay').classList.toggle('show');
}

function toggleMobileTOC() {
    document.getElementById('mobile-toc-panel').classList.toggle('show');
}

// ================= 列表与目录渲染 =================
function renderDocsList() { 
    const listUi = document.getElementById('doc-list-ui');
    let groups = { '📌 未分类': [] };
    
    docs.forEach(d => {
        const match = d.title.match(/^#(\S+)\s+(.*)/);
        if (match) {
            const tag = match[1];
            const cleanTitle = match[2];
            if (!groups[tag]) groups[tag] = [];
            groups[tag].push({ ...d, cleanTitle });
        } else {
            groups['📌 未分类'].push({ ...d, cleanTitle: d.title });
        }
    });

    let html = '';
    for (const tag in groups) {
        if (groups[tag].length === 0) continue;
        html += `<div class="tag-group" id="group-${tag}">
            <div class="tag-group-title" onclick="this.parentElement.classList.toggle('collapsed')">
                <span>${tag === '📌 未分类' ? '' : '#'}${tag}</span>
                <span style="font-size:11px; font-weight:normal; opacity:0.6;">${groups[tag].length}</span>
            </div>
            <div class="tag-group-list">`;
        groups[tag].forEach(d => {
            html += `<li class="doc-item ${d.id === currentDocId ? 'active' : ''}" onclick="loadDoc(${d.id})" ondblclick="renameDocPrompt(${d.id})">
                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 85%;">📄 ${d.cleanTitle}</span>
                <span class="doc-del" onclick="deleteDoc(${d.id}, event)">✖</span>
            </li>`;
        });
        html += `</div></div>`;
    }
    listUi.innerHTML = html;
}

function renderTabs() { 
    document.getElementById('tabs-bar-ui').innerHTML = docs.map(d => `<div class="tab-item ${d.id === currentDocId ? 'active' : ''}" onclick="loadDoc(${d.id})" oncontextmenu="renameDocPrompt(${d.id}); return false;">${d.title.replace(/^#\S+\s+/, '')} ${d.id === currentDocId ? '' : `<span style="margin-left:5px;opacity:0.5" onclick="deleteDoc(${d.id}, event)">×</span>`}</div>`).join(''); 
}

function renderTOC() { 
    const lines = editor.value.split('\n'); let html = ''; 
    lines.forEach((line, index) => { 
        const match = line.match(/^(#{1,6})\s+(.+)$/); 
        if(match) { html += `<div class="toc-item" style="padding-left: ${(match[1].length-1)*12}px" onclick="scrollToLine(${index})" title="${match[2]}">${match[2]}</div>`; } 
    }); 
    const finalHtml = html || '<div style="color:var(--text-muted); font-size:12px; text-align:center;">暂无标题 (# 触发)</div>';
    document.getElementById('toc-list').innerHTML = finalHtml; 
    document.getElementById('mobile-toc-list').innerHTML = finalHtml; 
}

function scrollToLine(lineIndex) { 
    const lines = editor.value.split('\n'); let chars = 0; 
    for(let i=0; i<lineIndex; i++) chars += lines[i].length + 1; 
    editor.focus(); editor.setSelectionRange(chars, chars); editor.blur(); editor.focus(); 
    document.getElementById('mobile-toc-panel').classList.remove('show');
}

// ================= 字数统计与迷你地图 =================
function updateStats() { 
    const t = editor.value; const total = t.length; 
    const cnCount = (t.match(/[\u4e00-\u9fa5]/g) || []).length;
    const enWordCount = (t.match(/[a-zA-Z]+/g) || []).length;
    const paraCount = t.length === 0 ? 0 : t.split(/\n+/).filter(p => p.trim().length > 0).length;
    const tokenEstimate = Math.ceil((cnCount * 1.5) + (enWordCount * 1.3) + ((total - cnCount - enWordCount) * 0.5));
    
    document.getElementById('s-total').innerText = total; 
    document.getElementById('s-cn').innerText = cnCount; 
    document.getElementById('s-en').innerText = enWordCount; 
    document.getElementById('s-token').innerText = tokenEstimate; 
    document.getElementById('s-para').innerText = paraCount; 
    
    const mobileTokenDisplay = document.getElementById('mobile-token-display');
    if (mobileTokenDisplay) mobileTokenDisplay.innerText = tokenEstimate;
    
    const readTime = Math.max(1, Math.ceil(total / 300));
    document.getElementById('s-read-time').innerText = readTime + ' 分钟';
    const target = parseInt(document.getElementById('target-words').value) || 1; 
    document.getElementById('word-progress-fill').style.width = `${Math.min(100, (total / target) * 100)}%`; 
}

function updateMinimap() { document.getElementById('minimap-content').textContent = editor.value; syncMinimapScroll(); }
function syncMinimapScroll() {
    const viewport = document.getElementById('minimap-viewport');
    const container = document.getElementById('minimap-container');
    const visibleRatio = editor.clientHeight / (editor.scrollHeight || 1);
    viewport.style.height = Math.max(10, container.clientHeight * visibleRatio) + 'px';
    const scrollRatio = editor.scrollTop / (editor.scrollHeight - editor.clientHeight || 1);
    const maxScrollTop = Math.max(0, container.clientHeight - viewport.clientHeight);
    viewport.style.top = (scrollRatio * maxScrollTop) + 'px';
}
function handleMinimapClick(e) { const rect = e.currentTarget.getBoundingClientRect(); const ratio = e.offsetY / rect.height; editor.scrollTop = ratio * editor.scrollHeight; editor.focus(); }

// ================= 回收站 =================
function openTrashModal() { renderTrashList(); document.getElementById('trash-modal').classList.add('show'); }
function closeTrashModal(e) { if(e) e.stopPropagation(); document.getElementById('trash-modal').classList.remove('show'); }
function renderTrashList() {
    const ul = document.getElementById('trash-list-ui');
    if(trashDocs.length === 0) { ul.innerHTML = '<li style="padding: 10px; text-align:center; color: var(--text-muted);">回收站为空</li>'; return; }
    ul.innerHTML = trashDocs.map((doc, i) => `<li class="snapshot-item"><div><div class="snapshot-info">📄 ${doc.title}</div><div class="snapshot-time">删除时间: ${doc.deletedAt || '未知'} | 字数: ${doc.content.length}</div></div><div style="display:flex; gap:5px;"><button class="btn" style="padding: 4px 8px;" onclick="restoreFromTrash(${i})">恢复</button></div></li>`).join('');
}
function restoreFromTrash(index) {
    const doc = trashDocs[index]; trashDocs.splice(index, 1); delete doc.deletedAt; delete doc.deletedTimestamp; docs.push(doc); 
    saveTrashState(); saveDocsStateSilent(); renderDocsList(); renderTabs(); updateDualSelectOptions(); renderTrashList(); showToast('✅ 文档已恢复');
}
function emptyTrash() {
    if(trashDocs.length === 0) return;
    if(confirm('⚠️ 彻底清空回收站后将无法恢复，确定吗？')) { trashDocs = []; saveTrashState(); renderTrashList(); showToast('🗑️ 回收站已清空'); }
}

// ================= 历史快照 =================
function openSnapshotModal() { renderSnapshots(); document.getElementById('snapshot-modal').classList.add('show'); }
function closeSnapshotModal(e) { if(e) e.stopPropagation(); document.getElementById('snapshot-modal').classList.remove('show'); }
function saveSnapshot() { const doc = docs.find(d => d.id === currentDocId); const name = prompt('快照命名：', new Date().toLocaleString()); if(name) { doc.snapshots.unshift({ name, content: editor.value, time: new Date().toLocaleString() }); if(doc.snapshots.length > 20) doc.snapshots.pop(); saveDocsStateSilent(); renderSnapshots(); showToast('📷 已保存'); } }
function restoreSnapshot(index) { const doc = docs.find(d => d.id === currentDocId); if(confirm('覆盖当前内容？')) { setValue(doc.snapshots[index].content); closeSnapshotModal(); showToast('✅ 已恢复'); } }
function showSnapshotDiff(index) {
    const doc = docs.find(d => d.id === currentDocId);
    const snapContent = doc.snapshots[index].content;
    const currContent = editor.value;

    if (typeof diff_match_patch === 'undefined') return showToast('❌ Diff 库加载失败，请检查网络');
    const dmp = new diff_match_patch();
    const diffs = dmp.diff_main(snapContent, currContent);
    dmp.diff_cleanupSemantic(diffs);

    let html = '';
    diffs.forEach(part => {
        const type = part[0];
        const text = part[1].replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        if (type === 1) html += `<ins>${text}</ins>`;
        else if (type === -1) html += `<del>${text}</del>`;
        else html += `<span style="color:var(--text-muted)">${text}</span>`;
    });

    document.getElementById('diff-content').innerHTML = html;
    document.getElementById('diff-modal').classList.add('show');
}
function clearAllSnapshots() { if(confirm('清空所有快照？')) { const doc = docs.find(d => d.id === currentDocId); doc.snapshots = []; saveDocsStateSilent(); renderSnapshots(); showToast('🗑️ 已清空'); } }
function renderSnapshots() { 
    const doc = docs.find(d => d.id === currentDocId); const ul = document.getElementById('snapshot-list-ui'); 
    if(!doc.snapshots || doc.snapshots.length === 0) { ul.innerHTML = '<li style="padding: 10px; text-align:center; color: var(--text-muted);">暂无快照</li>'; return; } 
    ul.innerHTML = doc.snapshots.map((s, i) => `<li class="snapshot-item"><div><div class="snapshot-info">${s.name}</div><div class="snapshot-time">${s.time} (字数: ${s.content.length})</div></div><div style="display:flex; gap:5px;"><button class="btn" style="padding: 4px 8px;" onclick="showSnapshotDiff(${i})">对比</button><button class="btn" style="padding: 4px 8px;" onclick="restoreSnapshot(${i})">恢复</button></div></li>`).join(''); 
}

// ================= 番茄钟 =================
let pomoMins = 25, pomoTime = 0, pomoInterval = null, isPomoPaused = false;
function togglePomoPanel() { document.getElementById('pomo-panel').classList.toggle('show'); }
function updatePomoUI() { const m = Math.floor(pomoTime / 60).toString().padStart(2, '0'); const s = (pomoTime % 60).toString().padStart(2, '0'); document.getElementById('pomo-display').innerText = `${m}:${s}`; }
function pomoTick() { pomoTime--; updatePomoUI(); if(pomoTime <= 0) { resetPomodoro(); showToast('🍅 番茄钟完成！休息一下！'); alert('时间到！'); } }
function startPomodoro() { const val = document.getElementById('pomo-mins').value; if(!val || val <= 0) return; pomoMins = parseInt(val); pomoTime = pomoMins * 60; isPomoPaused = false; document.getElementById('pomo-panel').classList.remove('show'); document.getElementById('pomo-toggle-btn').style.display = 'none'; document.getElementById('pomo-running-bar').style.display = 'flex'; document.getElementById('pomo-pause-btn').innerText = '⏸'; updatePomoUI(); clearInterval(pomoInterval); pomoInterval = setInterval(pomoTick, 1000); }
function pausePomodoro() { const btn = document.getElementById('pomo-pause-btn'); if(isPomoPaused) { isPomoPaused = false; btn.innerText = '⏸'; pomoInterval = setInterval(pomoTick, 1000); } else { isPomoPaused = true; btn.innerText = '▶'; clearInterval(pomoInterval); } }
function restartPomodoro() { pomoTime = pomoMins * 60; updatePomoUI(); if(isPomoPaused) { isPomoPaused = false; document.getElementById('pomo-pause-btn').innerText = '⏸'; pomoInterval = setInterval(pomoTick, 1000); } showToast('🔄 已重新计时'); }
function resetPomodoro() { clearInterval(pomoInterval); isPomoPaused = false; document.getElementById('pomo-running-bar').style.display = 'none'; document.getElementById('pomo-toggle-btn').style.display = 'flex'; }

// ================= 主题与模式切换 =================
function changeFontSize(s) { document.documentElement.style.setProperty('--font-size', s); }
function changeTheme(t) { document.documentElement.setAttribute('data-theme', t); }
function toggleFullscreen() { const w = document.getElementById('editor-wrap'); const b = document.getElementById('btn-fullscreen'); w.classList.toggle('fullscreen'); if(w.classList.contains('fullscreen')){ b.innerText='✖'; document.body.style.overflow='hidden'; } else { b.innerText='⛶'; document.body.style.overflow=''; } }

function toggleReadMode(cb) {
    isReadMode = cb.checked;
    editor.readOnly = isReadMode;
    document.getElementById('lbl-readmode').classList.toggle('active', isReadMode);
    if(isReadMode) showToast('📖 已开启阅读模式 (防止键盘弹起)');
}

function toggleDualMode(cb) {
    const wrap = document.getElementById('editor-wrap'); const mdLbl = document.getElementById('lbl-markdown'); const mdCb = mdLbl.querySelector('input');
    isDualMode = cb.checked;
    if (isDualMode) { wrap.classList.add('dual-mode'); if (isMarkdownMode) { mdCb.checked = false; toggleMarkdown(mdCb); } updateDualSelectOptions(); if(!dualDocId) loadDualDoc(docs.length > 1 ? docs.find(d=>d.id !== currentDocId).id : docs[0].id); } 
    else { wrap.classList.remove('dual-mode'); } editor.focus();
}
function updateDualSelectOptions() { document.getElementById('dual-doc-select').innerHTML = docs.map(d => `<option value="${d.id}" ${d.id == dualDocId ? 'selected' : ''}>📄 ${d.title}</option>`).join(''); }
function loadDualDoc(id) { dualDocId = parseInt(id); const doc = docs.find(d => d.id === dualDocId); if (doc) dualEditor.value = doc.content; }
function saveDualDoc() { const doc = docs.find(d => d.id === dualDocId); if (doc) { doc.content = dualEditor.value; saveDocsStateSilent(); } }

function toggleTypewriter(cb) { 
    const wrap = document.getElementById('editor-wrap'); const lbl = document.getElementById('lbl-typewriter'); isTypewriterMode = cb.checked;
    if (isTypewriterMode) { wrap.classList.add('typewriter-mode'); lbl.classList.add('active'); doTypewriterScroll(); } 
    else { wrap.classList.remove('typewriter-mode'); lbl.classList.remove('active'); } editor.focus(); 
}
function doTypewriterScroll() {
    if (!isTypewriterMode) return;
    const text = editor.value; const start = editor.selectionStart; const linesToCursor = text.substring(0, start).split('\n').length;
    const totalLines = text.split('\n').length || 1; const ratio = linesToCursor / totalLines;
    const targetScroll = (editor.scrollHeight * ratio) - (editor.clientHeight * 0.4); 
    editor.scrollTop = Math.max(0, targetScroll);
}

function toggleZenMode(cb) { 
    const lbl = document.getElementById('lbl-zen'); 
    if (cb.checked) { 
        document.body.classList.add('zen-mode'); 
        lbl.classList.add('active'); 
        try { document.documentElement.requestFullscreen(); } catch(e) {}
    } else { 
        document.body.classList.remove('zen-mode'); 
        lbl.classList.remove('active'); 
        try { if(document.fullscreenElement) document.exitFullscreen(); } catch(e) {}
    } 
    editor.focus(); 
}

function toggleMarkdown(cb) { 
    const wrap = document.getElementById('editor-wrap'); const lbl = document.getElementById('lbl-markdown'); const dualLbl = document.getElementById('lbl-dual'); const dualCb = dualLbl.querySelector('input'); 
    isMarkdownMode = cb.checked; 
    if (isMarkdownMode) { wrap.classList.add('split-mode'); lbl.classList.add('active'); if(isDualMode) { dualCb.checked=false; toggleDualMode(dualCb); } renderMarkdown(); } 
    else { wrap.classList.remove('split-mode'); lbl.classList.remove('active'); } 
    editor.focus(); 
}
function renderMarkdown() { if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') mdPreviewPane.innerHTML = DOMPurify.sanitize(marked.parse(editor.value)); }

// ================= 命令面板 (Ctrl+K) =================
const baseCommands = [ 
    { name: "新建文档", shortcut: "New", action: newDoc }, 
    { name: "清空当前内容", shortcut: "Clear", action: () => { if(confirm('清空当前文本？(可在快照找回)')) setValue(''); } }, 
    { name: "打开历史快照", shortcut: "Snap", action: openSnapshotModal }, 
    { name: "发送至 Telegram (纯文本)", shortcut: "Alt+S", action: () => { if(typeof sendToTelegram === 'function') sendToTelegram('text'); } }, 
    { name: "打开查找替换面板", action: () => { if(typeof toggleFindReplace === 'function') toggleFindReplace(); } }, 
    { name: "打开回收站", action: openTrashModal } 
];
let cmdSelectedIndex = 0; let filteredItems = [];

function openCmdOverlay() { document.getElementById('cmd-overlay').classList.add('show'); const input = document.getElementById('cmd-input'); input.value = ''; input.focus(); renderCmdList(''); }
function closeCmdOverlay(e) { if(e) e.stopPropagation(); document.getElementById('cmd-overlay').classList.remove('show'); editor.focus(); }

function renderCmdList(query) {
    query = query.toLowerCase(); filteredItems = [];
    baseCommands.forEach(c => { if(c.name.toLowerCase().includes(query) || !query) filteredItems.push(c); });
    if (query.trim().length > 0) {
        docs.forEach(d => {
            const contentLow = d.content.toLowerCase(); let idx = contentLow.indexOf(query);
            if (idx !== -1) {
                const snippetPre = d.content.substring(Math.max(0, idx - 15), idx); const matchText = d.content.substring(idx, idx + query.length); const snippetPost = d.content.substring(idx + query.length, Math.min(d.content.length, idx + query.length + 15));
                filteredItems.push({ isSearch: true, name: `<b>[文本]</b> ${d.title}`, displayHtml: `<span style="font-size:12px; color:var(--text-muted);">...${snippetPre}<span class="search-highlight">${matchText}</span>${snippetPost}...</span>`, action: () => { loadDoc(d.id); setTimeout(() => { editor.focus(); editor.setSelectionRange(idx, idx + query.length); }, 50); } });
            }
        });
    }
    cmdSelectedIndex = 0; updateCmdDOM();
}
function updateCmdDOM() { document.getElementById('cmd-list').innerHTML = filteredItems.map((c, i) => `<li class="cmd-item ${i === cmdSelectedIndex ? 'selected' : ''}" onclick="filteredItems[${i}].action(); closeCmdOverlay();"><div style="display:flex; flex-direction:column; gap:4px;"><span>${c.name} ${c.shortcut ? `<span class="cmd-shortcut">${c.shortcut}</span>` : ''}</span>${c.isSearch ? c.displayHtml : ''}</div></li>`).join(''); }
function selectCmd(index) { if (index < 0) index = filteredItems.length - 1; if (index >= filteredItems.length) index = 0; cmdSelectedIndex = index; updateCmdDOM(); document.querySelector('.cmd-item.selected')?.scrollIntoView({block: 'nearest'});}