// ===== FUTEBOL TV — AUTO SYNC SCRIPT (REST API) =====
// Runs via GitHub Actions every 30 minutes
// Uses Firestore REST API — no service account needed!

const fetch = require('node-fetch');
const { parse } = require('node-html-parser');

// ===== CONFIG =====
const FIREBASE_API_KEY = 'AIzaSyAjZwn53tctIJyzd3jsDcLoQQ4l4ptNZHw';
const PROJECT_ID = 'futebol-tv-app';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const SOURCE_URL = 'https://howtoblogging.info/?st=index';

// ===== JUNK FILTER =====
const JUNK_KEYWORDS = [
    'function', 'var ', 'const ', 'let ', 'push(', 'getElementById',
    'display:', 'width:', 'height:', 'margin:', 'padding:', 'border:',
    'script', 'style', 'googletag', 'adsbygoogle', 'analytics',
    'Hasync', 'Histats', 'cookie', 'window.', 'document.',
    'innerHTML', 'className', 'addEventListener', '$.', 'jQuery',
    '{', '}', '()', '=>', 'return ', 'async ', 'await ', 'import ',
    'console.', 'setTimeout', 'setInterval', 'onclick', 'href=',
    'src=', 'div.', 'span.', 'px;', 'em;', 'rem;', 'block;',
    'inline', 'Baixar', 'Atualizar', 'Compartilhar', 'Whatsapp',
    'APP', 'FUTEBOL DA HORA', 'http://', 'https://', 'www.',
    '.com/', '.net/', '.js', '.css', '.php', '.html',
    'Copyright', 'Privacy', 'Scholarship', 'Australia', 'Tax',
    'Finance', 'Insurance', 'Google Cloud', 'Blog post', 'Article',
    'Read more', 'Leia mais', 'Categories', 'Tags', 'Tips',
    'How to', 'Crypto', 'Bitcoin', 'Investment', 'Portfolio'
];

function isJunk(text) {
    const lower = text.toLowerCase();
    return JUNK_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

function isValidTeamName(name) {
    if (!name || name.length < 2 || name.length > 35) return false;
    if (isJunk(name)) return false;
    if (!/[a-zA-ZÀ-ú]/.test(name)) return false;
    const letters = name.replace(/[^a-zA-ZÀ-ú\s\-]/g, '');
    if (letters.length < name.length * 0.5) return false;
    if (/[{}();=><\[\]]/.test(name)) return false;
    return true;
}

// ===== TEAM EMOJIS =====
function getTeamEmoji(team) {
    const n = team.toLowerCase();
    if (n.includes('flamengo') || n.includes('internacional') || n.includes('inter')) return '🔴';
    if (n.includes('palmeiras') || n.includes('goias') || n.includes('goiás')) return '🟢';
    if (n.includes('corinthians') || n.includes('botafogo') || n.includes('vasco')) return '⚫';
    if (n.includes('gremio') || n.includes('grêmio') || n.includes('cruzeiro')) return '🔵';
    if (n.includes('sao paulo') || n.includes('são paulo') || n.includes('santos')) return '⚪';
    if (n.includes('fluminense')) return '🟤';
    if (n.includes('bahia') || n.includes('vitoria') || n.includes('vitória')) return '🔴';
    if (n.includes('atletico') || n.includes('atlético')) return '⚫';
    if (n.includes('real madrid') || n.includes('juventus')) return '⚪';
    if (n.includes('barcelona') || n.includes('chelsea')) return '🔵';
    if (n.includes('manchester city') || n.includes('city')) return '🔵';
    if (n.includes('liverpool') || n.includes('milan') || n.includes('arsenal')) return '🔴';
    if (n.includes('newcastle')) return '⚫';
    if (n.includes('athletic') || n.includes('wrexham') || n.includes('bangu')) return '🔴';
    if (n.includes('psg') || n.includes('paris') || n.includes('napoli') || n.includes('porto')) return '🔵';
    if (n.includes('bayern') || n.includes('benfica')) return '🔴';
    return '⚽';
}

// ===== FETCH SOURCE PAGE =====
async function fetchPage(url) {
    console.log('📡 Fetching:', url);
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7'
        }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
}

