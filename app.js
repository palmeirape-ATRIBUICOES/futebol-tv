// ===== FUTEBOL TV — APP LOGIC =====
// Player IPTV simples: admin cola URL, cliente assiste.

const ADMIN_PASSWORD = 'admin123'; // Troque para sua senha
const CHANNELS_COLLECTION = 'channels';

// === STATE ===
let hls = null;
let currentChannel = null;
let isAdmin = false;
let proxyUrl = '';
let globalChannels = [];

// === DOM REFS ===
const $ = (id) => document.getElementById(id);

const video = $('video-player');
const playerWrapper = $('player-wrapper');
const playerPlaceholder = $('player-placeholder');
const playerOverlay = $('player-overlay');
const playerLoading = $('player-loading');
const playerError = $('player-error');
const errorText = $('error-text');
const nowPlaying = $('now-playing');
const liveBadge = $('live-badge');
const channelsGrid = $('channels-grid');
const channelCount = $('channel-count');
const noChannels = $('no-channels');

// Player Options
const playerOptionsContainer = $('player-options-container');
const optionsButtons = $('options-buttons');

// Admin
const adminModal = $('admin-modal');
const adminLogin = $('admin-login');
const adminPanel = $('admin-panel');
const adminPassword = $('admin-password');
const loginError = $('login-error');
const channelName = $('channel-name');
const channelUrl = $('channel-url');
const channelCategory = $('channel-category');
const adminChannelsList = $('admin-channels-list');
const proxyUrlInput = $('proxy-url');

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
    // Loading screen
    setTimeout(() => {
        $('loading-screen').classList.add('fade-out');
        $('app').classList.remove('hidden');
    }, 1800);

    // Load proxy from localStorage, default to current origin
    let origin = window.location.origin;
    if (!origin || origin.startsWith('file')) {
        origin = 'http://localhost:3000';
    }
    proxyUrl = localStorage.getItem('proxyUrl') || origin;
    if (!proxyUrl || !proxyUrl.startsWith('http')) {
        proxyUrl = origin;
    }
    if (proxyUrlInput) proxyUrlInput.value = proxyUrl;

    // Aguarda autenticação anônima antes de carregar canais
    // Isso garante que as Firestore Security Rules sejam satisfeitas
    let channelsLoaded = false;
    auth.onAuthStateChanged((user) => {
        if (user && !channelsLoaded) {
            channelsLoaded = true;
            loadChannels();
        }
    });

    // Fallback: se em 2.5 segundos não logar via firebase, tenta carregar direto
    setTimeout(() => {
        if (!channelsLoaded) {
            console.warn('[Firebase] Auth timeout ou falha: Carregando canais em modo de segurança.');
            channelsLoaded = true;
            loadChannels();
        }
    }, 2500);

    // Setup event listeners
    setupEvents();
});

// ===== FIREBASE: Load Channels (realtime) =====
function loadChannels() {
    if (!db) {
        loadLocalFallbackChannels();
        return;
    }
    db.collection(CHANNELS_COLLECTION)
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            const channels = [];
            snapshot.forEach((doc) => {
                channels.push({ id: doc.id, ...doc.data() });
            });
            if (channels.length > 0) {
                globalChannels = channels;
                renderChannels(channels);
                if (isAdmin) renderAdminChannels(channels);
            } else {
                console.log('Coleção do Firestore está vazia. Carregando fallback local...');
                loadLocalFallbackChannels();
            }
        }, (err) => {
            console.error('Erro Firestore (onSnapshot):', err);
            loadLocalFallbackChannels();
        });
}

