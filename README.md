# Rak

Weekly public digest of Malaysian credit-card notices. The wallet is Maybank, CIMB, Hong Leong, OCBC, AmBank, HSBC Amanah, Alliance, Affin, and AEON Credit. The Monday job also watches the other credit-card issuers: Public Bank, RHB, UOB Malaysia, Standard Chartered, HSBC Bank Malaysia, Bank Islam, Bank Muamalat, Bank Rakyat, BSN, and ICBC Malaysia.

Issuers you do not hold are watched at bank level. No product cards are invented for them.

The curated library lives in [data/library.json](data/library.json). Every Monday at 09:00 Malaysia time, GitHub Actions opens each bank’s official announcements page, records the check, and adds any new notice-like link to [data/spotted.json](data/spotted.json). It then writes [index.html](index.html) at the root of `main`. GitHub Pages serves that file from the `main` branch.

The job does not read email, and it does not invent a before/after it could not read off the page. Open the source link on each card.

Run it by hand from the Actions tab with **Weekly card circulars**, or locally:

```bash
node scripts/refresh.mjs
node scripts/build.mjs
```

Open `dist/index.html`.
