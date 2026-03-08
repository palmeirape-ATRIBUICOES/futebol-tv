// ===== FUTEBOL TV — AUTO SYNC SCRIPT =====
// Runs via GitHub Actions every 30 minutes
// Scrapes games from source site and writes to Firebase Firestore

const admin = require('firebase-admin');
const fetch = require('node-fetch');
const { parse } = require('node-html-parser');

// ===== FIREBASE INIT =====
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');

if (!serviceAccount.project_id) {
    console.error('❌ FIREBASE_SERVICE_ACCOUNT not configured!');
    console.error('Please add a GitHub Secret named FIREBASE_SERVICE_ACCOUNT');
    console.error('with your Firebase service account JSON.');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ===== CONFIG =====
const SOURCE_URL = 'https://howtoblogging.info/?st=index';
const COLLECTION = 'channels';

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
    'APP', 'FUTEBOL DA HORA', 'http', 'www.', '.com', '.net',
    '.js', '.css', '.php', '.html', 'Copyright', 'Privacy',
    'Scholarship', 'Australia', 'Tax', 'Finance', 'Insurance',
    'Google Cloud', 'Blog', 'Article', 'Read more', 'Leia mais',
    'Categories', 'Tags', 'Tips', 'How to', 'Crypto', 'Bitcoin',
    'Investment', 'Portfolio', 'Housing', 'Emergency', 'Support',
    'Assistance', 'Natural Disasters', 'Tax Credits', 'Refund',
    'IRS', 'Cash App', 'Taxes', 'Student', 'ABSTUDY', 'Austudy',
    'GetYourRefund', 'MyFreeTaxes', 'TAFE', 'Scholarships', 'Youth',
    'Allowance', 'Step 4', 'Apply for', 'University', 'College'
];