// ===== LOCAL FALLBACK CHANNELS =====
async function loadLocalFallbackChannels() {
    try {
        console.log('[Fallback] Carregando canais locais a partir de channels.json...');
        const res = await fetch('channels.json');
        if (res.ok) {
            const channels = await res.json();
            const mapped = channels.map((ch, idx) => ({ id: `fallback-${idx}`, ...ch }));
            console.log(`[Fallback] ${mapped.length} canais carregados com sucesso.`);
            globalChannels = mapped;
            renderChannels(mapped);
            if (isAdmin) renderAdminChannels(mapped);
        } else {
            console.warn('[Fallback] channels.json não foi encontrado.');
            renderChannels([]);
        }
    } catch (err) {
        console.error('[Fallback] Erro ao carregar canais locais:', err);
        renderChannels([]);
    }
}

// ===== RENDER CHANNELS =====
function renderChannels(channels) {
    if (channels.length === 0) {
        channelsGrid.innerHTML = `<div class="no-channels"><p>Nenhum canal disponível no momento.</p></div>`;
        channelCount.textContent = '0 canais';
        liveBadge.style.display = 'none';
        return;
    }

    channelCount.textContent = `${channels.length} ${channels.length === 1 ? 'canal' : 'canais'}`;
    liveBadge.style.display = 'flex';

    const categoryIcons = {
        'premiere': '🏆', 'espn': '📺', 'sportv': '⚽',
        'esportes': '🏅', 'futebol': '⚽', 'amazon': '📦',
        'disney': '✨', 'max': '🎬', 'paramount': '⭐',
        'dazn': '🔥', 'default': '📡'
    };

    const getIcon = (cat) => {
        if (!cat) return '📡';
        const key = Object.keys(categoryIcons).find(k => cat.toLowerCase().includes(k));
        return key ? categoryIcons[key] : '📡';
    };

    channelsGrid.innerHTML = channels.map(ch => `
        <div class="channel-card ${currentChannel?.id === ch.id ? 'active' : ''}" 
             data-id="${ch.id}" onclick="playChannel('${ch.id}')">
            <div class="channel-icon">${getIcon(ch.category)}</div>
            <div class="channel-info">
                <div class="channel-name">${escapeHtml(ch.name)}</div>
                ${ch.category ? `<div class="channel-category">${escapeHtml(ch.category)}</div>` : ''}
            </div>
            <div class="channel-play-icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
            </div>
        </div>
    `).join('');
}

// ===== RENDER ADMIN CHANNELS =====
function renderAdminChannels(channels) {
    if (channels.length === 0) {
        adminChannelsList.innerHTML = `<div class="admin-no-channels">Nenhum canal cadastrado</div>`;
        return;
    }

    adminChannelsList.innerHTML = channels.map(ch => `
        <div class="admin-channel-item">
            <div class="admin-channel-info">
                <div class="admin-channel-name">${escapeHtml(ch.name)}</div>
                <div class="admin-channel-url">${escapeHtml(ch.url)}</div>
            </div>
            <div class="admin-channel-actions">
                <button class="btn-icon delete" title="Remover" onclick="deleteChannel('${ch.id}')">🗑️</button>
            </div>
        </div>
    `).join('');
}

