// ===== FUTEBOL TV — SERVIDOR PROXY SIMPLES =====
// Proxy que resolve problemas de CORS para streams IPTV.
// Roda localmente ou em um servidor (Railway, VPS, etc.)

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== CORS =====
app.use(cors({
    origin: '*',
    methods: ['GET', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Range'],
    exposedHeaders: ['Content-Length', 'Content-Range', 'Content-Type'],
}));

// ===== API: Status =====
app.get('/api/status', (req, res) => {
    res.json({ server: 'Futebol TV Proxy', status: 'online', uptime: process.uptime() });
});

// ===== PROXY GENÉRICO =====
// Uso: /proxy?url=http://servidor.com/live/user/pass/12345.m3u8
app.get('/proxy', async (req, res) => {
    let targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('Missing url parameter');

    // Decode if double-encoded
    try { targetUrl = decodeURIComponent(targetUrl); } catch(e) {}

    console.log(`📡 Proxy: ${targetUrl}`);

    try {
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        };

        // Bypass stream server hotlink checking by dynamically setting Referer and Origin
        if (targetUrl.includes('futemais') || targetUrl.includes('live') || targetUrl.includes('canal')) {
            headers['Referer'] = 'https://links.futemais.eu/';
            headers['Origin'] = 'https://links.futemais.eu';
        }

        const upstream = await fetch(targetUrl, {
            headers,
            timeout: 30000,
        });

        if (!upstream.ok) {
            console.error(`❌ Upstream ${upstream.status}: ${targetUrl}`);
            return res.status(upstream.status).send('Upstream error');
        }

        const ct = upstream.headers.get('content-type') || 'application/octet-stream';
        const cl = upstream.headers.get('content-length');

        // If it's an M3U8 playlist, rewrite URLs to go through proxy
        if (ct.includes('mpegurl') || ct.includes('m3u8') || targetUrl.includes('.m3u8')) {
            let body = await upstream.text();

            // Determine base URL for relative paths
            const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

            const lines = body.split('\n');
            const rewritten = lines.map(line => {
                const trimmed = line.trim();
                if (trimmed.startsWith('#') || trimmed === '') return line;

                // This is a segment/variant URL
                let fullUrl;
                if (trimmed.startsWith('http')) {
                    fullUrl = trimmed;
                } else if (trimmed.startsWith('/')) {
                    // Relative to server root
                    const parsed = new URL(targetUrl);
                    fullUrl = `${parsed.protocol}//${parsed.host}${trimmed}`;
                } else {
                    // Relative to M3U8 location
                    fullUrl = baseUrl + trimmed;
                }

                return `/proxy?url=${encodeURIComponent(fullUrl)}`;
            });

            body = rewritten.join('\n');

            res.set({
                'Content-Type': 'application/vnd.apple.mpegurl',
                'Cache-Control': 'no-cache, no-store',
                'Access-Control-Allow-Origin': '*',
            });
            return res.send(body);
        }

        // For segments (TS, etc), pipe directly
        const resHeaders = {
            'Content-Type': ct,
            'Cache-Control': 'public, max-age=5',
            'Access-Control-Allow-Origin': '*',
        };
        if (cl) resHeaders['Content-Length'] = cl;

        res.set(resHeaders);
        upstream.body.pipe(res);

    } catch (err) {
        console.error(`❌ Proxy error:`, err.message);
        res.status(502).send('Proxy error: ' + err.message);
    }
});

