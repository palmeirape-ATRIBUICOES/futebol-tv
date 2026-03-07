// ===== FUTEBOL TV — MAIN APP =====

// Preloader
window.addEventListener('load', () => {
    setTimeout(() => document.getElementById('preloader').classList.add('hidden'), 1800);
});

// Navbar scroll
window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 50);
});

// ===== STATE =====
let currentChannelUrl = null;
let hlsPlayer = null;
let paywallTimer = null;
let timeLeft = 40;
const FREE_TIME = 40; // seconds

// ===== DEMO/SAMPLE CHANNELS =====
const sampleChannels = [
    {
        id: 'demo1', home: 'Flamengo', away: 'Palmeiras', league: 'Brasileirão Série A',
        scoreHome: 2, scoreAway: 1, time: "67' 2º Tempo", status: 'live',
        emojiHome: '🔴', emojiAway: '🟢', viewers: 12453,
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    },
    {
        id: 'demo2', home: 'Real Madrid', away: 'Barcelona', league: 'La Liga',
        scoreHome: 1, scoreAway: 1, time: "34' 1º Tempo", status: 'live',
        emojiHome: '⚪', emojiAway: '🔵', viewers: 34210,
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    },
    {
        id: 'demo3', home: 'Corinthians', away: 'São Paulo', league: 'Brasileirão Série A',
        scoreHome: 0, scoreAway: 0, time: "12' 1º Tempo", status: 'live',
        emojiHome: '⚫', emojiAway: '🔴', viewers: 8721,
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    },
    {
        id: 'demo4', home: 'Manchester City', away: 'Liverpool', league: 'Premier League',
        scoreHome: 3, scoreAway: 2, time: "89' 2º Tempo", status: 'live',
        emojiHome: '🔵', emojiAway: '🔴', viewers: 45102,
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    },
    {
        id: 'demo5', home: 'Grêmio', away: 'Internacional', league: 'Brasileirão Série A',
        scoreHome: 1, scoreAway: 0, time: "55' 2º Tempo", status: 'live',
        emojiHome: '🔵', emojiAway: '🔴', viewers: 6534,
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    },
    {
        id: 'demo6', home: 'Juventus', away: 'Milan', league: 'Serie A',
        scoreHome: 0, scoreAway: 1, time: "22' 1º Tempo", status: 'live',
        emojiHome: '⚪', emojiAway: '🔴', viewers: 15783,
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    }
];

// ===== RENDER MATCHES =====
function renderMatches(channels) {
    const grid = document.getElementById('matchesGrid');
    const count = document.getElementById('matchCount');

    if (!channels || channels.length === 0) {
        // Use samples if no Firestore channels
        channels = sampleChannels;
    }

    count.textContent = `${channels.length} jogos disponíveis`;

    grid.innerHTML = channels.map(ch => `
    <div class="match-card" onclick="openPlayer('${ch.url || ''}', '${ch.home} x ${ch.away}')">
      <div class="match-card-thumb">
        <div style="width:100%;height:100%;background:linear-gradient(135deg,#1a1a28 0%,#2a2a3a 100%);display:flex;align-items:center;justify-content:center;font-size:3rem">
          ${ch.emojiHome || '⚽'} ⚡ ${ch.emojiAway || '⚽'}
        </div>
        <div class="match-card-overlay"></div>
        ${ch.status === 'live' ? '<div class="match-card-live"><span class="badge-live"><span class="dot"></span> AO VIVO</span></div>' : ''}
        <div class="match-card-viewers">👁 ${(ch.viewers || 0).toLocaleString('pt-BR')}</div>
      </div>
      <div class="match-card-body">
        <div class="match-teams">
          <div class="match-team">
            <div class="match-team-logo">${ch.emojiHome || '⚽'}</div>
            <span class="match-team-name">${ch.home}</span>
          </div>
          <div class="match-score">${ch.scoreHome ?? 0} x ${ch.scoreAway ?? 0}</div>
          <div class="match-team">
            <div class="match-team-logo">${ch.emojiAway || '⚽'}</div>
            <span class="match-team-name">${ch.away}</span>
          </div>
        </div>
        <div class="match-info">
          <span class="match-league">🏆 ${ch.league || 'Campeonato'}</span>
          <span class="match-time">${ch.time || '--'}</span>
        </div>
      </div>
      <button class="match-card-play">▶</button>
    </div>
  `).join('');
}

