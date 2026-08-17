"""Video analysis worker: metadata + transcript (subtitle or ASR) + frames.

Usage: python worker.py <url> <outdir> <opts-json>
Prints one JSON document to stdout: {ok, meta?, transcript?, frames?, warnings?, error?}

Platform strategy:
- Bilibili/YouTube/generic: yt-dlp (metadata, subtitles, audio/video download).
- Douyin: yt-dlp fails without a_bogus signatures, so we fall back to a
  headless-Chrome CDP harvest that intercepts the page's own signed API
  responses and extracts the aweme_detail JSON (desc/author/stats/playAddr).
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.request

# Windows pipes default to the locale codec (GBK); force UTF-8 so the host
# side can JSON.parse the output and non-ASCII text survives intact.
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding='utf-8')
    except Exception:  # noqa: BLE001
        pass

try:
    import yt_dlp
except Exception as e:  # noqa: BLE001
    print(json.dumps({'ok': False, 'error': 'yt_dlp not installed: %s' % e}, ensure_ascii=False))
    sys.exit(0)


def log(msg):
    sys.stderr.write('[worker] %s\n' % msg)
    sys.stderr.flush()


class YtDlpLogger:
    """Keep yt-dlp diagnostics off stdout: stdout is a one-document JSON IPC channel."""

    def debug(self, msg):
        if msg and not msg.startswith('[debug] '):
            log(msg)

    def info(self, msg):
        log(msg)

    def warning(self, msg):
        log('warning: %s' % msg)

    def error(self, msg):
        log('error: %s' % msg)


def parse_subtitle_file(path):
    """Strip timestamps/tags from an srt/vtt file, return plain text."""
    try:
        with open(path, 'r', encoding='utf-8', errors='replace') as fh:
            raw = fh.read()
    except Exception as e:  # noqa: BLE001
        return None, 'read failed: %s' % e
    raw = re.sub(r'<[^>]+>', '', raw)
    lines = []
    for ln in raw.splitlines():
        ln = ln.strip()
        if not ln:
            continue
        if re.match(r'^\d+$', ln):  # srt index
            continue
        if '-->' in ln:  # timing
            continue
        if ln.startswith(('WEBVTT', 'Kind:', 'Language:', 'NOTE')):
            continue
        lines.append(ln)
    text = '\n'.join(lines)
    return text, None


def pick_langs(pref):
    base = ['zh', 'zh-Hans', 'zh-CN', 'zh-TW', 'en', 'en-US', 'en-GB']
    if pref and pref not in base:
        base.insert(0, pref)
    seen, out = set(), []
    for lang in base:
        if lang not in seen:
            seen.add(lang)
            out.append(lang)
    return out


def extract_meta(info, source_url=None):
    def clean(v):
        if isinstance(v, str):
            return v.strip()[:4000]
        return v
    title = clean(info.get('title'))
    if not title:
        title = source_url or '未命名视频'
    return {
        'title': title,
        'uploader': clean(info.get('uploader')),
        'uploader_id': clean(info.get('uploader_id')),
        'extractor': info.get('extractor'),
        'webpage_url': info.get('webpage_url'),
        'duration': info.get('duration'),
        'view_count': info.get('view_count'),
        'like_count': info.get('like_count'),
        'upload_date': info.get('upload_date'),
        'description': clean(info.get('description')),
        'thumbnail': info.get('thumbnail'),
    }


def get_info(url, extra_opts=None, cookies_browser=None, cookies_file=None, proxy=None):
    opts = base_opts(cookies_browser, cookies_file, proxy)
    opts.update(platform_extra_opts(url, proxy))
    if extra_opts:
        opts.update(extra_opts)
    with yt_dlp.YoutubeDL(opts) as ydl:
        return ydl.extract_info(url, download=False)


def base_opts(cookies_browser=None, cookies_file=None, proxy=None):
    opts = {
        'quiet': True,
        'no_warnings': True,
        'noprogress': True,
        'logger': YtDlpLogger(),
        'noplaylist': True,
        'retries': 3,
        'fragment_retries': 3,
        'socket_timeout': 30,
    }
    if cookies_browser:
        opts['cookiesfrombrowser'] = (cookies_browser,)
    if cookies_file:
        opts['cookiefile'] = cookies_file
    if proxy:
        opts['proxy'] = proxy
    return opts


def configured_cookie_options(opts):
    """Read optional cookie sources without ever logging their contents.

    Browser name is intentionally explicit (edge/chrome/firefox); a cookie
    file must be supplied by the user through an environment variable.
    """
    browser = opts.get('cookies_browser') or os.environ.get('LOOKLOOK_COOKIES_BROWSER')
    cookie_file = opts.get('cookies_file') or os.environ.get('LOOKLOOK_COOKIES_FILE')
    return browser or None, cookie_file or None


def platform_extra_opts(url, proxy=None):
    """Per-platform yt-dlp extraction tweaks.

    YouTube blocks the default web client for bot-detected IPs; the android /
    tv_embedded / android_vr player clients usually bypass the login wall.
    A list in extractor_args makes yt-dlp try clients in order until one works.
    """
    if 'youtube.com' in url or 'youtu.be' in url:
        return {'extractor_args': {
            'youtube': {'player_client': ['android', 'tv_embedded', 'android_vr', 'web_embedded']},
        }}
    return {}


def download_subs(url, outdir, langs, cookies_browser=None, cookies_file=None, proxy=None):
    opts = dict(base_opts(cookies_browser, cookies_file, proxy))
    opts.update(platform_extra_opts(url, proxy))
    opts.update({
        'skip_download': True,
        'writesubtitles': True,
        'writeautomaticsub': True,
        'subtitleslangs': langs,
        'subtitlesformat': 'srt/vtt/best',
        'outtmpl': os.path.join(outdir, '%(id)s.%(ext)s'),
    })
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])
    found = []
    for fn in sorted(os.listdir(outdir)):
        if fn.lower().endswith(('.srt', '.vtt')):
            found.append(os.path.join(outdir, fn))
    return found


def download_audio(url, outdir, cookies_browser=None, cookies_file=None, proxy=None):
    opts = dict(base_opts(cookies_browser, cookies_file, proxy))
    opts.update(platform_extra_opts(url, proxy))
    opts.update({
        'format': 'bestaudio/best',
        'outtmpl': os.path.join(outdir, '%(id)s_audio.%(ext)s'),
        'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '128'}],
        'http_headers': {'Referer': 'https://www.bilibili.com/'},
    })
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])
    for fn in sorted(os.listdir(outdir)):
        if fn.endswith('.mp3'):
            return os.path.join(outdir, fn)
    return None


def download_video(url, outdir, cookies_browser=None, cookies_file=None, proxy=None):
    opts = dict(base_opts(cookies_browser, cookies_file, proxy))
    opts.update(platform_extra_opts(url, proxy))
    opts.update({
        'format': 'bv*+ba/b',
        'merge_output_format': 'mp4',
        'outtmpl': os.path.join(outdir, '%(id)s_video.%(ext)s'),
        'http_headers': {'Referer': 'https://www.bilibili.com/'},
    })
    with yt_dlp.YoutubeDL(opts) as ydl:
        ydl.download([url])
    for fn in sorted(os.listdir(outdir)):
        if fn.lower().endswith(('.mp4', '.mkv', '.webm', '.mov', '.flv')):
            return os.path.join(outdir, fn)
    return None


def detect_scenes(video_path, threshold=0.3, max_points=40):
    """Detect scene-change timestamps via ffmpeg's scene filter.

    Returns a sorted list of scene-boundary times (seconds). Each boundary is
    a frame where the scene metric exceeded the threshold (i.e. a new shot).
    """
    cmd = ['ffmpeg', '-i', video_path, '-vf',
           "select='gt(scene,%f)',showinfo" % threshold,
           '-vsync', 'vfr', '-f', 'null', '-']
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except Exception:  # noqa: BLE001
        return []
    times = []
    for m in re.finditer(r'pts_time:([0-9.]+)', out.stderr):
        t = float(m.group(1))
        if t > 0.05:
            times.append(round(t, 2))
    # Deduplicate near-identical boundaries and cap the count.
    dedup = []
    for t in times:
        if not dedup or t - dedup[-1] > 0.5:
            dedup.append(t)
    return dedup[:max_points]


def extract_frames(video_path, outdir, duration, count, scenes=None):
    """Extract frames at the given shot boundaries (or evenly if no scenes).

    Scene-driven: one frame per detected shot, plus interior fillers inside
    long shots so long slow scenes are not starved. The total never exceeds
    `count` (the host-side cap). Falls back to even sampling when scene
    detection produced nothing (static video).
    """
    if not count or count < 1:
        return []
    frames_dir = os.path.join(outdir, 'frames')
    os.makedirs(frames_dir, exist_ok=True)
    dur = float(duration) if duration else 60.0
    if dur < 1:
        dur = 60.0

    if scenes:
        # One frame per shot boundary.
        times = list(scenes)
        # Fill inside long shots: any gap > 15s gets an interior sample.
        filled = []
        prev = 0.0
        for t in times:
            if t - prev > 15:
                mid = round((prev + t) / 2, 2)
                if 0 < mid < dur:
                    filled.append(mid)
            filled.append(t)
            prev = t
        if dur - prev > 15:
            filled.append(round((prev + dur) / 2, 2))
        times = sorted(set(round(t, 2) for t in filled if 0 < t < dur))
    else:
        # Even sampling fallback.
        step = dur / (count + 1)
        times = [round(step * i, 2) for i in range(1, count + 1) if step * i < dur]

    # Enforce the cap, keeping the first `count` samples (evenly representative).
    if len(times) > count:
        idx = [round(i * (len(times) - 1) / (count - 1)) for i in range(count)]
        times = [times[i] for i in idx]

    paths = []
    for i, t in enumerate(times, 1):
        out = os.path.join(frames_dir, 'f%03d.jpg' % i)
        cmd = ['ffmpeg', '-y', '-ss', '%.2f' % t, '-i', video_path,
               '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '3', out]
        try:
            subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60, check=False)
        except Exception:  # noqa: BLE001
            continue
        if os.path.exists(out) and os.path.getsize(out) > 0:
            paths.append({'time': round(t, 2), 'path': out})
    return paths


# ---------------------------------------------------------------------------
# Douyin: CDP harvest of the page's own signed API responses.
# ---------------------------------------------------------------------------

CHROME_CANDIDATES = [
    # Windows
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe'),
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe'),
    # Linux
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/microsoft-edge',
]


def find_chrome():
    for p in CHROME_CANDIDATES:
        if os.path.exists(p):
            return p
    return None


def cdp_harvest_douyin(url, port=0, profile_root=None, proxy=None):
    """Open the Douyin page headlessly and intercept its signed API responses.

    Returns the aweme_detail dict, or raises with a diagnostic message.
    """
    try:
        import websocket
    except Exception as e:  # noqa: BLE001
        raise RuntimeError('websocket-client not installed: %s' % e)
    chrome = find_chrome()
    if not chrome:
        raise RuntimeError('no Chrome/Edge executable found for CDP harvest')
    import random
    port = port or random.randint(9500, 9800)
    profile = profile_root or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cdp-profile')
    os.makedirs(profile, exist_ok=True)
    argv = [chrome, '--headless=new', '--disable-gpu', '--no-sandbox',
            '--disable-dev-shm-usage', '--remote-allow-origins=*',
            '--mute-audio',
            '--remote-debugging-port=%d' % port,
            '--user-data-dir=%s' % profile]
    if proxy:
        argv.append('--proxy-server=%s' % proxy)
    argv.append('about:blank')
    proc = subprocess.Popen(
        argv,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    ws = None
    try:
        # wait for CDP endpoint
        ws_url = None
        for _ in range(60):
            try:
                with urllib.request.urlopen('http://127.0.0.1:%d/json' % port, timeout=2) as r:
                    tabs = json.loads(r.read().decode('utf-8', errors='replace'))
                pages = [t for t in tabs if t.get('type') == 'page']
                if pages:
                    ws_url = pages[0]['webSocketDebuggerUrl']
                    break
            except Exception:  # noqa: BLE001
                pass
            time.sleep(0.5)
        if not ws_url:
            raise RuntimeError('CDP endpoint not ready')

        ws = websocket.create_connection(ws_url, timeout=30)

        def send(method, params=None, _id=[0]):
            _id[0] += 1
            ws.send(json.dumps({'id': _id[0], 'method': method, 'params': params or {}}))
            while True:
                msg = json.loads(ws.recv())
                if msg.get('id') == _id[0]:
                    return msg

        send('Network.enable')
        send('Page.enable')
        send('Page.navigate', {'url': url})

        captured = {}
        deadline = time.time() + 30
        ws.settimeout(0.5)
        try:
            while time.time() < deadline:
                try:
                    msg = json.loads(ws.recv())
                except Exception:  # noqa: BLE001 (timeout)
                    continue
                method = msg.get('method')
                if method == 'Network.responseReceived':
                    params = msg.get('params', {})
                    resp = params.get('response', {})
                    u = resp.get('url', '')
                    if 'aweme/detail' in u or 'aweme/related' in u:
                        captured[params.get('requestId')] = {'url': u, 'body': None}
                elif method == 'Network.loadingFinished':
                    rid = msg.get('params', {}).get('requestId')
                    if rid in captured and captured[rid]['body'] is None:
                        try:
                            b = send('Network.getResponseBody', {'requestId': rid})
                            body = b.get('result', {}).get('body', '')
                            if body:
                                captured[rid]['body'] = body
                        except Exception:  # noqa: BLE001
                            captured[rid]['body'] = None
        except Exception:  # noqa: BLE001
            pass

        detail = None
        for rid, cap in captured.items():
            body = cap.get('body')
            if not body:
                continue
            try:
                data = json.loads(body)
            except Exception:  # noqa: BLE001
                continue
            ad = data.get('aweme_detail')
            if ad:
                detail = ad
                break
        if detail is None:
            raise RuntimeError('douyin detail API returned no aweme_detail (anti-bot may block headless)')
        return detail
    finally:
        if ws:
            try:
                ws.close()
            except Exception:  # noqa: BLE001
                pass
        proc.kill()


def douyin_meta_from_detail(detail):
    author = detail.get('author') or {}
    stats = detail.get('statistics') or {}
    desc = detail.get('desc') or ''
    title = desc.split('\n')[0][:80] if desc else 'Douyin video'
    return {
        'title': title,
        'uploader': author.get('nickname'),
        'uploader_id': author.get('uid'),
        'extractor': 'Douyin (CDP)',
        'webpage_url': 'https://www.douyin.com/video/%s' % detail.get('aweme_id'),
        'duration': (detail.get('duration') or 0) / 1000.0,
        'view_count': stats.get('play_count'),
        'like_count': stats.get('digg_count'),
        'upload_date': time.strftime('%Y%m%d', time.localtime(detail.get('create_time') or time.time())),
        'description': desc[:4000],
        'thumbnail': ((detail.get('video') or {}).get('cover') or {}).get('url_list', [None])[0],
    }


def douyin_play_url(detail):
    """Best playable URL from aweme_detail (video element src or bit_rate play_addr)."""
    v = detail.get('video') or {}
    play = v.get('play_addr') or {}
    urls = play.get('url_list') or []
    if urls:
        return urls[0]
    bitrates = v.get('bit_rate') or []
    for br in bitrates:
        pa = (br.get('play_addr') or {}).get('url_list') or []
        if pa:
            return pa[0]
    da = v.get('download_addr') or {}
    urls = da.get('url_list') or []
    if urls:
        return urls[0]
    return None


def douyin_download(url, outdir, detail, proxy=None):
    """Download the video via the signed play URL (urllib, no yt-dlp)."""
    play = douyin_play_url(detail)
    if not play:
        raise RuntimeError('no playable URL found in douyin detail')
    ext = 'mp4'
    out = os.path.join(outdir, 'douyin_video.%s' % ext)
    req = urllib.request.Request(play, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
        'Referer': 'https://www.douyin.com/',
    })
    opener = urllib.request.build_opener()
    if proxy:
        proxy_handler = urllib.request.ProxyHandler({'http': proxy, 'https': proxy})
        opener = urllib.request.build_opener(proxy_handler)
    with opener.open(req, timeout=120) as r, open(out, 'wb') as fh:
        while True:
            chunk = r.read(1 << 16)
            if not chunk:
                break
            fh.write(chunk)
    return out


def normalize_douyin_url(url):
    """Normalize Douyin share/feed URLs to the canonical /video/<id> page.

    - https://www.douyin.com/jingxuan?modal_id=<id>  -> /video/<id>
    - https://www.iesdouyin.com/share/video/<id>     -> /video/<id>
    - https://v.douyin.com/<short>                   -> resolved by yt-dlp/CDP
    """
    if 'douyin.com' not in url and 'iesdouyin.com' not in url:
        return url
    m = re.search(r'modal_id=(\d+)', url)
    if m:
        return 'https://www.douyin.com/video/%s' % m.group(1)
    m = re.search(r'(?:share/)?video/(\d+)', url)
    if m:
        return 'https://www.douyin.com/video/%s' % m.group(1)
    m = re.search(r'/video/(\d+)', url)
    if m:
        return 'https://www.douyin.com/video/%s' % m.group(1)
    return url


def probe_local(path):
    """ffprobe a local video: duration, audio/subtitle presence, resolution."""
    info = {'duration': 0.0, 'has_audio': False, 'has_subtitles': False, 'width': 0, 'height': 0}
    try:
        out = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,width,height:format=duration',
             '-of', 'json', path],
            capture_output=True, text=True, timeout=30,
        )
        data = json.loads(out.stdout)
        streams = data.get('streams') or []
        for s in streams:
            ct = s.get('codec_type')
            if ct == 'video':
                info['width'] = int(s.get('width') or 0)
                info['height'] = int(s.get('height') or 0)
            elif ct == 'audio':
                info['has_audio'] = True
            elif ct == 'subtitle':
                info['has_subtitles'] = True
        fmt = data.get('format') or {}
        info['duration'] = float(fmt.get('duration') or 0)
    except Exception:  # noqa: BLE001
        pass
    return info


def extract_local_subtitles(path, outdir):
    """Export the first subtitle track of a local video to SRT, if present."""
    try:
        srt = os.path.join(outdir, 'local_subs.srt')
        r = subprocess.run(
            ['ffmpeg', '-y', '-i', path, '-map', '0:s:0', srt],
            capture_output=True, text=True, timeout=60,
        )
        if r.returncode != 0 or not os.path.exists(srt):
            return None
        with open(srt, 'r', encoding='utf-8', errors='replace') as fh:
            return fh.read()
    except Exception:  # noqa: BLE001
        return None


def analyze_local(path, outdir, result, opts, want_transcript, want_frames,
                  lang, max_chars, warnings):
    """Full pipeline for a LOCAL video file (uploaded to .uploads/):
    probe → embedded subtitles (cheapest) → else ASR → frames."""
    probe = probe_local(path)
    result['meta'] = {
        'title': os.path.basename(path),
        'source': 'local-file',
        'path': path,
        'duration': probe['duration'],
        'width': probe['width'],
        'height': probe['height'],
    }
    if not os.path.getsize(path):
        result['ok'] = False
        result['error'] = 'video file is empty'
        return

    transcript = None
    if want_transcript:
        # 1) Embedded subtitle track first (zero cost, most accurate).
        if probe['has_subtitles']:
            srt = extract_local_subtitles(path, outdir)
            if srt:
                text, err = parse_subtitle_file(outdir + os.sep + 'local_subs.srt')
                if text and text.strip():
                    transcript = {'source': 'subtitle', 'file': path, 'language': 'embedded',
                                  'text': text, 'segments': None}
        # 2) No usable subtitle: hand the audio to the host (capability-probed
        #    audio understanding / local ASR).
        if transcript is None and probe['has_audio']:
            result['audio_path'] = path
        elif transcript is None:
            warnings.append('no subtitles and no audio track')

    if transcript is not None:
        full_len = len(transcript.get('text') or '')
        if full_len > max_chars:
            transcript['text'] = (transcript.get('text') or '')[:max_chars]
            warnings.append('transcript truncated from %d to %d chars' % (full_len, max_chars))
    result['transcript'] = transcript

    # 3) Frames straight from the local file (scene-driven).
    if want_frames > 0:
        scenes = detect_scenes(path)
        result['scenes'] = scenes
        result['frames'] = extract_frames(path, outdir, probe['duration'], want_frames, scenes=scenes)
        result['video_path'] = path


def main():
    raw_input = sys.argv[1]
    # Local file path vs remote URL: a path that exists on disk (and does not
    # look like a URL) skips download and runs the subtitle/ASR/frames
    # pipeline on the file itself.
    local_path = None
    if os.path.exists(raw_input) and not raw_input.startswith(('http://', 'https://')):
        local_path = raw_input
    url = raw_input if local_path is None else normalize_douyin_url(raw_input)
    outdir = sys.argv[2]
    try:
        opts = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
    except Exception:  # noqa: BLE001
        opts = {}
    os.makedirs(outdir, exist_ok=True)

    want_transcript = opts.get('transcript', True)
    want_frames = int(opts.get('frames', 0) or 0)
    lang = opts.get('lang', 'zh')
    cookies_browser, cookies_file = configured_cookie_options(opts)
    proxy = opts.get('proxy') or None
    max_chars = int(opts.get('max_chars', 20000) or 20000)
    warnings = []
    result = {'ok': True, 'warnings': warnings}

    if local_path is not None:
        analyze_local(local_path, outdir, result, opts, want_transcript, want_frames,
                      lang, max_chars, warnings)
        print(json.dumps(result, ensure_ascii=False))
        return

    is_douyin = 'douyin.com' in url or 'iesdouyin.com' in url

    # ---- metadata ----
    info = None
    detail = None
    if is_douyin:
        try:
            detail = cdp_harvest_douyin(url, proxy=proxy)
            result['meta'] = douyin_meta_from_detail(detail)
        except Exception as e:  # noqa: BLE001
            result['ok'] = False
            message = str(e)
            if 'anti-bot' in message or 'no aweme_detail' in message:
                message += '；抖音阻止了无头浏览器，请在本机浏览器完成登录或稍后重试'
            result['error'] = 'douyin metadata extraction failed: %s' % message
            print(json.dumps(result, ensure_ascii=False))
            return
    else:
        try:
            info = get_info(url, cookies_browser=cookies_browser, cookies_file=cookies_file, proxy=proxy)
            result['meta'] = extract_meta(info, url)
        except Exception as e:  # noqa: BLE001
            result['ok'] = False
            result['error'] = 'metadata extraction failed: %s' % e
            print(json.dumps(result, ensure_ascii=False))
            return

    if not want_transcript:
        print(json.dumps(result, ensure_ascii=False))
        return

    # ---- transcript: subtitles first; else leave audio for the host ASR ----
    # The host (looklook_see tool) owns speech-to-text: it calls an
    # OpenAI-compatible /v1/audio/transcriptions endpoint with the audio file
    # this worker prepares. Subtitles (platform or embedded) are still
    # extracted here because they are free and more accurate than ASR.
    langs = pick_langs(lang)
    transcript = None
    sub_files = []
    if is_douyin:
        warnings.append('douyin has no downloadable subtitles; ASR on host side')
    else:
        try:
            sub_files = download_subs(url, outdir, langs, cookies_browser, cookies_file, proxy)
        except Exception as e:  # noqa: BLE001
            warnings.append('subtitle download failed: %s' % e)

    for sf in sub_files:
        text, err = parse_subtitle_file(sf)
        if text and text.strip():
            transcript = {'source': 'subtitle', 'file': sf, 'language': os.path.basename(sf), 'text': text, 'segments': None}
            break

    if transcript is None:
        audio_path = None
        if is_douyin and detail:
            try:
                video_file = douyin_download(url, outdir, detail, proxy)
                audio_path = video_file
                result['video_path'] = video_file
            except Exception as e:  # noqa: BLE001
                warnings.append('douyin download failed: %s' % e)
        else:
            try:
                audio_path = download_audio(url, outdir, cookies_browser, cookies_file, proxy)
            except Exception as e:  # noqa: BLE001
                warnings.append('audio download failed: %s' % e)
        if audio_path:
            # Host-side ASR turns this into the transcript.
            result['audio_path'] = audio_path
        else:
            warnings.append('no subtitles and no audio available')

    if transcript is not None:
        full_len = len(transcript.get('text') or '')
        if full_len > max_chars:
            transcript['text'] = (transcript.get('text') or '')[:max_chars]
            warnings.append('transcript truncated from %d to %d chars' % (full_len, max_chars))

    result['transcript'] = transcript

    # ---- frames ----
    if want_frames > 0:
        video_path = None
        if is_douyin and detail:
            try:
                if not result.get('video_path'):
                    video_path = douyin_download(url, outdir, detail, proxy)
                else:
                    video_path = result['video_path']
            except Exception as e:  # noqa: BLE001
                warnings.append('douyin video download failed: %s' % e)
        else:
            try:
                video_path = download_video(url, outdir, cookies_browser, cookies_file, proxy)
            except Exception as e:  # noqa: BLE001
                warnings.append('video download failed: %s' % e)
        if video_path:
            duration = (detail or {}).get('duration', 0) / 1000.0 if is_douyin else info.get('duration')
            scenes = detect_scenes(video_path)
            result['scenes'] = scenes
            result['frames'] = extract_frames(video_path, outdir, duration, want_frames, scenes=scenes)
            result['video_path'] = video_path
        else:
            warnings.append('no video available for frames')

    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
