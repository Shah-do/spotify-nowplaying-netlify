# NowPlaying

A browser-only Spotify now-playing display with optional Plex integration. It uses Spotify Authorization Code with PKCE; no Spotify client secret or always-on backend is required.

## Don't want to build or deploy it yourself?

**Use the hosted version:** https://shah-do.github.io/spotify-nowplaying-netlify/

1. Open the hosted link and enter your Spotify app's **Client ID**. If you don't have one, create an app at https://developer.spotify.com/dashboard.
2. In your Spotify app settings, add this exact Redirect URI:
   `https://shah-do.github.io/spotify-nowplaying-netlify/`
3. Save the Spotify app settings, return to the hosted NowPlaying page, and click **Now Playing**.
4. Approve the requested Spotify permissions. Plex is optional; leave it disabled if you only want Spotify.
5. If you connected Spotify before artist portraits were added, disconnect and reconnect once to grant playlist access for the screensaver.

This is for people who want to use the existing hosted version without downloading, editing, or deploying the project themselves. Your Spotify tokens and settings are stored in your browser profile, so use a trusted browser and don't share your profile.

## Want to host your own copy?

The instructions below are for people who want to deploy their own version.

## Quick start: deploy first, then configure Spotify

Spotify requires the exact deployed URL as an allowed Redirect URI, so deploy the static files before finishing the Spotify Developer Dashboard setup.

### Option A — Netlify (recommended for a quick setup)

1. Download the repository as a ZIP from **Code → Download ZIP**: https://github.com/Shah-do/spotify-nowplaying-netlify
2. Extract it on your computer.
3. Open https://app.netlify.com/drop and drag the extracted project folder (the folder containing `index.html`, `app.js`, and `style.css`) into the drop area. If Netlify requires a ZIP, zip the contents of that folder and upload it.
4. Copy the deployed HTTPS URL, for example `https://your-site.netlify.app/`.
5. Open https://developer.spotify.com/dashboard, create a Spotify app, and copy its **Client ID**.
6. In that Spotify app's settings, add the exact deployed URL as a Redirect URI, including the trailing slash, and save it.
7. Open your deployed site, paste the Client ID, then click **Now Playing** and approve the requested permissions.

### Option B — Cloudflare Pages

1. Create a Pages project at https://dash.cloudflare.com/ and upload the static site using the supported direct-upload workflow, or connect the GitHub repository.
2. Use the generated HTTPS domain as your Spotify Redirect URI. This app expects the site root URL.
3. Add that exact URL (with trailing slash) to your Spotify app's Redirect URI list, save, then connect from the deployed site.

### Option C — GitHub Pages

1. Use the repository at https://github.com/Shah-do/spotify-nowplaying-netlify and enable Pages from the repository's **Settings → Pages**.
2. This repository supports the project path `/spotify-nowplaying-netlify/`. For a different repository name, update `BASE_PATH` in `app.js` and `display.js` before deploying.
3. Add the deployed site root including the project path and trailing slash (for example `https://YOUR-USERNAME.github.io/spotify-nowplaying-netlify/`) as a Redirect URI in Spotify Developer Dashboard.
4. Paste your Client ID into the site and authorize.

## Build, environment variables, and local development

This repository is a **static, browser-only app**. The server-side environment-variable setup used by apps with a backend or Netlify Functions does **not** apply to this project.

- **Required environment variables:** none. Do not create `SPOTIFY_CLIENT_SECRET` or `SPOTIFY_REFRESH_TOKEN`; this app uses Spotify Authorization Code with PKCE in the browser and obtains/stores its tokens through the authorization flow. The only Spotify value you enter into the setup page is the **Client ID**.
- **Netlify environment settings:** no Spotify variables need to be added under **Site configuration / Site settings → Environment variables** (menu wording may vary). Do not put a client secret or refresh token in `netlify.toml`.
- **Build command:** none. There is no framework build step or `npm run build` script.
- **Publish directory:** the repository/project root (`.`), where `index.html`, `app.js`, and `style.css` are located.
- **Functions directory:** none. The project does not use Netlify Serverless Functions; Spotify API calls and PKCE token exchange happen in the browser.
- **Local prerequisites:** Node.js is not required just to use the app or deploy the static files. If you want a local HTTP server for testing, any simple static file server will work; no `npm install`, `.env`, or `netlify dev` setup is required for the current architecture.

If the app is later redesigned to use a server-side token exchange or Netlify Functions, its architecture and setup instructions must be updated together. Never add a Spotify client secret to browser code or commit real tokens to GitHub.

## Spotify-only mode

Plex is optional and disabled by default. Connect Spotify and click **Now Playing**; you do not need to fill in any Plex fields.

When Spotify is idle, the display can build a small artist list from playlists available to your account and show matching public portraits from Wikimedia Commons. This requires the `playlist-read-private` permission. Playlist access may be limited by Spotify's API rules; inaccessible playlists and unavailable portraits are skipped. If no portraits are found, the screen stays black with the clock.

Artist portraits need Spotify playlist permission. If you connected Spotify before this feature was added, disconnect and reconnect once to enable the artist screensaver.


If Spotify or Plex playback stays paused for **2 minutes**, the display returns to the available idle screensaver. Resuming playback brings the playback display back.

## Optional Plex setup

1. Open Plex Web while signed in to the account that can access your server.
2. Find your Plex token using Plex's account/developer guidance. Treat it like a password; do not paste it into public issues, chats, or source code.
3. In NowPlaying setup, expand **Plex server connection**.
4. Enter your Plex server's reachable HTTPS URL, the token, and the exact Plex usernames allowed to appear. Use comma-separated usernames if needed.
5. Turn on **Enable Plex playback and movie screensaver**, save, and use **Test connection**. The browser must be able to reach Plex and the server must permit cross-origin browser requests (CORS).
6. Click **Now Playing**. When Plex is enabled and configured, current Plex playback and the full-library movie-art screensaver remain the primary Plex behavior.

## Privacy and security

- The app is static and runs in your browser; there is no app-owned backend collecting listening data.
- Spotify access/refresh tokens, Client ID, and Plex settings are stored in that browser profile's local storage. Anyone with access to the same profile or browser devtools can potentially access them. Avoid shared/public browser profiles.
- Never add a Spotify Client Secret or Plex token to the repository. A Spotify Client ID is not a secret.
- The display polls Spotify playback about every five seconds. Synced lyric lookups send track title, artist, album, and duration to LRCLIB. The artist screensaver sends artist names to Wikimedia Commons search. These third parties can receive query details and your IP address.
- Plex requests go directly from your browser to the Plex URL you configure. The Plex token is included in request query parameters as required by Plex, so prefer HTTPS and a trusted server endpoint.
- Disconnecting Spotify removes Spotify tokens from local storage on that browser. To remove the Plex token, clear this site's local storage/site data in the browser.
- This is a personal-use app. Review current Spotify API policies and access limitations before sharing it publicly.

## Troubleshooting

- **Spotify login fails:** confirm the Client ID and exact deployed Redirect URI, including the trailing slash and any GitHub Pages project path.
- **Spotify-only screensaver is blank:** reconnect to grant playlist access; it only uses playlists the API lets the app read and artists for whom a public portrait is found.
- **Plex fails the connection test:** check the URL, token, CORS, HTTPS/mixed-content restrictions, and username allowlist.
- No build command is needed for these static files. Netlify's publish directory is the project root (`.`).
