// ==========================================
// editor.js - 编辑器核心逻辑、快捷键与排版
// ==========================================

// ================= 基础编辑操作 =================
function setValue(newVal) {
    editor.value = newVal; const doc = docs.find(d => d.id === currentDocId); if(doc) doc.content = newVal;
    saveDocsStateSilent(); updateStats(); renderTOC(); updateMinimap(); historyStack.push(newVal); redoStack = []; if(isMarkdownMode) renderMarkdown();
}
function insertTextAtCursor(text, start, end, offset) { 
    const val = editor.value; 
    editor.value = val.substring(0, start) + text + val.substring(end); 
    editor.selectionStart = start + offset; 
    editor.selectionEnd = start + offset + (end - start); 
    editor.dispatchEvent(new Event('input')); 
}
function actUndo() { if (historyStack.length > 1) { redoStack.push(historyStack.pop()); editor.value = historyStack[historyStack.length - 1]; const doc = docs.find(d => d.id === currentDocId); if(doc) doc.content = editor.value; saveDocsStateSilent(); updateStats(); renderTOC(); updateMinimap(); if(isMarkdownMode) renderMarkdown(); } }
function actRedo() { if (redoStack.length > 0) { const next = redoStack.pop(); historyStack.push(next); editor.value = next; const doc = docs.find(d => d.id === currentDocId); if(doc) doc.content = editor.value; saveDocsStateSilent(); updateStats(); renderTOC(); updateMinimap(); if(isMarkdownMode) renderMarkdown(); } }
function actClear() { if(confirm('清空当前文本？(可在快照找回)')) setValue(''); }

function actCopy() {
    let t = editor.value.substring(editor.selectionStart, editor.selectionEnd);
    let sel = !!t;
    if(!t) t = editor.value;
    if(!t) return showToast('⚠️ 暂无内容可复制');
    const msg = sel ? '✅ 已复制选中内容' : '✅ 已复制全文';
    
    if(navigator.clipboard && window.isSecureContext) { 
        navigator.clipboard.writeText(t).then(()=>showToast(msg)).catch(()=>fallbackCopy(t, msg)); 
    } else {
        fallbackCopy(t, msg);
    }
    editor.focus(); 
}

function fallbackCopy(t, msg) { 
    const ta = document.createElement('textarea'); 
    ta.value = t; ta.style.position = 'fixed'; ta.style.left = '-9999px'; ta.style.top = '0';
    document.body.appendChild(ta); ta.select(); 
    try { document.execCommand('copy') ? showToast(msg) : showToast('❌ 复制失败，请 Ctrl+C'); } catch(e) { showToast('❌ 复制失败，请 Ctrl+C'); } 
    document.body.removeChild(ta); 
}

async function actPaste() { try { const t = await navigator.clipboard.readText(); insertTextAtCursor(t, editor.selectionStart, editor.selectionEnd, t.length); } catch(e) { alert('请用 Ctrl+V 粘贴'); } }
function actUpload(e) { const f = e.target.files[0]; if(!f) return; const reader = new FileReader(); reader.onload = ev => { setValue(ev.target.result); e.target.value=''; showToast('✅ 导入成功'); }; reader.readAsText(f); }

// ================= 排版与符号工具 =================
function togglePuncBox() { const box = document.getElementById('punc-box'); box.style.display = box.style.display === 'block' ? 'none' : 'block'; }
function insertSymbol(sym, offset) { const s = editor.selectionStart; const e = editor.selectionEnd; const t = editor.value; if (s !== e && sym.length >= 2 && offset > 0) { const p = sym.substring(0, offset); const suf = sym.substring(offset); insertTextAtCursor(p + t.substring(s, e) + suf, s, e, p.length); } else { insertTextAtCursor(sym, s, e, offset); } editor.focus(); }

