# backlog

Raw ideas and mid-session discoveries. Never directly worked — triaged
(promoted to `todo.md`, merged, or deleted) during planning sessions.
See `AGENTS.md` for the two-file planning model.

- Move `www/projection.test.mjs` and `www/snapshotPixels.test.mjs` out of the
  document root; they are currently served over HTTP even though only
  `node --test` loads them.
- Document the nginx `.mjs` MIME requirement in the README — it lives in the
  host config, so a fresh clone does not have it.
- Remember the tailnet URL can 403 after a `www/` inode change because the
  tailscale-router container has a stale mount; restart it before assuming a
  code fault.
- Revisit the `kb/Camera-Snapping-and-Scrolling.md` wording about sub-pixel
  crop offsets after Step 6 character-follow lands.
