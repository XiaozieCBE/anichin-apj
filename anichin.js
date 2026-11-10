#!/usr/bin/env node
/**
 * Anichin
 * Coded by rapsyncfox
 * Source: Anichin.moe
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const BASE_URL = "https://anichin.moe";
const TIMEOUT = 12000;

async function request(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeout || TIMEOUT);
    try {
        const res = await fetch(url, {
            method: options.method || 'GET',
            headers: {
                'User-Agent': UA,
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
                'Referer': options.headers?.Referer || `${BASE_URL}/`,
                ...options.headers
            },
            signal: controller.signal
        });
        clearTimeout(timer);
        return res;
    } catch (e) {
        clearTimeout(timer);
        throw e;
    }
}

async function getHtml(url, headers = {}) {
    try {
        const res = await request(url, { headers });
        if (!res.ok) return '';
        const finalUrl = res.url || url;
        const reqClean = url.replace(/\/+$/, '');
        const resClean = finalUrl.replace(/\/+$/, '');
        // If a non-home URL got redirected to homepage, treat it as not found
        if (reqClean !== BASE_URL && resClean === BASE_URL) {
            return '';
        }
        return await res.text();
    } catch (e) {
        return '';
    }
}

function unescapeHtml(str = '') {
    if (!str) return '';
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&#8211;/g, '-')
        .replace(/&#8212;/g, '-')
        .replace(/&#8216;/g, "'")
        .replace(/&#8217;/g, "'")
        .trim();
}

function cleanPoster(raw = '') {
    if (!raw) return '';
    let u = raw.replace(/&amp;/g, '&').trim();
    if (u.startsWith('//')) return 'https:' + u;
    if (u.startsWith('/')) return BASE_URL + u;
    return u;
}

function cleanSlug(input = '') {
    return String(input)
        .replace(/^anichin_/, '')
        .replace(/^\/+|\/+$/g, '')
        .replace(/^seri\//, '');
}

/**
 * Pure safe Dean Edwards unpacker without using eval
 */
function unpackDeanEdwards(packed = '') {
    if (!packed) return '';
    const match = packed.match(/}\s*\('([\s\S]+?)',\s*(\d+),\s*(\d+),\s*'([\s\S]+?)'\.split\('\|'\)/);
    if (!match) return '';
    let [, p, aStr, cStr, kStr] = match;
    const a = parseInt(aStr, 10);
    let c = parseInt(cStr, 10);
    const words = kStr.split('|');
    const dict = {};
    for (let i = 0; i < c; i++) {
        const key = i.toString(a);
        dict[key] = words[i] || key;
    }
    return p.replace(/\b\w+\b/g, (token) => {
        return Object.prototype.hasOwnProperty.call(dict, token) ? dict[token] : token;
    });
}

