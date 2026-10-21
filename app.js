// Spotify Authorization Code + PKCE. No client secret is used in this browser app.
const CLIENT_KEY = "spotify_nowplaying_client_id";
const BASE_PATH = location.pathname.startsWith("/spotify-nowplaying-netlify/") ? "/spotify-nowplaying-netlify/" : "/";
const REDIRECT_URI = `${location.origin}${BASE_PATH}`;
const SCOPES = ["user-read-currently-playing", "user-read-playback-state", "user-modify-playback-state", "playlist-read-private"];

const clientInput = document.querySelector("#clientId");
const statusEl = document.querySelector("#status");
const disconnectBtn = document.querySelector("#disconnectBtn");
const plexUrlInput = document.querySelector("#plexUrl");
const plexTokenInput = document.querySelector("#plexToken");
const plexUsersInput = document.querySelector("#plexUsers");
const plexEnabledInput = document.querySelector("#plexEnabled");
const plexStatus = document.querySelector("#plexStatus");
const PLEX_CONFIG_KEY = "nowplaying_plex_config";
clientInput.value = localStorage.getItem(CLIENT_KEY) || "";
function readPlexConfig() {
  try { return JSON.parse(localStorage.getItem(PLEX_CONFIG_KEY) || "{}"); } catch (_) { return {}; }
}
function loadPlexConfig() {
  const config = readPlexConfig();
  plexUrlInput.value = config.plexUrl || "";
  plexTokenInput.value = config.plexToken || "";
  plexUsersInput.value = config.plexUsers || "";
  plexEnabledInput.checked = config.enabled === true;
}
function savePlexConfig() {
  const config = {
    plexUrl: plexUrlInput.value.trim().replace(/\/$/, ""),
    plexToken: plexTokenInput.value.trim(),
    plexUsers: plexUsersInput.value.trim(),
    enabled: plexEnabledInput.checked
  };
  localStorage.setItem(PLEX_CONFIG_KEY, JSON.stringify(config));
  plexStatus.textContent = "Plex settings saved in this browser only.";
  return config;
}
loadPlexConfig();
document.querySelector("#savePlexBtn").addEventListener("click", savePlexConfig);
plexEnabledInput.addEventListener("change", savePlexConfig);
document.querySelector("#testPlexBtn").addEventListener("click", async () => {
  const config = savePlexConfig();
  plexStatus.textContent = "Checking Plex identity and live sessions…";
  try {
    if (!config.plexUrl || !config.plexToken) throw new Error("Enter both the Plex server URL and token.");
    const headers = {"Accept":"application/xml"};
    const identityUrl = new URL(config.plexUrl + "/identity");
    identityUrl.search = new URLSearchParams({"X-Plex-Token":config.plexToken});
    const identityResponse = await fetch(identityUrl, {cache:"no-store", headers});
    if (!identityResponse.ok) throw new Error("Plex identity returned HTTP " + identityResponse.status + ".");
    const identityXml = new DOMParser().parseFromString(await identityResponse.text(), "application/xml");
    const machine = identityXml.querySelector("MediaContainer")?.getAttribute("machineIdentifier");
    if (!machine) throw new Error("Plex identity response was not recognized. Check the server URL and token.");

    const sessionsUrl = new URL(config.plexUrl + "/status/sessions");
    sessionsUrl.search = new URLSearchParams({"X-Plex-Token":config.plexToken});
    const sessionsResponse = await fetch(sessionsUrl, {cache:"no-store", headers});
    if (!sessionsResponse.ok) throw new Error("Plex sessions returned HTTP " + sessionsResponse.status + ".");
    const sessionsXml = new DOMParser().parseFromString(await sessionsResponse.text(), "application/xml");
    if (sessionsXml.querySelector("parsererror")) throw new Error("Plex sessions response was not valid XML.");
    const media = Array.from(sessionsXml.querySelectorAll("Video, Track, Photo"));
    const users = [];
    for (const item of media) {
      const userNodes = Array.from(item.getElementsByTagName("User"));
      const names = [
        item.getAttribute("user"), item.getAttribute("username"), item.getAttribute("userTitle"),
        item.getAttribute("userName"),
        ...userNodes.flatMap(u => [u.getAttribute("title"),u.getAttribute("username"),u.getAttribute("name")])
      ].filter(Boolean);
      users.push(...names);
    }
    const uniqueUsers = [...new Set(users)];
    const wanted = config.plexUsers.split(",").map(x=>x.trim().toLocaleLowerCase().replace(/[^a-z0-9]/g,"")).filter(Boolean);
    const matched = uniqueUsers.filter(name=>wanted.includes(name.toLocaleLowerCase().replace(/[^a-z0-9]/g,"")));
    const playing = media.filter(item => ["playing","buffering","paused"].includes((item.getAttribute("state")||"").toLowerCase()));
    const mediaSummary = media.length ? media.length + " active media item(s)" : "no active media items";
    const userSummary = uniqueUsers.length ? " Plex user fields found: " + uniqueUsers.join(", ") + "." : " No username fields were found in the session response.";
    const matchSummary = wanted.length ? (matched.length ? " Username match: " + matched.join(", ") + "." : " No returned username matches your allowlist.") : " The username allowlist is empty.";
    plexStatus.textContent = "Plex server verified; /status/sessions returned " + mediaSummary + " (" + playing.length + " playing/paused)." + userSummary + matchSummary;
  } catch (error) {
    const cors = error instanceof TypeError ? " This is often caused by a CORS restriction, an unreachable server, or an HTTPS/mixed-content issue." : "";
    plexStatus.textContent = "Plex test failed: " + error.message + cors;
  }
});