// ===== STREAM PROXY INTELIGENTE =====
// Extrai token fresco em tempo real para evitar erro 403 de token expirado.
// Cadeia correta de Referers: ligapk.com → links2.futemais.eu → links.futemais.eu
app.get('/stream-proxy', async (req, res) => {
    let pageUrl = req.query.pageUrl;
    if (!pageUrl) return res.status(400).json({ error: 'Missing pageUrl parameter' });

    try { pageUrl = decodeURIComponent(pageUrl); } catch(e) {}
    console.log(`🎯 Stream-Proxy: ${pageUrl.substring(0, 80)}`);

    // Helper: buscar HTML com headers corretos
    async function fetchHtml(url, referer, origin) {
        const r = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9',
                ...(referer ? { 'Referer': referer } : {}),
                ...(origin  ? { 'Origin':  origin  } : {}),
            },
            redirect: 'follow'
        });
        if (!r.ok) throw new Error(`HTTP ${r.status} para ${url}`);
        return r.text();
    }

    // Helper: extrair M3U8 do HTML
    function extractM3u8(html) {
        const matches = html.match(/https?:\/\/[^\s"'<>\\]*\.m3u8[^\s"'<>\\]*/gi) || [];
        if (matches.length > 0) return matches[0].replace(/\\+/g, '');
        const src = html.match(/source\s*[:=]\s*['"]([^'"]+\.m3u8[^'"]*)/i);
        if (src) return src[1];
        return null;
    }

    try {
        // ── PASSO 1: Buscar a página do player (ex: links2.futemais.eu/canalapps.php?id=13802)
        // Referer: ligapk.com (pois o usuário veio de lá)
        const playerHtml = await fetchHtml(pageUrl, 'https://ligapk.com/', 'https://ligapk.com');
        console.log(`   Player page: ${playerHtml.length} bytes`);

        // ── PASSO 2: M3U8 direto na página do player?
        const directM3u8 = extractM3u8(playerHtml);
        if (directM3u8) {
            console.log(`✅ M3U8 direto: ${directM3u8.substring(0, 80)}`);
            return res.redirect(`/proxy?url=${encodeURIComponent(directM3u8)}`);
        }

        // ── PASSO 3: Extrair URLs das opções (changeChannel)
        // Prioridade 1: links.futemais.eu/canais3/opcao (mais confiável)
        // Prioridade 2: superdinamico.com/prime.php (fallback)
        const changeChannels = [...playerHtml.matchAll(/changeChannel\(['"]([^'"]+)['"]\)/gi)];
        let opcaoUrl = '';
        let superdinamicoUrl = '';

        for (const match of changeChannels) {
            const url = match[1];
            if ((url.includes('opcao') || url.includes('canais')) && url.includes('futemais') && !opcaoUrl) {
                opcaoUrl = url;
            }
            if (url.includes('superdinamico') && !superdinamicoUrl) {
                superdinamicoUrl = url;
            }
        }

        // Fallback: procurar em src de iframe
        if (!opcaoUrl && !superdinamicoUrl) {
            const iframeSrcs = [...playerHtml.matchAll(/src=['"]([^'"]+(?:opcao|canais|superdinamico)[^'"]*)['"]/gi)];
            for (const s of iframeSrcs) {
                const u = s[1].startsWith('//') ? 'https:' + s[1] : s[1];
                if (u.includes('futemais')) { opcaoUrl = u; break; }
                if (u.includes('superdinamico')) { superdinamicoUrl = u; break; }
            }
        }

        // ── PASSO 4A: Tentar opcao do futemais
        // Referer correto: a página do player (links2.futemais.eu)
        if (opcaoUrl) {
            console.log(`📺 Opcao futemais: ${opcaoUrl.substring(0, 80)}`);
            try {
                const opcaoHtml = await fetchHtml(opcaoUrl, pageUrl, new URL(pageUrl).origin);
                const m3u8 = extractM3u8(opcaoHtml);
                if (m3u8) {
                    console.log(`✅ M3U8 futemais: ${m3u8.substring(0, 80)}`);
                    return res.redirect(`/proxy?url=${encodeURIComponent(m3u8)}`);
                }
            } catch(e) {
                console.warn(`   Opcao futemais falhou: ${e.message}`);
            }
        }

        // ── PASSO 4B: Tentar superdinamico.com
        // Usa um endpoint REFRESH para obter a URL do stream
        if (superdinamicoUrl) {
            console.log(`📺 Superdinamico: ${superdinamicoUrl.substring(0, 80)}`);
            try {
                const sdHtml = await fetchHtml(superdinamicoUrl, pageUrl, new URL(pageUrl).origin);
                
                // Extrair PAGE_TOKEN e REFRESH_ENDPOINT do JS embutido
                const tokenMatch = sdHtml.match(/PAGE_TOKEN\s*=\s*['"]([^'"]+)['"]/);
                const endpointMatch = sdHtml.match(/REFRESH_ENDPOINT\s*=\s*['"]([^'"]+)['"]/);
                
                if (tokenMatch && endpointMatch) {
                    const token = tokenMatch[1];
                    const endpoint = endpointMatch[1];
                    const baseUrl = new URL(superdinamicoUrl);
                    const refreshUrl = `${baseUrl.origin}/${endpoint}`;
                    
                    console.log(`   🔑 Buscando URL via refresh endpoint: ${refreshUrl}`);
                    const refreshRes = await fetch(refreshUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'Referer': superdinamicoUrl,
                            'Origin': baseUrl.origin,
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        },
                        body: `token=${encodeURIComponent(token)}`
                    });
                    
                    if (refreshRes.ok) {
                        const data = await refreshRes.json().catch(() => null);
                        const streamUrl = data?.url || data?.stream || data?.src;
                        if (streamUrl && streamUrl.includes('.m3u8')) {
                            console.log(`✅ M3U8 superdinamico: ${streamUrl.substring(0, 80)}`);
                            return res.redirect(`/proxy?url=${encodeURIComponent(streamUrl)}`);
                        }
                    }
                }

                // Fallback: procurar M3U8 direto no HTML do superdinamico
                const sdM3u8 = extractM3u8(sdHtml);
                if (sdM3u8) {
                    console.log(`✅ M3U8 superdinamico direto: ${sdM3u8.substring(0, 80)}`);
                    return res.redirect(`/proxy?url=${encodeURIComponent(sdM3u8)}`);
                }
            } catch(e) {
                console.warn(`   Superdinamico falhou: ${e.message}`);
            }
        }

        console.error('❌ Nenhum M3U8 encontrado');
        res.status(502).json({ error: 'No M3U8 stream found', pageUrl, opcaoUrl, superdinamicoUrl });

    } catch (err) {
        console.error(`❌ Stream-Proxy error:`, err.message);
        res.status(502).json({ error: err.message, pageUrl });
    }
});