function fmtTrimSpaces() { setValue(editor.value.replace(/[ \t]+/g, ' ').replace(/^ +| +$/gm, '')); showToast('✅ 已清空格'); }
function fmtRemoveBlankLines() { setValue(editor.value.replace(/^\s*[\r\n]/gm, '')); showToast('✅ 已清空行');}
function fmtToHalfWidth() { let r=""; for(let i=0;i<editor.value.length;i++){ let c=editor.value.charCodeAt(i); if(c>=65281&&c<=65374)r+=String.fromCharCode(c-65248); else if(c==12288)r+=String.fromCharCode(32); else r+=editor.value.charAt(i); } setValue(r); showToast('✅ 全角转半角');}
function fmtToFullWidth() { let r=""; for(let i=0;i<editor.value.length;i++){ let c=editor.value.charCodeAt(i); if(c>=33&&c<=126)r+=String.fromCharCode(c+65248); else if(c==32)r+=String.fromCharCode(12288); else r+=editor.value.charAt(i); } setValue(r); showToast('✅ 半角转全角');}
function fmtNormPunc() { setValue(editor.value.replace(/,/g, '，').replace(/\./g, '。').replace(/\?/g, '？').replace(/!/g, '！').replace(/;/g, '；').replace(/:/g, '：')); showToast('✅ 规范中文标点');}
function fmtPangu() { setValue(editor.value.replace(/([\u4e00-\u9fa5])([a-zA-Z0-9])/g, '$1 $2').replace(/([a-zA-Z0-9])([\u4e00-\u9fa5])/g, '$1 $2')); showToast('✅ 盘古之白'); }
const mapT={'体':'體','国':'國','观':'觀','欢':'歡','机':'機','学':'學','爱':'愛','发':'發','东':'東'}; const mapS={'體':'体','國':'国','觀':'观','歡':'欢','機':'机','學':'学','愛':'爱','發':'发','東':'东'};
function fmtToTraditional() { let v=editor.value; for(let s in mapT)v=v.split(s).join(mapT[s]); setValue(v); showToast('✅ 简转繁');}
function fmtToSimplified() { let v=editor.value; for(let t in mapS)v=v.split(t).join(mapS[t]); setValue(v); showToast('✅ 繁转简');}

