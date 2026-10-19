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
const icons = {
  play: '<svg viewBox="0 0 75 75" aria-hidden="true" focusable="false"><circle cx="37.26" cy="37.26" r="37.26" fill="var(--accent)"/><path d="M29 22.5c0-1.8 2.1-2.8 3.6-1.7l20 15c1.2.9 1.2 2.7 0 3.6l-20 15c-1.5 1.1-3.6.1-3.6-1.7V22.5Z" fill="#fff"/></svg>',
  pause: '<svg viewBox="0 0 75 75" aria-hidden="true" focusable="false"><circle cx="37.26" cy="37.26" r="37.26" fill="var(--accent)"/><path d="M32 22C33.6569 22 35 23.3431 35 25V49C35 50.6569 33.6569 52 32 52H29C27.3431 52 26 50.6569 26 49V25C26 23.3431 27.3431 22 29 22H32ZM46 22C47.6569 22 49 23.3431 49 25V49C49 50.6569 47.6569 52 46 52H43C41.3431 52 40 50.6569 40 49V25C40 23.3431 41.3431 22 43 22H46Z" fill="#fff"/></svg>',
  next: '<svg viewBox="0 0 75 75" aria-hidden="true" focusable="false"><circle cx="37.26" cy="37.26" r="37.26" fill="#fff"/><path d="M23 23.9609C23 22.2748 24.9584 21.345 26.2646 22.4111L42.8516 35.9502C43.832 36.7505 43.832 38.2495 42.8516 39.0498L26.2646 52.5889C24.9584 53.655 23 52.7252 23 51.0391V23.9609ZM49.75 21C51.4069 21 52.75 22.3431 52.75 24V50C52.75 51.6569 51.4069 53 49.75 53H48.75C47.0931 53 45.75 51.6569 45.75 50V24C45.75 22.3431 47.0931 21 48.75 21H49.75Z" fill="var(--accent)"/></svg>'
};
function renderButtonIcons(){
  $("playPauseIcon").innerHTML=paused?icons.play:icons.pause;
  $("nextIcon").innerHTML=icons.next;
}
renderButtonIcons();
function updateControls(){
  $("playPauseBtn").disabled=commandBusy||!currentItem;
  $("nextBtn").disabled=commandBusy||!currentItem;
  $("playPauseIcon").innerHTML=paused?icons.play:icons.pause;
  $("playPauseBtn").setAttribute("aria-label",paused?"Play":"Pause");
}
$("playPauseBtn").addEventListener("click",async()=>{if(commandBusy||!currentItem)return;commandBusy=true;updateControls();try{await api(`https://api.spotify.com/v1/me/player/${paused?"play":"pause"}`,{method:"PUT"});await update();}catch(err){showMessage(`Playback control failed: ${err.message}`);}finally{commandBusy=false;updateControls();}});
$("nextBtn").addEventListener("click",async()=>{if(commandBusy||!currentItem)return;commandBusy=true;updateControls();try{await api("https://api.spotify.com/v1/me/player/next",{method:"POST"});await new Promise(r=>setTimeout(r,500));lastQueueLookup=0;await update();}catch(err){showMessage(`Next track failed: ${err.message}`);}finally{commandBusy=false;updateControls();}});
function setAccentFromImage(url){
  const fallback=()=>{const root=document.documentElement;root.style.setProperty("--accent","#BC1864");root.style.setProperty("--accent-soft","rgba(188,24,100,.20)");root.style.setProperty("--accent-glow","rgba(188,24,100,.30)");};
  const img=new Image();img.crossOrigin="anonymous";
  img.onload=()=>{
    try{
      const canvas=document.createElement("canvas");canvas.width=canvas.height=36;
      const ctx=canvas.getContext("2d",{willReadFrequently:true});ctx.drawImage(img,0,0,36,36);
      const data=ctx.getImageData(0,0,36,36).data,bins=new Map();
      for(let i=0;i<data.length;i+=4){
        const r=data[i],g=data[i+1],b=data[i+2],a=data[i+3];
        if(a<180)continue;
        const hi=Math.max(r,g,b),lo=Math.min(r,g,b),sat=hi?((hi-lo)/hi):0;
        if(hi<42||hi>248||sat<.22)continue;
        const key=[r>>4,g>>4,b>>4].join(",");
        const item=bins.get(key)||{r:0,g:0,b:0,n:0,score:0};
        item.r+=r;item.g+=g;item.b+=b;item.n++;item.score+=sat*(1-Math.abs(145-hi)/220);bins.set(key,item);
      }
      const candidates=[...bins.values()].sort((a,b)=>(b.score/b.n)-(a.score/a.n));let r,g,b;
      if(candidates.length){
        const best=candidates.slice(0,Math.min(5,candidates.length)),total=best.reduce((s,x)=>s+x.n,0);
        r=Math.round(best.reduce((s,x)=>s+x.r,0)/total);g=Math.round(best.reduce((s,x)=>s+x.g,0)/total);b=Math.round(best.reduce((s,x)=>s+x.b,0)/total);
      }else{let rr=0,gg=0,bb=0,n=0;for(let i=0;i<data.length;i+=16){rr+=data[i];gg+=data[i+1];bb+=data[i+2];n++;}r=Math.round(rr/n);g=Math.round(gg/n);b=Math.round(bb/n);}
      if(Math.max(r,g,b)-Math.min(r,g,b)<34){r=188;g=24;b=100;}
      const lift=Math.max(r,g,b)<150?.18:Math.max(r,g,b)<185?.10:.02;
      r=Math.round(r+(255-r)*lift);g=Math.round(g+(255-g)*lift);b=Math.round(b+(255-b)*lift);
      const root=document.documentElement;
      root.style.setProperty("--accent",`rgb(${r}, ${g}, ${b})`);
      root.style.setProperty("--accent-soft",`rgba(${r}, ${g}, ${b}, .18)`);
      root.style.setProperty("--accent-glow",`rgba(${r}, ${g}, ${b}, .28)`);
    }catch(_){fallback();}
  };
  img.onerror=fallback;img.src=url;
}
async function updateArtistBackground(item){
  const artist=item.artists?.[0];const backdrop=$("artistBackdrop");
  backdrop.classList.remove("visible");backdrop.style.backgroundImage="none";
  if(!artist?.name)return;
  // Prefer the artist profile image from Spotify, never the album cover.
  try{
    if(artist.id){
      const data=await api(`https://api.spotify.com/v1/artists/${artist.id}`);
      const image=data.images?.[0]?.url;
      if(image){backdrop.style.backgroundImage=`url("${image}")`;backdrop.classList.add("visible");return;}
    }
  }catch(_){}
  // If Spotify doesn't expose artist images for this app, try a public Commons portrait.
  try{
    const q=encodeURIComponent(`"${artist.name}" musician portrait`);
    const url=`https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${q}&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url&iiurlwidth=1800&format=json&origin=*`;
    const response=await fetch(url);if(!response.ok)return;
    const data=await response.json();const pages=Object.values(data.query?.pages||{});
    const candidate=pages.find(p=>p.title&&/\.(jpe?g|png|webp)$/i.test(p.title)&&p.imageinfo?.[0]?.thumburl);
    if(candidate){backdrop.style.backgroundImage=`url("${candidate.imageinfo[0].thumburl}")`;backdrop.classList.add("visible");}
  }catch(_){}
}
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
async function api(url, options = {}) {
  if (!accessToken || Date.now() > expiresAt - 60000) await refreshAccessToken();
  const request = () => fetch(url, {...options, headers: {Authorization: `Bearer ${accessToken}`, ...(options.body ? {"Content-Type":"application/json"} : {}), ...(options.headers || {})}});
  let response = await request();
  if (response.status === 401) { await refreshAccessToken(); response = await request(); }
  if (response.status === 204) return null;
  const raw = await response.text();
  let body = null;
  if (raw.trim()) {
    try { body = JSON.parse(raw); }
    catch (_) { if (!response.ok) throw new Error(`Spotify API returned ${response.status}`); return null; }
  }
  if (!response.ok) throw new Error(body?.error?.message || body?.error_description || `Spotify API returned ${response.status}`);
  return body;
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
      $("state") && ($("state").textContent = "SPOTIFY NOW PLAYING");
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
    $("state") && ($("state").textContent = paused ? "PAUSED" : "NOW PLAYING");
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