function b64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function sha256(value) {
  return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
function randomString(length = 64) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return b64url(bytes);
}
async function authorize() {
  const clientId = clientInput.value.trim();
  if (!clientId) {
    statusEl.textContent = "Add your Spotify Client ID first.";
    clientInput.focus();
    return;
  }
  if (!/^https:\/\//i.test(location.origin) && location.hostname !== "localhost") {
    statusEl.textContent = "Use the HTTPS URL for this site.";
    return;
  }
  localStorage.setItem(CLIENT_KEY, clientId);
  const verifier = randomString(64);
  sessionStorage.setItem("spotify_pkce_verifier", verifier);
  const challenge = await sha256(verifier);
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    code_challenge_method: "S256",
    code_challenge: challenge,
    scope: SCOPES.join(" ")
  });
  location.assign(`https://accounts.spotify.com/authorize?${params.toString()}`);
}
document.querySelector("#nowPlayingBtn").addEventListener("click", () => authorize());
disconnectBtn.addEventListener("click", () => {
  for (const key of ["spotify_access_token", "spotify_refresh_token", "spotify_expires_at"]) localStorage.removeItem(key);
  sessionStorage.removeItem("spotify_pkce_verifier");
  statusEl.textContent = "Disconnected on this browser. You can authorize again whenever you like.";
  disconnectBtn.hidden = true;
});

async function handleCallback() {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const error = params.get("error");
  if (error) {
    statusEl.textContent = `Spotify authorization failed: ${error}. Check your Spotify Redirect URI settings.`;
    history.replaceState({}, "", BASE_PATH);
    return;
  }
  if (!code) return;
  const clientId = localStorage.getItem(CLIENT_KEY);
  const verifier = sessionStorage.getItem("spotify_pkce_verifier");
  if (!clientId || !verifier) {
    statusEl.textContent = "Authorization session expired. Please choose a mode and try again.";
    history.replaceState({}, "", BASE_PATH);
    return;
  }
  statusEl.textContent = "Finishing Spotify authorization…";
  try {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {"Content-Type": "application/x-www-form-urlencoded"},
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: verifier
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error_description || data.error || "Token exchange failed");
    localStorage.setItem("spotify_access_token", data.access_token);
    if (data.refresh_token) localStorage.setItem("spotify_refresh_token", data.refresh_token);
    localStorage.setItem("spotify_expires_at", String(Date.now() + data.expires_in * 1000));
    sessionStorage.removeItem("spotify_pkce_verifier");
    history.replaceState({}, "", BASE_PATH);
    location.replace(`${BASE_PATH}app.html`);
  } catch (err) {
    statusEl.textContent = `Could not finish login: ${err.message}. Confirm the exact Redirect URI in Spotify Developer Dashboard.`;
    history.replaceState({}, "", BASE_PATH);
  }
}
handleCallback();
disconnectBtn.hidden = !localStorage.getItem("spotify_refresh_token");
