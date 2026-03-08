// ===== FUTEBOL TV — MAIN APP =====

// Preloader
window.addEventListener('load', () => {
    setTimeout(() => document.getElementById('preloader').classList.add('hidden'), 1200);
});

// Navbar scroll
window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 50);
});

// Show today's date
const dateEl = document.getElementById('todayDate');
if (dateEl) {
    const today = new Date();
    const options = { weekday: 'long', day: 'numeric', month: 'long' };
    dateEl.textContent = today.toLocaleDateString('pt-BR', options);
}

// ===== STATE =====
let currentChannelUrl = null;
let hlsPlayer = null;
let paywallTimer = null;
let timeLeft = 120;
const FREE_TIME = 120; // 2 minutes
let allChannels = [];

// ===== DEMO CHANNELS =====
const sampleChannels = [
    {
        id: 'demo1', home: 'Flamengo', away: 'Palmeiras', league: 'Brasileirao Serie A',
        scoreHome: 2, scoreAway: 1, time: "67' 2T", status: 'live',
        emojiHome: '🔴', emojiAway: '🟢', viewers: 12453,
        matchDate: '2026-03-07', matchTime: '21:30',
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    },
    {
        id: 'demo2', home: 'Real Madrid', away: 'Barcelona', league: 'La Liga',
        scoreHome: 1, scoreAway: 1, time: "34' 1T", status: 'live',
        emojiHome: '⚪', emojiAway: '🔵', viewers: 34210,
        matchDate: '2026-03-07', matchTime: '17:00',
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    },
    {
        id: 'demo3', home: 'Corinthians', away: 'Sao Paulo', league: 'Brasileirao Serie A',
        scoreHome: 0, scoreAway: 0, time: "12' 1T", status: 'live',
        emojiHome: '⚫', emojiAway: '🔴', viewers: 8721,
        matchDate: '2026-03-07', matchTime: '19:00',
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    },
    {
        id: 'demo4', home: 'Manchester City', away: 'Liverpool', league: 'Premier League',
        scoreHome: 3, scoreAway: 2, time: "89' 2T", status: 'live',
        emojiHome: '🔵', emojiAway: '🔴', viewers: 45102,
        matchDate: '2026-03-07', matchTime: '14:30',
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    },
    {
        id: 'demo5', home: 'Gremio', away: 'Internacional', league: 'Brasileirao Serie A',
        scoreHome: 1, scoreAway: 0, time: "55' 2T", status: 'live',
        emojiHome: '🔵', emojiAway: '🔴', viewers: 6534,
        matchDate: '2026-03-08', matchTime: '16:00',
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    },
    {
        id: 'demo6', home: 'Juventus', away: 'Milan', league: 'Serie A',
        scoreHome: 0, scoreAway: 1, time: "22' 1T", status: 'live',
        emojiHome: '⚪', emojiAway: '🔴', viewers: 15783,
        matchDate: '2026-03-08', matchTime: '15:45',
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'
    }
];

// ===== FORMAT TIME =====
function formatMatchTime(ch) {
    if (ch.matchDate && ch.matchTime) {
        return ch.matchTime;
    }
    return ch.time || '--:--';
}

function formatMatchDate(ch) {
    if (ch.matchDate) {
        const d = new Date(ch.matchDate + 'T12:00:00');
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        if (d.toDateString() === today.toDateString()) return 'Hoje';
        if (d.toDateString() === tomorrow.toDateString()) return 'Amanha';
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    }
    return '';
}

