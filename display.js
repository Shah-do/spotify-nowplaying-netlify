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
function updateClock() { $("clock").textContent = new Intl.DateTimeFormat(undefined,{hour:"2-digit",minute:"2-digit"}).format(new Date()); }
updateClock(); setInterval(updateClock,1000);
let currentItem=null, commandBusy=false, lastQueueLookup=0, queueKey="";
function updateControls(){ $("playPauseBtn").disabled=commandBusy||!currentItem; $("nextBtn").disabled=commandBusy||!currentItem; $("playPauseIcon").textContent=paused?"▶":"Ⅱ"; $("playPauseBtn").setAttribute("aria-label",paused?"Play":"Pause"); }
$("playPauseBtn").addEventListener("click",async()=>{if(commandBusy||!currentItem)return;commandBusy=true;updateControls();try{await api(`https://api.spotify.com/v1/me/player/${paused?"play":"pause"}`,{method:"PUT"});await update();}catch(err){showMessage(`Playback control failed: ${err.message}`);}finally{commandBusy=false;updateControls();}});
$("nextBtn").addEventListener("click",async()=>{if(commandBusy||!currentItem)return;commandBusy=true;updateControls();try{await api("https://api.spotify.com/v1/me/player/next",{method:"POST"});await new Promise(r=>setTimeout(r,500));lastQueueLookup=0;await update();}catch(err){showMessage(`Next track failed: ${err.message}`);}finally{commandBusy=false;updateControls();}});
function setAccentFromImage(url){const img=new Image();img.crossOrigin="anonymous";img.onload=()=>{try{const c=document.createElement("canvas");c.width=c.height=32;const x=c.getContext("2d",{willReadFrequently:true});x.drawImage(img,0,0,32,32);const d=x.getImageData(0,0,32,32).data;let r=0,g=0,b=0,n=0;for(let i=0;i<d.length;i+=16){const hi=Math.max(d[i],d[i+1],d[i+2]),lo=Math.min(d[i],d[i+1],d[i+2]);if(d[i+3]<150||hi-lo<18)continue;r+=d[i];g+=d[i+1];b+=d[i+2];n++;}if(n){r=Math.round(r/n);g=Math.round(g/n);b=Math.round(b/n);document.documentElement.style.setProperty("--accent",`rgb(${r},${g},${b})`);document.documentElement.style.setProperty("--accent-soft",`rgba(${r},${g},${b},.22)`);document.documentElement.style.setProperty("--accent-glow",`rgba(${r},${g},${b},.4)`);}}catch(_){} };img.src=url;}
async function updateArtistBackground(item){const artist=item.artists?.[0];if(!artist?.id)return;try{const data=await api(`https://api.spotify.com/v1/artists/${artist.id}`);const image=data.images?.[0]?.url;if(image){$("artistBackdrop").style.backgroundImage=`url("${image}")`;$("artistBackdrop").classList.add("visible");}else $("artistBackdrop").classList.remove("visible");}catch(_){$("artistBackdrop").classList.remove("visible");}}
async function updateQueue(force=false){if(!force&&Date.now()-lastQueueLookup<12000)return;lastQueueLookup=Date.now();try{const data=await api("https://api.spotify.com/v1/me/player/queue");const next=data?.queue?.[0];if(!next){$("queueTitle").textContent="Nothing queued";$("queueArtist").textContent="Add something to the queue";$("queueCover").src="placeholder.svg";$("queueCard").classList.add("empty");queueKey="";return;}const key=next.id||next.uri;if(key!==queueKey){queueKey=key;$("queueTitle").textContent=next.name;$("queueArtist").textContent=next.artists?.map(a=>a.name).join(", ")||"";$("queueCover").src=next.album?.images?.[0]?.url||"placeholder.svg";}$("queueCard").classList.remove("empty");}catch(_){$("queueTitle").textContent="Queue unavailable";$("queueArtist").textContent="Check Spotify playback";}}


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
      currentItem=null; updateControls();
      $("state").textContent = "SPOTIFY NOW PLAYING";
      showMessage("Nothing is playing right now. Start playback on Spotify.");
      await updateQueue(); return;
    }
    const item = data.item;
    currentItem=item;
    const key = item.id || `${item.name}-${item.artists[0]?.name}`;
    if (key !== trackKey) {
      trackKey = key;
      $("track").textContent = item.name;
      $("artist").textContent = item.artists.map(a => a.name).join(", ");
      const images = item.album?.images || [];
      if(images[0]?.url){$("cover").src=images[0].url;setAccentFromImage(images[0].url);}
      await Promise.all([lookupLyrics(item),updateArtistBackground(item)]);
      lastQueueLookup=0;
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
    updateControls();
    await updateQueue();
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