// ================= 查找替换 =================
let currentSearchMatches = [];
function toggleFindReplace() { const p = document.getElementById('find-replace-panel'); if(p.style.display === 'flex') { p.style.display = 'none'; document.getElementById('search-results-container').style.display = 'none'; document.getElementById('btn-replace-selected').style.display = 'none'; editor.focus(); } else { p.style.display = 'flex'; document.getElementById('find-input').focus(); } }
function getSearchRegex(q) { const isRegex = document.getElementById('cb-regex').checked; try { return isRegex ? new RegExp(q, 'g') : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'); } catch(e) { return null; } }
function getSearchRegexSingle(q) { const isRegex = document.getElementById('cb-regex').checked; try { return isRegex ? new RegExp(q) : new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); } catch(e) { return null; } }

function doFindNext() { 
    const q = document.getElementById('find-input').value; if(!q) return; 
    const reg = getSearchRegexSingle(q); if(!reg) return showToast('❌ 正则表达式无效');
    let content = editor.value; let afterCursor = content.substring(editor.selectionEnd); let match = afterCursor.match(reg);
    if (match) { editor.focus(); editor.setSelectionRange(editor.selectionEnd + match.index, editor.selectionEnd + match.index + match[0].length); } 
    else { match = content.match(reg); if (match) { editor.focus(); editor.setSelectionRange(match.index, match.index + match[0].length); } else showToast('❌ 未找到'); }
}
function doFindPrev() { 
    const q = document.getElementById('find-input').value; if(!q) return; 
    const reg = getSearchRegex(q); if(!reg) return showToast('❌ 正则表达式无效');
    let content = editor.value; let beforeCursor = content.substring(0, editor.selectionStart > 0 ? editor.selectionStart - 1 : 0);
    let matches = [...beforeCursor.matchAll(reg)];
    if(matches.length > 0) { const lastMatch = matches[matches.length - 1]; editor.focus(); editor.setSelectionRange(lastMatch.index, lastMatch.index + lastMatch[0].length); return; }
    matches = [...content.matchAll(reg)];
    if(matches.length > 0) { const lastMatch = matches[matches.length - 1]; editor.focus(); editor.setSelectionRange(lastMatch.index, lastMatch.index + lastMatch[0].length); }
    else showToast('❌ 未找到');
}
function doSearchList() {
    const q = document.getElementById('find-input').value; const container = document.getElementById('search-results-container'); const list = document.getElementById('search-results-list'); const countLabel = document.getElementById('search-count'); const btnReplaceSel = document.getElementById('btn-replace-selected');
    if(!q) { container.style.display = 'none'; btnReplaceSel.style.display = 'none'; return; }
    const reg = getSearchRegex(q); if(!reg) return showToast('❌ 正则表达式无效');
    currentSearchMatches = []; let content = editor.value; const matches = [...content.matchAll(reg)];
    matches.forEach(m => currentSearchMatches.push({ start: m.index, end: m.index + m[0].length, text: m[0] }));
    if (currentSearchMatches.length === 0) { container.style.display = 'none'; btnReplaceSel.style.display = 'none'; showToast('❌ 未找到匹配项'); return; }
    let html = '';
    currentSearchMatches.forEach((match, index) => {
        const pre = content.substring(Math.max(0, match.start - 15), match.start); const post = content.substring(match.end, Math.min(content.length, match.end + 15));
        html += `<li class="search-result-item" onclick="focusMatch(${match.start}, ${match.end})"><input type="checkbox" class="match-cb" value="${index}" checked onclick="event.stopPropagation()"><div class="search-snippet">...${pre}<span class="search-highlight">${match.text}</span>${post}...</div></li>`;
    });
    list.innerHTML = html; countLabel.innerText = `共 ${currentSearchMatches.length} 处`; document.getElementById('cb-select-all').checked = true;
    container.style.display = 'flex'; btnReplaceSel.style.display = 'inline-block';
}
function focusMatch(start, end) { editor.focus(); editor.setSelectionRange(start, end); }
function toggleSelectAllMatches(cb) { document.querySelectorAll('.match-cb').forEach(c => c.checked = cb.checked); }
function doReplaceCurrent() { 
    const q = document.getElementById('find-input').value; const r = document.getElementById('replace-input').value; 
    const sel = editor.value.substring(editor.selectionStart, editor.selectionEnd); 
    const reg = getSearchRegexSingle(q); if(!reg) return;
    if(sel.match(reg) && sel.match(reg)[0] === sel) { const replaced = sel.replace(reg, r); insertTextAtCursor(replaced, editor.selectionStart, editor.selectionEnd, replaced.length); doFindNext(); } else doFindNext(); 
}
function doReplaceAll() { 
    const q = document.getElementById('find-input').value; const r = document.getElementById('replace-input').value; if(!q) return; 
    const reg = getSearchRegex(q); if(!reg) return showToast('❌ 正则无效');
    const nc = editor.value.replace(reg, r); 
    if(editor.value !== nc) { setValue(nc); showToast('✅ 替换完成'); document.getElementById('search-results-container').style.display = 'none'; document.getElementById('btn-replace-selected').style.display = 'none'; } 
}
function doReplaceSelected() {
    const q = document.getElementById('find-input').value; const r = document.getElementById('replace-input').value;
    const reg = getSearchRegex(q); if(!reg) return;
    const checkboxes = document.querySelectorAll('.match-cb:checked'); if (checkboxes.length === 0) return showToast('⚠️ 未勾选');
    let indicesToReplace = Array.from(checkboxes).map(cb => parseInt(cb.value)).sort((a, b) => b - a);
    let content = editor.value; let replaceCount = 0;
    indicesToReplace.forEach(index => { 
        const match = currentSearchMatches[index]; const sel = content.substring(match.start, match.end);
        if (sel.match(reg) && sel.match(reg)[0] === sel) { const replaced = sel.replace(reg, r); content = content.substring(0, match.start) + replaced + content.substring(match.end); replaceCount++; } 
    });
    if (replaceCount > 0) { setValue(content); showToast(`✅ 替换 ${replaceCount} 处`); doSearchList(); }
}

// ================= 斜杠菜单 =================
let isSlashActive = false; let slashStartPos = -1; let slashIndex = 0;

function openSlashMenu() {
    isSlashActive = true; slashStartPos = editor.selectionStart - 1; slashIndex = 0;
    const menu = document.getElementById('slash-menu');
    const wrapRect = document.getElementById('editor-wrap').getBoundingClientRect();
    const mirror = document.createElement('div');
    const style = window.getComputedStyle(editor);
    ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'padding', 'width', 'whiteSpace', 'wordWrap', 'letterSpacing'].forEach(p => mirror.style[p] = style[p]);
    mirror.style.position = 'absolute'; mirror.style.visibility = 'hidden';
    mirror.textContent = editor.value.substring(0, editor.selectionStart);
    const span = document.createElement('span'); span.textContent = '|'; mirror.appendChild(span);
    document.body.appendChild(mirror);
    let top = span.offsetTop - editor.scrollTop + wrapRect.top;
    let left = span.offsetLeft - editor.scrollLeft + wrapRect.left;
    document.body.removeChild(mirror);

    menu.style.top = Math.min(top + 30, window.innerHeight - menu.offsetHeight - 20) + 'px';
    menu.style.left = left + 'px';
    menu.style.display = 'flex';
    updateSlashSelect();
}
function closeSlashMenu() { isSlashActive = false; document.getElementById('slash-menu').style.display = 'none'; }
function updateSlashSelect() {
    const items = document.querySelectorAll('.slash-item');
    items.forEach((item, i) => { if(i === slashIndex) item.classList.add('active'); else item.classList.remove('active'); });
}
function execSlash(cmd) {
    const cmds = { 'h1': '# ', 'h2': '## ', 'h3': '### ', 'todo': '- [ ] ', 'quote': '> ', 'line': '---\n', 'code': '```\n\n```\n' };
    const insertStr = cmds[cmd];
    
    if (isSlashActive) {
        const before = editor.value.substring(0, slashStartPos);
        const after = editor.value.substring(editor.selectionEnd);
        editor.value = before + insertStr + after;
        editor.selectionStart = editor.selectionEnd = before.length + insertStr.length - (cmd === 'code' ? 5 : 0);
        closeSlashMenu();
    } else {
        insertTextAtCursor(insertStr, editor.selectionStart, editor.selectionEnd, insertStr.length - (cmd === 'code' ? 5 : 0));
    }
    updateStats(); renderTOC(); updateMinimap(); if(isMarkdownMode) renderMarkdown(); editor.focus();
}

