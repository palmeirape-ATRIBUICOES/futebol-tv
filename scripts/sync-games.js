// ===== FUTEBOL TV — AUTO SYNC + STREAM EXTRACTOR =====
// Runs via GitHub Actions every 30 minutes
// 1. Scrapes games from index page
// 2. Follows each game link to extract M3U8 stream URL
// 3. Saves games + streams to Firestore

const fetch = require('node-fetch');
const { parse } = require('node-html-parser');

// ===== CONFIG =====
const FIREBASE_API_KEY = 'AIzaSyAjZwn53tctIJyzd3jsDcLoQQ4l4ptNZHw';
const PROJECT_ID = 'futebol-tv-app';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const SOURCE_URL = 'https://howtoblogging.info/?st=index';

// Stream domain pattern
const STREAM_DOMAIN = 'futemais.eu';

// ===== JUNK FILTER =====
const JUNK_KEYWORDS = [
    'function', 'var ', 'const ', 'let ', 'push(', 'getElementById',
    'display:', 'width:', 'height:', 'margin:', 'padding:', 'border:',
    'script', 'googletag', 'adsbygoogle', 'analytics',
    'Hasync', 'Histats', 'cookie', 'window.', 'document.',
    'innerHTML', 'className', 'addEventListener', '$.', 'jQuery',
    '{', '}', '()', '=>', 'return ', 'async ', 'await ', 'import ',
    'console.', 'setTimeout', 'setInterval', 'onclick', 'href=',
    'src=', 'div.', 'span.', 'px;', 'em;', 'rem;', 'block;',
    'inline', 'Baixar', 'Atualizar', 'Compartilhar', 'Whatsapp',
    'APP', 'FUTEBOL DA HORA', 'http://', 'https://', 'www.',
    '.com/', '.net/', '.js', '.css', '.php', '.html',
    'Copyright', 'Privacy', 'Scholarship', 'Tax', 'Finance',
    'Insurance', 'Google Cloud', 'Blog post', 'Article',
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

// ===== HTTP FETCHER =====
async function fetchPage(url) {
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7',
            'Referer': 'https://howtoblogging.info/'
        },
        redirect: 'follow',
        timeout: 15000
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
}

// ===== RESOLVE GOOGLE REDIRECT =====
function resolveGoogleRedirect(url) {
    // Google wraps URLs like: https://www.google.com/url?q=https%3A%2F%2F...&sa=D&...
    if (url.includes('google.com/url')) {
        try {
            const u = new URL(url);
            const q = u.searchParams.get('q');
            if (q) return q;
        } catch (e) { }
    }
    return url;
}

