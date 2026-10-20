(() => {
  const $ = id => document.getElementById(id);
  const CONFIG_KEY = "nowplaying_plex_config";
  const backdrop = $("artistBackdrop");
  const body = document.body;
  let tautulliUrl = "", apiKey = "", plexEnabled = true;
  let lastMode = "", plexItemKey = "", screensaverItems = [], screensaverIndex = -1;
  let lastSaverChange = 0, lastStatusCheck = 0, lastPlex = null, saverBusy = false;

  const spotifyMark = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1ed760"/><path d="M5.2 9.1c4.5-1.4 9.9-.9 13.7 1.4M6 12.1c3.9-1.1 8.5-.7 11.8 1.2M6.8 15c3.1-.8 6.8-.5 9.6 1" fill="none" stroke="#101512" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const plexMark = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#e5a00d"/><path d="M9 5h5l5 11-5 11H9l5-11L9 5Zm9 0h5l5 11-5 11h-5l5-11-5-11Z" fill="#171717"/></svg>';
  function readConfig(){try{return JSON.parse(localStorage.getItem(CONFIG_KEY)||"{}")}catch(_){return{}}}
  function loadConfig(){const c=readConfig();tautulliUrl=(c.tautulliUrl||"").replace(/\\/$/,"");apiKey=c.tautulliKey||"";plexEnabled=c.enabled!==false}
  function setSource(source){const badge=$("sourceBadge");if(!badge)return;badge.innerHTML=source==="plex"?plexMark:source==="spotify"?spotifyMark:"";badge.hidden=!source;badge.setAttribute("aria-label",source==="plex"?"Plex playback":"Spotify playback")}
  function setBackdrop(url){if(!backdrop||!url)return;backdrop.style.backgroundImage='url("'+String(url).replace(/["\\\\]/g,"")+'")';backdrop.classList.add("visible")}
  function formatMs(ms){const s=Math.max(0,Math.floor(ms/1000));return Math.floor(s/60)+":"+String(s%60).padStart(2,"0")}
  function setMode(mode){
    if(mode===lastMode)return;lastMode=mode;body.classList.toggle("idle",mode==="idle");body.classList.toggle("plex-mode",mode==="plex");
    if(mode!=="idle")$("screensaverCaption").hidden=true;
    if(mode==="spotify"){$("queueCard").hidden=false;setSource("spotify");$("mediaMeta").hidden=true;$("cover").alt="Album artwork";$("playPauseBtn").hidden=false;$("nextBtn").hidden=false;$("lyrics").hidden=!$("currentLyric").textContent}
    else if(mode==="plex"){setSource("plex");$("lyrics").hidden=true;$("playPauseBtn").hidden=true;$("nextBtn").hidden=true;$("queueCard").hidden=true;$("mediaMeta").hidden=false}
    else{setSource("");$("queueCard").hidden=true;$("screensaverCaption").hidden=false}
  }
  function imageUrl(path){
    if(!path)return "";
    if(/^https?:\\/\\//i.test(path))return path;
    if(!tautulliUrl||!apiKey)return "";
    return tautulliUrl+"/image?"+new URLSearchParams({img:path,apikey:apiKey});
  }
  function normalizeSession(s){
    const state=(s.state||"").toLowerCase(),type=(s.media_type||"").toLowerCase();
    return {title:s.title||s.full_title||"Unknown title",year:s.year,type,state,playing:["playing","buffering"].includes(state),paused:state==="paused",
      duration:Number(s.duration||0),offset:Number(s.view_offset||0),thumb:imageUrl(s.thumb||s.grandparent_thumb),
      backdrop:imageUrl(s.art||s.grandparent_art||s.thumb),director:s.directors||s.director||"",genres:s.genres||[],
      show:s.grandparent_title||"",season:s.parent_media_index,episode:s.media_index,episode_title:s.title||""};
  }
  function showPlex(item){
    setMode("plex");const key=[item.type,item.title,item.show,item.season,item.episode].join("|");
    if(key!==plexItemKey){plexItemKey=key;
      if(item.type==="episode"||item.type==="show"){$("track").textContent=item.show||item.title;const s=item.season?String(item.season).padStart(2,"0"):"—";const e=item.episode?String(item.episode).padStart(2,"0"):"—";$("artist").textContent="S"+s+" · E"+e+"  "+(item.episode_title||item.title)}
      else{$("track").textContent=item.title||"Now playing";$("artist").textContent=item.year?String(item.year):"Plex"}
      const extras=[];if(item.director)extras.push("Directed by "+(Array.isArray(item.director)?item.director.join(", "):item.director));
      if(item.genres?.length)extras.push((Array.isArray(item.genres)?item.genres:[item.genres]).slice(0,3).join(" · "));
      $("mediaMeta").textContent=extras.join("  /  ");$("cover").src=item.thumb||"placeholder.svg";$("cover").alt="Plex poster";if(item.backdrop)setBackdrop(item.backdrop)
    }
    $("bar").style.width=item.duration?Math.min(100,item.offset/item.duration*100)+"%":"0%";$("elapsed").textContent=formatMs(item.offset);$("duration").textContent=formatMs(item.duration);$("message").textContent=item.paused?"Paused on Plex":"";
  }
  async function tautulli(command,params={}){
    if(!tautulliUrl||!apiKey)throw new Error("Configure Tautulli in setup.");
    const url=tautulliUrl+"/api/v2?"+new URLSearchParams({apikey:apiKey,cmd:command,...params});
    const response=await fetch(url,{cache:"no-store"});if(!response.ok)throw new Error("Tautulli HTTP "+response.status);
    const json=await response.json();if(json?.response?.result!=="success")throw new Error(json?.response?.message||"Tautulli API request failed");
    return json.response.data;
  }
  async function loadScreensaver(){
    if(!tautulliUrl||!apiKey||saverBusy)return;saverBusy=true;
    try{
      // Tautulli home stats gives recently added media without needing a Plex token.
      const data=await tautulli("get_home_stats",{stat_id:"recently_added",media_type:"movie",stats_count:"30"});
      const rows=Array.isArray(data)?data:Object.values(data||{});
      const items=[];
      for(const row of rows){const list=row.rows||row.data||row.items||[];for(const m of (Array.isArray(list)?list:[])){const art=imageUrl(m.art||m.thumb||m.parent_thumb);if(art)items.push({title:m.title||m.full_title||"",year:m.year||"",backdrop:art})}}
      if(items.length)screensaverItems=items;
    }catch(_){/* Keep the current backdrop if this Tautulli version has no matching stats. */}
    finally{saverBusy=false}
  }
  function rotateScreensaver(force=false){
    if(!screensaverItems.length||(!force&&Date.now()-lastSaverChange<45000))return;
    let n=Math.floor(Math.random()*screensaverItems.length);if(screensaverItems.length>1&&n===screensaverIndex)n=(n+1)%screensaverItems.length;
    screensaverIndex=n;lastSaverChange=Date.now();const item=screensaverItems[n];setBackdrop(item.backdrop);$("screensaverTitle").textContent=item.title||"";$("screensaverYear").textContent=item.year||"";$("screensaverCaption").hidden=false;
  }
  async function pollPlex(){
    loadConfig();
    if(!plexEnabled||!tautulliUrl||!apiKey){lastPlex=null;if(window.currentItem)setMode("spotify");else{setMode("idle");rotateScreensaver()}return}
    try{
      const data=await tautulli("get_activity");const sessions=data?.sessions||[];
      const normalized=sessions.filter(s=>["movie","episode","show"].includes((s.media_type||"").toLowerCase())).map(normalizeSession);
      lastPlex=normalized.find(s=>s.playing)||normalized.find(s=>s.paused)||null;lastStatusCheck=Date.now();
      if(lastPlex){showPlex(lastPlex);return}
    }catch(_){/* A CORS/network error must not interrupt Spotify playback. */}
    if(window.currentItem){setMode("spotify");$("queueCard").hidden=false}
    else{setMode("idle");if(!screensaverItems.length)await loadScreensaver();rotateScreensaver()}
  }
  window.addEventListener("nowplaying:spotify-state",event=>{window.currentItem=event.detail?.item||null;if(!lastPlex){if(window.currentItem)setMode("spotify");else{setMode("idle");rotateScreensaver()}}});
  loadConfig();if(!plexEnabled||!tautulliUrl||!apiKey)setSource("spotify");
  pollPlex();setInterval(pollPlex,5000);
  setInterval(()=>{if(lastMode==="idle")rotateScreensaver();if(lastMode==="plex"&&lastPlex&&!lastPlex.paused&&lastPlex.duration){const elapsed=Math.min(lastPlex.duration,Number(lastPlex.offset||0)+(Date.now()-lastStatusCheck));$("bar").style.width=elapsed/lastPlex.duration*100+"%";$("elapsed").textContent=formatMs(elapsed)}},1000);
  window.nowplayingPlex={poll:pollPlex,get active(){return lastPlex}};
})();