// ===== TEAM LOGOS =====
function getTeamLogo(teamName) {
    const n = teamName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // CDN base for team logos
    const LOGOS = {
        // Brasileirão Série A
        'flamengo': 'https://logodetimes.com/times/flamengo/logo-flamengo-256.png',
        'palmeiras': 'https://logodetimes.com/times/palmeiras/logo-palmeiras-256.png',
        'corinthians': 'https://logodetimes.com/times/corinthians/logo-corinthians-256.png',
        'sao paulo': 'https://logodetimes.com/times/sao-paulo/logo-sao-paulo-256.png',
        'santos': 'https://logodetimes.com/times/santos/logo-santos-256.png',
        'gremio': 'https://logodetimes.com/times/gremio/logo-gremio-256.png',
        'internacional': 'https://logodetimes.com/times/internacional/logo-internacional-256.png',
        'atletico-mg': 'https://logodetimes.com/times/atletico-mineiro/logo-atletico-mineiro-256.png',
        'atletico mineiro': 'https://logodetimes.com/times/atletico-mineiro/logo-atletico-mineiro-256.png',
        'cruzeiro': 'https://logodetimes.com/times/cruzeiro/logo-cruzeiro-256.png',
        'fluminense': 'https://logodetimes.com/times/fluminense/logo-fluminense-256.png',
        'botafogo': 'https://logodetimes.com/times/botafogo/logo-botafogo-256.png',
        'vasco': 'https://logodetimes.com/times/vasco-da-gama/logo-vasco-da-gama-256.png',
        'bahia': 'https://logodetimes.com/times/bahia/logo-bahia-256.png',
        'fortaleza': 'https://logodetimes.com/times/fortaleza/logo-fortaleza-256.png',
        'athletico': 'https://logodetimes.com/times/athletico-paranaense/logo-athletico-paranaense-256.png',
        'goias': 'https://logodetimes.com/times/goias/logo-goias-256.png',
        'cuiaba': 'https://logodetimes.com/times/cuiaba/logo-cuiaba-256.png',
        'bragantino': 'https://logodetimes.com/times/red-bull-bragantino/logo-red-bull-bragantino-256.png',
        'vitoria': 'https://logodetimes.com/times/vitoria/logo-vitoria-256.png',
        'sport': 'https://logodetimes.com/times/sport/logo-sport-256.png',
        'ceara': 'https://logodetimes.com/times/ceara/logo-ceara-256.png',
        'atletico-go': 'https://logodetimes.com/times/atletico-goianiense/logo-atletico-goianiense-256.png',
        'atletico goianiense': 'https://logodetimes.com/times/atletico-goianiense/logo-atletico-goianiense-256.png',
        'bangu': 'https://logodetimes.com/times/bangu/logo-bangu-256.png',
        'coritiba': 'https://logodetimes.com/times/coritiba/logo-coritiba-256.png',
        'america-mg': 'https://logodetimes.com/times/america-mineiro/logo-america-mineiro-256.png',
        'juventude': 'https://logodetimes.com/times/juventude/logo-juventude-256.png',
        'chapecoense': 'https://logodetimes.com/times/chapecoense/logo-chapecoense-256.png',
        // Premier League
        'manchester city': 'https://logodetimes.com/times/manchester-city/logo-manchester-city-256.png',
        'liverpool': 'https://logodetimes.com/times/liverpool/logo-liverpool-256.png',
        'arsenal': 'https://logodetimes.com/times/arsenal/logo-arsenal-256.png',
        'chelsea': 'https://logodetimes.com/times/chelsea/logo-chelsea-256.png',
        'manchester united': 'https://logodetimes.com/times/manchester-united/logo-manchester-united-256.png',
        'tottenham': 'https://logodetimes.com/times/tottenham-hotspur/logo-tottenham-hotspur-256.png',
        'newcastle': 'https://logodetimes.com/times/newcastle-united/logo-newcastle-united-256.png',
        'aston villa': 'https://logodetimes.com/times/aston-villa/logo-aston-villa-256.png',
        // La Liga
        'real madrid': 'https://logodetimes.com/times/real-madrid/logo-real-madrid-256.png',
        'barcelona': 'https://logodetimes.com/times/barcelona/logo-barcelona-256.png',
        'atletico de madrid': 'https://logodetimes.com/times/atletico-de-madrid/logo-atletico-de-madrid-256.png',
        'sevilla': 'https://logodetimes.com/times/sevilla/logo-sevilla-256.png',
        'athletic': 'https://logodetimes.com/times/athletic-bilbao/logo-athletic-bilbao-256.png',
        'athletic bilbao': 'https://logodetimes.com/times/athletic-bilbao/logo-athletic-bilbao-256.png',
        // Serie A (Italy)
        'juventus': 'https://logodetimes.com/times/juventus/logo-juventus-256.png',
        'milan': 'https://logodetimes.com/times/milan/logo-milan-256.png',
        'inter de milao': 'https://logodetimes.com/times/internazionale/logo-internazionale-256.png',
        'napoli': 'https://logodetimes.com/times/napoli/logo-napoli-256.png',
        'roma': 'https://logodetimes.com/times/roma/logo-roma-256.png',
        'lazio': 'https://logodetimes.com/times/lazio/logo-lazio-256.png',
        'pisa': 'https://logodetimes.com/times/pisa/logo-pisa-256.png',
        // Bundesliga
        'bayern': 'https://logodetimes.com/times/bayern-de-munique/logo-bayern-de-munique-256.png',
        'borussia dortmund': 'https://logodetimes.com/times/borussia-dortmund/logo-borussia-dortmund-256.png',
        // Ligue 1
        'psg': 'https://logodetimes.com/times/psg/logo-psg-256.png',
        'paris': 'https://logodetimes.com/times/psg/logo-psg-256.png',
        // Portuguese
        'benfica': 'https://logodetimes.com/times/benfica/logo-benfica-256.png',
        'porto': 'https://logodetimes.com/times/porto/logo-porto-256.png',
        'sporting': 'https://logodetimes.com/times/sporting/logo-sporting-256.png',
        // Other
        'wrexham': 'https://upload.wikimedia.org/wikipedia/en/thumb/5/55/Wrexham_AFC.svg/180px-Wrexham_AFC.svg.png',
    };

    // Try exact match
    for (const [key, url] of Object.entries(LOGOS)) {
        if (n.includes(key)) return url;
    }

    // Fallback: generic football icon
    return 'https://cdn-icons-png.flaticon.com/128/1165/1165187.png';
}