// ===== PLAY CHANNEL =====
window.playChannel = async function(channelId) {
    try {
        let channel;
        if (channelId.startsWith('fallback-') || !db) {
            channel = globalChannels.find(c => c.id === channelId);
        } else {
            try {
                const doc = await db.collection(CHANNELS_COLLECTION).doc(channelId).get();
                if (doc.exists) {
                    channel = { id: doc.id, ...doc.data() };
                }
            } catch (e) {
                console.warn('[Player] Falha Firestore doc, buscando em cache:', e.message);
            }
            if (!channel) {
                channel = globalChannels.find(c => c.id === channelId);
            }
        }

        if (!channel) {
            showToast('Canal não encontrado', 'error');
            return;
        }

        currentChannel = channel;

        // Update UI
        playerPlaceholder.style.display = 'none';
        playerError.style.display = 'none';
        playerLoading.style.display = 'flex';
        video.classList.add('active');
        playerOverlay.classList.add('active');
        // Nome: usa home x away se for jogo sincronizado, senão usa 'name'
        nowPlaying.textContent = channel.home
            ? `${channel.home} x ${channel.away}`
            : (channel.name || 'Ao Vivo');

        // Mark active card
        document.querySelectorAll('.channel-card').forEach(card => {
            card.classList.toggle('active', card.dataset.id === channelId);
        });

        // Clear player options UI
        playerOptionsContainer.style.display = 'none';
        optionsButtons.innerHTML = '';

        // Estratégia de stream:
        // 1. Se tem streamPageUrl (URL do player do site fonte), usa /stream-proxy para pegar token fresco
        // 2. Se tem url direta (.m3u8), roteia pelo proxy normal
        // 3. Fallback: tenta direto
        const streamPageUrl = channel.streamPageUrl;
        const directUrl = channel.url;

        let streamUrl;

        if (streamPageUrl && streamPageUrl.includes('futemais') && proxyUrl) {
            // Usa o stream-proxy que busca token fresco em tempo real
            streamUrl = `${proxyUrl}/stream-proxy?pageUrl=${encodeURIComponent(streamPageUrl)}`;
            // Fetch alternative options in the background
            loadAlternativeOptions(streamPageUrl);
        } else if (directUrl && directUrl.includes('.m3u8') && proxyUrl) {
            // URL direta, roteia pelo proxy de CORS
            streamUrl = `${proxyUrl}/proxy?url=${encodeURIComponent(directUrl)}`;
        } else if (directUrl && directUrl.includes('.m3u8')) {
            streamUrl = directUrl;
        } else if (streamPageUrl && proxyUrl) {
            streamUrl = `${proxyUrl}/stream-proxy?pageUrl=${encodeURIComponent(streamPageUrl)}`;
            loadAlternativeOptions(streamPageUrl);
        } else {
            showError('Canal sem URL de stream configurada.');
            return;
        }

        console.log('[Player] Stream URL:', streamUrl);
        startStream(streamUrl);

    } catch (err) {
        console.error('Erro ao reproduzir:', err);
        showError('Erro ao carregar canal');
    }
};

// ===== LOAD ALTERNATIVE OPTIONS =====
async function loadAlternativeOptions(pageUrl) {
    try {
        console.log('[Player] Fetching channel options...');
        const res = await fetch(`${proxyUrl}/api/options?pageUrl=${encodeURIComponent(pageUrl)}`);
        if (res.ok) {
            const data = await res.json();
            if (data && data.options && data.options.length > 0) {
                renderOptionButtons(data.options, pageUrl);
            }
        }
    } catch (err) {
        console.warn('Erro ao carregar canais alternativos:', err);
    }
}

// ===== RENDER OPTION BUTTONS =====
function renderOptionButtons(options, pageUrl) {
    optionsButtons.innerHTML = '';
    
    options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = opt.label;
        if (idx === 0) btn.classList.add('active');
        
        btn.onclick = () => {
            document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            playerLoading.style.display = 'flex';
            playerError.style.display = 'none';
            
            const streamUrl = `${proxyUrl}/stream-proxy?pageUrl=${encodeURIComponent(pageUrl)}&optionUrl=${encodeURIComponent(opt.url)}`;
            console.log('[Player] Loading Option:', opt.label, streamUrl);
            startStream(streamUrl);
        };
        
        optionsButtons.appendChild(btn);
    });
    
    playerOptionsContainer.style.display = 'flex';
}