// ===== HLS PLAYER =====
function openPlayer(url, title) {
    // Check if user is premium
    const isPremium = AuthModule.userData && AuthModule.userData.premium;

    currentChannelUrl = url;
    document.getElementById('playerTitle').textContent = title;
    document.getElementById('playerPage').classList.add('active');
    document.getElementById('paywallOverlay').classList.remove('active');

    // Start video
    const video = document.getElementById('videoPlayer');
    if (Hls.isSupported() && url) {
        if (hlsPlayer) hlsPlayer.destroy();
        hlsPlayer = new Hls();
        hlsPlayer.loadSource(url);
        hlsPlayer.attachMedia(video);
        hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => { });
        });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.play().catch(() => { });
    }

    // Start paywall timer (only if not premium)
    if (!isPremium) {
        startPaywallTimer();
    } else {
        document.getElementById('timerBar').style.display = 'none';
        document.getElementById('timerBadge').innerHTML = '<span style="color:var(--accent-green)">✅ Premium</span>';
    }
}

function closePlayer() {
    document.getElementById('playerPage').classList.remove('active');
    const video = document.getElementById('videoPlayer');
    video.pause();
    if (hlsPlayer) { hlsPlayer.destroy(); hlsPlayer = null; }
    clearInterval(paywallTimer);
    paywallTimer = null;
    timeLeft = FREE_TIME;

    // Reset timer UI
    document.getElementById('timerFill').style.width = '100%';
    document.getElementById('timerBadge').innerHTML = '<span class="timer-icon">⏱</span><span id="timerText">Grátis: 40s</span>';
    document.getElementById('timerBar').style.display = '';
}

// ===== PAYWALL TIMER =====
function startPaywallTimer() {
    timeLeft = FREE_TIME;
    const fill = document.getElementById('timerFill');
    const text = document.getElementById('timerText');
    const bar = document.getElementById('timerBar');
    const badge = document.getElementById('timerBadge');

    bar.style.display = '';
    badge.innerHTML = '<span class="timer-icon">⏱</span><span id="timerText">Grátis: 40s</span>';

    paywallTimer = setInterval(() => {
        timeLeft--;
        const pct = (timeLeft / FREE_TIME) * 100;
        fill.style.width = pct + '%';

        const timerTextEl = document.getElementById('timerText');
        if (timerTextEl) {
            timerTextEl.textContent = `Grátis: ${timeLeft}s`;
        }

        // Change color when low
        if (timeLeft <= 10) {
            fill.style.background = 'var(--gradient-live)';
        }

        if (timeLeft <= 0) {
            clearInterval(paywallTimer);
            triggerPaywall();
        }
    }, 1000);
}

function triggerPaywall() {
    // Pause video
    document.getElementById('videoPlayer').pause();
    // Show paywall
    document.getElementById('paywallOverlay').classList.add('active');
    // Hide timer
    document.getElementById('timerBar').style.display = 'none';
    document.getElementById('timerBadge').innerHTML = '<span style="color:var(--accent-red)">🔒 Bloqueado</span>';

    // Block in Firestore
    const identifier = AuthModule.currentUser ? AuthModule.currentUser.uid : getClientIP();
    DataModule.blockAccess(identifier).catch(() => { });
}

function getClientIP() {
    // Fallback: use a fingerprint from user agent + screen size
    return 'anon_' + btoa(navigator.userAgent.substring(0, 30) + screen.width + screen.height).substring(0, 20);
}