// ================= 事件监听器 =================

// 监听斜杠菜单点击
document.querySelectorAll('.slash-item').forEach(item => { item.addEventListener('click', (e) => { e.preventDefault(); execSlash(item.getAttribute('data-cmd')); }); });

// 监听输入
editor.addEventListener('input', (e) => {
    const doc = docs.find(d => d.id === currentDocId); if(doc) doc.content = editor.value;
    const textBeforeCursor = editor.value.substring(0, editor.selectionStart);
    
    // 优化 Snippet 匹配：只提取光标前最后一个连续的词进行匹配
const match = textBeforeCursor.match(/(\S+)$/);
if (match) {
    const lastWord = match[1];
    if (customSnippets[lastWord]) {
        const val = customSnippets[lastWord](); 
        const start = editor.selectionStart - lastWord.length;
        editor.value = editor.value.substring(0, start) + val + editor.value.substring(editor.selectionEnd);
        editor.selectionStart = editor.selectionEnd = start + val.length;
        if(doc) doc.content = editor.value;
    }
}

    if (e.data === '/') {
        const charBefore = editor.value.charAt(editor.selectionStart - 2);
        if (!charBefore || charBefore === '\n' || charBefore === ' ') openSlashMenu();
    } else if (isSlashActive) {
        const filterText = editor.value.substring(slashStartPos + 1, editor.selectionStart);
        if (filterText.includes(' ') || filterText.includes('\n')) closeSlashMenu();
    }

    saveDocsStateSilent(); if (isTypewriterMode) doTypewriterScroll();
    clearTimeout(historyTimeout); 
    historyTimeout = setTimeout(() => { 
        updateStats(); updateMinimap(); if (isMarkdownMode) renderMarkdown(); renderTOC(); 
        if (historyStack[historyStack.length - 1] !== editor.value) { 
            historyStack.push(editor.value); redoStack = []; 
            if (historyStack.length > 50) historyStack.shift(); 
        } 
    }, 500); 
});