// ===== EXTRACT STREAM URL FROM GAME PAGE =====
async function extractStreamUrl(gamePageUrl) {
    try {
        const resolvedUrl = resolveGoogleRedirect(gamePageUrl);
        console.log(`   🔍 Extracting stream from: ${resolvedUrl}`);

        const html = await fetchPage(resolvedUrl);

        // Search for M3U8 URLs directly in the page HTML
        const m3u8Matches = html.match(/https?:\/\/[^\s"'<>]*\.m3u8[^\s"'<>]*/gi) || [];
        if (m3u8Matches.length > 0) {
            console.log(`   ✅ Found M3U8 directly: ${m3u8Matches[0]}`);
            return m3u8Matches[0];
        }

        // Search for iframes pointing to futemais.eu or player pages
        const iframeMatches = html.match(/src=["']([^"']*(?:futemais|player|embed|live|stream)[^"']*)/gi) || [];
        for (const match of iframeMatches) {
            const src = match.replace(/^src=["']/, '');
            console.log(`   📺 Found iframe: ${src}`);

            // Follow the iframe to get the actual M3U8
            try {
                const playerHtml = await fetchPage(src.startsWith('//') ? 'https:' + src : src);
                const streamUrls = playerHtml.match(/https?:\/\/[^\s"'<>]*\.m3u8[^\s"'<>]*/gi) || [];
                if (streamUrls.length > 0) {
                    console.log(`   ✅ Found M3U8 in iframe: ${streamUrls[0]}`);
                    return streamUrls[0];
                }

                // Look for source in player config
                const sourceMatches = playerHtml.match(/["']?(https?:\/\/[^\s"'<>]*(?:chunks|index|master|live)[^\s"'<>]*\.m3u8[^\s"'<>]*)/gi) || [];
                if (sourceMatches.length > 0) {
                    const cleanUrl = sourceMatches[0].replace(/^["']/, '');
                    console.log(`   ✅ Found stream source: ${cleanUrl}`);
                    return cleanUrl;
                }
            } catch (iframeErr) {
                console.log(`   ⚠️ Could not fetch iframe: ${iframeErr.message}`);
            }
        }

        // Search for futemais.eu URLs of any kind
        const futeMaisUrls = html.match(/https?:\/\/[^\s"'<>]*futemais\.eu[^\s"'<>]*/gi) || [];
        for (const url of futeMaisUrls) {
            if (url.includes('/live/') || url.includes('canal') || url.includes('.m3u8')) {
                console.log(`   ✅ Found futemais stream: ${url}`);
                return url;
            }
        }

        // Search for any embed/player URLs
        const embedUrls = html.match(/src=["']([^"']*(?:\/embed\/|\/player\/|\/live\/|\/watch\/)[^"']*)/gi) || [];
        for (const match of embedUrls) {
            const embedSrc = match.replace(/^src=["']/, '');
            console.log(`   📺 Found embed: ${embedSrc}`);

            try {
                const embedHtml = await fetchPage(embedSrc.startsWith('//') ? 'https:' + embedSrc : embedSrc);
                const streamUrls = embedHtml.match(/https?:\/\/[^\s"'<>]*\.m3u8[^\s"'<>]*/gi) || [];
                if (streamUrls.length > 0) {
                    console.log(`   ✅ Found M3U8 in embed: ${streamUrls[0]}`);
                    return streamUrls[0];
                }
            } catch (e) {
                console.log(`   ⚠️ Could not fetch embed: ${e.message}`);
            }
        }

        // Extract the ?id= parameter and try direct futemais pattern
        const idMatch = resolvedUrl.match(/[?&]id=(\d+)/);
        if (idMatch) {
            const gameId = idMatch[1];
            // Try common patterns based on observed URLs
            const patterns = [
                `https://br.futemais.eu/live/canal${gameId}/chunks.m3u8`,
                `https://br.futemais.eu/live/ch${gameId}/chunks.m3u8`,
                `https://futemais.eu/live/${gameId}/chunks.m3u8`,
            ];

            for (const pattern of patterns) {
                try {
                    const testRes = await fetch(pattern, {
                        method: 'HEAD',
                        headers: { 'Referer': 'https://howtoblogging.info/' }
                    });
                    if (testRes.ok || testRes.status === 403) {
                        // 403 means the URL exists but needs auth tokens
                        console.log(`   🔗 Pattern match (needs token): ${pattern}`);
                        return pattern;
                    }
                } catch (e) { }
            }
        }

        // Last resort: save the game page URL so user can watch via iframe
        console.log(`   ⚠️ No M3U8 found, saving page URL as fallback`);
        return resolvedUrl;

    } catch (err) {
        console.log(`   ❌ Error extracting stream: ${err.message}`);
        return '';
    }
}

// ===== PARSE GAMES FROM INDEX PAGE =====
function parseGamesFromIndex(html) {
    let clean = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '');
    clean = clean.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
    clean = clean.replace(/<!--[\s\S]*?-->/g, '');

    const root = parse(clean);
    const games = [];
    const seen = new Set();

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

        // Resolve Google redirect URLs
        const realHref = resolveGoogleRedirect(href);

        games.push({
            home, away,
            league: league || 'Campeonato',
            matchTime: matchTime || '',
            matchDate: new Date().toISOString().split('T')[0],
            status: 'live',
            streamPageUrl: realHref,
            url: '', // Will be filled with M3U8 URL
            scoreHome: 0, scoreAway: 0,
            time: matchTime || 'Ao Vivo',
            emojiHome: getTeamEmoji(home),
            emojiAway: getTeamEmoji(away),
            viewers: Math.floor(Math.random() * 20000) + 1000,
            syncedAt: new Date().toISOString()
        });
    }

    // Text fallback
    if (games.length < 3) {
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
                    if (!seen.has(`${line}-*`)) teams.push(line);
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
                                url: '',
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

// ===== FIRESTORE REST API =====
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
    console.log('🗑️  Deleting old synced docs...');
    const queryUrl = `${FIRESTORE_URL}/channels?key=${FIREBASE_API_KEY}&pageSize=100`;
    const res = await fetch(queryUrl);
    if (!res.ok) { console.warn('Could not list docs:', res.status); return 0; }

    const data = await res.json();
    const docs = data.documents || [];
    let deleted = 0;

    for (const doc of docs) {
        if (doc.fields && doc.fields.syncedAt && doc.fields.syncedAt.stringValue) {
            const delUrl = `https://firestore.googleapis.com/v1/${doc.name}?key=${FIREBASE_API_KEY}`;
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
        throw new Error(`Failed: ${res.status} — ${err}`);
    }
    return true;
}

// ===== MAIN =====
async function main() {
    const brTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log('');
    console.log('==========================================');
    console.log('⚽ FUTEBOL TV — AUTO SYNC + STREAM EXTRACT');
    console.log(`📅 ${brTime}`);
    console.log('==========================================');
    console.log('');

    try {
        // 1. Fetch index page
        console.log('📡 Step 1: Fetching game listings...');
        const html = await fetchPage(SOURCE_URL);
        console.log(`   Page loaded (${html.length} bytes)`);

        // 2. Parse games
        console.log('');
        console.log('🎮 Step 2: Parsing games...');
        const games = parseGamesFromIndex(html);
        console.log(`   Found ${games.length} games`);

        if (games.length === 0) {
            console.log('⚠️  No games found. Source may have changed.');
            process.exit(0);
        }

        // 3. Extract stream URLs for each game
        console.log('');
        console.log('📺 Step 3: Extracting stream URLs...');
        let streamsFound = 0;

        for (let i = 0; i < games.length; i++) {
            const game = games[i];
            console.log(`\n   [${i + 1}/${games.length}] ${game.home} x ${game.away}`);

            if (game.streamPageUrl) {
                const streamUrl = await extractStreamUrl(game.streamPageUrl);
                if (streamUrl && streamUrl.includes('.m3u8')) {
                    game.url = streamUrl;
                    streamsFound++;
                    console.log(`   ✅ Stream: ${streamUrl.substring(0, 80)}...`);
                } else if (streamUrl) {
                    // Save as fallback page URL
                    game.streamPageUrl = streamUrl;
                    console.log(`   🔗 Saved page URL as fallback`);
                }
            }

            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 1000));
        }

        console.log(`\n   📊 Streams found: ${streamsFound}/${games.length}`);

        // 4. Delete old docs
        console.log('');
        console.log('🗑️  Step 4: Cleaning old data...');
        await deleteOldSyncedDocs();

        // 5. Save to Firestore
        console.log('');
        console.log('💾 Step 5: Saving to Firestore...');
        let saved = 0;
        for (const game of games) {
            try {
                await addGameDoc(game);
                saved++;
            } catch (e) {
                console.warn(`   ⚠️  Failed: ${game.home} x ${game.away} — ${e.message}`);
            }
        }

        // Summary
        console.log('');
        console.log('==========================================');
        console.log(`✅ Sync complete!`);
        console.log(`   🎮 Games: ${saved}/${games.length}`);
        console.log(`   📺 Streams: ${streamsFound}/${games.length}`);
        console.log('==========================================');

    } catch (err) {
        console.error('❌ Sync error:', err.message);
        process.exit(1);
    }
}

main();
