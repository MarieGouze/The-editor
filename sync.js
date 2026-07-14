// ==========================================
// sync.js - 云端同步、Telegram 推送与导入导出
// ==========================================

// ================= WebDAV 云端同步 =================
function openSyncModal() { 
    const conf = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}'); 
    document.getElementById('dav-url').value = conf.davUrl || ''; 
    document.getElementById('dav-user').value = conf.davUser || ''; 
    document.getElementById('dav-pass').value = conf.davPass || ''; 
    document.getElementById('tg-token').value = conf.tgToken || ''; 
    document.getElementById('tg-chatid').value = conf.tgChatId || ''; 
    document.getElementById('tg-title').value = ''; 
    document.getElementById('smms-token').value = conf.smmsToken || ''; 
    document.getElementById('sync-settings-modal').classList.add('show'); 
}
function closeSyncModal(e) { if(e) e.stopPropagation(); document.getElementById('sync-settings-modal').classList.remove('show'); }

function saveIntegrationConfig(showMsg = true) { 
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ 
        davUrl: document.getElementById('dav-url').value.trim(), 
        davUser: document.getElementById('dav-user').value.trim(), 
        davPass: document.getElementById('dav-pass').value, 
        tgToken: document.getElementById('tg-token').value.trim(), 
        tgChatId: document.getElementById('tg-chatid').value.trim(),
        smmsToken: document.getElementById('smms-token').value.trim()
    })); 
    const snippets = document.getElementById('custom-snippets-input').value;
    localStorage.setItem(SNIPPETS_KEY, snippets);
    loadCustomSnippets();
    if(showMsg) showToast('✅ 配置已存'); 
}

function getBasicAuthHeader(user, pass) { return 'Basic ' + btoa(encodeURIComponent(user + ':' + pass).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1))); }
function getWebdavEndpoint() { const conf = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}'); if(!conf.davUrl) return null; return { url: (conf.davUrl.endsWith('/') ? conf.davUrl : conf.davUrl + '/') + 'meow_editor_sync.json', user: conf.davUser, pass: conf.davPass, baseUrl: conf.davUrl }; }

async function testWebdavConnection() {
    saveIntegrationConfig(false);
    const info = getWebdavEndpoint();
    if(!info) return showToast('⚠️ 请先填写 WebDAV URL');
    showToast('🔗 测试 WebDAV 连通性...');
    try {
        const res = await fetch(info.url, { method: 'GET', headers: { 'Authorization': getBasicAuthHeader(info.user, info.pass) } });
        if (res.ok || res.status === 404) showToast('✅ 连通成功 (账号验证通过)');
        else if (res.status === 401 || res.status === 403) showToast('❌ 认证失败 (账号或密码错误)');
        else showToast(`⚠️ 异常状态码: HTTP ${res.status}`);
    } catch(e) { showToast('❌ 网络连接错误或跨域(CORS)拦截'); }
}

