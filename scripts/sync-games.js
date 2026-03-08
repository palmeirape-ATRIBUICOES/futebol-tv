// ===== FUTEBOL TV — AUTO SYNC + STREAM EXTRACTOR v3 =====
// Runs via GitHub Actions every 30 minutes
// FIXED: Uses apk.futemais.eu as source (works from any IP, no cloaking)

const fetch = require('node-fetch');
const { parse } = require('node-html-parser');

// ===== CONFIG =====
const FIREBASE_API_KEY = 'AIzaSyAjZwn53tctIJyzd3jsDcLoQQ4l4ptNZHw';
const PROJECT_ID = 'futebol-tv-app';
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Source URLs
const INDEX_URL = 'https://apk.futemais.eu/app2/';
const PLAYER_BASE = 'https://links3.futemais.eu/canalapps.php';

// ===== JUNK FILTER =====
const JUNK_KEYWORDS = [
    'function', 'var ', 'const ', 'let ', 'push(', 'getElementById',
    'display:', 'width:', 'height:', 'margin:', 'padding:', 'border:',
    'googletag', 'adsbygoogle', 'analytics', 'Hasync', 'Histats',
    'cookie', 'window.', 'document.', 'innerHTML', 'addEventListener',
    '{', '}', '()', '=>', 'return ', 'async ', 'import ',
    'setTimeout', 'setInterval', 'onclick',
    'Baixar', 'Atualizar', 'Compartilhar', 'Whatsapp',
    'FUTEBOL DA HORA', 'APP', 'Voltar',
    'Copyright', 'Privacy', 'Terms', 'About Us', 'Contact'
];

function isJunk(text) {
    const lower = text.toLowerCase();
    return JUNK_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

function isValidTeamName(name) {
    if (!name || name.length < 2 || name.length > 40) return false;
    if (isJunk(name)) return false;
    if (!/[a-zA-ZÀ-ú]/.test(name)) return false;
    const letters = name.replace(/[^a-zA-ZÀ-ú\s\-\.]/g, '');
    if (letters.length < name.length * 0.5) return false;
    if (/[{}();=><\[\]]/.test(name)) return false;
    return true;
}

function getTeamEmoji(team) {
    const n = team.toLowerCase();
    if (n.includes('flamengo') || n.includes('internacional') || n.includes('inter')) return '🔴';
    if (n.includes('palmeiras') || n.includes('goias') || n.includes('goiás')) return '🟢';
    if (n.includes('corinthians') || n.includes('botafogo') || n.includes('vasco')) return '⚫';
    if (n.includes('gremio') || n.includes('cruzeiro')) return '🔵';
    if (n.includes('sao paulo') || n.includes('santos')) return '⚪';
    if (n.includes('fluminense')) return '🟤';
    if (n.includes('bahia') || n.includes('vitoria')) return '🔴';
    if (n.includes('atletico') || n.includes('atlético')) return '⚫';
    if (n.includes('real madrid') || n.includes('juventus')) return '⚪';
    if (n.includes('barcelona') || n.includes('chelsea')) return '🔵';
    if (n.includes('liverpool') || n.includes('arsenal')) return '🔴';
    if (n.includes('manchester city')) return '🔵';
    if (n.includes('psg') || n.includes('napoli') || n.includes('porto')) return '🔵';
    if (n.includes('bayern') || n.includes('benfica')) return '🔴';
    return '⚽';
}

// ===== HTTP FETCHER =====
async function fetchPage(url) {
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.7',
            'Referer': 'https://apk.futemais.eu/'
        },
        redirect: 'follow'
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
}