// 监听快捷键
editor.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') { e.preventDefault(); insertTextAtCursor('  ', this.selectionStart, this.selectionEnd, 2); return; }
    
    if (isSlashActive) {
        const totalItems = document.querySelectorAll('.slash-item').length;
        if (e.key === 'ArrowDown') { e.preventDefault(); slashIndex = (slashIndex + 1) % totalItems; updateSlashSelect(); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); slashIndex = (slashIndex - 1 + totalItems) % totalItems; updateSlashSelect(); return; }
        if (e.key === 'Enter') { e.preventDefault(); document.querySelectorAll('.slash-item')[slashIndex].click(); return; }
        if (e.key === 'Escape' || e.key === 'Backspace' && editor.selectionStart <= slashStartPos + 1) { closeSlashMenu(); }
    }
    const start = this.selectionStart; const end = this.selectionEnd; const selected = this.value.substring(start, end);
    
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const lines = this.value.split('\n');
        let currentLineIndex = this.value.substr(0, start).split('\n').length - 1;
        if (e.key === 'ArrowUp' && currentLineIndex > 0) {
            const temp = lines[currentLineIndex]; lines[currentLineIndex] = lines[currentLineIndex - 1]; lines[currentLineIndex - 1] = temp;
            const newText = lines.join('\n'); const offsetStart = newText.split('\n').slice(0, currentLineIndex - 1).join('\n').length + (currentLineIndex > 1 ? 1 : 0);
            setValue(newText); this.setSelectionRange(offsetStart, offsetStart + temp.length);
        } 
        else if (e.key === 'ArrowDown' && currentLineIndex < lines.length - 1) {
            const temp = lines[currentLineIndex]; lines[currentLineIndex] = lines[currentLineIndex + 1]; lines[currentLineIndex + 1] = temp;
            const newText = lines.join('\n'); const offsetStart = newText.split('\n').slice(0, currentLineIndex + 1).join('\n').length + 1;
            setValue(newText); this.setSelectionRange(offsetStart, offsetStart + temp.length);
        }
        return;
    }

    if (e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); if(typeof sendToTelegram === 'function') sendToTelegram('text'); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'b' || e.key.toLowerCase() === 'i')) {
        e.preventDefault(); const char = e.key.toLowerCase() === 'b' ? '**' : '*';
        if (selected) insertTextAtCursor(`${char}${selected}${char}`, start, end, char.length); else insertTextAtCursor(`${char}${char}`, start, end, char.length); return;
    }
    const wrapPairs = { '"':'"', "'":"'", '(':')', '[':']', '{':'}', '<':'>', '《':'》', '「':'」', '【':'】', '（':'）', '“':'”', '‘':'’' };
    if (selected && wrapPairs[e.key]) { e.preventDefault(); insertTextAtCursor(`${e.key}${selected}${wrapPairs[e.key]}`, start, end, 1); }
});

// 更新底部状态栏（行号、列号、选中字数）
function updateCursorAndSelection() {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const textBeforeCursor = editor.value.substring(0, start);
    const lines = textBeforeCursor.split('\n');
    const currentLine = lines.length;
    const currentCol = lines[lines.length - 1].length + 1;
    
    const cursorEl = document.getElementById('cursor-position');
    if(cursorEl) cursorEl.innerText = `行 ${currentLine}, 列 ${currentCol}`;

    const selEl = document.getElementById('selection-stats');
    if(selEl) {
        if (start !== end) {
            const selectedText = editor.value.substring(start, end);
            selEl.innerText = `| 选中: ${selectedText.length} 字符`;
            selEl.style.display = 'inline';
        } else {
            selEl.style.display = 'none';
        }
    }
}

// 绑定光标变动事件
document.addEventListener('selectionchange', () => {
    if (document.activeElement === editor) updateCursorAndSelection();
});
editor.addEventListener('keyup', updateCursorAndSelection);
editor.addEventListener('click', updateCursorAndSelection);

// 监听滚动与点击
let isSyncingLeft = false;
editor.addEventListener('scroll', function() {
    syncMinimapScroll();
    if (!isMarkdownMode || isSyncingLeft) return; isSyncingLeft = true;
    const percentage = this.scrollTop / (this.scrollHeight - this.clientHeight);
    mdPreviewPane.scrollTop = percentage * (mdPreviewPane.scrollHeight - mdPreviewPane.clientHeight);
    setTimeout(() => isSyncingLeft = false, 20);
});
editor.addEventListener('keyup', () => { if(isTypewriterMode) setTimeout(doTypewriterScroll, 10); });
editor.addEventListener('click', () => { if(isTypewriterMode) setTimeout(doTypewriterScroll, 10); });