async function webdavPush(force = false) { 
    saveIntegrationConfig(false);
    const info = getWebdavEndpoint(); 
    if(!info) return showToast('⚠️ 请先填写 WebDAV URL'); 
    
    const d = new Date();
    const defaultName = `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
    const backupName = prompt('请输入本次云端备份的名称：', defaultName);
    if(!backupName) return;

    try { 
        let cloudData = { backups: [] };
        const checkRes = await fetch(info.url, { method: 'GET', headers: { 'Authorization': getBasicAuthHeader(info.user, info.pass) }, cache: 'no-store' }); 
        if (checkRes.ok) {
            const text = await checkRes.text();
            if(text) {
                try {
                    const parsed = JSON.parse(text);
                    if(parsed.backups) cloudData = parsed;
                    else if(parsed.list) {
                        cloudData.backups.push({ name: "旧版覆盖备份", timestamp: parsed.lastModified || Date.now(), docs: parsed.list, currentDocId: parsed.current, tgConfig: {} });
                    }
                } catch(e) {}
            }
        }

        showToast('⬆️ 推送打包中...'); 
        const pushTime = Date.now();
        const conf = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
        
        cloudData.backups.unshift({
            name: backupName,
            timestamp: pushTime,
            docs: docs,
            currentDocId: currentDocId,
            tgConfig: { tgToken: conf.tgToken, tgChatId: conf.tgChatId }
        });

        if(cloudData.backups.length > 20) cloudData.backups.pop();

        const res = await fetch(info.url, { method: 'PUT', headers: { 'Authorization': getBasicAuthHeader(info.user, info.pass), 'Content-Type': 'application/json' }, body: JSON.stringify(cloudData) }); 
        if(res.ok || res.status === 201 || res.status === 204) {
            lastSyncTime = pushTime;
            showToast('✅ 成功推送到私有云'); 
            closeSyncModal();
        } else { showToast(`❌ 推送失败: HTTP ${res.status}`); }
    } catch(e) { showToast('❌ 网络或跨域(CORS)错误'); } 
}

let currentCloudBackups = [];
async function webdavPull() { 
    saveIntegrationConfig(false);
    const info = getWebdavEndpoint(); 
    if(!info) return showToast('⚠️ 请先填写 WebDAV URL'); 
    
    try { 
        showToast('⬇️ 获取云端列表...'); 
        const res = await fetch(info.url, { method: 'GET', headers: { 'Authorization': getBasicAuthHeader(info.user, info.pass) }, cache: 'no-store' }); 
        if(res.ok) { 
            const data = await res.json(); 
            if(data && data.backups) { 
                currentCloudBackups = data.backups;
                renderCloudList();
                document.getElementById('cloud-list-modal').classList.add('show');
                closeSyncModal();
            } else if (data && data.list) {
                if(!confirm('⚠️ 发现旧版云端数据，将【完全覆盖】本地所有文档！确定吗？')) return; 
                docs = data.list; currentDocId = data.current || docs[0].id; 
                lastSyncTime = data.lastModified || Date.now();
                saveDocsStateSilent(); renderDocsList(); renderTabs(); loadDoc(currentDocId); updateDualSelectOptions(); 
                showToast('✅ 成功覆盖本地'); closeSyncModal(); 
            } else showToast('❌ 数据格式错误'); 
        } else if (res.status === 404) showToast('⚠️ 云端无备份文件'); else showToast(`❌ 拉取失败: HTTP ${res.status}`); 
    } catch(e) { showToast('❌ 网络或跨域(CORS)错误'); } 
}

function closeCloudListModal(e) { if(e) e.stopPropagation(); document.getElementById('cloud-list-modal').classList.remove('show'); }
function renderCloudList() {
    const ul = document.getElementById('cloud-list-ui'); 
    if(!currentCloudBackups || currentCloudBackups.length === 0) { ul.innerHTML = '<li style="padding: 10px; text-align:center; color: var(--text-muted);">暂无云端备份</li>'; return; } 
    ul.innerHTML = currentCloudBackups.map((b, i) => {
        const dateStr = new Date(b.timestamp).toLocaleString();
        return `<li class="snapshot-item"><div><div class="snapshot-info">📦 ${b.name}</div><div class="snapshot-time">备份时间: ${dateStr} | 文档数: ${b.docs.length}</div></div><div style="display:flex; gap:5px;"><button class="btn" style="padding: 4px 8px;" onclick="restoreCloudBackup(${i})">拉取恢复</button></div></li>`;
    }).join('');
}
function restoreCloudBackup(index) {
    if(!confirm('⚠️ 恢复此备份将【完全覆盖】本地所有文档和 TG 配置！确定吗？')) return; 
    const b = currentCloudBackups[index];
    docs = b.docs;
    currentDocId = b.currentDocId || docs[0].id;
    lastSyncTime = b.timestamp;
    
    if(b.tgConfig) {
        const conf = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
        conf.tgToken = b.tgConfig.tgToken || conf.tgToken;
        conf.tgChatId = b.tgConfig.tgChatId || conf.tgChatId;
        localStorage.setItem(CONFIG_KEY, JSON.stringify(conf));
    }

    saveDocsStateSilent(); renderDocsList(); renderTabs(); loadDoc(currentDocId); updateDualSelectOptions(); 
    showToast('✅ 成功恢复云端备份'); 
    closeCloudListModal();
}

// 每10分钟自动静默备份 WebDAV
setInterval(() => {
    const info = getWebdavEndpoint(); 
    if(info && info.user && info.pass) {
        const now = Date.now();
        fetch(info.url.replace('meow_editor_sync.json', 'meow_editor_auto_backup.json'), { method: 'PUT', headers: { 'Authorization': getBasicAuthHeader(info.user, info.pass), 'Content-Type': 'application/json' }, body: JSON.stringify({ list: docs, current: currentDocId, timestamp: now }) }).catch(e=>{});
    }
}, 600000);

// ================= Telegram 推送 =================
async function testTgConnection() {
    saveIntegrationConfig(false);
    const token = document.getElementById('tg-token').value.trim();
    const chatId = document.getElementById('tg-chatid').value.trim();
    if(!token || !chatId) return showToast('⚠️ 请先填写 Token 和 Chat ID');
    showToast('🔗 测试 TG 连通性...');
    try {
        const res = await fetch(`https://api.telegram.org/bot${token}/getChat?chat_id=${chatId}`);
        const data = await res.json();
        if(data.ok) showToast(`✅ 连通成功！目标：${data.result.title || data.result.username || data.result.first_name}`);
        else showToast(`❌ 失败: ${data.description}`);
    } catch(e) { showToast('❌ 网络连接错误'); }
}

