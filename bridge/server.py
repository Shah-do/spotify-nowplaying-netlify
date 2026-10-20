#!/usr/bin/env python3
"""Read-only bridge: the Tautulli API key stays in this server's environment."""
import json, os, random, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TAUTULLI_URL = os.environ.get("TAUTULLI_URL", "").rstrip("/")
TAUTULLI_API_KEY = os.environ.get("TAUTULLI_API_KEY", "")
PLEX_URL = os.environ.get("PLEX_URL", "").rstrip("/")
PLEX_TOKEN = os.environ.get("PLEX_TOKEN", "")
PORT = int(os.environ.get("PORT", "8787"))
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "https://shah-do.github.io")

def fetch_json(url):
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "NowPlaying-Bridge/1.0"})
    with urllib.request.urlopen(request, timeout=8) as response:
        return json.loads(response.read().decode("utf-8"))

def tautulli(command, **params):
    if not TAUTULLI_URL or not TAUTULLI_API_KEY:
        raise RuntimeError("Set TAUTULLI_URL and TAUTULLI_API_KEY in the bridge environment.")
    query = urllib.parse.urlencode({"apikey": TAUTULLI_API_KEY, "cmd": command, **params})
    data = fetch_json(f"{TAUTULLI_URL}/api/v2?{query}")
    response = data.get("response", {})
    if response.get("result") != "success":
        raise RuntimeError(response.get("message", "Tautulli API request failed"))
    return response.get("data", {})

def plex_url(path):
    query = urllib.parse.urlencode({"X-Plex-Token": PLEX_TOKEN})
    return f"{PLEX_URL}{path}{'&' if '?' in path else '?'}{query}"

def image_url(path):
    if not path: return ""
    if path.startswith("http://") or path.startswith("https://"): return path
    return plex_url(path) if PLEX_URL and PLEX_TOKEN else ""

def normalized(session):
    state = (session.get("state") or "").lower()
    media = (session.get("media_type") or "").lower()
    return {
        "title": session.get("title") or session.get("full_title") or "Unknown title",
        "year": session.get("year"), "type": media, "state": state,
        "playing": state in ("playing", "buffering"), "paused": state == "paused",
        "duration": int(session.get("duration") or 0), "offset": int(session.get("view_offset") or 0),
        "thumb": image_url(session.get("thumb") or session.get("grandparent_thumb")),
        "backdrop": image_url(session.get("art") or session.get("grandparent_art") or session.get("thumb")),
        "director": session.get("directors") or session.get("director") or "",
        "genres": session.get("genres") or [], "show": session.get("grandparent_title") or "",
        "season": session.get("parent_media_index"), "episode": session.get("media_index"),
        "episode_title": session.get("title") or ""
    }

def status():
    data = tautulli("get_activity")
    sessions = data.get("sessions", []) if isinstance(data, dict) else []
    candidates = [normalized(s) for s in sessions if (s.get("media_type") or "").lower() in ("movie", "episode", "show")]
    active = next((s for s in candidates if s["playing"]), None)
    if active is None: active = next((s for s in candidates if s["paused"]), None)
    return {"ok": True, "active": active, "sessions": candidates}

def screensaver():
    if not PLEX_URL or not PLEX_TOKEN:
        return {"ok": True, "items": [], "note": "Set PLEX_URL and PLEX_TOKEN on the bridge to enable library backdrops."}
    url = plex_url("/library/sections?X-Plex-Container-Start=0")
    data = fetch_json(url)
    dirs = data.get("MediaContainer", {}).get("Directory", [])
    if isinstance(dirs, dict): dirs = [dirs]
    items = []
    for section in [d for d in dirs if d.get("type") == "movie"]:
        params = urllib.parse.urlencode({"X-Plex-Token": PLEX_TOKEN, "type": 1, "sort": "random", "limit": 80})
        library = fetch_json(f"{PLEX_URL}/library/sections/{section['key']}/all?{params}")
        entries = library.get("MediaContainer", {}).get("Metadata", [])
        if isinstance(entries, dict): entries = [entries]
        for movie in entries:
            backdrop = image_url(movie.get("art"))
            if backdrop: items.append({"title": movie.get("title", ""), "year": movie.get("year", ""), "backdrop": backdrop})
    random.shuffle(items)
    return {"ok": True, "items": items[:30]}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args): print(fmt % args)
    def send_json(self, code, payload):
        body = json.dumps(payload).encode()
        origin = self.headers.get("Origin", "")
        self.send_response(code)
        if origin == ALLOWED_ORIGIN or ALLOWED_ORIGIN == "*":
            self.send_header("Access-Control-Allow-Origin", origin or ALLOWED_ORIGIN)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def do_OPTIONS(self): self.send_json(204, {})
    def do_GET(self):
        try:
            path = urllib.parse.urlparse(self.path).path
            if path == "/health":
                self.send_json(200, {"ok": True, "configured": bool(TAUTULLI_URL and TAUTULLI_API_KEY)})
            elif path == "/api/status": self.send_json(200, status())
            elif path == "/api/screensaver": self.send_json(200, screensaver())
            else: self.send_json(404, {"ok": False, "error": "Not found"})
        except Exception as error: self.send_json(502, {"ok": False, "error": str(error)})

if __name__ == "__main__":
    print(f"NowPlaying bridge listening on port {PORT}")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