// ===== RENDER MATCHES AS LIST =====
function renderMatches(channels) {
    const list = document.getElementById('matchesList');
    const count = document.getElementById('matchCount');

    if (!channels || channels.length === 0) {
        channels = sampleChannels;
    }

    allChannels = channels;
    count.textContent = channels.length + ' jogos disponiveis';

    // Build league filters
    buildLeagueFilters(channels);

    // Group by date
    const groups = {};
    channels.forEach(ch => {
        const dateKey = ch.matchDate || 'live';
        const dateLabel = formatMatchDate(ch) || 'Ao Vivo';
        if (!groups[dateKey]) groups[dateKey] = { label: dateLabel, matches: [] };
        groups[dateKey].matches.push(ch);
    });

    let html = '';

    // Sort groups: today first, then chronological
    const sortedKeys = Object.keys(groups).sort();

    sortedKeys.forEach(key => {
        const group = groups[key];
        html += '<div class="match-date-group">';
        html += '<div class="match-date-header">';
        html += '<span class="match-date-label">' + group.label + '</span>';
        html += '<span class="match-date-count">' + group.matches.length + ' jogos</span>';
        html += '</div>';

        group.matches.forEach(ch => {
            const statusClass = ch.status === 'live' ? 'live' : ch.status === 'scheduled' ? 'scheduled' : 'ended';
            const statusText = ch.status === 'live' ? 'AO VIVO' : ch.status === 'scheduled' ? 'Em Breve' : 'Encerrado';
            const statusDot = ch.status === 'live' ? '🔴' : ch.status === 'scheduled' ? '🟡' : '⚫';

            const logoHome = getTeamLogo(ch.home);
            const logoAway = getTeamLogo(ch.away);

            html += '<div class="match-item ' + statusClass + '" onclick="openPlayer(\'' + (ch.url || '') + '\', \'' + ch.home + ' x ' + ch.away + '\', \'' + (ch.streamPageUrl || '') + '\')">';
            html += '  <div class="match-item-left">';
            html += '    <div class="match-item-teams">';
            html += '      <img class="team-logo" src="' + logoHome + '" alt="' + ch.home + '" onerror="this.src=\'https://cdn-icons-png.flaticon.com/128/1165/1165187.png\'">';
            html += '      <div class="match-team-names">';
            html += '        <span class="team-home">' + ch.home + '</span>';
            html += '        <span class="team-vs">vs</span>';
            html += '        <span class="team-away">' + ch.away + '</span>';
            html += '      </div>';
            html += '      <img class="team-logo" src="' + logoAway + '" alt="' + ch.away + '" onerror="this.src=\'https://cdn-icons-png.flaticon.com/128/1165/1165187.png\'">';
            html += '    </div>';
            html += '  </div>';
            html += '  <div class="match-item-center">';
            html += '    <span class="match-league-tag">' + (ch.league || 'Campeonato') + '</span>';
            html += '  </div>';
            html += '  <div class="match-item-right">';
            html += '    <span class="match-item-time">' + formatMatchTime(ch) + '</span>';
            html += '    <span class="match-item-status ' + statusClass + '">' + statusDot + ' ' + statusText + '</span>';
            if (ch.status === 'live') {
                html += '    <span class="match-item-score">' + (ch.scoreHome ?? 0) + ' x ' + (ch.scoreAway ?? 0) + '</span>';
            }
            html += '  </div>';
            html += '  <div class="match-item-play">';
            html += '    <span class="play-icon">&#9654;</span>';
            html += '  </div>';
            html += '</div>';
        });

        html += '</div>';
    });

    list.innerHTML = html;
}