// ===== START STREAM =====
function startStream(url) {
    // Destroy existing HLS instance
    if (hls) {
        hls.destroy();
        hls = null;
    }

    const isM3U8 = url.includes('.m3u8') || url.includes('m3u8');

    if (isM3U8 && Hls.isSupported()) {
        hls = new Hls({
            debug: false,
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 30,
            maxBufferLength: 30,
            maxMaxBufferLength: 60,
            startLevel: -1, // Auto quality
            xhrSetup: function(xhr) {
                xhr.withCredentials = false;
            }
        });

        hls.loadSource(url);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            playerLoading.style.display = 'none';
            video.play().catch(() => {
                // Autoplay blocked, show play button
                playerLoading.style.display = 'none';
            });
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
            console.error('HLS Error:', data);
            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        console.log('Network error, trying to recover...');
                        if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR) {
                            showError('Não foi possível carregar o stream. Verifique a URL ou configure o servidor proxy.');
                        } else {
                            hls.startLoad();
                        }
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        console.log('Media error, trying to recover...');
                        hls.recoverMediaError();
                        break;
                    default:
                        showError('Erro fatal no stream');
                        hls.destroy();
                        break;
                }
            }
        });

    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS
        video.src = url;
        video.addEventListener('loadedmetadata', () => {
            playerLoading.style.display = 'none';
            video.play();
        }, { once: true });

        video.addEventListener('error', () => {
            showError('Erro ao carregar stream');
        }, { once: true });

    } else {
        // Try as direct video (mp4, ts, etc)
        video.src = url;
        video.addEventListener('canplay', () => {
            playerLoading.style.display = 'none';
            video.play().catch(() => {});
        }, { once: true });

        video.addEventListener('error', () => {
            showError('Formato não suportado ou erro de CORS. Configure o servidor proxy.');
        }, { once: true });
    }
}

// ===== SHOW ERROR =====
function showError(msg) {
    playerLoading.style.display = 'none';
    errorText.textContent = msg;
    playerError.style.display = 'flex';
}

// ===== ADD CHANNEL =====
async function addChannel() {
    const name = channelName.value.trim();
    const url = channelUrl.value.trim();
    const category = channelCategory.value.trim();

    if (!name || !url) {
        showToast('Preencha o nome e a URL', 'error');
        return;
    }

    try {
        await db.collection(CHANNELS_COLLECTION).add({
            name,
            url,
            category: category || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Clear form
        channelName.value = '';
        channelUrl.value = '';
        channelCategory.value = '';

        showToast('✅ Canal adicionado com sucesso!', 'success');
    } catch (err) {
        console.error('Erro ao adicionar canal:', err);
        showToast('Erro ao adicionar canal', 'error');
    }
}

// ===== DELETE CHANNEL =====
window.deleteChannel = async function(channelId) {
    if (!confirm('Tem certeza que deseja remover este canal?')) return;

    try {
        await db.collection(CHANNELS_COLLECTION).doc(channelId).delete();
        showToast('Canal removido', 'success');

        // If this was the playing channel, stop
        if (currentChannel?.id === channelId) {
            stopPlayback();
        }
    } catch (err) {
        console.error('Erro ao remover canal:', err);
        showToast('Erro ao remover canal', 'error');
    }
};

// ===== STOP PLAYBACK =====
function stopPlayback() {
    if (hls) {
        hls.destroy();
        hls = null;
    }
    video.src = '';
    video.classList.remove('active');
    playerOverlay.classList.remove('active');
    playerPlaceholder.style.display = 'flex';
    playerLoading.style.display = 'none';
    playerError.style.display = 'none';
    playerOptionsContainer.style.display = 'none';
    optionsButtons.innerHTML = '';
    currentChannel = null;
    nowPlaying.textContent = '';
}

// ===== SETUP EVENTS =====
function setupEvents() {
    // Admin button
    $('btn-admin').addEventListener('click', () => {
        adminModal.style.display = 'flex';
        if (isAdmin) {
            adminLogin.style.display = 'none';
            adminPanel.style.display = 'block';
        } else {
            adminLogin.style.display = 'block';
            adminPanel.style.display = 'none';
            adminPassword.value = '';
            loginError.style.display = 'none';
        }
    });

    // Close modal
    $('modal-close').addEventListener('click', () => {
        adminModal.style.display = 'none';
    });

    // Click outside modal to close
    adminModal.addEventListener('click', (e) => {
        if (e.target === adminModal) adminModal.style.display = 'none';
    });

    // Admin login
    $('btn-login').addEventListener('click', doLogin);
    adminPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') doLogin();
    });

    // Add channel
    $('btn-add-channel').addEventListener('click', addChannel);

    // Save proxy
    $('btn-save-proxy').addEventListener('click', () => {
        proxyUrl = proxyUrlInput.value.trim().replace(/\/$/, ''); // remove trailing slash
        localStorage.setItem('proxyUrl', proxyUrl);
        showToast('✅ Proxy salvo!', 'success');
    });

    // Retry
    $('btn-retry').addEventListener('click', () => {
        if (currentChannel) playChannel(currentChannel.id);
    });

    // Player controls
    $('btn-play-pause').addEventListener('click', togglePlayPause);
    $('btn-mute').addEventListener('click', toggleMute);
    $('btn-fullscreen').addEventListener('click', toggleFullscreen);
    $('volume-slider').addEventListener('input', (e) => {
        video.volume = e.target.value;
        video.muted = false;
        updateVolumeIcon();
    });

    // Video events
    video.addEventListener('play', () => {
        $('icon-play').style.display = 'none';
        $('icon-pause').style.display = 'block';
    });

    video.addEventListener('pause', () => {
        $('icon-play').style.display = 'block';
        $('icon-pause').style.display = 'none';
    });

    // Show/hide overlay on mouse move
    let overlayTimeout;
    playerWrapper.addEventListener('mousemove', () => {
        playerOverlay.classList.add('visible');
        clearTimeout(overlayTimeout);
        overlayTimeout = setTimeout(() => {
            if (!video.paused) playerOverlay.classList.remove('visible');
        }, 3000);
    });

    playerWrapper.addEventListener('mouseleave', () => {
        if (!video.paused) playerOverlay.classList.remove('visible');
    });

    // Double click for fullscreen
    video.addEventListener('dblclick', toggleFullscreen);

    // Click video to play/pause
    video.addEventListener('click', togglePlayPause);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;

        switch (e.key) {
            case ' ':
            case 'k':
                e.preventDefault();
                togglePlayPause();
                break;
            case 'f':
                e.preventDefault();
                toggleFullscreen();
                break;
            case 'm':
                e.preventDefault();
                toggleMute();
                break;
            case 'Escape':
                if (adminModal.style.display === 'flex') {
                    adminModal.style.display = 'none';
                }
                break;
        }
    });
}

