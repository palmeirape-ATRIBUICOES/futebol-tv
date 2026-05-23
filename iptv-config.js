// ===== IPTV CONFIG — XTREAM CODES =====
// Configuração do servidor de retransmissão e credenciais IPTV

const IPTV_CONFIG = {
    // === SERVIDOR DE RETRANSMISSÃO ===
    // Quando o servidor Node.js estiver rodando, use a URL dele aqui.
    // Em produção, use a URL pública (ngrok, Railway, VPS, etc.)
    restreamServer: window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
        ? window.location.origin  // Usa o mesmo servidor se aberto via localhost
        : (window.RESTREAM_SERVER || ''),  // Em produção, defina window.RESTREAM_SERVER

    // === CREDENCIAIS IPTV (usadas pelo admin) ===
    server: 'http://horizonmult.fun',
    username: 'thpalmeira',
    password: '1643363hdgsje',

    // === CATEGORIAS ESPORTIVAS ===
    sportCategories: [
        { id: '57',   name: 'PREMIERE',       icon: '🏆' },
        { id: '73',   name: 'ESPN',           icon: '📺' },
        { id: '74',   name: 'SPORTV',         icon: '⚽' },
        { id: '75',   name: 'ESPORTES',       icon: '🏅' },
        { id: '59',   name: 'AMAZON PRIME',   icon: '📦' },
        { id: '3986', name: 'CAZÉ TV',        icon: '🎮' },
        { id: '61',   name: 'DISNEY+',        icon: '✨' },
        { id: '60',   name: 'MAX',            icon: '🎬' },
        { id: '63',   name: 'PARAMOUNT+',     icon: '⭐' },
        { id: '3987', name: 'GOAT',           icon: '🐐' },
        { id: '4737', name: 'NSPORTS',        icon: '🎯' },
        { id: '62',   name: 'DAZN',           icon: '🔥' },
        { id: '1026', name: 'ONE FOOTBALL',   icon: '⚽' },
        { id: '58',   name: 'SPORTYNET',      icon: '📡' },
        { id: '65',   name: 'PPV ESPORTES',   icon: '🏟️' },
    ],

    // Build API URL (direto ao painel IPTV — usado apenas no admin)
    getApiUrl(action, params = '') {
        return `${this.server}/player_api.php?username=${this.username}&password=${this.password}&action=${action}${params}`;
    },

    // Build stream URL VIA SERVIDOR DE RETRANSMISSÃO
    getStreamUrl(streamId, format = 'ts') {
        const base = this.restreamServer;
        if (base) {
            return `${base}/live/${streamId}.${format}`;
        }
        // Fallback direto (só funciona na rede local)
        return `${this.server}/${this.username}/${this.password}/${streamId}.${format}`;
    },

    // Build M3U8 stream URL VIA SERVIDOR DE RETRANSMISSÃO
    getM3U8Url(streamId) {
        const base = this.restreamServer;
        if (base) {
            return `${base}/live/${streamId}.m3u8`;
        }
        // Fallback direto
        return `${this.server}/live/${this.username}/${this.password}/${streamId}.m3u8`;
    },

    // Verifica se o servidor de retransmissão está disponível
    async checkRestreamServer() {
        if (!this.restreamServer) return false;
        try {
            const res = await fetch(`${this.restreamServer}/api/status`, { 
                signal: AbortSignal.timeout(5000) 
            });
            return res.ok;
        } catch {
            return false;
        }
    }
};
