"""CDP harvest for YouTube: open the video/shorts page headlessly, read the
embedded ytInitialPlayerResponse / ytInitialData, and dump the video detail
plus caption track URLs. Everything goes through the optional proxy."""
import json
import os
import subprocess
import sys
import time
import urllib.request

import websocket

CHROME_CANDIDATES = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    os.path.expandvars(r'%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe'),
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe'),
]


def find_chrome():
    for p in CHROME_CANDIDATES:
        if os.path.exists(p):
            return p
    return None


def main():
    url = sys.argv[1]
    proxy = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None
    port = 9777
    profile = r'D:\AICODE\DeepSeekharness\video-worker\yt-profile'
    out = r'D:\AICODE\DeepSeekharness\video-worker\yt_state.json'
    chrome = find_chrome()
    os.makedirs(profile, exist_ok=True)
    argv = [chrome, '--headless=new', '--disable-gpu', '--no-sandbox',
            '--disable-dev-shm-usage', '--remote-allow-origins=*',
            '--mute-audio', '--remote-debugging-port=%d' % port,
            '--user-data-dir=%s' % profile]
    if proxy:
        argv.append('--proxy-server=%s' % proxy)
    argv.append('about:blank')
    proc = subprocess.Popen(argv, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws = None
    try:
        ws_url = None
        for _ in range(60):
            try:
                with urllib.request.urlopen('http://127.0.0.1:%d/json' % port, timeout=2) as r:
                    tabs = json.loads(r.read().decode('utf-8', errors='replace'))
                pages = [t for t in tabs if t.get('type') == 'page']
                if pages:
                    ws_url = pages[0]['webSocketDebuggerUrl']
                    break
            except Exception:
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
        send('Runtime.enable')
        send('Page.navigate', {'url': url})
        time.sleep(12)

        expr = r'''(async () => {
          const out = {};
          out.url = location.href;
          out.title = document.title;
          for (const k of ['ytInitialPlayerResponse', 'ytInitialData', 'playerResponse', 'ytplayer']) {
            try { out[k] = window[k] || null } catch (e) { out[k] = 'ERR' }
          }
          // fallback: search all scripts for embedded player response JSON
          const blobs = [];
          for (const s of document.querySelectorAll('script')) {
            const t = (s.textContent || '').trim();
            if (t.includes('ytInitialPlayerResponse') || t.includes('"playabilityStatus"')) {
              blobs.push(t.slice(0, 800000));
            }
          }
          out.scriptBlobs = blobs;
          const vids = [];
          for (const v of document.querySelectorAll('video')) {
            vids.push({ src: v.src || '', currentSrc: v.currentSrc || '' });
          }
          out.videos = vids;
          out.metaDesc = (document.querySelector('meta[name="description"]') || {}).content || '';
          out.ogTitle = (document.querySelector('meta[property="og:title"]') || {}).content || '';
          return out;
        })()'''
        resp = send('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True})
        val = resp.get('result', {}).get('result', {}).get('value')
        with open(out, 'w', encoding='utf-8') as fh:
            json.dump(val, fh, ensure_ascii=False, indent=1)
        print('url:', (val or {}).get('url'))
        print('title:', (val or {}).get('title'))
        print('has ytInitialPlayerResponse:', bool((val or {}).get('ytInitialPlayerResponse')))
        print('has ytInitialData:', bool((val or {}).get('ytInitialData')))
        print('scriptBlobs:', len((val or {}).get('scriptBlobs') or []))
        print('videos:', (val or {}).get('videos'))
        print('ogTitle:', (val or {}).get('ogTitle'))
    finally:
        if ws:
            try:
                ws.close()
            except Exception:
                pass
        proc.kill()


if __name__ == '__main__':
    main()