function sendToTelegramFromDropdown() {
    const format = document.getElementById('quick-tg-format').value;
    sendToTelegram(format);
}

async function sendToTelegram(overrideFormat = null) { 
    saveIntegrationConfig(false);
    const conf = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}'); 
    if(!conf.tgToken || !conf.tgChatId) {
        openSyncModal();
        return showToast('⚠️ 请先配置 TG Bot Token 和 Chat ID'); 
    }
    
    let text = editor.value.substring(editor.selectionStart, editor.selectionEnd);
    let isSelection = !!text;
    if(!text) text = editor.value; 
    if(!text && docs.length <= 1) return showToast('⚠️ 当前无内容可发');

    const customTitle = document.getElementById('tg-title')?.value.trim();
    const doc = docs.find(d => d.id === currentDocId);
    let title = customTitle || doc?.title || '未命名文档';
    if(isSelection) title += ' (选中片段)';
    
    const format = overrideFormat || 'text';

    showToast(`✈️ 推送 Telegram (${format})...`); 
    try { 
        if (format === 'text') {
            const finalMsg = `<b>${title}</b>\n\n${text}`;
            const res = await fetch(`https://api.telegram.org/bot${conf.tgToken}/sendMessage`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ chat_id: conf.tgChatId, text: finalMsg, parse_mode: 'HTML' }) }); 
            if(res.ok) { showToast('✅ 文本发送成功'); } else showToast(`❌ 发送失败`); 
        } else {
            const formData = new FormData();
            formData.append('chat_id', conf.tgChatId);
            formData.append('caption', `📄 ${title}`);
            let blob; let filename = `${title}.${format}`;

            if (format === 'txt') {
                blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            } else if (format === 'md') {
                blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
            } else if (format === 'zip') {
                showToast('📦 打包 ZIP...');
                const zip = new JSZip();
                if (isSelection) { zip.file(`${title}.txt`, text); } 
                else { docs.forEach(d => { let name = d.title.replace(/[\\/:*?"<>|]/g, "_") || '未命名'; zip.file(`${name}.md`, d.content); }); }
                blob = await zip.generateAsync({type:"blob"});
                filename = `编辑器全库备份_${new Date().toISOString().slice(0,10)}.zip`;
            }
            formData.append('document', blob, filename);

            const res = await fetch(`https://api.telegram.org/bot${conf.tgToken}/sendDocument`, { method: 'POST', body: formData });
            if(res.ok) { showToast('✅ 文件发送成功'); } else showToast(`❌ 文件发送失败`); 
        }
    } catch(e) { showToast('❌ 发送失败，请检查网络'); } 
}

// ================= 工作区全量导入导出 =================
function exportWorkspace() {
    const workspaceData = {
        docs: localStorage.getItem(DOCS_KEY),
        trash: localStorage.getItem(TRASH_KEY),
        config: localStorage.getItem(CONFIG_KEY),
        snippets: localStorage.getItem(SNIPPETS_KEY),
        scratchpad: localStorage.getItem('cute_scratchpad')
    };
    const blob = new Blob([JSON.stringify(workspaceData)], { type: 'application/json' });
    downloadFile(blob, `喵喵编辑器_工作区备份_${new Date().toISOString().slice(0,10)}.json`);
    showToast('✅ 工作区已导出');
}

function importWorkspace(e) {
    const file = e.target.files[0]; if (!file) return;
    if(!confirm('⚠️ 导入工作区将【完全覆盖】当前所有本地文档和设置！确定吗？')) { e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = ev => {
        try {
            const data = JSON.parse(ev.target.result);
            if(data.docs) localStorage.setItem(DOCS_KEY, data.docs);
            if(data.trash) localStorage.setItem(TRASH_KEY, data.trash);
            if(data.config) localStorage.setItem(CONFIG_KEY, data.config);
            if(data.snippets) localStorage.setItem(SNIPPETS_KEY, data.snippets);
            if(data.scratchpad) localStorage.setItem('cute_scratchpad', data.scratchpad);
            showToast('✅ 工作区导入成功，正在重启...');
            setTimeout(() => location.reload(), 1000);
        } catch(err) { showToast('❌ 导入失败，文件格式错误'); }
    };
    reader.readAsText(file);
}

// ================= 格式化下载 =================
function updateExportWidth(sel) { const widths = { 'txt':'55px', 'md':'58px', 'html':'65px', 'pdf':'58px', 'jpg':'58px', 'docx':'65px', 'zip':'80px' }; sel.style.width = widths[sel.value] || 'auto'; }

function actDownload() {
    if (!editor.value && docs.length <= 1 && !docs[0].content) return showToast('⚠️ 无内容导出');
    const format = document.getElementById('export-format').value; const doc = docs.find(d => d.id === currentDocId); const title = doc.title || '导出文档'; const content = editor.value;
    
    if (format === 'zip') { 
        showToast('打包 ZIP...'); const zip = new JSZip(); 
        docs.forEach(d => { let name = d.title.replace(/[\\/:*?"<>|]/g, "_") || '未命名'; zip.file(`${name}.md`, d.content); }); 
        zip.generateAsync({type:"blob"}).then(blob => { downloadFile(blob, `全库备份_${new Date().toISOString().slice(0,10)}.zip`); showToast('✅ 下载完成'); }); return; 
    }
    if (format === 'txt') { downloadFile(new Blob([content], { type: 'text/plain;charset=utf-8' }), `${title}.txt`); } 
    else if (format === 'md') { downloadFile(new Blob([content], { type: 'text/markdown;charset=utf-8' }), `${title}.md`); } 
    else if (format === 'html') { 
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font-family:sans-serif;line-height:1.6;padding:20px;max-width:800px;margin:0 auto;}</style></head><body>\n${DOMPurify.sanitize(marked.parse(content))}\n</body></html>`; 
        downloadFile(new Blob([html], { type: 'text/html;charset=utf-8' }), `${title}.html`); 
    }
    else if (format === 'docx') { 
        const docHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${title}</title></head><body>${DOMPurify.sanitize(marked.parse(content))}</body></html>`; 
        downloadFile(new Blob([docHtml], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document;charset=utf-8' }), `${title}.docx`); 
    }
    else if (format === 'pdf') { 
        showToast('生成 PDF...'); const div = document.createElement('div'); div.innerHTML = DOMPurify.sanitize(marked.parse(content)); div.style.padding = '30px'; div.style.color = '#000'; div.style.background = '#fff'; 
        html2pdf().set({ margin: 10, filename: `${title}.pdf`, html2canvas: { scale: 2 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } }).from(div).save().then(() => showToast('✅ 导出成功')); 
    }
    else if (format === 'jpg') { 
        showToast('生成 JPG...'); const div = document.createElement('div'); div.innerHTML = DOMPurify.sanitize(marked.parse(content)); div.style.padding = '40px'; div.style.background = '#fff'; div.style.color = '#000'; div.style.width = '800px'; div.style.lineHeight = '1.8'; document.body.appendChild(div); 
        html2canvas(div, { scale: 2 }).then(canvas => { const url = canvas.toDataURL('image/jpeg', 1.0); const a = document.createElement('a'); a.href = url; a.download = `${title}.jpg`; a.click(); document.body.removeChild(div); showToast('✅ 导出成功'); }); 
    }
}

function downloadFile(blob, filename) { 
    const url = URL.createObjectURL(blob); 
    const a = document.createElement('a'); 
    a.href = url; a.download = filename; a.click(); 
    URL.revokeObjectURL(url); 
}