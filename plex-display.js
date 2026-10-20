(() => {
  const $ = id => document.getElementById(id);
  const CONFIG_KEY = "nowplaying_plex_config";
  const backdrop = $("artistBackdrop"), body = document.body;
  let plexUrl="", plexToken="", plexEnabled=true, allowedPlexUsers=[];
  let lastMode="", plexItemKey="", screensaverItems=[], screensaverIndex=-1, lastSaverChange=0, lastStatusCheck=0, lastPlex=null, saverBusy=false;
  const spotifyMark='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1ed760"/><path d="M5.2 9.1c4.5-1.4 9.9-.9 13.7 1.4M6 12.1c3.9-1.1 8.5-.7 11.8 1.2M6.8 15c3.1-.8 6.8-.5 9.6 1" fill="none" stroke="#101512" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const plexMark='<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#e5a00d"/><path d="M9 5h5l5 11-5 11H9l5-11L9 5Zm9 0h5l5 11-5 11h-5l5-11-5-11Z" fill="#171717"/></svg>';
  function loadConfig(){let c={};try{c=JSON.parse(localStorage.getItem(CONFIG_KEY)||"{}")}catch(_){}plexUrl=(c.plexUrl||"").replace(/\/$/,"");plexToken=c.plexToken||"";plexEnabled=c.enabled!==false;allowedPlexUsers=(c.plexUsers||"").split(",").map(canonicalUsername).filter(Boolean)}
  function apiUrl(path,params={}){const u=new URL(plexUrl+path);u.search=new URLSearchParams({...params,"X-Plex-Token":plexToken});return u.toString()}
  async function plexFetch(path,params={},accept="application/xml"){if(!plexUrl||!plexToken)throw new Error("Configure Plex server URL and token in setup.");const r=await fetch(apiUrl(path,params),{cache:"no-store",headers:{Accept:accept}});if(!r.ok)throw new Error("Plex HTTP "+r.status);return r}
  function xmlItems(xml,tag){return Array.from(xml.getElementsByTagName(tag))}
  function attr(el,...names){for(const n of names){const v=el.getAttribute(n);if(v)return v}return ""}
  function setSource(source){const b=$("sourceBadge"),img=$("sourceBadgeIcon");if(!b||!img)return;img.src=source==="plex"?"./Plex.svg":source==="spotify"?"./Spotify.svg":"";b.hidden=!source;b.setAttribute("aria-label",source==="plex"?"Plex playback":"Spotify playback");if(source)updateBadgeContrast()}
  function updateBadgeContrast(){const badge=$("sourceBadge"),cover=$("cover");if(!badge||badge.hidden||!cover)return;try{const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});canvas.width=24;canvas.height=24;ctx.drawImage(cover,0,0,24,24);const d=ctx.getImageData(0,0,24,24).data;let total=0;for(let i=0;i<d.length;i+=4)total+=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2];badge.classList.toggle("on-light-background",total/(d.length/4)>145)}catch(_){badge.classList.remove("on-light-background")}}
  $("cover").addEventListener("load",updateBadgeContrast);
  function setBackdrop(url){if(!backdrop||!url)return;backdrop.style.backgroundImage='url("'+String(url).replace(/["\\]/g,"")+'")';backdrop.classList.add("visible")}
  function imageUrl(path){if(!path)return "";if(/^https?:\/\//i.test(path))return path;return plexUrl&&plexToken?apiUrl(path):""}
  function formatMs(ms){const s=Math.max(0,Math.floor(ms/1000));return Math.floor(s/60)+":"+String(s%60).padStart(2,"0")}
  function setMode(mode){if(mode===lastMode)return;lastMode=mode;body.classList.toggle("idle",mode==="idle");body.classList.toggle("plex-mode",mode==="plex");if(mode!=="idle")$("screensaverCaption").hidden=true;
    if(mode==="spotify"){$("queueCard").hidden=false;setSource("spotify");$("mediaMeta").hidden=true;$("cover").alt="Album artwork";$("playPauseBtn").hidden=false;$("nextBtn").hidden=false;$("lyrics").hidden=!$("currentLyric").textContent}
    else if(mode==="plex"){setSource("plex");$("lyrics").hidden=true;$("playPauseBtn").hidden=true;$("nextBtn").hidden=true;$("queueCard").hidden=true;$("mediaMeta").hidden=false}
    else{setSource("");$("queueCard").hidden=true;$("screensaverCaption").hidden=false}}
  function canonicalUsername(value){
    // Plex may expose the account username in one place and the profile title
    // (which can contain spaces) in another. Normalize punctuation/spacing.
    return String(value || "").normalize("NFKC").toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
  }
  function sessionUsername(el){
    const userNodes = xmlItems(el, "User");
    const values = [
      attr(el, "user"), attr(el, "username"), attr(el, "userTitle"), attr(el, "userName"),
      ...userNodes.flatMap(user => [attr(user, "title"), attr(user, "username"), attr(user, "name")])
    ];
    return values.map(canonicalUsername).filter(Boolean);
  }
  function normalizeSession(el){const type=attr(el,"type").toLowerCase(),player=el.getElementsByTagName("Player")[0],state=(attr(el,"state")||attr(player,"state")).toLowerCase(),title=attr(el,"title")||"Unknown title";const duration=Number(attr(el,"duration")||0),offset=Number(attr(el,"viewOffset")||0);
    const grand=el.getElementsByTagName("grandparentTitle")[0];const director=xmlItems(el,"Director").map(x=>attr(x,"tag")).filter(Boolean);const genres=xmlItems(el,"Genre").map(x=>attr(x,"tag")).filter(Boolean);
    const thumb=attr(el,"thumb"),art=attr(el,"art")||attr(el,"grandparentThumb")||thumb;const showThumb=attr(el,"grandparentThumb")||thumb;const showArt=attr(el,"grandparentArt")||art;const posterPath=(type==="episode"||type==="show")?showThumb:thumb;const posterArt=(type==="episode"||type==="show")?showArt:art;
    return {title,year:attr(el,"year"),ratingKey:attr(el,"ratingKey"),type,state,playing:state==="playing"||state==="buffering",paused:state==="paused",duration,offset,thumb:imageUrl(posterPath),backdrop:imageUrl(posterArt),director,genres,show:attr(el,"grandparentTitle"),season:attr(el,"parentIndex"),episode:attr(el,"index"),episode_title:title}}
  function showPlex(item){setMode("plex");const key=[item.type,item.title,item.show,item.season,item.episode].join("|");if(key!==plexItemKey){plexItemKey=key;
    if(item.type==="episode"||item.type==="show"){$("track").textContent=item.show||item.title;const s=item.season?String(item.season).padStart(2,"0"):"—",e=item.episode?String(item.episode).padStart(2,"0"):"—";$("artist").textContent="S"+s+" · E"+e+"  "+item.episode_title}
    else{$("track").textContent=item.title||"Now playing";$("artist").textContent=item.year?String(item.year):"Plex"}
    const extras=[];if(item.director.length)extras.push("Directed by "+item.director.join(", "));if(item.genres.length)extras.push(item.genres.slice(0,3).join(" · "));$("mediaMeta").textContent=extras.join("  /  ");
    const cover=$("cover");
    cover.onerror=()=>{
      cover.onerror=null;
      if(item.backdrop && cover.src!==item.backdrop){cover.style.objectFit="cover";cover.src=item.backdrop;}
      else {cover.removeAttribute("src");cover.alt="Plex artwork unavailable";}
    };
    cover.style.objectFit="cover";
    const setArtwork=(squarePath)=>{
      const squareUrl=squarePath?imageUrl(squarePath):"";
      cover.src=squareUrl||item.backdrop||item.thumb||"";
      cover.alt=squareUrl?"Plex Square Art":item.backdrop?"Plex Background":"Plex Poster";
      cover.style.objectFit="cover";
    };
    setArtwork("");
    if(item.ratingKey){
      plexFetch("/library/metadata/"+encodeURIComponent(item.ratingKey),{}, "application/xml")
        .then(r=>r.text())
        .then(async text=>{
          const doc=new DOMParser().parseFromString(text,"application/xml");
          const meta=xmlItems(doc,"Video")[0]||xmlItems(doc,"Directory")[0];
          if(!meta)return;

          // Plex exposes the selected Square Art as an Image element with
          // type="backgroundSquare"; it is not a squareArt attribute.
          const squareImage=Array.from(doc.getElementsByTagName("Image"))
            .find(image=>attr(image,"type")==="backgroundSquare");
          let path=squareImage?attr(squareImage,"url"): "";

          // Fallback: query Plex's dedicated Square Art asset list and use
          // the selected Photo's thumb/key (some agents expose it only here).
          const loadSquareArts=async()=>{
            try{
              const response=await plexFetch("/library/metadata/"+encodeURIComponent(item.ratingKey)+"/squareArts");
              const squareDoc=new DOMParser().parseFromString(await response.text(),"application/xml");
              const photos=xmlItems(squareDoc,"Photo");
              const selected=photos.find(photo=>attr(photo,"selected")==="1")||photos[0];
              return selected?attr(selected,"thumb","key"):"";
            }catch(_){return "";}
          };
          if(path){setArtwork(path);return;}
          const squarePath=await loadSquareArts();
          if(squarePath)setArtwork(squarePath);
        }).catch(()=>{});
    }
    if(item.backdrop)setBackdrop(item.backdrop)}
    $("bar").style.width=item.duration?Math.min(100,item.offset/item.duration*100)+"%":"0%";$("elapsed").textContent=formatMs(item.offset);$("duration").textContent=formatMs(item.duration);$("message").textContent=item.paused?"Paused on Plex":""}
  async function loadScreensaver(){if(!plexUrl||!plexToken||saverBusy)return;saverBusy=true;try{
    const r=await plexFetch("/library/recentlyAdded",{type:"1", "X-Plex-Container-Start":"0","X-Plex-Container-Size":"30"});const xml=new DOMParser().parseFromString(await r.text(),"application/xml");const items=[];
    for(const m of xmlItems(xml,"Video")){const art=attr(m,"art")||attr(m,"thumb");if(art)items.push({title:attr(m,"title"),year:attr(m,"year"),backdrop:imageUrl(art)})}if(items.length)screensaverItems=items;
  }catch(_){}finally{saverBusy=false}}
  function rotateScreensaver(force=false){if(!screensaverItems.length||(!force&&Date.now()-lastSaverChange<45000))return;let n=Math.floor(Math.random()*screensaverItems.length);if(screensaverItems.length>1&&n===screensaverIndex)n=(n+1)%screensaverItems.length;screensaverIndex=n;lastSaverChange=Date.now();const item=screensaverItems[n];setBackdrop(item.backdrop);$("screensaverTitle").textContent=item.title||"";$("screensaverYear").textContent=item.year||"";$("screensaverCaption").hidden=false}
  async function pollPlex(){loadConfig();if(!plexEnabled||!plexUrl||!plexToken){lastPlex=null;if(window.currentItem)setMode("spotify");else{setMode("idle");rotateScreensaver()}return}
    try{const r=await plexFetch("/status/sessions");const xml=new DOMParser().parseFromString(await r.text(),"application/xml");const sessions=xmlItems(xml,"Video");
      const normalized=sessions.filter(s=>{
        const type=attr(s,"type").toLowerCase();
        return ["movie","episode"].includes(type) && allowedPlexUsers.length>0 &&
          sessionUsername(s).some(n=>allowedPlexUsers.includes(n));
      }).map(normalizeSession);
      lastPlex=normalized.find(s=>s.playing)||normalized.find(s=>s.paused)||null;lastStatusCheck=Date.now();if(lastPlex){showPlex(lastPlex);return}
    }catch(_){}
    if(window.currentItem){setMode("spotify");$("queueCard").hidden=false}else{setMode("idle");if(!screensaverItems.length)await loadScreensaver();rotateScreensaver()}}
  window.addEventListener("nowplaying:spotify-state",e=>{window.currentItem=e.detail?.item||null;if(!lastPlex){if(window.currentItem)setMode("spotify");else{setMode("idle");rotateScreensaver()}}});
  loadConfig();if(!plexEnabled||!plexUrl||!plexToken)setSource("spotify");pollPlex();setInterval(pollPlex,5000);
  setInterval(()=>{if(lastMode==="idle")rotateScreensaver();if(lastMode==="plex"&&lastPlex&&!lastPlex.paused&&lastPlex.duration){const elapsed=Math.min(lastPlex.duration,Number(lastPlex.offset||0)+(Date.now()-lastStatusCheck));$("bar").style.width=elapsed/lastPlex.duration*100+"%";$("elapsed").textContent=formatMs(elapsed)}},1000);
  window.nowplayingPlex={poll:pollPlex,get active(){return lastPlex}};
})();