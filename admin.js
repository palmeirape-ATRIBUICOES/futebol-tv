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
