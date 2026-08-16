"""CDP cookie export for any site (YouTube/Douyin/...): open the URL
headlessly, wait, dump cookies as Netscape cookies.txt."""
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
    host = url.split('/')[2].replace('www.', '')
    port = 9888
    profile = r'D:\AICODE\DeepSeekharness\video-worker\cookie-profile'
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'site_cookies.txt')
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
        send('Page.navigate', {'url': url})
        time.sleep(12)
        resp = send('Network.getAllCookies')
        cookies = resp.get('result', {}).get('cookies', [])
        lines = ['# Netscape HTTP Cookie File']
        for c in cookies:
            domain = c.get('domain', '')
            name = c.get('name', '')
            if not domain or not name:
                continue
            if host.replace('.com', '') not in domain and host.replace('.com', '') not in domain.replace('.youtube', 'youtube') and 'youtube' not in domain and 'google' not in domain:
                pass  # keep all; yt-dlp scopes them
            domain_specified = domain.startswith('.')
            secure = 'TRUE' if c.get('secure') else 'FALSE'
            path = c.get('path', '/')
            exp = c.get('expires')
            if exp is None or exp <= 0:
                exp = 0
            value = c.get('value', '')
            lines.append(f'{domain}\t{"TRUE" if domain_specified else "FALSE"}\t{path}\t{secure}\t{int(exp)}\t{name}\t{value}')
        with open(out, 'w', encoding='utf-8') as fh:
            fh.write('\n'.join(lines))
        names = [c.get('name') for c in cookies]
        print('COOKIES:', len(cookies), '->', out)
        print('NAMES:', names)
    finally:
        if ws:
            try:
                ws.close()
            except Exception:
                pass
        proc.kill()


if __name__ == '__main__':
    main()