// ===== PAYMENT =====
function openPayment() {
    // For MVP: simulate payment with a confirmation
    const confirmed = confirm(
        '💳 PAGAMENTO — R$ 14,90/mês\n\n' +
        'No MVP, o pagamento é simulado.\n' +
        'Em produção, integraremos com Mercado Pago/PIX.\n\n' +
        'Clique OK para simular pagamento aprovado.'
    );

    if (confirmed) {
        // Grant access
        const identifier = AuthModule.currentUser ? AuthModule.currentUser.uid : getClientIP();
        DataModule.grantAccess(identifier).then(() => {
            // If logged in, update premium status
            if (AuthModule.currentUser) {
                db.collection('users').doc(AuthModule.currentUser.uid).update({ premium: true });
                AuthModule.userData.premium = true;
            }
            // Remove paywall
            document.getElementById('paywallOverlay').classList.remove('active');
            document.getElementById('timerBar').style.display = 'none';
            document.getElementById('timerBadge').innerHTML = '<span style="color:var(--accent-green)">✅ Premium</span>';
            // Resume video
            document.getElementById('videoPlayer').play().catch(() => { });
            alert('✅ Pagamento confirmado! Aproveite todos os jogos sem limites.');
        }).catch(() => {
            alert('Erro ao processar. Tente novamente.');
        });
    }
}

// ===== AUTH UI =====
function openLogin() {
    document.getElementById('loginError').style.display = 'none';
    document.getElementById('loginModal').classList.add('active');
}
function closeLogin() {
    document.getElementById('loginModal').classList.remove('active');
}
function openRegister() {
    document.getElementById('registerError').style.display = 'none';
    document.getElementById('registerModal').classList.add('active');
}
function closeRegister() {
    document.getElementById('registerModal').classList.remove('active');
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('loginBtn');
    const err = document.getElementById('loginError');
    btn.textContent = 'Entrando...'; btn.disabled = true; err.style.display = 'none';

    const result = await AuthModule.login(
        document.getElementById('loginEmail').value,
        document.getElementById('loginPassword').value
    );

    btn.textContent = 'Entrar'; btn.disabled = false;
    if (!result.success) { err.textContent = result.error; err.style.display = ''; }
    else { closeLogin(); }
}

async function handleRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('regBtn');
    const err = document.getElementById('registerError');
    btn.textContent = 'Criando...'; btn.disabled = true; err.style.display = 'none';

    const result = await AuthModule.register(
        document.getElementById('regEmail').value,
        document.getElementById('regPassword').value,
        { name: document.getElementById('regName').value }
    );

    btn.textContent = 'Criar Conta'; btn.disabled = false;
    if (!result.success) { err.textContent = result.error; err.style.display = ''; }
    else { closeRegister(); }
}

// ===== AUTH CALLBACKS =====
AuthModule.onLogin = (user, data) => {
    closeLogin();
    closeRegister();
    document.getElementById('navCta').innerHTML = `
    <span style="color:var(--text-secondary);font-size:.85rem">⚽ ${data.name || user.email}</span>
    ${data.premium ? '<span class="badge-live" style="background:rgba(255,214,0,.15);border-color:rgba(255,214,0,.3);color:#ffd600"><span class="dot" style="background:#ffd600"></span> PREMIUM</span>' : ''}
    <a href="#" class="btn btn-secondary" onclick="AuthModule.logout()">Sair</a>
  `;

    // If paywall is active and user is premium, remove it
    if (data.premium && document.getElementById('paywallOverlay').classList.contains('active')) {
        document.getElementById('paywallOverlay').classList.remove('active');
        document.getElementById('timerBar').style.display = 'none';
        document.getElementById('timerBadge').innerHTML = '<span style="color:var(--accent-green)">✅ Premium</span>';
        clearInterval(paywallTimer);
        document.getElementById('videoPlayer').play().catch(() => { });
    }
};

AuthModule.onLogout = () => {
    document.getElementById('navCta').innerHTML = `
    <a href="#" class="btn btn-secondary" onclick="openLogin()">Entrar</a>
    <a href="#" class="btn btn-primary" onclick="openRegister()">Assinar</a>
  `;
};

// ===== MODAL OVERLAY CLICK =====
document.getElementById('loginModal').addEventListener('click', e => { if (e.target.id === 'loginModal') closeLogin(); });
document.getElementById('registerModal').addEventListener('click', e => { if (e.target.id === 'registerModal') closeRegister(); });

// ===== INIT =====
AuthModule.init();

// Listen for channels from Firestore
try {
    DataModule.onChannelsChange(channels => {
        if (channels.length > 0) {
            renderMatches(channels);
        } else {
            renderMatches(sampleChannels);
        }
    });
} catch (e) {
    // If Firebase not configured, show samples
    renderMatches(sampleChannels);
}

// Scroll reveal
const revealObs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('active'); });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));
