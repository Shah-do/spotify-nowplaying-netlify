// Spotify Authorization Code + PKCE. No client secret is used in this browser app.
const CLIENT_KEY = "spotify_nowplaying_client_id";
const BASE_PATH = location.pathname.startsWith("/spotify-nowplaying-netlify/") ? "/spotify-nowplaying-netlify/" : "/";
const REDIRECT_URI = `${location.origin}${BASE_PATH}`;
const SCOPES = ["user-read-currently-playing", "user-read-playback-state", "user-modify-playback-state"];

const clientInput = document.querySelector("#clientId");
const statusEl = document.querySelector("#status");
const disconnectBtn = document.querySelector("#disconnectBtn");
clientInput.value = localStorage.getItem(CLIENT_KEY) || "";

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
async function authorize(mode) {
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
  localStorage.setItem("spotify_nowplaying_mode", mode);
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
document.querySelector("#desktopBtn").addEventListener("click", () => authorize("desktop"));
document.querySelector("#projectorBtn").addEventListener("click", () => authorize("projector"));
disconnectBtn.addEventListener("click", () => {
  for (const key of ["spotify_access_token", "spotify_refresh_token", "spotify_expires_at", "spotify_nowplaying_mode"]) localStorage.removeItem(key);
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
    const mode = localStorage.getItem("spotify_nowplaying_mode") === "projector" ? "p.html" : "app.html";
    location.replace(`${BASE_PATH}${mode}`);
  } catch (err) {
    statusEl.textContent = `Could not finish login: ${err.message}. Confirm the exact Redirect URI in Spotify Developer Dashboard.`;
    history.replaceState({}, "", BASE_PATH);
  }
}
handleCallback();
disconnectBtn.hidden = !localStorage.getItem("spotify_refresh_token");
