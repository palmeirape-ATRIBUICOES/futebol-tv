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
            const parsedTarget = new URL(targetUrl);
            const parentSearch = parsedTarget.search;

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
                    fullUrl = `${parsedTarget.protocol}//${parsedTarget.host}${trimmed}`;
                } else {
                    // Relative to M3U8 location
                    fullUrl = baseUrl + trimmed;
                }

                // Preserve security parameters/tokens (md5, expires) for TS segments
                if (parentSearch && !fullUrl.includes('?')) {
                    fullUrl += parentSearch;
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

// ===== STREAM PROXY HELPERS =====

// Helper: fetch HTML with correct sports streaming referers
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

// Helper: extract M3U8 link from HTML body
function extractM3u8(html) {
    const matches = html.match(/https?:\/\/[^\s"'<>\\]*\.m3u8[^\s"'<>\\]*/gi) || [];
    if (matches.length > 0) return matches[0].replace(/\\+/g, '');
    const src = html.match(/source\s*[:=]\s*['"]([^'"]+\.m3u8[^'"]*)/i);
    if (src) return src[1];
    return null;
}

// Helper: process and redirect futemais/standard option
async function handleFutemais(opcaoUrl, referer, res) {
    console.log(`📺 Processando futemais: ${opcaoUrl}`);
    const opcaoHtml = await fetchHtml(opcaoUrl, referer, new URL(referer).origin);
    const m3u8 = extractM3u8(opcaoHtml);
    if (m3u8) {
        console.log(`✅ M3U8 futemais obtido: ${m3u8.substring(0, 80)}`);
        return res.redirect(`/proxy?url=${encodeURIComponent(m3u8)}`);
    }
    throw new Error('No M3U8 found in futemais page');
}

// Helper: process and redirect superdinamico option
async function handleSuperdinamico(superdinamicoUrl, referer, res) {
    console.log(`📺 Processando superdinamico: ${superdinamicoUrl}`);
    const sdHtml = await fetchHtml(superdinamicoUrl, referer, new URL(referer).origin);
    
    // Extrair PAGE_TOKEN e REFRESH_ENDPOINT
    const tokenMatch = sdHtml.match(/PAGE_TOKEN\s*=\s*['"]([^'"]+)['"]/);
    const endpointMatch = sdHtml.match(/REFRESH_ENDPOINT\s*=\s*['"]([^'"]+)['"]/);
    
    if (tokenMatch && endpointMatch) {
        const token = tokenMatch[1];
        const endpoint = endpointMatch[1];
        const baseUrl = new URL(superdinamicoUrl);
        const refreshUrl = `${baseUrl.origin}/${endpoint}`;
        
        console.log(`   🔑 Buscando URL via refresh: ${refreshUrl}`);
        const refreshRes = await fetch(refreshUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Referer': superdinamicoUrl,
                'Origin': baseUrl.origin,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            body: JSON.stringify({ token: token })
        });
        
        if (refreshRes.ok) {
            const data = await refreshRes.json().catch(() => null);
            const streamUrl = data?.url || data?.stream || data?.src;
            if (streamUrl && streamUrl.includes('.m3u8')) {
                console.log(`✅ M3U8 superdinamico obtido: ${streamUrl.substring(0, 80)}`);
                return res.redirect(`/proxy?url=${encodeURIComponent(streamUrl)}`);
            }
        }
    }

    // Fallback direct
    const sdM3u8 = extractM3u8(sdHtml);
    if (sdM3u8) {
        console.log(`✅ M3U8 superdinamico direto obtido: ${sdM3u8.substring(0, 80)}`);
        return res.redirect(`/proxy?url=${encodeURIComponent(sdM3u8)}`);
    }

    throw new Error('No M3U8 found in superdinamico page');
}

// ===== STREAM PROXY INTELIGENTE =====
// Extrai token fresco em tempo real para evitar erro 403 de token expirado.
app.get('/stream-proxy', async (req, res) => {
    let pageUrl = req.query.pageUrl;
    let optionUrl = req.query.optionUrl;
    
    if (!pageUrl && !optionUrl) {
        return res.status(400).json({ error: 'Missing pageUrl or optionUrl parameter' });
    }

    try {
        if (pageUrl) pageUrl = decodeURIComponent(pageUrl);
        if (optionUrl) optionUrl = decodeURIComponent(optionUrl);

        // Caso 1: Tocar opção específica diretamente
        if (optionUrl) {
            console.log(`🎯 Stream-Proxy Direto para opção: ${optionUrl.substring(0, 80)}`);
            if (optionUrl.includes('superdinamico')) {
                return await handleSuperdinamico(optionUrl, pageUrl || optionUrl, res);
            } else {
                return await handleFutemais(optionUrl, pageUrl || optionUrl, res);
            }
        }

        // Caso 2: Fluxo automático padrão (tenta a primeira que funcionar)
        console.log(`🎯 Stream-Proxy Automático: ${pageUrl.substring(0, 80)}`);
        const playerHtml = await fetchHtml(pageUrl, 'https://ligapk.com/', 'https://ligapk.com');

        // M3U8 direto na página?
        const directM3u8 = extractM3u8(playerHtml);
        if (directM3u8) {
            console.log(`✅ M3U8 direto: ${directM3u8.substring(0, 80)}`);
            return res.redirect(`/proxy?url=${encodeURIComponent(directM3u8)}`);
        }

        const changeChannels = [...playerHtml.matchAll(/changeChannel\(['"]([^'"]+)['"]\)/gi)];
        let targetOptUrl = '';
        let isSuperdinamico = false;

        // Prioridade 1: futemais/canais3
        for (const match of changeChannels) {
            const url = match[1];
            if ((url.includes('opcao') || url.includes('canais')) && url.includes('futemais')) {
                targetOptUrl = url;
                break;
            }
        }

        // Prioridade 2: superdinamico
        if (!targetOptUrl) {
            for (const match of changeChannels) {
                const url = match[1];
                if (url.includes('superdinamico')) {
                    targetOptUrl = url;
                    isSuperdinamico = true;
                    break;
                }
            }
        }

        // Fallback: iframe srcs
        if (!targetOptUrl) {
            const iframeSrcs = [...playerHtml.matchAll(/src=['"]([^'"]+(?:opcao|canais|superdinamico)[^'"]*)['"]/gi)];
            for (const s of iframeSrcs) {
                const u = s[1].startsWith('//') ? 'https:' + s[1] : s[1];
                targetOptUrl = u;
                isSuperdinamico = u.includes('superdinamico');
                break;
            }
        }

        if (targetOptUrl) {
            if (isSuperdinamico) {
                return await handleSuperdinamico(targetOptUrl, pageUrl, res);
            } else {
                return await handleFutemais(targetOptUrl, pageUrl, res);
            }
        }

        console.error('❌ Nenhum M3U8 encontrado no fluxo automático');
        res.status(502).json({ error: 'No M3U8 stream found' });

    } catch (err) {
        console.error(`❌ Stream-Proxy error:`, err.message);
        res.status(502).json({ error: err.message });
    }
});

// ===== API: Obter todas as opções do player (canais de transmissão) =====
// Retorna a lista de opções de player e labels (ex: CH 1, CH 2, ..., CH 8)
app.get('/api/options', async (req, res) => {
    let pageUrl = req.query.pageUrl;
    if (!pageUrl) return res.status(400).json({ error: 'Missing pageUrl parameter' });

    try { pageUrl = decodeURIComponent(pageUrl); } catch(e) {}
    console.log(`🔍 Buscando opções do player para: ${pageUrl}`);

    try {
        const playerHtml = await fetchHtml(pageUrl, 'https://ligapk.com/', 'https://ligapk.com');
        
        // Extrair todas as chamadas de changeChannel com seus nomes/labels da tabela
        const regex = /<a[^>]*changeChannel\(['"]([^'"]+)['"]\)[^>]*>([\s\S]*?)<\/a>/gi;
        const matches = [...playerHtml.matchAll(regex)];

        const options = [];
        matches.forEach((m, idx) => {
            const url = m[1];
            const label = m[2].replace(/<[^>]+>/g, '').trim() || `Opção ${idx + 1}`;
            options.push({ label, url });
        });

        // Se não encontrar nenhuma opção na tabela changeChannel, tentar do iframe src ou M3U8 direto
        if (options.length === 0) {
            const directM3u8 = extractM3u8(playerHtml);
            if (directM3u8) {
                options.push({ label: 'Opção 1', url: directM3u8 });
            }
            
            const iframeSrcs = [...playerHtml.matchAll(/src=['"]([^'"]+(?:opcao|canais|superdinamico|player)[^'"]*)['"]/gi)];
            iframeSrcs.forEach((s, idx) => {
                const u = s[1].startsWith('//') ? 'https:' + s[1] : s[1];
                options.push({ label: `Opção ${options.length + 1}`, url: u });
            });
        }

        console.log(`   Encontradas ${options.length} opções`);
        res.json({ options });
    } catch (err) {
        console.error(`❌ Erro em /api/options:`, err.message);
        res.status(502).json({ error: err.message, options: [] });
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