// ===== ADMIN LOGIN =====
function doLogin() {
    const pwd = adminPassword.value.trim();
    if (pwd === ADMIN_PASSWORD) {
        isAdmin = true;
        adminLogin.style.display = 'none';
        adminPanel.style.display = 'block';
        loginError.style.display = 'none';

        // Load admin channels list
        loadChannels();
        showToast('✅ Login efetuado!', 'success');
    } else {
        loginError.style.display = 'block';
        adminPassword.value = '';
        adminPassword.focus();
    }
}

// ===== PLAYER CONTROLS =====
function togglePlayPause() {
    if (!video.src && !video.classList.contains('active')) return;
    if (video.paused) {
        video.play().catch(() => {});
    } else {
        video.pause();
    }
}

function toggleMute() {
    video.muted = !video.muted;
    updateVolumeIcon();
}

function updateVolumeIcon() {
    $('icon-vol').style.display = video.muted ? 'none' : 'block';
    $('icon-muted').style.display = video.muted ? 'block' : 'none';
    $('volume-slider').value = video.muted ? 0 : video.volume;
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        playerWrapper.requestFullscreen?.() ||
        playerWrapper.webkitRequestFullscreen?.() ||
        playerWrapper.msRequestFullscreen?.();
    } else {
        document.exitFullscreen?.() ||
        document.webkitExitFullscreen?.() ||
        document.msExitFullscreen?.();
    }
}

// ===== TOAST =====
function showToast(message, type = 'success') {
    // Remove existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

// ===== UTILS =====
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
