"""The side panel's voice: one local narrator for every Claude Code session on this computer.

Kokoro (free, offline, natural) makes the speech; Windows plays it with winsound, macOS with afplay.
Runs on http://127.0.0.1:4271 (only this computer can reach it):
  POST /say     {"text": "...", "title": "...", "from": "folder", "voice": "am_michael", "mode": "now" | "queue"}
  POST /toggle  /pause  /resume  /stop  /again (this sentence)  /back  /next  /repeat (from the top)
  POST /speed   {"delta": 0.1} or {"value": 1.2}
  POST /quit
  GET  /state
"queue" adds a card after what is playing (another session's card never cuts in).
Exits by itself after an hour without use. Started by the panel on first use:
  python -I narrator.py --home <folder with the model files> [--port 4271] [--speed 1.0]
Try a voice once and exit:
  python -I narrator.py --home <folder> --sample "Hello there." --voice af_heart
"""
import argparse
import glob
import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

IS_WINDOWS = sys.platform == 'win32'
if IS_WINDOWS:
    import winsound

ap = argparse.ArgumentParser()
ap.add_argument('--home', required=True)
ap.add_argument('--port', type=int, default=4271)
ap.add_argument('--speed', type=float, default=1.0)
ap.add_argument('--voice', default='am_michael')
ap.add_argument('--sample', default=None)
args = ap.parse_args()

IDLE_EXIT = 3600
TMP = os.path.join(tempfile.gettempdir(), 'side-panel-voice')
os.makedirs(TMP, exist_ok=True)

lock = threading.Condition()
st = {'title': '', 'source': '', 'sentences': [], 'idx': 0, 'status': 'idle', 'speed': max(0.6, min(2.0, args.speed)),
      'voice': args.voice, 'gen': 0, 'touched': time.time()}
cache = {}  # (text, voice, speed) -> (path, seconds)
kokoro = None
kokoro_lock = threading.Lock()
wake = threading.Event()
playing = {'proc': None}


def model_files():
    models = sorted(glob.glob(os.path.join(args.home, 'kokoro*.onnx')), key=os.path.getsize, reverse=True)
    voices = os.path.join(args.home, 'voices-v1.0.bin')
    if not models or not os.path.exists(voices):
        raise RuntimeError(f'the voice files are missing in {args.home}')
    return models[0], voices


def table_row(m):
    # A table row is read as a sentence: "First cell: second, third." Divider rows are dropped.
    cells = [c.strip() for c in m.group(0).strip().strip('|').split('|')]
    cells = [c for c in cells if c]
    if not cells or all(re.fullmatch(r':?-{2,}:?', c) for c in cells):
        return ''
    return cells[0] + (': ' + ', '.join(cells[1:]) if len(cells) > 1 else '') + '.'


def speakable(text):
    t = re.sub(r'```.*?```', ' There is a code block here. ', text, flags=re.S)
    t = re.sub(r'^[ \t]*\|.*\|[ \t]*\r?\n(?=[ \t]*\|[ \t:|-]*-{2,})', '', t, flags=re.M)  # header row
    t = re.sub(r'^\s*\|.*\|\s*$', table_row, t, flags=re.M)
    t = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', t)
    t = re.sub(r'https?://\S+', 'a link', t)
    t = re.sub(r'`([^`]*)`', r'\1', t)
    t = re.sub(r'(?<!\S)(?:[A-Za-z]:)?(?:[^\s\\/,;()]*[\\/]){2,}([^\\/\s,;()]+)', r'\1', t)  # a path -> its file name
    t = re.sub(r'^\s*#+\s*', '', t, flags=re.M)
    t = re.sub(r'^\s*(?:[-*•]|\d+\.)\s+', '', t, flags=re.M)
    t = t.replace('→', ' to ').replace('·', ',').replace('&', ' and ')
    t = re.sub(r'[*_~>#]', '', t)
    t = re.sub(r'[\U0001F000-\U0001FFFF☀-➿←-⇿⬀-⯿]', '', t)
    return t


def split(text):
    out = []
    for line in speakable(text).split('\n'):
        line = line.strip()
        if not line:
            continue
        if not re.search(r'[.!?:]$', line):
            line += '.'
        for s in re.split(r'(?<=[.!?])\s+(?=[A-Z0-9"\'(])', line):
            s = s.strip()
            while len(s) > 300:  # a very long sentence: cut at a comma near the middle
                cut = s.rfind(',', 0, 300)
                cut = cut if cut > 80 else 300
                out.append(s[:cut + 1].strip())
                s = s[cut + 1:].strip()
            if re.search(r'\w', s):
                out.append(s)
    return out


def synth(text, voice, speed):
    key = (text, voice, round(speed, 2))
    if key in cache:
        return cache[key]
    global kokoro
    with kokoro_lock:
        if kokoro is None:
            from kokoro_onnx import Kokoro
            kokoro = Kokoro(*model_files())
        samples, rate = kokoro.create(text, voice=voice, speed=speed, lang='en-gb' if voice[:1] == 'b' else 'en-us')[:2]
    import soundfile as sf
    path = os.path.join(TMP, f'{abs(hash(key))}.wav')
    sf.write(path, samples, rate)
    if len(cache) > 300:
        cache.clear()
    cache[key] = (path, len(samples) / rate)
    return cache[key]


