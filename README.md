# Stufen

Flashcards on your own repetition ladder: decks, map-click cards, schedules, statistics. A single page (`public/index.html`) with its data in a Cloudflare D1 database, behind one password.

## Layout

| Path | What it is |
|---|---|
| `public/index.html` | The whole app: markup, styles and script in one file. |
| `public/cloud.js` | Storage for the page: sign-in box, documents, stored files, downloads. Talks to `/api`. |
| `public/lib/` | Libraries and map data the page loads on demand (Anki and spreadsheet import, world map). |
| `functions/` | The server side, run by Cloudflare Pages Functions: `/api/*` (login, documents, files) and `/_blob/<id>`. |
| `server/lib.js` | Shared by the functions: tables, login cookie. |
| `dev/` | Tests. `sh dev/run.sh` tests the page; `sh dev/cloud.sh` tests sign-in and storage end to end. |

## Cloudflare setup (once)

1. **Pages project**: Workers & Pages → Create → Pages → Connect to Git → this repository. Framework preset: None. Build command: empty. Build output directory: `public`.
2. **Database**: Storage & Databases → D1 → Create database, name `stufen`.
3. **Bindings**, in the Pages project under Settings:
   - D1 database binding: variable name `DB` → database `stufen`.
   - Variable (encrypted secret): `STUFEN_PASSWORD` → the password you want to sign in with.
4. **Redeploy** once so the bindings apply (Deployments → Retry deployment).

The tables are created on first use. Every push to `main` is published automatically.

## Limits that matter

- One document (a deck, a row, a day's answer log) holds at most 1 MB; one stored file at most 20 MB; all stored files together 350 MB (the free D1 database holds 500 MB).
- Only requests to `/api/*` and `/_blob/*` run server code (`public/_routes.json`), so the page and its libraries do not count against the free daily request allowance.

## Tests

```sh
sh dev/run.sh      # the page itself, with stand-in storage (needs playwright)
sh dev/cloud.sh    # sign-in, database and files, against a local copy of the site (needs wrangler)
```
