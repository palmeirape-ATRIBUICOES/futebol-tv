// ===== ADMIN — FUTEBOL TV =====

// ===== ADMIN SETUP =====
// Se nenhum admin existe, o primeiro login vira admin automaticamente
AuthModule.onLogin = async (user, data) => {
    // Primeiro acesso: se role não está definida, promove a admin
    if (!data.role || data.role === 'user') {
        // Verifica se já existe algum admin
        const admins = await db.collection('users').where('role', '==', 'admin').get();
        if (admins.empty) {
            // Nenhum admin existe → promove este usuário
            await db.collection('users').doc(user.uid).update({ role: 'admin' });
            data.role = 'admin';
            console.log('✅ Primeiro admin configurado:', user.email);
        } else {
            alert('❌ Acesso negado. Apenas administradores podem acessar esta página.');
            window.location.href = 'index.html';
            return;
        }
    }

    document.getElementById('adminUser').textContent = '👤 ' + (data.name || user.email);
    loadChannels();
    loadStats();
};

AuthModule.onLogout = () => {
    window.location.href = 'index.html';
};

// Init
AuthModule.init();

// ===== FORM TOGGLE =====
function toggleForm() {
    const form = document.getElementById('channelForm');
    if (form.style.display === 'none') {
        form.style.display = '';
        form.scrollIntoView({ behavior: 'smooth' });
    } else {
        form.style.display = 'none';
        clearForm();
    }
}

function clearForm() {
    document.getElementById('chHome').value = '';
    document.getElementById('chAway').value = '';
    document.getElementById('chLeague').value = '';
    document.getElementById('chUrl').value = '';
    document.getElementById('chScoreHome').value = '0';
    document.getElementById('chScoreAway').value = '0';
    document.getElementById('chMatchDate').value = '';
    document.getElementById('chMatchTime').value = '';
    document.getElementById('chTime').value = '';
    document.getElementById('chStatus').value = 'live';
    document.getElementById('chThumb').value = '';
    document.getElementById('chEmojiHome').value = '';
    document.getElementById('chEmojiAway').value = '';
    document.getElementById('chEditId').value = '';
    document.getElementById('chIptvUrl').value = '';
    document.getElementById('chIptvChannelField').value = '';
    const iptvSelect = document.getElementById('chIptvSelect');
    if (iptvSelect) iptvSelect.value = '';
    const iptvLabel = document.getElementById('chIptvChannelName');
    if (iptvLabel) { iptvLabel.style.display = 'none'; iptvLabel.textContent = ''; }
    const iptvSearch = document.getElementById('iptvSearch');
    if (iptvSearch) iptvSearch.value = '';
    document.getElementById('formTitle').textContent = 'Adicionar Novo Canal';
}

// ===== SAVE CHANNEL =====
async function saveChannel(e) {
    e.preventDefault();

    const iptvUrl = document.getElementById('chIptvUrl').value || '';
    const iptvChannel = document.getElementById('chIptvChannelField').value || '';
    const manualUrl = document.getElementById('chUrl').value || '';

    const data = {
        home: document.getElementById('chHome').value,
        away: document.getElementById('chAway').value,
        league: document.getElementById('chLeague').value,
        url: manualUrl,
        iptvUrl: iptvUrl || manualUrl,
        iptvChannel: iptvChannel,
        scoreHome: parseInt(document.getElementById('chScoreHome').value) || 0,
        scoreAway: parseInt(document.getElementById('chScoreAway').value) || 0,
        matchDate: document.getElementById('chMatchDate').value || '',
        matchTime: document.getElementById('chMatchTime').value || '',
        time: document.getElementById('chTime').value,
        status: document.getElementById('chStatus').value,
        thumb: document.getElementById('chThumb').value,
        emojiHome: document.getElementById('chEmojiHome').value || '⚽',
        emojiAway: document.getElementById('chEmojiAway').value || '⚽'
    };

    const editId = document.getElementById('chEditId').value;

    try {
        await DataModule.saveChannel(data, editId || null);
        alert(editId ? '✅ Canal atualizado!' : '✅ Canal adicionado!');
        toggleForm();
        loadChannels();
        loadStats();
    } catch (err) {
        alert('❌ Erro ao salvar: ' + err.message);
    }
}

