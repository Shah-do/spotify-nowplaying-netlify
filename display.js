const CLIENT_KEY = "spotify_nowplaying_client_id";
const REDIRECT_URI = `${location.origin}/`;
const $ = id => document.getElementById(id);
let accessToken = localStorage.getItem("spotify_access_token");
let expiresAt = Number(localStorage.getItem("spotify_expires_at") || 0);
let trackKey = "";
let lyrics = [];
let startedAt = 0;
let progressMs = 0;
let durationMs = 0;
let paused = false;
let lastLyricsLookup = "";

function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
function showMessage(text) { $("message").textContent = text || ""; }
$("backBtn").addEventListener("click", () => location.href = "/");

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem("spotify_refresh_token");
  const clientId = localStorage.getItem(CLIENT_KEY);
  if (!refreshToken || !clientId) throw new Error("Please return to setup and connect Spotify.");
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: new URLSearchParams({client_id: clientId, grant_type: "refresh_token", refresh_token: refreshToken})
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.error || "Token refresh failed");
  accessToken = data.access_token;
  expiresAt = Date.now() + data.expires_in * 1000;
  localStorage.setItem("spotify_access_token", accessToken);
  localStorage.setItem("spotify_expires_at", String(expiresAt));
  if (data.refresh_token) localStorage.setItem("spotify_refresh_token", data.refresh_token);
}
async function api(url) {
  if (!accessToken || Date.now() > expiresAt - 60000) await refreshAccessToken();
  let response = await fetch(url, {headers: {Authorization: `Bearer ${accessToken}`}});
  if (response.status === 401) {
    await refreshAccessToken();
    response = await fetch(url, {headers: {Authorization: `Bearer ${accessToken}`}});
  }
  if (response.status === 204) return null;
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error?.message || `Spotify API returned ${response.status}`);
  }
  return response.json();
}
async function lookupLyrics(item) {
  const key = `${item.id}|${item.name}`;
  if (key === lastLyricsLookup) return;
  lastLyricsLookup = key;
  lyrics = [];
  $("lyrics").hidden = true;
  const artists = item.artists.map(a => a.name).join(", ");
  const url = `https://lrclib.net/api/get?${new URLSearchParams({
    track_name: item.name, artist_name: artists, album_name: item.album.name,
    duration: String(Math.round(item.duration_ms / 1000))
  })}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    if (data.syncedLyrics) {
      lyrics = data.syncedLyrics.split(/\r?\n/).map(line => {
        const match = line.match(/\[(\d{2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/);
        if (!match) return null;
        const frac = Number(`0.${match[3] || "0"}`);
        return {time: Number(match[1]) * 60 + Number(match[2]) + frac, text: match[4].trim()};
      }).filter(Boolean);
      $("lyrics").hidden = !lyrics.length;
    }
  } catch (_) { /* Lyrics are optional. */ }
}
function renderLyrics() {
  if (!lyrics.length) return;
  const seconds = (progressMs + (paused ? 0 : Date.now() - startedAt)) / 1000;
  let i = lyrics.findIndex(line => line.time > seconds);
  if (i < 0) i = lyrics.length;
  $("prevLyric").textContent = i > 0 ? lyrics[i - 1].text : "";
  $("currentLyric").textContent = i < lyrics.length ? lyrics[i].text : "";
  $("nextLyric").textContent = i + 1 < lyrics.length ? lyrics[i + 1].text : "";
}
async function update() {
  try {
    const data = await api("https://api.spotify.com/v1/me/player/currently-playing");
    if (!data || !data.item) {
      $("state").textContent = "SPOTIFY NOW PLAYING";
      showMessage("Nothing is playing right now. Start playback on Spotify.");
      return;
    }
    const item = data.item;
    const key = item.id || `${item.name}-${item.artists[0]?.name}`;
    if (key !== trackKey) {
      trackKey = key;
      $("track").textContent = item.name;
      $("artist").textContent = item.artists.map(a => a.name).join(", ");
      const images = item.album?.images || [];
      if (images[0]?.url) {
        $("cover").src = images[0].url;
        document.body.style.setProperty("--album-bg", `url("${images[0].url}")`);
      }
      await lookupLyrics(item);
    }
    progressMs = data.progress_ms || 0;
    durationMs = item.duration_ms || 0;
    paused = !data.is_playing;
    startedAt = Date.now();
    $("state").textContent = paused ? "PAUSED" : "NOW PLAYING";
    showMessage("");
    const estimated = Math.min(durationMs, progressMs + (paused ? 0 : Date.now() - startedAt));
    $("bar").style.width = durationMs ? `${Math.min(100, estimated / durationMs * 100)}%` : "0%";
    $("elapsed").textContent = formatTime(estimated);
    $("duration").textContent = formatTime(durationMs);
    renderLyrics();
  } catch (err) {
    showMessage(`${err.message} Return to setup if you need to reconnect.`);
  }
}
if (!accessToken && !localStorage.getItem("spotify_refresh_token")) {
  showMessage("No Spotify session found. Return to setup and connect your account.");
} else {
  update();
  setInterval(update, 5000);
  setInterval(() => {
    if (!paused && durationMs) {
      const elapsed = Math.min(durationMs, progressMs + (Date.now() - startedAt));
      $("bar").style.width = `${elapsed / durationMs * 100}%`;
      $("elapsed").textContent = formatTime(elapsed);
      renderLyrics();
    }
  }, 500);
}