// ===== LEAGUE FILTERS =====
function buildLeagueFilters(channels) {
    const filtersDiv = document.getElementById('leagueFilters');
    const leagues = [...new Set(channels.map(c => c.league).filter(Boolean))];

    let html = '<button class="filter-btn active" onclick="filterMatches(\'all\')">Todos (' + channels.length + ')</button>';
    leagues.forEach(league => {
        const count = channels.filter(c => c.league === league).length;
        html += '<button class="filter-btn" onclick="filterMatches(\'' + league.replace(/'/g, "\\'") + '\')">' + league + ' (' + count + ')</button>';
    });
    filtersDiv.innerHTML = html;
}

function filterMatches(league) {
    // Update active filter button
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    if (league === 'all') {
        renderMatches(allChannels);
    } else {
        const filtered = allChannels.filter(c => c.league === league);
        const list = document.getElementById('matchesList');
        // Re-render only the filtered matches
        const temp = allChannels;
        renderMatches(filtered);
        allChannels = temp; // restore full list
    }
}

// ===== HLS PLAYER =====
function showPlayerError(msg) {
    let errDiv = document.getElementById('playerError');
    if (!errDiv) {
        errDiv = document.createElement('div');
        errDiv.id = 'playerError';
        errDiv.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:20;background:rgba(0,0,0,0.85);border:1px solid rgba(255,59,48,0.4);border-radius:16px;padding:32px 40px;text-align:center;max-width:400px;backdrop-filter:blur(10px)';
        const container = document.getElementById('videoPlayer').parentElement;
        container.style.position = 'relative';
        container.appendChild(errDiv);
    }
    errDiv.innerHTML = '<div style="font-size:3rem;margin-bottom:12px">📡</div>' +
        '<h3 style="color:#ff3b30;margin-bottom:8px;font-size:1.1rem">Stream Indisponivel</h3>' +
        '<p style="color:rgba(255,255,255,0.6);font-size:.85rem;line-height:1.5;margin-bottom:16px">' + msg + '</p>' +
        '<button onclick="retryStream()" style="background:linear-gradient(135deg,#00e676,#00c853);color:#000;border:none;padding:10px 24px;border-radius:8px;font-weight:700;cursor:pointer;margin-right:8px">Tentar Novamente</button>' +
        '<button onclick="closePlayer()" style="background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.2);padding:10px 24px;border-radius:8px;cursor:pointer">Voltar</button>';
    errDiv.style.display = 'block';
}

function hidePlayerError() {
    const errDiv = document.getElementById('playerError');
    if (errDiv) errDiv.style.display = 'none';
}

function retryStream() {
    if (currentChannelUrl) {
        hidePlayerError();
        loadHlsStream(currentChannelUrl);
    }
}

function loadHlsStream(url) {
    const video = document.getElementById('videoPlayer');
    hidePlayerError();

    if (Hls.isSupported() && url) {
        if (hlsPlayer) hlsPlayer.destroy();
        hlsPlayer = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            xhrSetup: function (xhr) {
                xhr.timeout = 10000;
            }
        });

        hlsPlayer.loadSource(url);
        hlsPlayer.attachMedia(video);

        hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
            video.play().catch(() => { });
        });

        hlsPlayer.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        showPlayerError('Erro de rede. O stream pode estar offline ou bloqueado por CORS.');
                        hlsPlayer.destroy();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        hlsPlayer.recoverMediaError();
                        break;
                    default:
                        showPlayerError('O stream nao pode ser carregado. Tente outro canal.');
                        hlsPlayer.destroy();
                        break;
                }
            }
        });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url;
        video.addEventListener('error', () => {
            showPlayerError('Erro ao carregar o stream neste dispositivo.');
        }, { once: true });
        video.play().catch(() => { });
    } else {
        showPlayerError('Seu navegador nao suporta reproducao HLS.');
    }
}