// ===== IMPORTAR LISTA M3U =====
function toggleM3uImport() {
    const panel = document.getElementById('m3uImportPanel');
    panel.style.display = panel.style.display === 'none' ? '' : 'none';
}

async function importM3u() {
    const raw = document.getElementById('m3uTextarea').value.trim();
    if (!raw) { alert('Cole a lista M3U no campo acima.'); return; }

    const channels = parseM3u(raw);
    if (channels.length === 0) {
        alert('❌ Nenhum canal encontrado na lista. Verifique o formato M3U.');
        return;
    }

    const btn = document.querySelector('#m3uImportPanel .btn-primary');
    btn.textContent = `Importando ${channels.length} canais...`;
    btn.disabled = true;

    let imported = 0;
    for (const ch of channels) {
        try {
            await DataModule.saveChannel(ch, null);
            imported++;
        } catch (err) {
            console.error('Erro importando canal:', ch.home, err);
        }
    }

    btn.textContent = '📥 Importar Canais';
    btn.disabled = false;
    document.getElementById('m3uTextarea').value = '';
    toggleM3uImport();
    loadChannels();
    loadStats();
    alert(`✅ ${imported} de ${channels.length} canais importados com sucesso!`);
}

function parseM3u(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    const channels = [];
    let currentInfo = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line.startsWith('#EXTINF:')) {
            // Parse #EXTINF line
            // Format: #EXTINF:-1 tvg-id="" tvg-name="..." tvg-logo="..." group-title="...",Channel Name
            const nameMatch = line.match(/,(.+)$/);
            const groupMatch = line.match(/group-title="([^"]*)"/);
            const logoMatch = line.match(/tvg-logo="([^"]*)"/);

            currentInfo = {
                name: nameMatch ? nameMatch[1].trim() : 'Canal ' + (channels.length + 1),
                group: groupMatch ? groupMatch[1] : '',
                logo: logoMatch ? logoMatch[1] : ''
            };
        } else if (line.startsWith('http') && currentInfo) {
            // This is the URL line
            const nameParts = currentInfo.name.split(/\s*x\s*|\s*vs\s*|\s*×\s*/i);
            const home = nameParts[0] ? nameParts[0].trim() : currentInfo.name;
            const away = nameParts[1] ? nameParts[1].trim() : '';

            channels.push({
                home: home,
                away: away || 'Transmissão',
                league: currentInfo.group || 'Ao Vivo',
                url: line,
                scoreHome: 0,
                scoreAway: 0,
                time: 'Ao Vivo',
                status: 'live',
                thumb: currentInfo.logo || '',
                emojiHome: '⚽',
                emojiAway: '⚽'
            });
            currentInfo = null;
        } else if (line.startsWith('http') && !currentInfo) {
            // URL without #EXTINF - create basic channel
            channels.push({
                home: 'Canal ' + (channels.length + 1),
                away: 'Transmissão',
                league: 'Ao Vivo',
                url: line,
                scoreHome: 0,
                scoreAway: 0,
                time: 'Ao Vivo',
                status: 'live',
                thumb: '',
                emojiHome: '📺',
                emojiAway: '⚽'
            });
        }
    }

    return channels;
}

// ===== LOAD CHANNELS =====
async function loadChannels() {
    try {
        const channels = await DataModule.getChannels();
        renderChannelRows(channels);
    } catch (err) {
        console.error('Erro ao carregar canais:', err);
    }
}