// 监听全局事件
document.addEventListener('click', (e) => { 
    if (isSlashActive && e.target.id !== 'main-input') closeSlashMenu(); 
    
    // 安全获取番茄钟面板
    const pomoWrapper = document.querySelector('.pomo-wrapper');
    if (pomoWrapper && !pomoWrapper.contains(e.target)) {
        const pomoPanel = document.getElementById('pomo-panel');
        if (pomoPanel) pomoPanel.classList.remove('show');
    }
    
    // 安全判断点击目标，防止 closest 报错
    if (e.target && typeof e.target.closest === 'function' && !e.target.closest('.access-group')) {
        const modeMenu = document.getElementById('mode-menu');
        if (modeMenu) modeMenu.style.display = 'none';
    }
});

let altPressTimer;
document.addEventListener('keydown', (e) => {
    if (e.key === 'Alt' && !altPressTimer) {
        altPressTimer = setTimeout(() => { document.getElementById('cheatsheet-modal').classList.add('show'); }, 800);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openCmdOverlay(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveDocsStateSilent(); showToast('💾 手动保存成功');} 
    
    const overlay = document.getElementById('cmd-overlay');
    if (overlay.classList.contains('show')) {
        if (e.key === 'Escape') closeCmdOverlay();
        else if (e.key === 'ArrowDown') { e.preventDefault(); selectCmd(cmdSelectedIndex + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); selectCmd(cmdSelectedIndex - 1); }
        else if (e.key === 'Enter' && filteredItems[cmdSelectedIndex]) { e.preventDefault(); filteredItems[cmdSelectedIndex].action(); closeCmdOverlay(); }
    }
});
document.addEventListener('keyup', (e) => { if (e.key === 'Alt') { clearTimeout(altPressTimer); altPressTimer = null; } });
document.getElementById('cmd-input').addEventListener('input', (e) => renderCmdList(e.target.value));

// 剪贴板图片拦截：支持 SM.MS 图床上传 或 降级为 Base64
editor.addEventListener('paste', async (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            e.preventDefault();
            const file = items[i].getAsFile();
            const conf = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
            
            if (conf.smmsToken) {
                showToast('⏳ 正在上传图片至 SM.MS 图床...');
                const formData = new FormData(); formData.append('smfile', file);
                try {
                    const res = await fetch('https://sm.ms/api/v2/upload', { method: 'POST', headers: { 'Authorization': conf.smmsToken }, body: formData });
                    const data = await res.json();
                    if (data.success || data.code === 'image_repeated') {
                        const url = data.success ? data.data.url : data.images;
                        const imgMd = `\n![image](${url})\n`;
                        insertTextAtCursor(imgMd, editor.selectionStart, editor.selectionEnd, imgMd.length);
                        showToast('✅ 图片上传成功');
                    } else { showToast(`❌ 上传失败: ${data.message}`); }
                } catch (err) { showToast('❌ 图床网络错误，请检查 Token 或网络'); }
            } else {
                showToast('⚠️ 未配置图床，正转为本地代码(易导致卡顿)...');
                const reader = new FileReader();
                reader.onload = (event) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas'); const MAX_WIDTH = 800; 
                        let width = img.width; let height = img.height;
                        if (width > MAX_WIDTH) { height = Math.round((height * MAX_WIDTH) / width); width = MAX_WIDTH; }
                        canvas.width = width; canvas.height = height;
                        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
                        const dataUrl = canvas.toDataURL('image/jpeg', 0.5); 
const imgMd = `\n![image](${dataUrl})\n`;
try {
    // 预检容量，LocalStorage 上限约为 5MB
    const currentSize = JSON.stringify(docs).length;
    if (currentSize + imgMd.length > 4.5 * 1024 * 1024) throw new Error("QuotaExceeded");
    insertTextAtCursor(imgMd, editor.selectionStart, editor.selectionEnd, imgMd.length);
    showToast('✅ 图片插入成功 (建议配置图床)');
} catch(err) {
    showToast('❌ 本地存储空间不足！请配置图床或清理回收站。');
}
                    }
                    img.src = event.target.result;
                };
                reader.readAsDataURL(file);
            }
            break;
        }
    }
});

// 解决移动端软键盘弹起遮挡输入区域的问题
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
        const wrap = document.getElementById('editor-wrap');
        // 如果视口高度变小，说明键盘弹起了，增加底部内边距
        if (window.visualViewport.height < window.innerHeight * 0.8) {
            wrap.style.paddingBottom = (window.innerHeight - window.visualViewport.height + 20) + 'px';
        } else {
            wrap.style.paddingBottom = '5px'; // 恢复默认
        }
    });
}