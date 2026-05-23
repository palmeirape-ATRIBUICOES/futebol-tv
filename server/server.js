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
// Uso: /stream-proxy?pageUrl=https://links2.futemais.eu/canalapps.php?id=13801
// Extrai token fresco em tempo real — resolve o erro 403 do token expirado
app.get('/stream-proxy', async (req, res) => {
    let pageUrl = req.query.pageUrl;
    if (!pageUrl) return res.status(400).json({ error: 'Missing pageUrl parameter' });

    try { pageUrl = decodeURIComponent(pageUrl); } catch(e) {}
    console.log(`🎯 Stream-Proxy: buscando token para ${pageUrl.substring(0, 80)}`);

    try {
        // PASSO 1: Buscar a página do player
        const playerRes = await fetch(pageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
                'Referer': 'https://apk.futemais.eu/',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'pt-BR,pt;q=0.9'
            }
        });

        if (!playerRes.ok) {
            return res.status(502).json({ error: `Player page returned ${playerRes.status}` });
        }

        const playerHtml = await playerRes.text();

        // PASSO 2: Tentar M3U8 direto na página do player
        const directM3u8 = playerHtml.match(/https?:\/\/[^\s"'<>\\]*\.m3u8[^\s"'<>\\]*/gi) || [];
        if (directM3u8.length > 0) {
            const freshUrl = directM3u8[0].replace(/\\+/g, '');
            console.log(`✅ M3U8 direto: ${freshUrl.substring(0, 80)}`);
            return res.redirect(`/proxy?url=${encodeURIComponent(freshUrl)}`);
        }

        // PASSO 3: Procurar changeChannel com URL de opcao
        let opcaoUrl = '';
        const changeChannels = playerHtml.match(/changeChannel\(['"]([^'"]+)['"]\)/gi) || [];
        for (const match of changeChannels) {
            const m = match.match(/changeChannel\(['"]([^'"]+)['"]\)/i);
            if (m && (m[1].includes('opcao') || m[1].includes('canais') || m[1].includes('futemais'))) {
                opcaoUrl = m[1];
                break;
            }
        }

        // Fallback: src de iframe
        if (!opcaoUrl) {
            const iframeSrcs = playerHtml.match(/src=['"]([^'"]*(?:opcao|canais)[^'"]*)['"]/gi) || [];
            for (const s of iframeSrcs) {
                const srcM = s.match(/src=['"]([^'"]+)['"]/i);
                if (srcM && !srcM[1].includes('google') && !srcM[1].includes('ads')) {
                    opcaoUrl = srcM[1].startsWith('//') ? 'https:' + srcM[1] : srcM[1];
                    break;
                }
            }
        }

        if (!opcaoUrl) {
            return res.status(502).json({ error: 'No stream option found in player page' });
        }

        console.log(`📺 Seguindo opcao: ${opcaoUrl.substring(0, 80)}`);

        // PASSO 4: Buscar a página da opção com Referer correto
        const opcaoOrigin = (() => { try { return new URL(pageUrl).origin; } catch(e) { return 'https://links2.futemais.eu'; } })();
        const opcaoRes = await fetch(opcaoUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': pageUrl,
                'Origin': opcaoOrigin,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            }
        });

        if (!opcaoRes.ok) {
            return res.status(502).json({ error: `Opcao page returned ${opcaoRes.status}` });
        }

        const opcaoHtml = await opcaoRes.text();

        // PASSO 5: Extrair M3U8 com token fresco
        const m3u8s = opcaoHtml.match(/https?:\/\/[^\s"'<>\\]*\.m3u8[^\s"'<>\\]*/gi) || [];
        if (m3u8s.length > 0) {
            const freshUrl = m3u8s[0].replace(/\\+/g, '');
            console.log(`✅ M3U8 fresco: ${freshUrl.substring(0, 80)}`);
            return res.redirect(`/proxy?url=${encodeURIComponent(freshUrl)}`);
        }

        // Procurar via source: config do Clappr/HLS
        const sourceConfigs = opcaoHtml.match(/source\s*[:=]\s*['"]([^'"]+\.m3u8[^'"]*)/gi) || [];
        if (sourceConfigs.length > 0) {
            const srcMatch = sourceConfigs[0].match(/(https?:\/\/[^'"]+)/);
            if (srcMatch) {
                const freshUrl = srcMatch[1];
                console.log(`✅ Clappr source fresco: ${freshUrl.substring(0, 80)}`);
                return res.redirect(`/proxy?url=${encodeURIComponent(freshUrl)}`);
            }
        }

        console.error('❌ Nenhum M3U8 encontrado na página da opção');
        res.status(502).json({ error: 'No M3U8 stream found in option page' });

    } catch (err) {
        console.error(`❌ Stream-Proxy error:`, err.message);
        res.status(502).json({ error: 'Stream proxy error: ' + err.message });
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
