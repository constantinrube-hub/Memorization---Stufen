# Notes for working on this repository

- The app is one file, `public/index.html`. Keep markup, styles and script in it; do not split it or add a build step. Cloudflare publishes `public/` as it is on every push to `main`.
- The page reaches its data only through `window.claude.use('db' | 'assets' | 'downloads')`. On the site that is `public/cloud.js`; in the page tests it is `dev/mock.js`. Both must behave the same: `doc(path).get/set/update/delete/onSnapshot`, `collection(path).where('id','>',x).limit(n).get()`, `assets.upload/list/delete`, files served at `/_blob/<id>`, error codes `unavailable`, `invalid_argument`, `too_large`, `quota_or_state`.
- `update` merges maps key by key and fails with `invalid_argument` when the document does not exist; the two-device change stamps in `meta/pulse` depend on that.
- Data model (decks, notes, logs, meta) is described at the top of the script and in the owner's project notes; documents are whole-document, last-writer-wins.
- Before pushing: `sh dev/run.sh` and `sh dev/cloud.sh` must both end with ALL GREEN.
- Never commit secrets. The password is the Pages secret `STUFEN_PASSWORD`; a Google Maps key, once used, comes from a Pages variable, not from the repository.
- Comments say why, in plain words. The owner reads the app, not the code: explain changes to him in terms of what he sees.
