(() => {
  const $ = id => document.getElementById(id);
  const CONFIG_KEY = "nowplaying_plex_config";
  const backdrop = $("artistBackdrop");
  const body = document.body;
  let bridgeUrl = "";
  let plexEnabled = true;
  let lastMode = "";
  let plexItemKey = "";
  let screensaverItems = [];
  let screensaverIndex = -1;
  let lastSaverChange = 0;
  let lastStatusCheck = 0;
  let lastPlex = null;
  let saverBusy = false;

  const spotifyMark = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1ed760"/><path d="M5.2 9.1c4.5-1.4 9.9-.9 13.7 1.4M6 12.1c3.9-1.1 8.5-.7 11.8 1.2M6.8 15c3.1-.8 6.8-.5 9.6 1" fill="none" stroke="#101512" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const plexMark = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#e5a00d"/><path d="M9 5h5l5 11-5 11H9l5-11L9 5Zm9 0h5l5 11-5 11h-5l5-11-5-11Z" fill="#171717"/></svg>';

  function readConfig() {
    try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}"); } catch (_) { return {}; }
  }
  function setSource(source) {
    const badge = $("sourceBadge");
    if (!badge) return;
    badge.innerHTML = source === "plex" ? plexMark : source === "spotify" ? spotifyMark : "";
    badge.hidden = !source;
    badge.setAttribute("aria-label", source === "plex" ? "Plex playback" : "Spotify playback");
  }
  function setBackdrop(url) {
    if (!backdrop || !url) return;
    backdrop.style.backgroundImage = 'url("' + String(url).replace(/["\\\\]/g, "") + '")';
    backdrop.classList.add("visible");
  }
  function setMode(mode) {
    if (mode === lastMode) return;
    lastMode = mode;
    body.classList.toggle("idle", mode === "idle");
    body.classList.toggle("plex-mode", mode === "plex");
    if (mode !== "idle") $("screensaverCaption").hidden = true;
    if (mode === "spotify") {
      setSource("spotify");
      $("mediaMeta").hidden = true;
      $("cover").alt = "Album artwork";
      $("controls")?.removeAttribute("hidden");
      $("playPauseBtn").hidden = false;
      $("nextBtn").hidden = false;
      $("lyrics").hidden = !$("lyrics").querySelector("#currentLyric")?.textContent;
    } else if (mode === "plex") {
      setSource("plex");
      $("lyrics").hidden = true;
      $("playPauseBtn").hidden = true;
      $("nextBtn").hidden = true;
      $("queueCard").hidden = true;
      $("mediaMeta").hidden = false;
    } else {
      setSource("");
      $("queueCard").hidden = true;
      $("screensaverCaption").hidden = false;
    }
  }
  function showPlex(item) {
    setMode("plex");
    const key = [item.type, item.title, item.show, item.season, item.episode].join("|");
    if (key !== plexItemKey) {
      plexItemKey = key;
      if (item.type === "episode" || item.type === "show") {
        $("track").textContent = item.show || item.title;
        const season = item.season ? String(item.season).padStart(2, "0") : "—";
        const episode = item.episode ? String(item.episode).padStart(2, "0") : "—";
        $("artist").textContent = "S" + season + " · E" + episode + "  " + (item.episode_title || item.title);
      } else {
        $("track").textContent = item.title || "Now playing";
        $("artist").textContent = item.year ? String(item.year) : "Plex";
      }
      const extras = [];
      if (item.director) extras.push("Directed by " + (Array.isArray(item.director) ? item.director.join(", ") : item.director));
      if (item.genres?.length) extras.push((Array.isArray(item.genres) ? item.genres : [item.genres]).slice(0, 3).join(" · "));
      $("mediaMeta").textContent = extras.join("  /  ");
      $("cover").src = item.thumb || item.backdrop || "placeholder.svg";
      $("cover").alt = "Plex poster";
      if (item.backdrop) setBackdrop(item.backdrop);
    }
    const duration = Number(item.duration || 0);
    const offset = Number(item.offset || 0);
    $("bar").style.width = duration ? Math.min(100, offset / duration * 100) + "%" : "0%";
    $("elapsed").textContent = formatMs(offset);
    $("duration").textContent = formatMs(duration);
    $("message").textContent = item.paused ? "Paused on Plex" : "";
  }
  function formatMs(ms) {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  }
  async function loadScreensaver() {
    if (!bridgeUrl || saverBusy) return;
    saverBusy = true;
    try {
      const response = await fetch(bridgeUrl + "/api/screensaver", {cache:"no-store"});
      if (!response.ok) throw new Error("Screensaver request failed");
      const data = await response.json();
      if (data.ok && Array.isArray(data.items)) screensaverItems = data.items.filter(x => x.backdrop);
    } catch (_) {
      // If the bridge cannot supply library images, keep the last known backdrop.
    } finally { saverBusy = false; }
  }
  function rotateScreensaver(force = false) {
    if (!screensaverItems.length || (!force && Date.now() - lastSaverChange < 45000)) return;
    let next = Math.floor(Math.random() * screensaverItems.length);
    if (screensaverItems.length > 1 && next === screensaverIndex) next = (next + 1) % screensaverItems.length;
    screensaverIndex = next;
    lastSaverChange = Date.now();
    const item = screensaverItems[next];
    setBackdrop(item.backdrop);
    $("screensaverTitle").textContent = item.title || "";
    $("screensaverYear").textContent = item.year || "";
    $("screensaverCaption").hidden = false;
  }
  async function pollPlex() {
    const config = readConfig();
    bridgeUrl = (config.bridgeUrl || "").replace(/\\/$/, "");
    plexEnabled = config.enabled !== false;
    if (!plexEnabled || !bridgeUrl) {
      lastPlex = null;
      if (window.currentItem) setMode("spotify");
      else { setMode("idle"); rotateScreensaver(); }
      return;
    }
    try {
      const response = await fetch(bridgeUrl + "/api/status", {cache:"no-store"});
      if (!response.ok) throw new Error("Bridge status unavailable");
      const data = await response.json();
      lastStatusCheck = Date.now();
      lastPlex = data.active || null;
      if (lastPlex) {
        showPlex(lastPlex);
        return;
      }
    } catch (_) {
      // A failed Plex check should not interrupt Spotify.
    }
    if (window.currentItem) {
      setMode("spotify");
      $("queueCard").hidden = false;
    } else {
      setMode("idle");
      if (!screensaverItems.length) await loadScreensaver();
      rotateScreensaver();
    }
  }
  // display.js owns the Spotify player. Its currentItem binding is top-level
  // lexical state, so the small public hook below is updated by the display script.
  window.addEventListener("nowplaying:spotify-state", event => {
    window.currentItem = event.detail?.item || null;
    if (!lastPlex) {
      if (window.currentItem) setMode("spotify");
      else { setMode("idle"); rotateScreensaver(); }
    }
  });
  const config = readConfig();
  bridgeUrl = (config.bridgeUrl || "").replace(/\\/$/, "");
  plexEnabled = config.enabled !== false;
  if (!plexEnabled || !bridgeUrl) {
    // Without Plex configured, preserve the existing Spotify experience.
    setSource("spotify");
  }
  pollPlex();
  setInterval(pollPlex, 5000);
  setInterval(() => {
    if (lastMode === "idle") rotateScreensaver();
    if (lastMode === "plex" && lastPlex && !lastPlex.paused && lastPlex.duration) {
      const estimate = Math.min(lastPlex.duration, Number(lastPlex.offset || 0) + (Date.now() - lastStatusCheck));
      $("bar").style.width = estimate / lastPlex.duration * 100 + "%";
      $("elapsed").textContent = formatMs(estimate);
    }
  }, 1000);
  // Expose a small callback for the Spotify player to announce each poll.
  window.dispatchEvent(new CustomEvent("nowplaying:plex-ready"));
  window.nowplayingPlex = { poll: pollPlex, get active() { return lastPlex; } };
})();