// ===== EXTRACT M3U8 FROM PLAYER PAGE =====
async function extractStreamUrl(gameId) {
    try {
        const playerUrl = `${PLAYER_BASE}?id=${gameId}`;
        console.log(`   🔍 Fetching player page: ${playerUrl}`);

        const html = await fetchPage(playerUrl);

        // 1. Direct M3U8 in page
        const m3u8Urls = html.match(/https?:\/\/[^\s"'<>\\]*\.m3u8[^\s"'<>\\]*/gi) || [];
        if (m3u8Urls.length > 0) {
            const url = m3u8Urls[0].replace(/\\+/g, '');
            console.log(`   ✅ M3U8 found: ${url.substring(0, 80)}...`);
            return url;
        }

        // 2. Look for iframe src
        const iframeMatches = html.match(/(?:iframe|embed)[^>]*src=["']([^"']+)/gi) || [];
        for (const match of iframeMatches) {
            const srcMatch = match.match(/src=["']([^"']+)/i);
            if (!srcMatch) continue;
            let src = srcMatch[1];
            if (src.startsWith('//')) src = 'https:' + src;

            console.log(`   📺 Found iframe: ${src}`);

            // Skip ad iframes
            if (src.includes('ads') || src.includes('google') || src.includes('doubleclick')) continue;

            try {
                const iframeHtml = await fetchPage(src);
                const streamUrls = iframeHtml.match(/https?:\/\/[^\s"'<>\\]*\.m3u8[^\s"'<>\\]*/gi) || [];
                if (streamUrls.length > 0) {
                    const url = streamUrls[0].replace(/\\+/g, '');
                    console.log(`   ✅ M3U8 from iframe: ${url.substring(0, 80)}...`);
                    return url;
                }

                // Follow nested iframes
                const nestedIframes = iframeHtml.match(/(?:iframe|embed)[^>]*src=["']([^"']+)/gi) || [];
                for (const nested of nestedIframes) {
                    const nestedSrc = nested.match(/src=["']([^"']+)/i);
                    if (!nestedSrc) continue;
                    let nSrc = nestedSrc[1];
                    if (nSrc.startsWith('//')) nSrc = 'https:' + nSrc;
                    if (nSrc.includes('ads') || nSrc.includes('google')) continue;

                    console.log(`   📺 Nested iframe: ${nSrc}`);
                    try {
                        const nestedHtml = await fetchPage(nSrc);
                        const nUrls = nestedHtml.match(/https?:\/\/[^\s"'<>\\]*\.m3u8[^\s"'<>\\]*/gi) || [];
                        if (nUrls.length > 0) {
                            const url = nUrls[0].replace(/\\+/g, '');
                            console.log(`   ✅ M3U8 from nested: ${url.substring(0, 80)}...`);
                            return url;
                        }
                    } catch (e) { }
                }
            } catch (e) {
                console.log(`   ⚠️ iframe fetch error: ${e.message}`);
            }
        }

        // 3. Look for any futemais URLs with stream pattern
        const futemaisUrls = html.match(/https?:\/\/[^\s"'<>\\]*futemais\.eu[^\s"'<>\\]*/gi) || [];
        for (const fUrl of futemaisUrls) {
            if (fUrl.includes('/live/') || fUrl.includes('canal') || fUrl.includes('.m3u8')) {
                console.log(`   ✅ Futemais stream: ${fUrl.substring(0, 80)}...`);
                return fUrl;
            }
        }

        // 4. Look for source/file in JS configs
        const jsConfigs = html.match(/["']?(source|file|url|src)["']?\s*[:=]\s*["'](https?:\/\/[^"']+)/gi) || [];
        for (const cfg of jsConfigs) {
            const urlMatch = cfg.match(/(https?:\/\/[^"']+)/);
            if (urlMatch && (urlMatch[1].includes('.m3u8') || urlMatch[1].includes('/live/'))) {
                console.log(`   ✅ JS config stream: ${urlMatch[1].substring(0, 80)}...`);
                return urlMatch[1];
            }
        }

        // 5. Fallback: return the player page URL for iframe embedding
        console.log(`   ⚠️ No M3U8 found, using player page as fallback`);
        return playerUrl;

    } catch (err) {
        console.log(`   ❌ Extract error: ${err.message}`);
        return '';
    }
}

// ===== PARSE GAMES FROM INDEX =====
function parseGamesFromIndex(html) {
    let clean = html.replace(/<script[\s\S]*?<\/script>/gi, '');
    clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '');
    clean = clean.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
    clean = clean.replace(/<!--[\s\S]*?-->/g, '');

    const root = parse(clean);
    const games = [];
    const seen = new Set();

    // Find all links with game IDs
    const links = root.querySelectorAll('a');
    console.log(`   📊 Total links found: ${links.length}`);

    for (const link of links) {
        const href = link.getAttribute('href') || '';

        // Look for links with ?id= parameter
        const idMatch = href.match(/[?&]id=(\d+)/);
        if (!idMatch) continue;

        const gameId = idMatch[1];
        if (seen.has(gameId)) continue;

        // Extract text content
        const rawText = link.text.trim();
        const text = rawText.replace(/\.\s*\.\s*\./g, '').replace(/\s+/g, ' ').trim();
        if (!text || text.length < 3) continue;

        // Parse the link text for team names, league, and time
        // Text format: "TeamA  League  Time  TeamB  ..."
        const parts = text.split(/\s{2,}/).map(p => p.trim()).filter(p => p.length > 0);

        // Also try splitting by newlines (the text may have them)
        const altParts = rawText.split(/[\n\r]+/).map(p => p.trim()).filter(p => p.length > 1 && p !== '.');

        const useParts = parts.length >= 3 ? parts : altParts;

        if (useParts.length < 2) {
            console.log(`   ⚠️ Skipping id=${gameId}: not enough parts in "${text.substring(0, 50)}"`);
            continue;
        }

        let home = '', away = '', league = '', matchTime = '';

        // First non-junk part = home team
        for (const p of useParts) {
            if (isValidTeamName(p) && !home) { home = p; continue; }
            if (/^\d{1,2}:\d{2}$/.test(p)) { matchTime = p; continue; }
            if (p.match(/^(Copa|Campeonato|Brasileiro|Serie|Premier|La Liga|Libertadores|Champions|Paulista|Carioca|Goiano|Baiano|Italiano|Espanhol|Bundesliga|Ligue|EFL|FA Cup)/i)) {
                league = p; continue;
            }
            if (p.length > 2 && p.length < 30 && !isJunk(p) && !p.match(/^\.+$/)) {
                if (home && !away) {
                    // Check if it's a league or a team
                    if (isValidTeamName(p)) away = p;
                    else if (!league) league = p;
                }
            }
        }

        // If no away team found, try looking for X split
        if (home && !away) {
            const xMatch = text.match(/(.+?)\s*(?:x|vs|X|VS)\s*(.+)/);
            if (xMatch) {
                home = xMatch[1].trim();
                away = xMatch[2].trim();
            }
        }

        if (!home || !away) {
            console.log(`   ⚠️ Skipping id=${gameId}: could not parse teams from "${text.substring(0, 60)}"`);
            continue;
        }

        // Clean up team names
        home = home.replace(/\s+/g, ' ').trim();
        away = away.replace(/\s+/g, ' ').trim();

        seen.add(gameId);

        console.log(`   ✅ Game: ${home} x ${away} (${league || '?'}) ${matchTime || ''} [id=${gameId}]`);

        games.push({
            home, away, gameId,
            league: league || 'Campeonato',
            matchTime: matchTime || '',
            matchDate: new Date().toISOString().split('T')[0],
            status: 'live',
            streamPageUrl: `${PLAYER_BASE}?id=${gameId}`,
            url: '', // Will be filled with M3U8
            scoreHome: 0, scoreAway: 0,
            time: matchTime || 'Ao Vivo',
            emojiHome: getTeamEmoji(home),
            emojiAway: getTeamEmoji(away),
            viewers: Math.floor(Math.random() * 20000) + 1000,
            syncedAt: new Date().toISOString()
        });
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
    const queryUrl = `${FIRESTORE_URL}/channels?key=${FIREBASE_API_KEY}&pageSize=200`;
    const res = await fetch(queryUrl);
    if (!res.ok) { console.warn('   Could not list docs:', res.status); return 0; }

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
        throw new Error(`${res.status} — ${err.substring(0, 100)}`);
    }
    return true;
}

// ===== MAIN =====
async function main() {
    const brTime = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    console.log('');
    console.log('==========================================');
    console.log('⚽ FUTEBOL TV — SYNC + STREAM EXTRACT v3');
    console.log(`📅 ${brTime}`);
    console.log('==========================================');

    try {
        // === Step 1: Get game list ===
        console.log('\n📡 Step 1: Fetching game listings...');
        const html = await fetchPage(INDEX_URL);
        console.log(`   Page loaded (${html.length} bytes)`);

        // Debug: show first 500 chars of text content
        const debugText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 500);
        console.log(`   📝 Preview: ${debugText.substring(0, 200)}...`);

        // === Step 2: Parse games ===
        console.log('\n🎮 Step 2: Parsing games...');
        const games = parseGamesFromIndex(html);
        console.log(`\n   Total: ${games.length} games found`);

        if (games.length === 0) {
            console.log('\n⚠️  No games found. Dumping HTML structure for debug:');
            console.log(`   HTML length: ${html.length}`);
            console.log(`   Has <a> tags: ${html.includes('<a ')}`);
            console.log(`   Has ?id=: ${html.includes('?id=')}`);
            console.log(`   Has futemais: ${html.includes('futemais')}`);
            console.log(`   Has canalapps: ${html.includes('canalapps')}`);
            // Show first link with id= for debugging
            const firstIdLink = html.match(/<a[^>]*id=\d+[^>]*>[^<]*/i);
            if (firstIdLink) console.log(`   First id link: ${firstIdLink[0].substring(0, 150)}`);
            process.exit(0);
        }

        // === Step 3: Extract streams ===
        console.log('\n📺 Step 3: Extracting stream URLs...');
        let streamsFound = 0;

        for (let i = 0; i < games.length; i++) {
            const game = games[i];
            console.log(`\n   [${i + 1}/${games.length}] ${game.home} x ${game.away}`);

            const streamUrl = await extractStreamUrl(game.gameId);
            if (streamUrl) {
                if (streamUrl.includes('.m3u8')) {
                    game.url = streamUrl;
                    streamsFound++;
                } else {
                    game.streamPageUrl = streamUrl;
                }
            }

            // Delay between requests
            if (i < games.length - 1) {
                await new Promise(r => setTimeout(r, 800));
            }
        }

        console.log(`\n   📊 Streams: ${streamsFound}/${games.length}`);

        // === Step 4: Clean old data ===
        console.log('\n🗑️  Step 4: Cleaning old data...');
        await deleteOldSyncedDocs();

        // === Step 5: Save ===
        console.log('\n💾 Step 5: Saving to Firestore...');
        let saved = 0;
        for (const game of games) {
            try {
                // Remove internal gameId before saving
                const { gameId, ...saveData } = game;
                await addGameDoc(saveData);
                saved++;
                console.log(`   ✅ Saved: ${game.home} x ${game.away}`);
            } catch (e) {
                console.warn(`   ❌ Failed: ${game.home} x ${game.away} — ${e.message}`);
            }
        }

        // === Summary ===
        console.log('\n==========================================');
        console.log('✅ SYNC COMPLETE');
        console.log(`   🎮 Games: ${saved}/${games.length}`);
        console.log(`   📺 Streams: ${streamsFound}/${games.length}`);
        console.log('==========================================');

    } catch (err) {
        console.error('❌ Sync error:', err.message);
        process.exit(1);
    }
}

main();