function openPlayer(url, title, streamPageUrl) {
    const isPremium = AuthModule.userData && AuthModule.userData.premium;
    currentChannelUrl = url;
    document.getElementById('playerTitle').textContent = title;
    document.getElementById('playerPage').classList.add('active');
    document.getElementById('paywallOverlay').classList.remove('active');
    document.body.style.overflow = 'hidden';

    // Update play button state
    updatePlayPauseBtn(true);

    // Remove any existing iframe
    const existingIframe = document.getElementById('streamIframe');
    if (existingIframe) existingIframe.remove();

    const video = document.getElementById('videoPlayer');

    if (url && url.includes('.m3u8')) {
        // Direct M3U8 stream
        video.style.display = '';
        loadHlsStream(url);
    } else if (streamPageUrl) {
        // Fallback: load original game page in iframe
        video.style.display = 'none';
        hidePlayerError();
        const iframe = document.createElement('iframe');
        iframe.id = 'streamIframe';
        iframe.src = streamPageUrl;
        iframe.style.cssText = 'width:100%;height:100%;border:none;position:absolute;top:0;left:0;z-index:5;background:#000;';
        iframe.allowFullscreen = true;
        iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media');
        video.parentElement.appendChild(iframe);
    } else if (url) {
        video.style.display = '';
        loadHlsStream(url);
    } else {
        showPlayerError('Nenhum stream disponível para este jogo no momento.');
    }

    // Timer
    if (!isPremium) {
        startPaywallTimer();
        const earlyPayBtn = document.getElementById('btnEarlyPay');
        if (earlyPayBtn) earlyPayBtn.style.display = '';
    } else {
        document.getElementById('timerBar').style.display = 'none';
        const badge = document.getElementById('timerBadgeInline');
        if (badge) badge.innerHTML = '<span style="color:var(--accent-green)">&#10004; Premium</span>';
        const earlyPayBtn = document.getElementById('btnEarlyPay');
        if (earlyPayBtn) earlyPayBtn.style.display = 'none';
    }
}

function closePlayer() {
    document.getElementById('playerPage').classList.remove('active');
    document.body.style.overflow = '';
    const video = document.getElementById('videoPlayer');
    video.pause();
    video.style.display = '';
    if (hlsPlayer) { hlsPlayer.destroy(); hlsPlayer = null; }

    // Remove iframe if exists
    const iframe = document.getElementById('streamIframe');
    if (iframe) iframe.remove();

    clearInterval(paywallTimer);
    paywallTimer = null;
    timeLeft = FREE_TIME;

    // Reset timer
    const fill = document.getElementById('timerFill');
    if (fill) fill.style.width = '100%';
    const badge = document.getElementById('timerBadgeInline');
    if (badge) badge.innerHTML = '<span class="timer-icon">&#9201;</span><span id="timerTextInline">Gratis: 2:00</span>';
    const bar = document.getElementById('timerBar');
    if (bar) bar.style.display = '';
}