function renderChannelRows(channels) {
    const list = document.getElementById('channelsList');

    if (channels.length === 0) {
        list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)"><p>Nenhum canal cadastrado. Clique em "+ Adicionar Canal" ou "📥 Importar M3U".</p></div>';
        return;
    }

    list.innerHTML = channels.map(ch => {
        const hasIptv = ch.iptvUrl || ch.url;
        const iptvBadge = ch.iptvChannel
            ? `<span style="font-size:.7rem;background:rgba(0,230,118,.1);border:1px solid rgba(0,230,118,.2);color:#00e676;padding:2px 8px;border-radius:6px;margin-left:4px">📡 ${ch.iptvChannel}</span>`
            : (hasIptv ? `<span style="font-size:.7rem;background:rgba(0,230,118,.1);border:1px solid rgba(0,230,118,.2);color:#00e676;padding:2px 8px;border-radius:6px;margin-left:4px">✅ Link</span>` : `<span style="font-size:.7rem;background:rgba(255,59,48,.1);border:1px solid rgba(255,59,48,.2);color:#ff3b30;padding:2px 8px;border-radius:6px;margin-left:4px">⚠️ Sem Link</span>`);
        return `
    <div class="channel-row">
      <span>
        <span class="channel-status ${ch.status === 'live' ? 'live' : 'offline'}">
          ${ch.status === 'live' ? '🔴 Ao Vivo' : ch.status === 'scheduled' ? '📅 Agendado' : '⏹ Encerrado'}
        </span>
      </span>
      <span>${ch.emojiHome || ''} ${ch.home} x ${ch.away} ${ch.emojiAway || ''} ${iptvBadge}</span>
      <span style="color:var(--text-secondary)">${ch.league || '-'}</span>
      <span style="font-weight:700">${ch.scoreHome ?? 0} x ${ch.scoreAway ?? 0}</span>
      <span style="color:var(--accent-green)">${ch.time || '-'}</span>
      <div class="channel-actions">
        <button class="btn-edit" onclick="editChannel('${ch.id}')" title="Editar">✏️</button>
        <button class="btn-delete" onclick="deleteChannel('${ch.id}')" title="Excluir">🗑️</button>
      </div>
    </div>
  `;}).join('');
}

// ===== EDIT CHANNEL =====
async function editChannel(id) {
    try {
        const doc = await db.collection('channels').doc(id).get();
        if (!doc.exists) return;
        const ch = doc.data();

        document.getElementById('chHome').value = ch.home || '';
        document.getElementById('chAway').value = ch.away || '';
        document.getElementById('chLeague').value = ch.league || '';
        document.getElementById('chUrl').value = ch.url || '';
        document.getElementById('chScoreHome').value = ch.scoreHome || 0;
        document.getElementById('chScoreAway').value = ch.scoreAway || 0;
        document.getElementById('chMatchDate').value = ch.matchDate || '';
        document.getElementById('chMatchTime').value = ch.matchTime || '';
        document.getElementById('chTime').value = ch.time || '';
        document.getElementById('chStatus').value = ch.status || 'live';
        document.getElementById('chThumb').value = ch.thumb || '';
        document.getElementById('chEmojiHome').value = ch.emojiHome || '';
        document.getElementById('chEmojiAway').value = ch.emojiAway || '';
        document.getElementById('chEditId').value = id;
        document.getElementById('chIptvUrl').value = ch.iptvUrl || '';
        document.getElementById('chIptvChannelField').value = ch.iptvChannel || '';

        // Show IPTV channel name if set
        const iptvLabel = document.getElementById('chIptvChannelName');
        if (iptvLabel && ch.iptvChannel) {
            iptvLabel.textContent = '📡 Canal IPTV: ' + ch.iptvChannel;
            iptvLabel.style.display = 'block';
        }

        // Try to select the matching IPTV channel in dropdown
        const iptvSelect = document.getElementById('chIptvSelect');
        if (iptvSelect && ch.iptvUrl) {
            iptvSelect.value = ch.iptvUrl;
        }
        document.getElementById('formTitle').textContent = 'Editar Canal';

        const form = document.getElementById('channelForm');
        form.style.display = '';
        form.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
        alert('Erro ao carregar canal: ' + err.message);
    }
}

// ===== DELETE CHANNEL =====
async function deleteChannel(id) {
    if (!confirm('Tem certeza que deseja excluir este canal?')) return;
    try {
        await DataModule.deleteChannel(id);
        alert('🗑️ Canal excluído!');
        loadChannels();
        loadStats();
    } catch (err) {
        alert('Erro ao excluir: ' + err.message);
    }
}