function isJunk(text) {
    const lower = text.toLowerCase();
    return JUNK_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

function isValidTeamName(name) {
    if (!name || name.length < 2 || name.length > 35) return false;
    if (isJunk(name)) return false;
    if (!/[a-zA-ZÀ-ú]/.test(name)) return false;
    const letters = name.replace(/[^a-zA-ZÀ-ú]/g, '');
    if (letters.length < name.length * 0.4) return false;
    if (/[{}();=><]/.test(name)) return false;
    return true;
}

// ===== TEAM EMOJIS =====
function getTeamEmoji(team) {
    const name = team.toLowerCase();
    if (name.includes('flamengo') || name.includes('internacional') || name.includes('inter')) return '🔴';
    if (name.includes('palmeiras') || name.includes('goias') || name.includes('goiás')) return '🟢';
    if (name.includes('corinthians') || name.includes('botafogo') || name.includes('vasco')) return '⚫';
    if (name.includes('gremio') || name.includes('grêmio') || name.includes('cruzeiro')) return '🔵';
    if (name.includes('sao paulo') || name.includes('são paulo') || name.includes('santos')) return '⚪';
    if (name.includes('fluminense')) return '🟤';
    if (name.includes('bahia') || name.includes('vitoria') || name.includes('vitória')) return '🔴';
    if (name.includes('atletico') || name.includes('atlético')) return '⚫';
    if (name.includes('bangu')) return '🔴';
    if (name.includes('real madrid') || name.includes('juventus')) return '⚪';
    if (name.includes('barcelona') || name.includes('chelsea')) return '🔵';
    if (name.includes('manchester city') || name.includes('city')) return '🔵';
    if (name.includes('liverpool') || name.includes('milan') || name.includes('arsenal')) return '🔴';
    if (name.includes('newcastle') || name.includes('pisa')) return '⚫';
    if (name.includes('athletic')) return '🔴';
    if (name.includes('wrexham')) return '🔴';
    if (name.includes('psg') || name.includes('paris')) return '🔵';
    if (name.includes('bayern') || name.includes('benfica')) return '🔴';
    if (name.includes('porto') || name.includes('napoli')) return '🔵';
    return '⚽';
}

// ===== FETCH PAGE =====
async function fetchPage(url) {
    console.log('📡 Buscando:', url);
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        timeout: 20000
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
}

// ===== PARSE GAMES =====
function parseGames(html) {
    // Remove scripts, styles, comments
    let clean = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '');
    clean = clean.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
    clean = clean.replace(/<!--[\s\S]*?-->/g, '');

    const root = parse(clean);
    const games = [];

    // Strategy 1: Find links with game data
    const links = root.querySelectorAll('a');

    for (const link of links) {
        const href = link.getAttribute('href') || '';
        if (!href.includes('howtoblogging') && !href.includes('?id=')) continue;

        const text = link.text.trim();
        if (!text || text.length < 5 || isJunk(text)) continue;

        // Clean text
        const cleanText = text.replace(/\.\s*\.\s*\./g, '').replace(/\s+/g, ' ').trim();
        if (cleanText.length < 5 || isJunk(cleanText)) continue;

        // Split by multiple spaces
        const parts = cleanText.split(/\s{2,}/).map(p => p.trim()).filter(p => p.length > 0);

        if (parts.length >= 3) {
            const home = parts[0].trim();
            const away = parts[parts.length - 1].trim();

            if (!isValidTeamName(home) || !isValidTeamName(away)) continue;

            let league = '';
            let matchTime = '';

            for (let i = 1; i < parts.length - 1; i++) {
                const part = parts[i].trim();
                if (/^\d{1,2}:\d{2}$/.test(part)) {
                    matchTime = part;
                } else if (part.length > 2 && !isJunk(part)) {
                    league = part;
                }
            }

            // Avoid duplicate games
            const exists = games.some(g => g.home === home && g.away === away);
            if (exists) continue;

            games.push({
                home,
                away,
                league: league || 'Campeonato',
                matchTime: matchTime || '',
                matchDate: new Date().toISOString().split('T')[0],
                status: 'live',
                streamPageUrl: href,
                url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
                scoreHome: 0,
                scoreAway: 0,
                time: matchTime || 'Ao Vivo',
                emojiHome: getTeamEmoji(home),
                emojiAway: getTeamEmoji(away),
                viewers: Math.floor(Math.random() * 20000) + 1000,
                syncedAt: new Date().toISOString()
            });
        }
    }

    // Strategy 2: Text-based fallback
    if (games.length < 3) {
        console.log('⚠️ Links found few games, trying text fallback...');

        const bodyText = root.querySelector('body');
        if (bodyText) {
            const allText = bodyText.text;
            const lines = allText.split('\n').map(l => l.trim()).filter(l => l.length > 1 && l.length < 50);

            let currentLeague = '';
            let currentTime = '';
            let teams = [];

            for (const line of lines) {
                if (isJunk(line)) continue;

                const timeMatch = line.match(/^(\d{1,2}:\d{2})$/);
                if (timeMatch) {
                    currentTime = timeMatch[1];
                    continue;
                }

                if (line.match(/^(Copa|Campeonato|Brasileiro|Serie|Premier|La Liga|Libertadores|Champions|Paulista|Carioca|Goiano|Baiano|Italiano|Espanhol|Frances|Alemao|UEFA)/i)) {
                    currentLeague = line;
                    continue;
                }

                if (isValidTeamName(line) && !line.match(/^\d/)) {
                    const isDuplicate = games.some(g => g.home === line || g.away === line);
                    if (!isDuplicate) {
                        teams.push(line);
                    }

                    if (teams.length === 2) {
                        games.push({
                            home: teams[0],
                            away: teams[1],
                            league: currentLeague || 'Campeonato',
                            matchTime: currentTime || '',
                            matchDate: new Date().toISOString().split('T')[0],
                            status: 'live',
                            streamPageUrl: '',
                            url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
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
    }

    return games;
}

// ===== SYNC TO FIRESTORE =====
async function syncToFirestore(games) {
    console.log(`💾 Salvando ${games.length} jogos no Firestore...`);

    // 1. Delete old synced channels
    const snapshot = await db.collection(COLLECTION)
        .where('syncedAt', '!=', '')
        .get();

    const batch = db.batch();
    let deleteCount = 0;

    snapshot.forEach(doc => {
        batch.delete(doc.ref);
        deleteCount++;
    });

    if (deleteCount > 0) {
        await batch.commit();
        console.log(`🗑️ Removidos ${deleteCount} jogos antigos`);
    }

    // 2. Add new games in batches (Firestore limit: 500 per batch)
    const addBatch = db.batch();

    for (const game of games) {
        const ref = db.collection(COLLECTION).doc();
        addBatch.set(ref, {
            ...game,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    await addBatch.commit();
    console.log(`✅ ${games.length} jogos adicionados!`);
}

// ===== MAIN =====
async function main() {
    console.log('');
    console.log('==================================');
    console.log('⚽ FUTEBOL TV — AUTO SYNC');
    console.log(`📅 ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`);
    console.log('==================================');
    console.log('');

    try {
        // 1. Fetch the source page
        const html = await fetchPage(SOURCE_URL);
        console.log(`📄 Pagina carregada (${html.length} bytes)`);

        // 2. Parse games
        const games = parseGames(html);
        console.log(`🎮 ${games.length} jogos encontrados:`);
        games.forEach((g, i) => {
            console.log(`   ${i + 1}. ${g.home} x ${g.away} (${g.league}) — ${g.matchTime || 'Ao Vivo'}`);
        });

        if (games.length === 0) {
            console.log('⚠️ Nenhum jogo encontrado. O site pode ter mudado de estrutura.');
            process.exit(0);
        }

        // 3. Sync to Firestore
        await syncToFirestore(games);

        console.log('');
        console.log('✅ Sync concluida com sucesso!');
        console.log('==================================');

    } catch (err) {
        console.error('❌ Erro na sincronizacao:', err.message);
        process.exit(1);
    }
}

main();