def play(path):
    if IS_WINDOWS:
        winsound.PlaySound(path, winsound.SND_FILENAME | winsound.SND_ASYNC | winsound.SND_NODEFAULT)
    else:
        playing['proc'] = subprocess.Popen(['afplay', path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def stop_sound():
    if IS_WINDOWS:
        winsound.PlaySound(None, 0)
    elif playing['proc'] is not None:
        try:
            playing['proc'].terminate()
        except Exception:
            pass
        playing['proc'] = None


def prefetch():
    while True:
        with lock:
            lock.wait(timeout=1)
            todo = [(s, st['voice'], st['speed']) for s in st['sentences'][st['idx']:st['idx'] + 3]]
        for text, voice, speed in todo:
            try:
                synth(text, voice, speed)
            except Exception:
                pass


def player():
    while True:
        with lock:
            while st['status'] != 'playing' or st['idx'] >= len(st['sentences']):
                if st['status'] == 'playing':
                    st['status'] = 'done'
                lock.wait(timeout=1)
            gen, idx, text, voice, speed = st['gen'], st['idx'], st['sentences'][st['idx']], st['voice'], st['speed']
        try:
            path, secs = synth(text, voice, speed)
        except Exception as e:
            with lock:
                st['status'], st['title'] = 'error', f'voice failed: {e}'
            continue
        with lock:
            if gen != st['gen'] or st['status'] != 'playing':
                continue
        wake.clear()
        play(path)
        if wake.wait(timeout=secs + 0.15):
            stop_sound()
            continue
        with lock:
            if gen == st['gen'] and st['idx'] == idx and st['status'] == 'playing':
                st['idx'] += 1
                lock.notify_all()


def act(path, body):
    with lock:
        st['touched'] = time.time()
        n = len(st['sentences'])
        if path == '/quit':
            os._exit(0)
        if path == '/say' and isinstance(body.get('voice'), str) and re.fullmatch(r'[a-z]{2}_[a-z]+', body['voice']):
            st['voice'] = body['voice']
        if path == '/say' and body.get('mode') == 'queue' and st['status'] == 'playing':
            who = str(body.get('from', ''))
            st['sentences'] += ([f'Next, from {who}.'] if who else []) + split(str(body.get('text', '')))[:100]
            lock.notify_all()
            return state()
        if path == '/say':
            st['sentences'] = split(str(body.get('text', '')))[:400]
            st['title'] = str(body.get('title', ''))[:120]
            st['source'] = str(body.get('from', ''))[:60]
            st['idx'], st['status'] = 0, 'playing' if st['sentences'] else 'idle'
        elif path == '/pause' or (path == '/toggle' and st['status'] == 'playing'):
            if st['status'] == 'playing':
                st['status'] = 'paused'
        elif path in ('/resume', '/toggle'):
            if st['status'] in ('paused', 'done', 'stopped') and n:
                if st['idx'] >= n:
                    st['idx'] = 0
                st['status'] = 'playing'
        elif path == '/stop':
            st['status'] = 'stopped'
        elif path == '/again':
            st['status'] = 'playing' if n else st['status']
            st['idx'] = min(st['idx'], max(n - 1, 0))
        elif path == '/back':
            st['idx'] = max(0, min(st['idx'], n) - 1)
            st['status'] = 'playing' if n else st['status']
        elif path == '/next':
            st['idx'] = min(n, st['idx'] + 1)
        elif path == '/repeat':
            st['idx'], st['status'] = 0, 'playing' if n else st['status']
        elif path == '/speed':
            v = body.get('value')
            v = float(v) if v is not None else st['speed'] + float(body.get('delta', 0))
            st['speed'] = max(0.6, min(2.0, round(v, 2)))
        else:
            return None
        st['gen'] += 1
        wake.set()
        lock.notify_all()
        return state()


def state():
    n, i = len(st['sentences']), st['idx']
    return {'status': st['status'], 'title': st['title'], 'from': st['source'], 'idx': min(i + 1, n), 'total': n,
            'sentence': st['sentences'][i] if i < n else '', 'speed': st['speed'], 'voice': st['voice']}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def reply(self, obj, code=200):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        with lock:
            self.reply(state())

    def do_POST(self):
        # Only callers on this computer: Claude Code and scripts send no Origin; a web page always does.
        if self.headers.get('Origin') not in (None, 'null'):
            self.reply({'error': 'not allowed'}, 403)
            return
        try:
            raw = self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}'
            out = act(self.path, json.loads(raw))
            self.reply(out if out is not None else {'error': 'unknown'}, 200 if out is not None else 404)
        except Exception as e:
            self.reply({'error': str(e)}, 400)


def idle_watch():
    while True:
        time.sleep(60)
        with lock:
            if st['status'] != 'playing' and time.time() - st['touched'] > IDLE_EXIT:
                os._exit(0)


if __name__ == '__main__':
    if args.sample is not None:
        path, secs = synth(args.sample, args.voice, st['speed'])
        if IS_WINDOWS:
            winsound.PlaySound(path, winsound.SND_FILENAME)
        else:
            subprocess.run(['afplay', path])
        sys.exit(0)
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)  # fails if one already runs: fine
    for fn in (prefetch, player, idle_watch):
        threading.Thread(target=fn, daemon=True).start()
    server.serve_forever()