// ===== DELETE ALL =====
async function deleteAllChannels() {
    if (!confirm('⚠️ ATENÇÃO: Isso vai excluir TODOS os canais. Tem certeza?')) return;
    if (!confirm('🗑️ CONFIRMAÇÃO FINAL: Todos os canais serão removidos permanentemente. Continuar?')) return;

    try {
        const statusEl = document.getElementById('syncStatus');
        if (statusEl) statusEl.textContent = 'Excluindo canais...';

        // Get ALL channels directly from Firestore
        const snapshot = await db.collection('channels').get();

        if (snapshot.empty) {
            alert('Nenhum canal para excluir.');
            return;
        }

        const total = snapshot.size;
        let deleted = 0;

        // Delete in batches of 500 (Firestore limit)
        const batchSize = 500;
        const docs = snapshot.docs;

        for (let i = 0; i < docs.length; i += batchSize) {
            const batch = db.batch();
            const chunk = docs.slice(i, i + batchSize);

            chunk.forEach(doc => {
                batch.delete(doc.ref);
            });

            await batch.commit();
            deleted += chunk.length;

            if (statusEl) statusEl.textContent = `Excluindo... ${deleted}/${total}`;
        }

        if (statusEl) statusEl.textContent = `✅ ${total} canais excluidos!`;
        alert(`🗑️ ${total} canais foram excluídos com sucesso!`);
        loadChannels();
        loadStats();
    } catch (err) {
        console.error('Erro ao excluir:', err);
        alert('Erro ao excluir canais: ' + err.message);
    }
}

// ===== STATS =====
async function loadStats() {
    try {
        const channels = await DataModule.getChannels();
        const live = channels.filter(c => c.status === 'live');
        const subs = await DataModule.getSubscribers();
        const totalViewers = channels.reduce((sum, c) => sum + (c.viewers || 0), 0);

        document.getElementById('statChannels').textContent = channels.length;
        document.getElementById('statLive').textContent = live.length;
        document.getElementById('statSubs').textContent = subs.length;
        document.getElementById('statViews').textContent = totalViewers.toLocaleString('pt-BR');

        // Render subscribers
        renderSubscribers(subs);
    } catch (err) {
        console.error('Erro ao carregar stats:', err);
    }
}

function renderSubscribers(subs) {
    const list = document.getElementById('subscribersList');
    if (subs.length === 0) {
        list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)"><p>Nenhum assinante ainda.</p></div>';
        return;
    }
    list.innerHTML = subs.map(s => `
    <div class="channel-row" style="grid-template-columns:2fr 2fr 1fr 1fr 1fr 100px">
      <span>${s.name || '-'}</span>
      <span style="color:var(--text-secondary)">${s.email || '-'}</span>
      <span><span class="channel-status live">✅ Ativo</span></span>
      <span style="color:var(--accent-gold)">Premium</span>
      <span style="color:var(--text-muted);font-size:.75rem">${s.createdAt ? new Date(s.createdAt.seconds * 1000).toLocaleDateString('pt-BR') : '-'}</span>
      <div class="channel-actions">
        <button class="btn-delete" onclick="revokeAccess('${s.id}')" title="Revogar">🚫</button>
      </div>
    </div>
  `).join('');
}

async function revokeAccess(uid) {
    if (!confirm('Revogar acesso premium deste usuário?')) return;
    try {
        await AuthModule.setPremium(uid, false);
        alert('Acesso revogado.');
        loadStats();
    } catch (err) {
        alert('Erro: ' + err.message);
    }
}

// ===== IPTV XTREAM CODES INTEGRATION =====
// Default IPTV panel config (can be changed in admin UI)
let iptvConfig = {
    server: 'http://horizonmult.fun',
    username: 'thpalmeira',
    password: '1643363hdgsje'
};

// Sports category IDs to sync
const SPORTS_CATEGORY_IDS = [
    57, 73, 74, 75, 59, 3986, 61, 60, 63, 3987, 62, 1026, 58, 65, 4737, 4733
];

let autoSyncInterval = null;
let syncInProgress = false;

function updateSyncUI(status, icon) {
    const statusEl = document.getElementById('syncStatus');
    const iconEl = document.getElementById('syncIcon');
    if (statusEl) statusEl.textContent = status;
    if (iconEl) iconEl.textContent = icon || '📡';
}

function updateLastSyncTime() {
    const el = document.getElementById('lastSyncTime');
    if (el) {
        const now = new Date();
        el.textContent = 'Ultima sync: ' + now.toLocaleTimeString('pt-BR');
    }
}

function xtreamUrl(action) {
    return `${iptvConfig.server}/player_api.php?username=${iptvConfig.username}&password=${iptvConfig.password}&action=${action}`;
}

