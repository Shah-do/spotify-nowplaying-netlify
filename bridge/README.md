# NowPlaying bridge (Tautulli + Plex)

The bridge keeps the Tautulli API key on your own server. The public GitHub Pages app only needs the bridge URL; do not put real server URLs or credentials in repository files.

## Configure locally
Copy `.env.example` to `.env` (or enter the variables in your Docker UI) and set:

- `TAUTULLI_URL`: base URL reachable from the bridge, without `/api/v2`.
- `TAUTULLI_API_KEY`: Tautulli API key.
- `PLEX_URL` and `PLEX_TOKEN`: optional but required for movie-library screensaver images and authenticated Plex artwork.
- `ALLOWED_ORIGIN`: exact site origin, normally `https://shah-do.github.io`.

Never commit a real `.env` file. Publish the bridge through HTTPS before connecting it to a GitHub Pages site. Restrict access to the bridge using your reverse proxy, VPN, or tunnel.

## Start
Run in this directory:

```sh
docker compose --env-file .env up -d --build
```

Check `https://YOUR-BRIDGE-DOMAIN/health`. Then paste that base URL into NowPlaying setup.

## Endpoints
- `GET /health`: bridge configuration check.
- `GET /api/status`: active or paused Plex playback metadata and progress.
- `GET /api/screensaver`: random movie backdrop candidates from Plex movie libraries.

The bridge is read-only and does not control playback.