// ===== PARSE GAMES FROM HTML =====
function parseGames(html) {
    // Strip scripts, styles, comments
    let clean = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '');
    clean = clean.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
    clean = clean.replace(/<!--[\s\S]*?-->/g, '');

    const root = parse(clean);
    const games = [];
    const seen = new Set();

    // Strategy 1: Parse links with game data
    const links = root.querySelectorAll('a');
    for (const link of links) {
        const href = link.getAttribute('href') || '';
        if (!href.includes('howtoblogging') && !href.includes('?id=')) continue;

        const text = link.text.trim().replace(/\.\s*\.\s*\./g, '').replace(/\s+/g, ' ');
        if (!text || text.length < 5 || isJunk(text)) continue;

        const parts = text.split(/\s{2,}/).map(p => p.trim()).filter(p => p.length > 0);
        if (parts.length < 3) continue;

        const home = parts[0];
        const away = parts[parts.length - 1];
        if (!isValidTeamName(home) || !isValidTeamName(away)) continue;

        const key = `${home}-${away}`;
        if (seen.has(key)) continue;
        seen.add(key);

        let league = '', matchTime = '';
        for (let i = 1; i < parts.length - 1; i++) {
            const p = parts[i].trim();
            if (/^\d{1,2}:\d{2}$/.test(p)) matchTime = p;
            else if (p.length > 2 && !isJunk(p)) league = p;
        }

        games.push({
            home, away,
            league: league || 'Campeonato',
            matchTime: matchTime || '',
            matchDate: new Date().toISOString().split('T')[0],
            status: 'live',
            streamPageUrl: href,
            url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
            scoreHome: 0, scoreAway: 0,
            time: matchTime || 'Ao Vivo',
            emojiHome: getTeamEmoji(home),
            emojiAway: getTeamEmoji(away),
            viewers: Math.floor(Math.random() * 20000) + 1000,
            syncedAt: new Date().toISOString()
        });
    }

    // Strategy 2: Text fallback
    if (games.length < 3) {
        console.log('⚠️ Few link-based games, trying text fallback...');
        const body = root.querySelector('body');
        if (body) {
            const lines = body.text.split('\n').map(l => l.trim()).filter(l => l.length > 1 && l.length < 50 && !isJunk(l));
            let currentLeague = '', currentTime = '', teams = [];

            for (const line of lines) {
                if (/^\d{1,2}:\d{2}$/.test(line)) { currentTime = line; continue; }
                if (line.match(/^(Copa|Campeonato|Brasileiro|Serie|Premier|La Liga|Libertadores|Champions|Paulista|Carioca|Goiano|Baiano|Italiano|Espanhol)/i)) {
                    currentLeague = line; continue;
                }
                if (isValidTeamName(line) && !line.match(/^\d/)) {
                    const key1 = `${line}-*`;
                    if (!seen.has(key1)) { teams.push(line); }
                    if (teams.length === 2) {
                        const key = `${teams[0]}-${teams[1]}`;
                        if (!seen.has(key)) {
                            seen.add(key);
                            games.push({
                                home: teams[0], away: teams[1],
                                league: currentLeague || 'Campeonato',
                                matchTime: currentTime || '',
                                matchDate: new Date().toISOString().split('T')[0],
                                status: 'live', streamPageUrl: '',
                                url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
                                scoreHome: 0, scoreAway: 0,
                                time: currentTime || 'Ao Vivo',
                                emojiHome: getTeamEmoji(teams[0]),
                                emojiAway: getTeamEmoji(teams[1]),
                                viewers: Math.floor(Math.random() * 20000) + 1000,
                                syncedAt: new Date().toISOString()
                            });
                        }
                        teams = []; currentTime = '';
                    }
                }
            }
        }
    }

    return games;
}

// ===== FIRESTORE REST API HELPERS =====
function gameToFirestoreDoc(game) {
    const fields = {};
    for (const [key, value] of Object.entries(game)) {
        if (typeof value === 'number') {
            fields[key] = { integerValue: String(value) };
        } else {
            fields[key] = { stringValue: String(value) };
        }
    }
    return { fields };
}

async function deleteOldSyncedDocs() {
    console.log('🗑️ Deleting old synced docs...');

    // Query for docs with syncedAt field
    const queryUrl = `${FIRESTORE_URL}/channels?key=${FIREBASE_API_KEY}&pageSize=100`;
    const res = await fetch(queryUrl);

    if (!res.ok) {
        console.warn('Could not list docs:', res.status);
        return 0;
    }

    const data = await res.json();
    const docs = data.documents || [];
    let deleted = 0;

    for (const doc of docs) {
        // Check if this doc has syncedAt field (meaning it was auto-synced)
        if (doc.fields && doc.fields.syncedAt && doc.fields.syncedAt.stringValue) {
            const docPath = doc.name;
            const delUrl = `https://firestore.googleapis.com/v1/${docPath}?key=${FIREBASE_API_KEY}`;
            const delRes = await fetch(delUrl, { method: 'DELETE' });
            if (delRes.ok) deleted++;
        }
    }

    console.log(`   Deleted ${deleted} old docs`);
    return deleted;
}

async function addGameDoc(game) {
    const url = `${FIRESTORE_URL}/channels?key=${FIREBASE_API_KEY}`;
    const body = gameToFirestoreDoc(game);

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Failed to add doc: ${res.status} — ${err}`);
    }

    return true;
}

// ===== MAIN =====
async function main() {
    const brTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log('');
    console.log('==================================');
    console.log('⚽ FUTEBOL TV — AUTO SYNC 24/7');
    console.log(`📅 ${brTime}`);
    console.log('==================================');
    console.log('');

    try {
        // 1. Fetch source
        const html = await fetchPage(SOURCE_URL);
        console.log(`📄 Page loaded (${html.length} bytes)`);

        // 2. Parse games
        const games = parseGames(html);
        console.log(`🎮 Found ${games.length} valid games:`);
        games.forEach((g, i) => {
            console.log(`   ${i + 1}. ${g.emojiHome} ${g.home} x ${g.away} ${g.emojiAway} (${g.league}) — ${g.matchTime || 'Ao Vivo'}`);
        });

        if (games.length === 0) {
            console.log('⚠️ No games found. Source site may have changed.');
            process.exit(0);
        }

        // 3. Delete old synced docs
        await deleteOldSyncedDocs();

        // 4. Add new games
        console.log(`💾 Saving ${games.length} games to Firestore...`);
        let saved = 0;
        for (const game of games) {
            try {
                await addGameDoc(game);
                saved++;
            } catch (e) {
                console.warn(`   ⚠️ Failed to save: ${game.home} x ${game.away} — ${e.message}`);
            }
        }

        console.log('');
        console.log(`✅ Sync complete! ${saved}/${games.length} games saved.`);
        console.log('==================================');

    } catch (err) {
        console.error('❌ Sync error:', err.message);
        process.exit(1);
    }
}

main();