function buildStreamUrl(streamId) {
    return `${iptvConfig.server}/${iptvConfig.username}/${iptvConfig.password}/${streamId}.ts`;
}

const CORS_PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest='
];

async function fetchXtreamApi(action) {
    const url = xtreamUrl(action);
    try {
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (res.ok) return await res.json();
    } catch (e) {
        console.warn('Direct fetch failed, trying proxies...');
    }
    for (const proxy of CORS_PROXIES) {
        try {
            const proxyUrl = proxy + encodeURIComponent(url);
            const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
            if (res.ok) {
                const text = await res.text();
                return JSON.parse(text);
            }
        } catch (e) {
            console.warn('Proxy failed:', e.message);
        }
    }
    throw new Error('Nao foi possivel conectar ao painel IPTV.');
}

function cleanChannelName(name) {
    return name.replace(/[♦️⭐⚽️⛳❌♠️]/g, '').replace(/\s*\[ALT\]\s*/gi, ' [ALT]').trim();
}

function getCategoryLabel(catName) {
    return catName.replace(/[♦️⭐⚽️⛳❌♠️|]/g, '').trim();
}

function getTeamEmoji(team) {
    const name = team.toLowerCase();
    if (name.includes('premiere')) return '🏆';
    if (name.includes('espn')) return '📺';
    if (name.includes('sportv')) return '📺';
    if (name.includes('dazn')) return '📡';
    if (name.includes('disney')) return '✨';
    if (name.includes('max') || name.includes('hbo')) return '🎬';
    if (name.includes('paramount')) return '⭐';
    if (name.includes('amazon') || name.includes('prime')) return '📦';
    if (name.includes('caze') || name.includes('cazé')) return '🎙️';
    if (name.includes('goat')) return '🐐';
    if (name.includes('ufc') || name.includes('fight')) return '🥊';
    return '📺';
}

