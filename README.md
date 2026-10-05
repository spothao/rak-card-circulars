# Rak

Weekly public digest of Malaysian credit-card notices for one wallet: Maybank, CIMB, Hong Leong, OCBC, AmBank, HSBC Amanah, Alliance, Affin, and AEON Credit.

The curated library lives in [data/library.json](data/library.json). Every Monday at 09:00 Malaysia time, GitHub Actions opens each bank’s official announcements page, records the check, and adds any new notice-like link to [data/spotted.json](data/spotted.json). It then publishes a static site to GitHub Pages.

The job does not read email, and it does not invent a before/after it could not read off the page. Open the source link on each card.

Run it by hand from the Actions tab with **Weekly card circulars**, or locally:

```bash
node scripts/refresh.mjs
node scripts/build.mjs
```

Open `dist/index.html`.