async function getHome() {
    const html = await getHtml(`${BASE_URL}/`);
    const cardRegex = /<article[^>]*class=["'][^"']*bs[^"']*["'][\s\S]*?<\/article>/gi;
    const matches = html.match(cardRegex) || [];
    const items = [];
    const seen = new Set();

    for (const block of matches) {
        const aMatch = block.match(/<a[^>]*href=["']([^"']+)["'][^>]*title=["']([^"']+)["']/i) ||
                       block.match(/<a[^>]*title=["']([^"']+)["'][^>]*href=["']([^"']+)["']/i);
        if (!aMatch) continue;

        const href = aMatch[1].startsWith('http') || aMatch[1].startsWith('/') ? aMatch[1] : aMatch[2];
        const title = aMatch[1].startsWith('http') || aMatch[1].startsWith('/') ? aMatch[2] : aMatch[1];
        const cleanHref = href.startsWith('http') ? href.replace(BASE_URL, '') : href;
        const rawSlug = cleanHref.replace(/^\/seri\//, '').replace(/^\/+|\/+$/g, '');
        const slug = rawSlug.replace(/-(?:episode-\d+.*|subtitle-indonesia.*)$/i, '');
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);

        const imgMatch = block.match(/data-lazy-src=["']([^"']+)["']/i) ||
                         block.match(/data-src=["']([^"']+)["']/i) ||
                         block.match(/src=["']([^"']+)["']/i);
        const epMatch = block.match(/<span[^>]*class=["']epx["'][^>]*>([^<]+)<\/span>/i);
        const cleanTitle = unescapeHtml(title).replace(/\s+(?:Episode|Ep)\s+\d+.*$/i, '').replace(/\s+Subtitle Indonesia.*$/i, '').trim();

        items.push({
            id: `anichin_${slug}`,
            title: cleanTitle,
            slug,
            type: 'donghua',
            poster: cleanPoster(imgMatch ? imgMatch[1] : ''),
            latestEpisode: epMatch ? epMatch[1].trim() : '',
            source: 'anichin'
        });
    }

    return { credit: 'rapsyncfox', source: 'anichin', total: items.length, items };
}

async function search(query) {
    if (!query) return { credit: 'rapsyncfox', source: 'anichin', total: 0, results: [] };
    const html = await getHtml(`${BASE_URL}/?s=${encodeURIComponent(query)}`);
    const cardRegex = /<article[^>]*class=["'][^"']*bs[^"']*["'][\s\S]*?<\/article>/gi;
    const matches = html.match(cardRegex) || [];
    const results = [];
    const seen = new Set();

    for (const block of matches) {
        const aMatch = block.match(/<a[^>]*href=["']([^"']+)["'][^>]*title=["']([^"']+)["']/i) ||
                       block.match(/<a[^>]*title=["']([^"']+)["'][^>]*href=["']([^"']+)["']/i);
        if (!aMatch) continue;

        const href = aMatch[1].startsWith('http') || aMatch[1].startsWith('/') ? aMatch[1] : aMatch[2];
        const title = aMatch[1].startsWith('http') || aMatch[1].startsWith('/') ? aMatch[2] : aMatch[1];
        const cleanHref = href.startsWith('http') ? href.replace(BASE_URL, '') : href;
        const rawSlug = cleanHref.replace(/^\/seri\//, '').replace(/^\/+|\/+$/g, '');
        const slug = rawSlug.replace(/-(?:episode-\d+.*|subtitle-indonesia.*)$/i, '');
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);

        const imgMatch = block.match(/data-lazy-src=["']([^"']+)["']/i) ||
                         block.match(/data-src=["']([^"']+)["']/i) ||
                         block.match(/src=["']([^"']+)["']/i);
        const ratingMatch = block.match(/class=["']rating["'][^>]*>[\s\S]*?([0-9]+\.[0-9]+)/i);
        const cleanTitle = unescapeHtml(title).replace(/\s+(?:Episode|Ep)\s+\d+.*$/i, '').replace(/\s+Subtitle Indonesia.*$/i, '').trim();

        results.push({
            id: `anichin_${slug}`,
            title: cleanTitle,
            slug,
            type: 'donghua',
            poster: cleanPoster(imgMatch ? imgMatch[1] : ''),
            rating: ratingMatch ? parseFloat(ratingMatch[1]) : null,
            source: 'anichin'
        });
    }

    return { credit: 'rapsyncfox', source: 'anichin', query, total: results.length, results };
}

async function getDetail(slugInput) {
    const slug = cleanSlug(slugInput);
    let html = await getHtml(`${BASE_URL}/${slug}/`);
    if (!html) {
        html = await getHtml(`${BASE_URL}/seri/${slug}/`);
    }
    if (!html) throw new Error(`Detail donghua tidak ditemukan: ${slug}`);

    const titleMatch = html.match(/<h1[^>]*class=["'][^"']*entry-title[^"']*["'][^>]*>([^<]+)<\/h1>/i) ||
                       html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const title = unescapeHtml(titleMatch ? titleMatch[1] : slug.replace(/-/g, ' '));

    const posterMatch = html.match(/class=["']thumb["'][^>]*>[\s\S]*?<img[^>]+(?:data-lazy-src|data-src|src)=["']([^"']+)["']/i);
    const poster = cleanPoster(posterMatch ? posterMatch[1] : '');

    const descMatch = html.match(/<div class=["']entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const synopsis = descMatch ? unescapeHtml(descMatch[1].replace(/<[^>]+>/g, '')).trim() : '';

    const episodes = [];
    const seenEp = new Set();

    // 1. Scoped parsing from eplister block to avoid matching unrelated links
    const eplisterMatch = html.match(/<div class=["']eplister["'][\s\S]*?<\/ul>/i);
    if (eplisterMatch) {
        const epListHtml = eplisterMatch[0];
        const liMatches = epListHtml.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi);
        for (const li of liMatches) {
            const block = li[1];
            const aMatch = block.match(/<a[^>]*href=["']([^"']+)["']/i);
            if (!aMatch) continue;

            const cleanHref = aMatch[1].replace(/https?:\/\/anichin\.moe/, '').replace(/^\/+|\/+$/g, '');
            const epSlug = cleanHref.split('/').pop();
            if (!epSlug || seenEp.has(epSlug)) continue;
            seenEp.add(epSlug);

            const numMatch = block.match(/<div class=["']epl-num["'][^>]*>([^<]*)<\/div>/i);
            const titleMatch = block.match(/<div class=["']epl-title["'][^>]*>([^<]*)<\/div>/i);
            const epNumStr = numMatch ? numMatch[1].trim() : '';
            const epTitleRaw = titleMatch ? titleMatch[1].trim() : '';

            const fromSlug = epSlug.match(/-episode-(\d+)/i)?.[1];
            const fromTitle = epTitleRaw.match(/(?:Episode|Ep\.?)\s*(\d+)/i)?.[1];
            const fromNumStr = epNumStr.match(/\d+/)?.[0];
            const epNum = parseInt(fromSlug || fromTitle || fromNumStr || (episodes.length + 1), 10);

            episodes.push({
                episode: epNum,
                title: unescapeHtml(epTitleRaw) || `Episode ${epNum}`,
                slug: epSlug
            });
        }
    }

    // 2. Fallback if eplister not found or empty
    if (episodes.length === 0) {
        const fallbackMatches = html.matchAll(/<li[^>]*data-id=["'](\d+)["'][^>]*>[\s\S]*?<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);
        for (const m of fallbackMatches) {
            const epHref = m[2];
            const cleanHref = epHref.replace(/https?:\/\/anichin\.moe/, '').replace(/^\/+|\/+$/g, '');
            const epSlug = cleanHref.split('/').pop();
            if (!epSlug || seenEp.has(epSlug)) continue;
            seenEp.add(epSlug);

            const epTitleRaw = m[3].replace(/<[^>]+>/g, '').trim();
            const epNumMatch = epTitleRaw.match(/(?:Episode|Ep)\s*([0-9]+)/i) || epSlug.match(/(?:episode|ep)-([0-9]+)/i);
            const epNum = epNumMatch ? parseInt(epNumMatch[1], 10) : episodes.length + 1;

            episodes.push({
                episode: epNum,
                title: unescapeHtml(epTitleRaw) || `Episode ${epNum}`,
                slug: epSlug
            });
        }
    }

    episodes.sort((a, b) => a.episode - b.episode);

    return {
        credit: 'rapsyncfox',
        source: 'anichin',
        id: `anichin_${slug}`,
        title,
        slug,
        type: 'donghua',
        poster,
        synopsis,
        totalEpisodes: episodes.length,
        episodes
    };
}

async function getStream(slugInput, episode = 1) {
    let epSlug = cleanSlug(slugInput);

    // Jika slugInput adalah slug judul seri (bukan episode), cari episode yang cocok dari detail
    if (!epSlug.match(/-(?:episode|ep)-\d+/i)) {
        try {
            const detail = await getDetail(epSlug);
            const target = detail.episodes?.find(e => e.episode === episode) ||
                           detail.episodes?.[detail.episodes.length - 1] ||
                           detail.episodes?.[0];
            if (target && target.slug) {
                epSlug = target.slug;
            }
        } catch (_) {
            const padded = String(episode).padStart(2, '0');
            epSlug = `${epSlug}-episode-${padded}-subtitle-indonesia`;
        }
    }

    let watchUrl = `${BASE_URL}/${epSlug}/`;
    let html = await getHtml(watchUrl);
    if (!html && !epSlug.endsWith('/')) {
        const altSlug = epSlug.replace(/-episode-(\d+)/i, (_, n) => `-episode-${parseInt(n, 10)}`);
        watchUrl = `${BASE_URL}/${altSlug}/`;
        html = await getHtml(watchUrl);
        if (html) epSlug = altSlug;
    }
    if (!html) throw new Error(`Halaman episode tidak ditemukan: ${epSlug}`);

    const streams = [];
    const seenUrls = new Set();
    const mirrorOptions = [];

    // 1. Ekstrak seluruh mirror option dari elemen <select class="mirror">
    const mirrorMatch = html.match(/<select[^>]*class=["'][^"']*mirror[^"']*["'][^>]*>([\s\S]*?)<\/select>/i);
    if (mirrorMatch) {
        const optMatches = mirrorMatch[1].matchAll(/<option[^>]*value=["']([^"']*)["'][^>]*>([^<]*)<\/option>/gi);
        for (const opt of optMatches) {
            const b64 = opt[1].trim();
            if (!b64) continue;
            let decoded = '';
            try {
                decoded = Buffer.from(b64, 'base64').toString('utf8');
            } catch (_) {
                decoded = b64;
            }
            const srcMatch = decoded.match(/(?:src|href)=["']?([^"' >]+)["']?/i);
            const src = srcMatch ? srcMatch[1].trim() : '';
            if (src && /^https?:\/\//i.test(src)) {
                mirrorOptions.push({ label: unescapeHtml(opt[2]).trim() || 'Mirror', url: src });
            }
        }
    }

    // 2. Ekstrak iframe bawaan dari halaman
    const iframeMatches = html.matchAll(/<iframe[^>]+(?:data-litespeed-src|data-src|src)=["']([^"']+)["']/gi);
    for (const im of iframeMatches) {
        const src = im[1].trim();
        if (src && /^https?:\/\//i.test(src) && !mirrorOptions.some(o => o.url === src)) {
            mirrorOptions.push({ label: 'Default Player', url: src });
        }
    }

    for (const opt of mirrorOptions) {
        const src = opt.url;

        // A. VidHide (morencius, vidhide, minochinos, vidhidepre, myviid, callistanos)
        // Keunggulan: HLS master playlist adaptif tanpa batasan IP dan CORS terbuka
        if (/vidhide|minochinos|vidhidepre|morencius|myviid|callistanos/i.test(src)) {
            try {
                const vHtml = await getHtml(src, { 'Referer': BASE_URL + '/' });
                const unpacked = unpackDeanEdwards(vHtml);
                const targetCode = unpacked || vHtml;
                for (const m of targetCode.matchAll(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/gi)) {
                    const u = m[0];
                    if (!seenUrls.has(u)) {
                        seenUrls.add(u);
                        streams.push({
                            format: 'HLS',
                            quality: '1080p',
                            url: u,
                            server: 'VidHide Direct HLS (Universal/No IP Lock)',
                            referer: src,
                            priority: 100,
                            headers: {
                                'Referer': src,
                                'User-Agent': UA
                            }
                        });
                    }
                }
            } catch (_) {}

            if (!seenUrls.has(src)) {
                seenUrls.add(src);
                streams.push({
                    format: 'Embed',
                    quality: 'HD',
                    url: src,
                    server: `${opt.label} (Embed Player)`,
                    referer: BASE_URL + '/',
                    priority: 25,
                    isEmbed: true,
                    headers: {
                        'Referer': BASE_URL + '/',
                        'User-Agent': UA
                    }
                });
            }
            continue;
        }

        // B. Rumble Cloud
        if (/rumble\.com\/embed/i.test(src)) {
            try {
                const rHtml = await getHtml(src, { 'Referer': BASE_URL + '/' });
                const clean = rHtml.replace(/\\\//g, '/').replace(/\\/g, '');
                for (const m of clean.matchAll(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/gi)) {
                    const u = m[0];
                    if (!seenUrls.has(u)) {
                        seenUrls.add(u);
                        streams.push({
                            format: 'HLS',
                            quality: '1080p',
                            url: u,
                            server: 'Rumble Cloud HLS (1080p)',
                            referer: 'https://rumble.com/',
                            priority: 95,
                            headers: {
                                'Referer': 'https://rumble.com/',
                                'User-Agent': UA
                            }
                        });
                    }
                }
                for (const m of clean.matchAll(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/gi)) {
                    const u = m[0];
                    if (!seenUrls.has(u) && !u.includes('timeline')) {
                        seenUrls.add(u);
                        streams.push({
                            format: 'MP4',
                            quality: '1080p',
                            url: u,
                            server: 'Rumble Direct MP4 (1080p)',
                            referer: 'https://rumble.com/',
                            priority: 90,
                            headers: {
                                'Referer': 'https://rumble.com/',
                                'User-Agent': UA
                            }
                        });
                    }
                }
            } catch (_) {}

            if (!seenUrls.has(src)) {
                seenUrls.add(src);
                streams.push({
                    format: 'Embed',
                    quality: 'HD',
                    url: src,
                    server: `${opt.label} (Embed Player)`,
                    referer: BASE_URL + '/',
                    priority: 25,
                    isEmbed: true,
                    headers: {
                        'Referer': BASE_URL + '/',
                        'User-Agent': UA
                    }
                });
            }
            continue;
        }

        // C. OK.ru
        if (/ok\.ru|odnoklassniki/i.test(src)) {
            try {
                const okHtml = await getHtml(src, { 'Referer': BASE_URL + '/' });
                const optMatch = okHtml.match(/data-options=["']([^"']+)["']/i) ||
                                 okHtml.match(/data-movie-options=["']([^"']+)["']/i);
                if (optMatch) {
                    const rawJson = optMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
                    const optJson = JSON.parse(rawJson);
                    const meta = typeof optJson.flashvars?.metadata === 'string'
                        ? JSON.parse(optJson.flashvars.metadata)
                        : (optJson.flashvars?.metadata || null);

                    const hls = meta?.hlsMasterPlaylistUrl || meta?.hlsManifestUrl;
                    if (hls && !seenUrls.has(hls)) {
                        seenUrls.add(hls);
                        streams.push({
                            format: 'HLS',
                            quality: '720p',
                            url: hls,
                            server: 'OK.ru Fast HLS (Adaptive)',
                            referer: 'https://ok.ru/',
                            priority: 85,
                            headers: {
                                'Referer': 'https://ok.ru/',
                                'User-Agent': UA
                            }
                        });
                    }

                    if (Array.isArray(meta?.videos)) {
                        for (const v of meta.videos) {
                            if (v.url && !seenUrls.has(v.url)) {
                                seenUrls.add(v.url);
                                const qName = v.name || 'HD';
                                const qLabel = qName === 'ultra' ? '1080p' :
                                               (qName === 'full' ? '1080p' :
                                               (qName === 'hd' ? '720p' :
                                               (qName === 'sd' ? '480p' :
                                               (qName === 'low' ? '360p' :
                                               (qName === 'lowest' ? '240p' : qName)))));
                                const pScore = qLabel === '1080p' ? 80 :
                                               (qLabel === '720p' ? 75 :
                                               (qLabel === '480p' ? 70 : 60));
                                streams.push({
                                    format: 'MP4',
                                    quality: qLabel,
                                    url: v.url,
                                    server: `OK.ru Direct MP4 (${qLabel})`,
                                    referer: 'https://ok.ru/',
                                    priority: pScore,
                                    headers: {
                                        'Referer': 'https://ok.ru/',
                                        'User-Agent': UA
                                    }
                                });
                            }
                        }
                    }
                }
            } catch (_) {}

            if (!seenUrls.has(src)) {
                seenUrls.add(src);
                streams.push({
                    format: 'Embed',
                    quality: 'HD',
                    url: src,
                    server: `${opt.label} (Embed Player)`,
                    referer: BASE_URL + '/',
                    priority: 25,
                    isEmbed: true,
                    headers: {
                        'Referer': BASE_URL + '/',
                        'User-Agent': UA
                    }
                });
            }
            continue;
        }

        // D. StreamRuby (nuvorel, rubyvidhub, rubystm, streamruby)
        if (/streamruby|rubyvidhub|rubystm|nuvorel/i.test(src)) {
            try {
                const sHtml = await getHtml(src, { 'Referer': BASE_URL + '/' });
                const unpacked = unpackDeanEdwards(sHtml);
                const targetCode = unpacked || sHtml;
                for (const m of targetCode.matchAll(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/gi)) {
                    const u = m[0];
                    if (!seenUrls.has(u)) {
                        seenUrls.add(u);
                        streams.push({
                            format: 'HLS',
                            quality: '720p',
                            url: u,
                            server: 'StreamRuby HLS',
                            referer: src,
                            priority: 65,
                            headers: {
                                'Referer': src,
                                'User-Agent': UA
                            }
                        });
                    }
                }
            } catch (_) {}

            if (!seenUrls.has(src)) {
                seenUrls.add(src);
                streams.push({
                    format: 'Embed',
                    quality: 'HD',
                    url: src,
                    server: `${opt.label} (Embed Player)`,
                    referer: BASE_URL + '/',
                    priority: 20,
                    isEmbed: true,
                    headers: {
                        'Referer': BASE_URL + '/',
                        'User-Agent': UA
                    }
                });
            }
            continue;
        }

        // E. Mirror lainnya (AbyssPlayer, D-Tube, Nunadrama, Mega, dll)
        if (!seenUrls.has(src)) {
            seenUrls.add(src);
            streams.push({
                format: 'Embed',
                quality: 'Auto',
                url: src,
                server: `${opt.label} (Embed Player)`,
                referer: BASE_URL + '/',
                priority: 15,
                isEmbed: true,
                headers: {
                    'Referer': BASE_URL + '/',
                    'User-Agent': UA
                }
            });
        }
    }

    // Urutkan prioritas: Stream langsung HLS/MP4 universal dulu, baru server dengan referer/IP check, lalu embed player
    streams.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    const result = {
        credit: 'rapsyncfox',
        source: 'anichin',
        slug: epSlug,
        episode,
        streams,
        captions: [{
            language: 'Indonesian',
            code: 'id',
            type: 'hardsub',
            note: 'Subtitle Indonesia terpasang langsung pada video'
        }]
    };

    if (streams.length > 0) {
        const top = streams[0];
        const hFlags = Object.entries(top.headers || {})
            .map(([k, v]) => `--http-header-fields="${k}: ${v}"`)
            .join(' ');
        result.mpvCommand = `mpv "${top.url}" ${hFlags}`;
    }

    return result;
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
        console.log(`
Anichin CLI - by rapsyncfox
Usage:
  node anichin.js --home
  node anichin.js --search "<query>"
  node anichin.js --detail <slug>
  node anichin.js --stream <slug> [episode]
`);
        process.exit(0);
    }

    try {
        if (args.includes('--home')) {
            const data = await getHome();
            console.log(JSON.stringify(data, null, 2));
            return;
        }
        if (args.includes('--search')) {
            const q = args[args.indexOf('--search') + 1];
            if (!q) throw new Error('Query wajib diisi: --search "<query>"');
            const data = await search(q);
            console.log(JSON.stringify(data, null, 2));
            return;
        }
        if (args.includes('--detail')) {
            const s = args[args.indexOf('--detail') + 1];
            if (!s) throw new Error('Slug wajib diisi: --detail <slug>');
            const data = await getDetail(s);
            console.log(JSON.stringify(data, null, 2));
            return;
        }
        if (args.includes('--stream')) {
            const s = args[args.indexOf('--stream') + 1];
            if (!s) throw new Error('Slug wajib diisi: --stream <slug> [episode]');
            const ep = args[args.indexOf('--stream') + 2] ? parseInt(args[args.indexOf('--stream') + 2], 10) : 1;
            const data = await getStream(s, ep);
            console.log(JSON.stringify(data, null, 2));
            return;
        }
        throw new Error(`Argumen tidak dikenali: ${args.join(' ')}`);
    } catch (e) {
        console.error(JSON.stringify({ error: true, message: e.message }, null, 2));
        process.exit(1);
    }
}

if (require.main === module) main();
module.exports = { credit: 'rapsyncfox', getHome, search, getDetail, getStream };