// ===== PLAYER CONTROLS =====
function togglePlayPause() {
    const video = document.getElementById('videoPlayer');
    if (video.paused) {
        video.play().catch(() => { });
        updatePlayPauseBtn(true);
    } else {
        video.pause();
        updatePlayPauseBtn(false);
    }
}

function updatePlayPauseBtn(playing) {
    const btn = document.getElementById('btnPlayPause');
    if (btn) btn.innerHTML = playing ? '⏸' : '▶️';
}

function toggleMute() {
    const video = document.getElementById('videoPlayer');
    const btn = document.getElementById('btnMute');
    const slider = document.getElementById('volumeSlider');
    video.muted = !video.muted;
    if (btn) btn.innerHTML = video.muted ? '🔇' : '🔊';
    if (slider) slider.value = video.muted ? 0 : video.volume * 100;
}

function changeVolume(val) {
    const video = document.getElementById('videoPlayer');
    const btn = document.getElementById('btnMute');
    video.volume = val / 100;
    video.muted = val == 0;
    if (btn) btn.innerHTML = val == 0 ? '🔇' : val < 50 ? '🔉' : '🔊';
}

function toggleFullscreen() {
    const container = document.getElementById('playerPage');
    if (!document.fullscreenElement) {
        (container.requestFullscreen || container.webkitRequestFullscreen || container.mozRequestFullScreen).call(container);
    } else {
        (document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen).call(document);
    }
}

function tryCast() {
    // Try native cast API or show manual instructions
    if (navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices) {
        alert('📺 Para transmitir via Chromecast:\n\n1. Clique nos 3 pontos do Chrome (⋮)\n2. Selecione "Transmitir..."\n3. Escolha seu dispositivo Chromecast\n\nOu use o botao Transmitir do navegador.');
    } else {
        alert('📺 Para transmitir:\n\nUse o menu do navegador > Transmitir\nOu conecte via HDMI/Smart TV.');
    }
}

// Video event listeners
document.getElementById('videoPlayer').addEventListener('play', () => updatePlayPauseBtn(true));
document.getElementById('videoPlayer').addEventListener('pause', () => updatePlayPauseBtn(false));

// ===== PAYWALL TIMER (2 MINUTES) =====
function startPaywallTimer() {
    timeLeft = FREE_TIME;
    const fill = document.getElementById('timerFill');
    const bar = document.getElementById('timerBar');

    if (bar) bar.style.display = '';

    paywallTimer = setInterval(() => {
        timeLeft--;
        const pct = (timeLeft / FREE_TIME) * 100;
        if (fill) fill.style.width = pct + '%';

        // Format mm:ss
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        const timeStr = mins + ':' + (secs < 10 ? '0' : '') + secs;

        const timerInline = document.getElementById('timerTextInline');
        if (timerInline) timerInline.textContent = 'Gratis: ' + timeStr;

        // Warning colors
        if (timeLeft <= 30) {
            if (fill) fill.style.background = 'linear-gradient(90deg,#ff3b30,#ff6b35)';
        }

        if (timeLeft <= 0) {
            clearInterval(paywallTimer);
            triggerPaywall();
        }
    }, 1000);
}

function triggerPaywall() {
    document.getElementById('videoPlayer').pause();
    document.getElementById('paywallOverlay').classList.add('active');
    document.getElementById('timerBar').style.display = 'none';
    const badge = document.getElementById('timerBadgeInline');
    if (badge) badge.innerHTML = '<span style="color:var(--accent-red)">🔒 Bloqueado</span>';

    // Pre-fill email if logged in
    const payEmail = document.getElementById('payEmail');
    if (payEmail && AuthModule.currentUser) {
        payEmail.value = AuthModule.currentUser.email;
    }

    const identifier = AuthModule.currentUser ? AuthModule.currentUser.uid : getClientIP();
    DataModule.blockAccess(identifier).catch(() => { });
}

function closePaywall() {
    document.getElementById('paywallOverlay').classList.remove('active');
}

function getClientIP() {
    return 'anon_' + btoa(navigator.userAgent.substring(0, 30) + screen.width + screen.height).substring(0, 20);
}