async function syncFromSource() {
    if (syncInProgress) {
        alert('Sincronizacao em andamento. Aguarde...');
        return;
    }

    const serverInput = document.getElementById('iptvServer');
    const userInput = document.getElementById('iptvUser');
    const passInput = document.getElementById('iptvPass');
    if (serverInput && serverInput.value) iptvConfig.server = serverInput.value.replace(/\/$/, '');
    if (userInput && userInput.value) iptvConfig.username = userInput.value;
    if (passInput && passInput.value) iptvConfig.password = passInput.value;

    syncInProgress = true;
    const btn = document.getElementById('btnSync');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Sincronizando...'; }
    updateSyncUI('Conectando ao painel IPTV...', '⏳');

    try {
        updateSyncUI('Buscando categorias...', '📡');
        const categories = await fetchXtreamApi('get_live_categories');
        const sportsCats = categories.filter(c => SPORTS_CATEGORY_IDS.includes(parseInt(c.category_id)));

        if (sportsCats.length === 0) {
            updateSyncUI('Nenhuma categoria esportiva', '⚠️');
            alert('Nenhuma categoria esportiva encontrada no painel.');
            return;
        }

        let allChannels = [];
        for (let i = 0; i < sportsCats.length; i++) {
            const cat = sportsCats[i];
            const catLabel = getCategoryLabel(cat.category_name);
            updateSyncUI(`Buscando: ${catLabel} (${i + 1}/${sportsCats.length})...`, '📺');

            try {
                const streams = await fetchXtreamApi(`get_live_streams&category_id=${cat.category_id}`);
                const filtered = streams.filter(s => {
                    const name = s.name.toUpperCase();
                    if (name.includes('SD') && !name.includes('FHD')) return false;
                    if (name.includes('[ALT]')) return false;
                    return true;
                });

                filtered.forEach(stream => {
                    const channelName = cleanChannelName(stream.name);
                    allChannels.push({
                        home: channelName,
                        away: 'Transmissão',
                        league: catLabel,
                        url: buildStreamUrl(stream.stream_id),
                        streamPageUrl: '',
                        scoreHome: 0, scoreAway: 0,
                        matchDate: new Date().toISOString().split('T')[0],
                        matchTime: '',
                        time: 'Ao Vivo',
                        status: 'live',
                        thumb: stream.stream_icon || '',
                        emojiHome: getTeamEmoji(channelName),
                        emojiAway: '⚽',
                        viewers: Math.floor(Math.random() * 20000) + 1000,
                        syncedAt: new Date().toISOString(),
                        streamId: stream.stream_id.toString(),
                        categoryId: cat.category_id
                    });
                });
            } catch (e) {
                console.warn(`Erro categoria ${catLabel}:`, e.message);
            }
            if (i < sportsCats.length - 1) await new Promise(r => setTimeout(r, 300));
        }

        if (allChannels.length === 0) {
            updateSyncUI('Nenhum canal encontrado', '⚠️');
            return;
        }

        updateSyncUI(`Salvando ${allChannels.length} canais...`, '💾');

        // Clear old synced
        const existing = await db.collection('channels').where('syncedAt', '!=', '').get();
        const delPromises = [];
        existing.forEach(doc => delPromises.push(doc.ref.delete()));
        await Promise.all(delPromises);

        // Save in batches
        let saved = 0;
        for (let i = 0; i < allChannels.length; i += 500) {
            const batch = db.batch();
            allChannels.slice(i, i + 500).forEach(ch => {
                batch.set(db.collection('channels').doc(), {
                    ...ch,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            });
            await batch.commit();
            saved += Math.min(500, allChannels.length - i);
            updateSyncUI(`Salvando... ${saved}/${allChannels.length}`, '💾');
        }

        updateSyncUI(`✅ ${allChannels.length} canais sincronizados!`, '✅');
        updateLastSyncTime();
        loadChannels();
        loadStats();
    } catch (err) {
        console.error('Erro:', err);
        updateSyncUI('Erro: ' + err.message, '❌');
        alert('Erro: ' + err.message + '\n\nVerifique as credenciais IPTV.');
    } finally {
        syncInProgress = false;
        if (btn) { btn.disabled = false; btn.textContent = '🔄 Sincronizar IPTV'; }
    }
}

function toggleAutoSync() {
    const toggle = document.getElementById('autoSyncToggle');
    if (toggle && toggle.checked) {
        updateSyncUI('Ativa — proxima sync em 30 min', '🟢');
        syncFromSource();
        autoSyncInterval = setInterval(() => syncFromSource(), 30 * 60 * 1000);
    } else {
        if (autoSyncInterval) { clearInterval(autoSyncInterval); autoSyncInterval = null; }
        updateSyncUI('Desativada', '📡');
    }
}

function saveIptvConfig() {
    const s = document.getElementById('iptvServer');
    const u = document.getElementById('iptvUser');
    const p = document.getElementById('iptvPass');
    if (s) iptvConfig.server = s.value.replace(/\/$/, '');
    if (u) iptvConfig.username = u.value;
    if (p) iptvConfig.password = p.value;
    localStorage.setItem('iptvConfig', JSON.stringify(iptvConfig));
    alert('✅ Configuracoes IPTV salvas!');
}

function loadIptvConfig() {
    const saved = localStorage.getItem('iptvConfig');
    if (saved) {
        try { iptvConfig = { ...iptvConfig, ...JSON.parse(saved) }; } catch (e) { }
    }
    const s = document.getElementById('iptvServer');
    const u = document.getElementById('iptvUser');
    const p = document.getElementById('iptvPass');
    if (s) s.value = iptvConfig.server;
    if (u) u.value = iptvConfig.username;
    if (p) p.value = iptvConfig.password;
}

window.addEventListener('DOMContentLoaded', () => {
    loadIptvConfig();
    loadIptvChannelsDropdown();
});
window.addEventListener('beforeunload', () => { if (autoSyncInterval) clearInterval(autoSyncInterval); });

// ===== IPTV CHANNEL SELECTOR FOR FORM =====
let iptvChannelsList = [];

async function loadIptvChannelsDropdown() {
    const select = document.getElementById('chIptvSelect');
    if (!select) return;

    select.innerHTML = '<option value="">-- Carregando canais IPTV... --</option>';

    try {
        // Use config from iptv-config.js if available, otherwise use local iptvConfig
        const cfg = (typeof IPTV_CONFIG !== 'undefined') ? IPTV_CONFIG : iptvConfig;
        const categories = cfg.sportCategories || SPORTS_CATEGORY_IDS.map(id => ({ id: String(id), name: 'Cat ' + id }));

        const allStreams = [];

        for (const cat of categories) {
            const catId = cat.id || cat;
            const catName = cat.name || 'Categoria ' + catId;
            try {
                let apiUrl;
                if (typeof IPTV_CONFIG !== 'undefined') {
                    apiUrl = IPTV_CONFIG.getApiUrl('get_live_streams', `&category_id=${catId}`);
                } else {
                    apiUrl = xtreamUrl(`get_live_streams&category_id=${catId}`);
                }

                const res = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
                if (!res.ok) continue;
                const streams = await res.json();
                if (!Array.isArray(streams)) continue;

                streams.forEach(s => {
                    s._categoryName = catName;
                });
                allStreams.push(...streams);
            } catch (e) {
                console.warn(`IPTV dropdown: failed to load ${catName}`);
            }
        }

        iptvChannelsList = allStreams;

        // Build dropdown grouped by category
        let html = '<option value="">-- Selecione um canal IPTV (' + allStreams.length + ' canais) --</option>';
        html += '<option value="_manual">✏️ Inserir URL manualmente</option>';

        // Group by category
        const grouped = {};
        allStreams.forEach(s => {
            const cat = s._categoryName || 'Outros';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(s);
        });

        for (const [catName, streams] of Object.entries(grouped)) {
            html += `<optgroup label="${catName} (${streams.length})">`;
            streams.forEach(s => {
                let streamUrl;
                if (typeof IPTV_CONFIG !== 'undefined') {
                    streamUrl = IPTV_CONFIG.getM3U8Url(s.stream_id);
                } else {
                    streamUrl = buildStreamUrl(s.stream_id);
                }
                html += `<option value="${streamUrl}" data-name="${s.name}" data-stream-id="${s.stream_id}">${s.name}</option>`;
            });
            html += '</optgroup>';
        }

        select.innerHTML = html;
        console.log(`✅ IPTV dropdown: ${allStreams.length} canais carregados`);

    } catch (e) {
        console.error('Erro ao carregar canais IPTV:', e);
        select.innerHTML = '<option value="">-- Erro ao carregar canais --</option><option value="_manual">✏️ Inserir URL manualmente</option>';
    }
}

function onIptvChannelSelect(value) {
    if (value === '_manual' || !value) {
        document.getElementById('chUrl').value = '';
        document.getElementById('chUrl').focus();
        document.getElementById('chIptvUrl').value = '';
        document.getElementById('chIptvChannelField').value = '';
        const label = document.getElementById('chIptvChannelName');
        if (label) { label.style.display = 'none'; label.textContent = ''; }
        return;
    }

    const select = document.getElementById('chIptvSelect');
    const selected = select.options[select.selectedIndex];
    const channelName = selected ? selected.getAttribute('data-name') || selected.textContent : '';
    const streamId = selected ? selected.getAttribute('data-stream-id') : '';

    // Also build the TS URL as fallback
    let tsUrl = '';
    if (typeof IPTV_CONFIG !== 'undefined' && streamId) {
        tsUrl = IPTV_CONFIG.getStreamUrl(streamId, 'ts');
    }

    // Set the URL field
    document.getElementById('chUrl').value = value;
    document.getElementById('chIptvUrl').value = value;
    document.getElementById('chIptvChannelField').value = channelName;

    // Show channel name label
    const label = document.getElementById('chIptvChannelName');
    if (label) {
        label.textContent = '📡 ' + channelName + (tsUrl ? ' | TS: ' + tsUrl : '');
        label.style.display = 'block';
    }
}

function filterIptvOptions(query) {
    const select = document.getElementById('chIptvSelect');
    if (!select) return;
    const q = query.toLowerCase().trim();

    // If query is empty, show all
    if (!q) {
        Array.from(select.options).forEach(opt => opt.style.display = '');
        Array.from(select.querySelectorAll('optgroup')).forEach(g => g.style.display = '');
        return;
    }

    // Filter options
    Array.from(select.querySelectorAll('optgroup')).forEach(group => {
        let hasVisible = false;
        Array.from(group.querySelectorAll('option')).forEach(opt => {
            const matches = opt.textContent.toLowerCase().includes(q);
            opt.style.display = matches ? '' : 'none';
            if (matches) hasVisible = true;
        });
        group.style.display = hasVisible ? '' : 'none';
    });
}
