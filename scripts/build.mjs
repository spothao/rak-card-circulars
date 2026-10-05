import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const library = JSON.parse(readFileSync(new URL("data/library.json", root), "utf8"));
const spotted = JSON.parse(readFileSync(new URL("data/spotted.json", root), "utf8"));
const checks = JSON.parse(readFileSync(new URL("data/checks.json", root), "utf8"));
const client = readFileSync(new URL("desk-client.js", import.meta.url), "utf8");
const payload = JSON.stringify({ library, spotted, checks }).replace(/</g, "\\u003c");

function prettyDay(iso) {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Rak — card circulars</title>
  <meta name="description" content="Card circulars for one Malaysian wallet: feed, banks, wallet, and notices you file." />
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect fill='%238f2d28' width='32' height='32' rx='6'/%3E%3Ctext x='16' y='22' text-anchor='middle' fill='%23fffdf9' font-size='16' font-family='Georgia'%3ER%3C/text%3E%3C/svg%3E" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,520;9..144,640&family=Source+Sans+3:wght@400;600;700&display=swap" />
  <style>
    :root { color-scheme: light; --bg:#efeae1; --surface:#f7f4ee; --raised:#fffdf9; --ink:#1c1916; --muted:#6f675d; --line:#ddd4c6; --stamp:#8f2d28; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font-family: "Source Sans 3", sans-serif; font-size: 1.0625rem; line-height: 1.5; }
    h1, h2 { font-family: Fraunces, Georgia, serif; font-weight: 520; text-wrap: balance; }
    header { background: var(--surface); border-bottom: 1px solid var(--line); }
    .wrap { max-width: 46rem; margin: 0 auto; padding: 1.25rem 1rem 5.5rem; }
    .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
    .brand { font-family: Fraunces, Georgia, serif; font-size: 2.4rem; line-height: 1; margin: 0; }
    .lede { color: var(--muted); margin: 0.4rem 0 0; max-width: 36rem; }
    .stamp, .open { display: inline-block; background: var(--stamp); color: var(--raised); border-radius: 999px; padding: 0.25rem 0.75rem; font-size: 0.9rem; font-weight: 700; white-space: nowrap; }
    .stamp { margin-top: 0; }
    .bar { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 1rem 0; }
    input, select, textarea, button { font: inherit; color: var(--ink); }
    input, select, textarea { width: 100%; border: 1px solid var(--line); background: var(--surface); border-radius: 0.875rem; padding: 0.65rem 0.9rem; }
    input[type="search"] { border-radius: 999px; background: var(--raised); min-height: 2.75rem; flex: 1 1 12rem; }
    button { min-height: 2.75rem; border-radius: 999px; border: 1px solid var(--line); background: var(--raised); padding: 0 1rem; font-weight: 700; cursor: pointer; }
    button.on { background: var(--ink); color: var(--raised); border-color: var(--ink); }
    button.danger { border: 0; background: transparent; color: var(--stamp); padding-left: 0; }
    button.go, a.go { display: inline-flex; align-items: center; min-height: 2.75rem; background: var(--stamp); color: var(--raised); text-decoration: none; font-weight: 700; font-size: 0.95rem; border-radius: 999px; padding: 0 1rem; border: 0; }
    a.go { background: var(--ink); }
    section { margin-top: 1.25rem; }
    h2 { font-size: 1.45rem; margin: 0 0 0.55rem; line-height: 1.2; }
    .card { background: var(--raised); border: 1px solid var(--line); border-radius: 0.875rem; padding: 1rem 1.05rem; margin: 0 0 0.75rem; }
    button.card { display: block; width: 100%; text-align: left; border-radius: 0.875rem; }
    .card h2 { font-size: 1.35rem; }
    .meta, .when, .muted { color: var(--muted); font-size: 0.92rem; }
    .stamp-text { color: var(--stamp); font-weight: 700; margin: 0; }
    .dot { display: inline-block; width: 0.5rem; height: 0.5rem; border-radius: 99px; background: var(--stamp); margin-right: 0.4rem; }
    .dot.off { background: var(--line); }
    .change { border-top: 1px solid var(--line); padding-top: 0.6rem; margin-top: 0.6rem; }
    .change dt { font-weight: 700; font-size: 0.92rem; }
    .change dd { margin: 0.15rem 0; }
    .split { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; }
    .stack { display: grid; gap: 0.75rem; }
    .pair { display: grid; gap: 0.75rem; }
    label { display: grid; gap: 0.3rem; font-size: 0.92rem; font-weight: 700; }
    fieldset { border: 0; margin: 0; padding: 0; }
    legend { font-weight: 700; font-size: 0.92rem; }
    @media (min-width: 700px) {
      .pair { grid-template-columns: 1fr 1fr; }
      .wrap { padding-bottom: 3rem; }
      .dock { display: none; }
    }
    .dock { position: fixed; inset: auto 0 0 0; z-index: 5; display: grid; grid-template-columns: repeat(4, 1fr); background: var(--surface); border-top: 1px solid var(--line); }
    .dock button { border: 0; border-radius: 0; background: transparent; min-height: 3.5rem; }
    .dock button.on { color: var(--stamp); background: transparent; }
    footer { color: var(--muted); font-size: 0.92rem; margin-top: 2rem; }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <div class="top">
        <div>
          <p class="brand">Rak</p>
          <p class="lede">Card circulars for one Malaysian wallet, plus every other credit-card issuer. Library compiled ${prettyDay(library.compiledOn)}. Official pages last checked ${prettyDay(checks.checkedOn || library.compiledOn)}. Cards you add, and notices you file, stay in this browser.</p>
        </div>
        <p class="open" id="open-count">0 open</p>
      </div>
      <nav class="bar" id="nav" aria-label="Sections"></nav>
    </div>
  </header>
  <main class="wrap">
    <div id="view"></div>
    <footer>
      <p>Rak does not read email and does not invent a before/after it could not read. Press items are labelled. If a write-up disagrees with the bank page, the bank page wins.</p>
    </footer>
  </main>
  <nav class="dock" id="dock" aria-label="Sections"></nav>
  <script id="rak-data" type="application/json">${payload}</script>
  <script>
${client}
  </script>
</body>
</html>
`;

mkdirSync(new URL("dist", root), { recursive: true });
writeFileSync(new URL("dist/index.html", root), html);
writeFileSync(new URL("dist/.nojekyll", root), "");
console.log("wrote dist/index.html", html.length);