// ===== Serve Frontend =====
app.use(express.static(path.join(__dirname, '..'), {
    index: 'index.html',
    extensions: ['html']
}));

// ===== START =====
app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('==========================================');
    console.log('⚽ FUTEBOL TV — Servidor Proxy');
    console.log('==========================================');
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`📡 Proxy: GET /proxy?url=<stream_url>`);
    console.log(`📊 Status: GET /api/status`);
    console.log('==========================================');
    console.log('');

    // ===== KEEP AWAKE MONITOR ROBOT =====
    // Render automatically exposes RENDER_EXTERNAL_URL when deployed.
    // Pings itself every 10 minutes to bypass Render's free tier sleep mode.
    const EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL;
    if (EXTERNAL_URL) {
        const cleanUrl = EXTERNAL_URL.replace(/\/$/, ''); // remove trailing slash
        console.log(`🤖 Keep-Alive Robot: Activating self-ping to ${cleanUrl}`);
        setInterval(async () => {
            try {
                console.log('🤖 Keep-Alive Robot: Pinging self to stay awake...');
                const res = await fetch(`${cleanUrl}/api/status`);
                console.log(`🤖 Keep-Alive Robot: Status ${res.status}`);
            } catch (e) {
                console.error('🤖 Keep-Alive Robot error:', e.message);
            }
        }, 10 * 60 * 1000); // 10 minutes
    }
});
