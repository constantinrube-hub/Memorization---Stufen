# Notes for working on this repository

- The app is one file, `public/index.html`. Keep markup, styles and script in it; do not split it or add a build step. Cloudflare publishes `public/` as it is on every push to `main`.
- The page reaches its data only through `window.claude.use('db' | 'assets' | 'downloads')`. On the site that is `public/cloud.js`; in the page tests it is `dev/mock.js`. Both must behave the same: `doc(path).get/set/update/delete/onSnapshot`, `collection(path).where('id','>',x).limit(n).get()`, `assets.upload/list/delete`, files served at `/_blob/<id>`, error codes `unavailable`, `invalid_argument`, `too_large`, `quota_or_state`.
- `update` merges maps key by key and fails with `invalid_argument` when the document does not exist; the two-device change stamps in `meta/pulse` depend on that.
- Data model (decks, notes, logs, meta) is described at the top of the script and in the owner's project notes; documents are whole-document, last-writer-wins.
- Before pushing: `sh dev/run.sh` and `sh dev/cloud.sh` must both end with ALL GREEN.
- Never commit secrets. The password is the Pages secret `STUFEN_PASSWORD`; a Google Maps key, once used, comes from a Pages variable, not from the repository.
- Comments say why, in plain words. The owner reads the app, not the code: explain changes to him in terms of what he sees.
- The real Google map (maps with the Google-like look, study view and region editor) is a picture under the page's own SVG: the page keeps zoom, pan and clicks, and `gSync()` moves the one Google map to match. Never create a second `google.maps.Map`: each one is a billable load. Tests use a stand-in (`dev/gmap.js`); Google cannot be reached from the test machine, so the owner checks the real look.
- Zoom on the Google map ends on a whole Google level by gliding forward around the pointer (`gStep` for wheel notches and the buttons, `gSnap` after a flowing zoom). It must never jump, and never spring back to the level the zoom started from.
- The Street View check in Map settings (`svCheck`) uses only `StreetViewService`, which Google does not bill. Never create a `StreetViewPanorama`: each one is billed. Street View opens as a link to Google Maps.
