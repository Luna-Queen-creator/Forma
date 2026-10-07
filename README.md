# Forma

A personal planner and tracker for strength training, cardio, HIIT, yoga, mobility and meditation, plus body measurements, all in one app.

**Privacy:** Forma has no accounts, no server, no analytics and no tracking. Everything you enter, including body measurements and progress photos, is stored only in your own browser, on your own device. This repository and the published site contain nothing but the app itself. Anyone opening the site gets an empty app with their own private storage.

## Use it
Open the published site on your phone and choose **Install app** (Chrome / Samsung Internet) or **Add to Home Screen** (Safari). It works offline once installed. Back up your data from **Settings → App & backups**.

`Forma.html` is a single-file edition you can also open directly without a web address.

## Change it
- Edit the app in `source/`. It runs as-is (open `source/index.html`).
- Run `python3 build.py`. It regenerates `docs/` (the site GitHub Pages serves, with a versioned offline cache) and `Forma.html`.
- Commit and push. Installed apps show an "Update now" notice for the new version.

See `START-HERE.txt` for the file layout.

Exercise instructions are general guidance, not medical or personal-training advice.
