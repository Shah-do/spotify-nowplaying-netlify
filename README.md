# NowPlaying — Netlify edition

A browser-only Spotify now-playing display adapted from the original 11ason release. Uses Spotify Authorization Code with PKCE; no client secret or always-on server is required.

## 1. Create a Spotify Developer app

1. Open https://developer.spotify.com/dashboard and create an app.
2. Copy its **Client ID**.
3. Add the exact Redirect URI for your deployed site, including the trailing slash, for example:
   `https://YOUR-SITE-NAME.netlify.app/`
4. Save the settings. Use your own app's Client ID, not the original author's ID.

The redirect URI must exactly match `location.origin + "/"` used by this site. Do not add a Client Secret to this repository or the browser.

## 2. Deploy to Netlify

1. Push the contents of this folder to a new GitHub repository.
2. In Netlify, choose **Add new site → Import an existing project** and select the repository.
3. Build command: leave blank.
4. Publish directory: `.` (a single dot).
5. Deploy the site.
6. Copy the resulting `https://...netlify.app/` address into Spotify Developer Dashboard as the Redirect URI and save.

If you later change the Netlify site name/domain, update the Spotify Redirect URI too.

## 3. Use it

1. Open your Netlify site.
2. Paste your Spotify Client ID into the field.
3. Choose Desktop mode or Projector mode and approve the Spotify permissions.
4. Start playback on Spotify. The display polls playback state every five seconds and requests synced lyrics from LRCLIB when available.

## Notes

- This is a personal-use starter, not a production multi-user service.
- Tokens are kept in this browser's local storage. Anyone with access to the same browser profile can potentially access that session. Use only on a device/profile you control.
- The Spotify account must be eligible to use the requested API scopes, and Spotify developer settings/policies may change.
- If Spotify reports `INVALID_CLIENT`, `INVALID_REDIRECT_URI`, or a token exchange error, check the Client ID and exact redirect URI.
- No Spotify Client Secret is needed or should be added.
