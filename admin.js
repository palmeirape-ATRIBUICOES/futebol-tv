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
    document.getElementById('formTitle').textContent = 'Adicionar Novo Canal';
}

// ===== SAVE CHANNEL =====
async function saveChannel(e) {
    e.preventDefault();

    const data = {
        home: document.getElementById('chHome').value,
        away: document.getElementById('chAway').value,
        league: document.getElementById('chLeague').value,
        url: document.getElementById('chUrl').value,
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

    list.innerHTML = channels.map(ch => `
    <div class="channel-row">
      <span>
        <span class="channel-status ${ch.status === 'live' ? 'live' : 'offline'}">
          ${ch.status === 'live' ? '🔴 Ao Vivo' : ch.status === 'scheduled' ? '📅 Agendado' : '⏹ Encerrado'}
        </span>
      </span>
      <span>${ch.emojiHome || ''} ${ch.home} x ${ch.away} ${ch.emojiAway || ''}</span>
      <span style="color:var(--text-secondary)">${ch.league || '-'}</span>
      <span style="font-weight:700">${ch.scoreHome ?? 0} x ${ch.scoreAway ?? 0}</span>
      <span style="color:var(--accent-green)">${ch.time || '-'}</span>
      <div class="channel-actions">
        <button class="btn-edit" onclick="editChannel('${ch.id}')" title="Editar">✏️</button>
        <button class="btn-delete" onclick="deleteChannel('${ch.id}')" title="Excluir">🗑️</button>
      </div>
    </div>
  `).join('');
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
    try {
        const channels = await DataModule.getChannels();
        for (const ch of channels) {
            await DataModule.deleteChannel(ch.id);
        }
        alert('🗑️ Todos os canais foram excluídos!');
        loadChannels();
        loadStats();
    } catch (err) {
        alert('Erro: ' + err.message);
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

// ===== AUTO-SYNC FROM SOURCE SITE =====
const SOURCE_URL = 'https://howtoblogging.info/?st=index';
const CORS_PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest='
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

async function fetchWithProxy(url) {
    for (let i = 0; i < CORS_PROXIES.length; i++) {
        try {
            const proxyUrl = CORS_PROXIES[i] + encodeURIComponent(url);
            const response = await fetch(proxyUrl, {
                signal: AbortSignal.timeout(15000)
            });
            if (response.ok) {
                return await response.text();
            }
        } catch (e) {
            console.warn('Proxy ' + i + ' falhou:', e.message);
        }
    }
    throw new Error('Todos os proxies falharam. Tente novamente.');
}

function parseGamesFromHtml(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const games = [];

    // The reference site uses anchor tags with specific structure
    // Each game link contains: team names, league, time
    const links = doc.querySelectorAll('a[href*="howtoblogging"], a[href*="?id="]');

    links.forEach(link => {
        const text = link.textContent.trim();
        if (!text || text.length < 5) return;

        // Clean up the text - remove dots and extra whitespace
        const cleanText = text.replace(/\.\s*\.\s*\./g, '').replace(/\s+/g, ' ').trim();

        // Try to extract team and league info
        // Pattern: "TeamA  League  Time  TeamB"
        const parts = cleanText.split(/\s{2,}/);

        if (parts.length >= 3) {
            const home = parts[0].trim();
            const away = parts[parts.length - 1].trim();

            // Middle parts contain league and time
            let league = '';
            let matchTime = '';

            for (let i = 1; i < parts.length - 1; i++) {
                const part = parts[i].trim();
                // Check if it looks like a time (HH:MM format)
                if (/^\d{1,2}:\d{2}$/.test(part)) {
                    matchTime = part;
                } else if (part.length > 2) {
                    league = part;
                }
            }

            if (home && away && home !== away && home.length > 1 && away.length > 1) {
                // Get the link URL (stream link)
                let streamUrl = link.href || '';

                games.push({
                    home: home,
                    away: away,
                    league: league || 'Campeonato',
                    matchTime: matchTime || '',
                    matchDate: new Date().toISOString().split('T')[0],
                    status: 'live',
                    streamPageUrl: streamUrl,
                    url: '', // Will need to be set manually or from stream page
                    scoreHome: 0,
                    scoreAway: 0,
                    time: matchTime ? matchTime : 'Ao Vivo',
                    emojiHome: getTeamEmoji(home),
                    emojiAway: getTeamEmoji(away),
                    viewers: Math.floor(Math.random() * 20000) + 1000,
                    syncedAt: new Date().toISOString()
                });
            }
        }
    });

    // If link-based parsing didn't work well, try text-based parsing
    if (games.length === 0) {
        const bodyText = doc.body ? doc.body.innerHTML : html;

        // Look for patterns that match team names with times
        const timePattern = /(\d{1,2}:\d{2})/g;
        const allText = doc.body ? doc.body.textContent : '';
        const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 3);

        let currentLeague = '';
        let currentTime = '';
        let teams = [];

        for (const line of lines) {
            // Skip junk lines
            if (line.includes('Baixar') || line.includes('Atualizar') || line.includes('http') || line.length > 100) continue;

            // Check for time
            const timeMatch = line.match(/^(\d{1,2}:\d{2})$/);
            if (timeMatch) {
                currentTime = timeMatch[1];
                continue;
            }

            // Check for league-like strings
            if (line.match(/^(Copa|Campeonato|Brasileiro|Serie|Premier|La Liga|Libertadores|Champions|Paulista|Carioca|Goiano|Baiano|Italiano|Espanhol|Frances|Alemao)/i) ||
                line.match(/(League|Cup|Liga|Serie|Division)/i)) {
                currentLeague = line;
                continue;
            }

            // Check if it looks like a team name (no numbers, reasonable length)
            if (line.length > 2 && line.length < 40 && !line.match(/^\d/) && !line.match(/^\./)) {
                teams.push(line);

                // If we have a pair of teams
                if (teams.length === 2) {
                    games.push({
                        home: teams[0],
                        away: teams[1],
                        league: currentLeague || 'Campeonato',
                        matchTime: currentTime || '',
                        matchDate: new Date().toISOString().split('T')[0],
                        status: 'live',
                        streamPageUrl: '',
                        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', // fallback
                        scoreHome: 0,
                        scoreAway: 0,
                        time: currentTime || 'Ao Vivo',
                        emojiHome: getTeamEmoji(teams[0]),
                        emojiAway: getTeamEmoji(teams[1]),
                        viewers: Math.floor(Math.random() * 20000) + 1000,
                        syncedAt: new Date().toISOString()
                    });
                    teams = [];
                    currentTime = '';
                }
            }
        }
    }

    return games;
}

function getTeamEmoji(team) {
    const name = team.toLowerCase();
    // Brazilian teams
    if (name.includes('flamengo') || name.includes('internacional') || name.includes('inter')) return '🔴';
    if (name.includes('palmeiras') || name.includes('goias')) return '🟢';
    if (name.includes('corinthians') || name.includes('botafogo') || name.includes('vasco')) return '⚫';
    if (name.includes('gremio') || name.includes('cruzeiro')) return '🔵';
    if (name.includes('sao paulo') || name.includes('santos')) return '⚪';
    if (name.includes('fluminense')) return '🟤';
    if (name.includes('bahia') || name.includes('vitoria')) return '🔴';
    if (name.includes('atletico')) return '⚫';
    if (name.includes('bangu')) return '🔴';
    // European
    if (name.includes('real madrid') || name.includes('juventus')) return '⚪';
    if (name.includes('barcelona') || name.includes('chelsea')) return '🔵';
    if (name.includes('manchester city') || name.includes('city')) return '🔵';
    if (name.includes('liverpool') || name.includes('milan') || name.includes('arsenal')) return '🔴';
    if (name.includes('newcastle') || name.includes('pisa')) return '⚫';
    if (name.includes('athletic')) return '🔴';
    if (name.includes('wrexham')) return '🔴';
    return '⚽';
}

async function syncFromSource() {
    if (syncInProgress) {
        alert('Sincronizacao em andamento. Aguarde...');
        return;
    }

    syncInProgress = true;
    const btn = document.getElementById('btnSync');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Sincronizando...';
    }
    updateSyncUI('Buscando jogos...', '⏳');

    try {
        // 1. Fetch the source page
        const html = await fetchWithProxy(SOURCE_URL);
        updateSyncUI('Analisando pagina...', '🔍');

        // 2. Parse games
        const games = parseGamesFromHtml(html);

        if (games.length === 0) {
            updateSyncUI('Nenhum jogo encontrado', '⚠️');
            alert('Nenhum jogo foi encontrado no site fonte. O site pode ter mudado de estrutura.');
            return;
        }

        updateSyncUI('Salvando ' + games.length + ' jogos...', '💾');

        // 3. Clear old synced channels (only auto-synced ones, keep manual ones)
        const existingChannels = await db.collection('channels').where('syncedAt', '!=', '').get();
        const deletePromises = [];
        existingChannels.forEach(doc => {
            deletePromises.push(doc.ref.delete());
        });
        await Promise.all(deletePromises);

        // 4. Save new games
        const savePromises = games.map(game => {
            return db.collection('channels').add({
                ...game,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        await Promise.all(savePromises);

        updateSyncUI('✅ ' + games.length + ' jogos sincronizados!', '✅');
        updateLastSyncTime();
        loadChannels();
        loadStats();

        console.log('Sync completa:', games.length, 'jogos');

    } catch (err) {
        console.error('Erro na sincronizacao:', err);
        updateSyncUI('Erro: ' + err.message, '❌');
        alert('Erro na sincronizacao: ' + err.message + '\n\nTente novamente em alguns instantes.');
    } finally {
        syncInProgress = false;
        if (btn) {
            btn.disabled = false;
            btn.textContent = '🔄 Sincronizar Jogos';
        }
    }
}

function toggleAutoSync() {
    const toggle = document.getElementById('autoSyncToggle');

    if (toggle && toggle.checked) {
        // Start auto-sync every 30 minutes
        updateSyncUI('Ativa — proxima sync em 30 min', '🟢');

        // Do first sync immediately
        syncFromSource();

        // Set interval for every 30 minutes (1800000 ms)
        autoSyncInterval = setInterval(() => {
            console.log('Auto-sync disparada:', new Date().toLocaleTimeString());
            syncFromSource();
        }, 30 * 60 * 1000); // 30 minutes

    } else {
        // Stop auto-sync
        if (autoSyncInterval) {
            clearInterval(autoSyncInterval);
            autoSyncInterval = null;
        }
        updateSyncUI('Desativada', '📡');
    }
}

// Restore auto-sync state if page was left open
window.addEventListener('beforeunload', () => {
    if (autoSyncInterval) {
        clearInterval(autoSyncInterval);
    }
});