// ===== PAYMENT WITH EMAIL =====
async function processPayment() {
    const emailInput = document.getElementById('payEmail');
    const email = emailInput ? emailInput.value.trim() : '';

    if (!email || !email.includes('@')) {
        alert('Por favor, insira um e-mail valido para receber o acesso Premium.');
        return;
    }

    const confirmed = confirm(
        '💳 CONFIRMAR PAGAMENTO\n\n' +
        'Valor: R$ 14,90/mes\n' +
        'E-mail: ' + email + '\n\n' +
        'Apos o pagamento, voce tera acesso ilimitado a todos os jogos.\n\n' +
        'Clique OK para confirmar.'
    );

    if (!confirmed) return;

    try {
        // If user is not logged in, try to create account or log in with this email
        if (!AuthModule.currentUser) {
            // Try login first
            let result = await AuthModule.login(email, 'premium2026');
            if (!result.success) {
                // Create account
                result = await AuthModule.register(email, 'premium2026', { name: 'Premium' });
            }
        }

        // Grant premium access
        const uid = AuthModule.currentUser ? AuthModule.currentUser.uid : null;
        if (uid) {
            await db.collection('users').doc(uid).update({ premium: true });
            AuthModule.userData.premium = true;
        }

        const identifier = uid || getClientIP();
        await DataModule.grantAccess(identifier);

        // Remove paywall, resume
        document.getElementById('paywallOverlay').classList.remove('active');
        document.getElementById('timerBar').style.display = 'none';
        const badge = document.getElementById('timerBadgeInline');
        if (badge) badge.innerHTML = '<span style="color:var(--accent-green)">&#10004; Premium</span>';
        const earlyPayBtn = document.getElementById('btnEarlyPay');
        if (earlyPayBtn) earlyPayBtn.style.display = 'none';

        document.getElementById('videoPlayer').play().catch(() => { });
        clearInterval(paywallTimer);

        alert('✅ Pagamento confirmado!\n\nE-mail premium: ' + email + '\n\nAproveite todos os jogos sem limites!');
    } catch (err) {
        alert('Erro ao processar pagamento. Tente novamente.\n' + err.message);
    }
}

function openPayment() {
    // If already in player, show paywall early with payment form
    const paywall = document.getElementById('paywallOverlay');
    if (paywall) {
        paywall.classList.add('active');
        // Pre-fill email
        const payEmail = document.getElementById('payEmail');
        if (payEmail && AuthModule.currentUser) {
            payEmail.value = AuthModule.currentUser.email;
        }
        // Pause video while deciding
        document.getElementById('videoPlayer').pause();
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
    document.getElementById('navCta').innerHTML =
        '<span style="color:var(--text-secondary);font-size:.85rem">⚽ ' + (data.name || user.email) + '</span>' +
        (data.premium ? '<span class="badge-live" style="background:rgba(255,214,0,.15);border-color:rgba(255,214,0,.3);color:#ffd600"><span class="dot" style="background:#ffd600"></span> PREMIUM</span>' : '') +
        '<a href="#" class="btn btn-secondary" onclick="AuthModule.logout()">Sair</a>';

    // If premium and paywall is active, remove it
    if (data.premium && document.getElementById('paywallOverlay').classList.contains('active')) {
        document.getElementById('paywallOverlay').classList.remove('active');
        document.getElementById('timerBar').style.display = 'none';
        const badge = document.getElementById('timerBadgeInline');
        if (badge) badge.innerHTML = '<span style="color:var(--accent-green)">&#10004; Premium</span>';
        clearInterval(paywallTimer);
        document.getElementById('videoPlayer').play().catch(() => { });
    }
};

AuthModule.onLogout = () => {
    document.getElementById('navCta').innerHTML =
        '<a href="#" class="btn btn-secondary" onclick="openLogin()">Entrar</a>' +
        '<a href="#" class="btn btn-primary" onclick="openRegister()">Assinar</a>';
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
    renderMatches(sampleChannels);
}

// Scroll reveal
const revealObs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('active'); });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));
