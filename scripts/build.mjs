import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const library = JSON.parse(readFileSync(new URL("data/library.json", root), "utf8"));
const spotted = JSON.parse(readFileSync(new URL("data/spotted.json", root), "utf8"));
const checks = JSON.parse(readFileSync(new URL("data/checks.json", root), "utf8"));

const kindLabel = library.kindLabel;
const bankById = Object.fromEntries(library.banks.map((bank) => [bank.id, bank]));
const cardById = Object.fromEntries(library.cards.map((card) => [card.id, card]));

function escapeHtml(value) {
  const named = { "&": "amp", "<": "lt", ">": "gt", '"': "quot" };
  return String(value).replace(/[&<>"]/g, (ch) => "&" + named[ch] + ";");
}

function pretty(iso) {
  if (!iso) return "";
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function daysFrom(iso, today) {
  const [y, m, d] = iso.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const a = Date.UTC(y, m - 1, d);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((a - b) / 86_400_000);
}

const today = checks.checkedOn || library.compiledOn;

function timing(effective) {
  if (!effective) return "";
  const days = daysFrom(effective, today);
  if (days > 1) return `Takes effect ${pretty(effective)} · in ${days} days`;
  if (days === 1) return `Takes effect tomorrow, ${pretty(effective)}`;
  if (days === 0) return `Takes effect today, ${pretty(effective)}`;
  return `In force since ${pretty(effective)}`;
}

function noticeHtml(notice) {
  const bank = bankById[notice.bankId];
  const cards = (notice.cardIds || []).map((id) => cardById[id]?.name).filter(Boolean);
  const changes = (notice.changes || [])
    .map(
      (row) => `<div class="change">
        <dt>${escapeHtml(row.label)}</dt>
        <dd class="muted">Before: ${escapeHtml(row.before)}</dd>
        <dd>Now: ${escapeHtml(row.after)}</dd>
      </div>`,
    )
    .join("");
  const when = notice.effective ? timing(notice.effective) : notice.published ? `Dated ${pretty(notice.published)}` : notice.spotted ? `Spotted ${pretty(notice.spotted)}` : "";
  return `<article class="card" data-bank="${escapeHtml(notice.bankId)}" data-kind="${escapeHtml(notice.kind)}" data-title="${escapeHtml(`${notice.title} ${bank?.name ?? ""} ${cards.join(" ")}`.toLowerCase())}">
    <p class="meta"><span class="dot"></span>${escapeHtml(bank?.short ?? notice.bankId)} · ${escapeHtml(kindLabel[notice.kind] || notice.kind)}${notice.spotted ? " · New on the page" : ""}${notice.sourceKind === "press" ? " · Press" : ""}</p>
    <h2>${escapeHtml(notice.title)}</h2>
    <p class="when">${escapeHtml(when)}</p>
    <p>${escapeHtml(notice.summary)}</p>
    ${changes ? `<dl>${changes}</dl>` : ""}
    <p class="muted">Touches: ${escapeHtml(cards.join(", ") || bank?.short || "")}</p>
    <p><a class="go" href="${escapeHtml(notice.sourceUrl)}" rel="noreferrer">${escapeHtml(notice.sourceLabel || "Source")}</a></p>
  </article>`;
}

const curated = library.notices.filter((notice) => notice.scope !== "other");
const ahead = curated.filter((notice) => notice.effective && daysFrom(notice.effective, today) >= 0);
const rest = curated.filter((notice) => !ahead.includes(notice));
const checkByBank = Object.fromEntries((checks.banks || []).map((row) => [row.bankId, row]));

const banksHtml = library.banks
  .map((bank) => {
    const held = library.cards.filter((card) => card.bankId === bank.id).map((card) => card.name);
    const row = checkByBank[bank.id];
    const status = row
      ? row.ok
        ? `Checked ${pretty(row.checkedOn)} · ${row.added} new link${row.added === 1 ? "" : "s"}`
        : `Check failed ${pretty(row.checkedOn)}${row.error ? ` · ${row.error}` : ""}`
      : "Not checked yet";
    return `<article class="card">
      <h2>${escapeHtml(bank.short)}</h2>
      <p class="muted">${escapeHtml(held.join(" · "))}</p>
      <p>${escapeHtml(status)}</p>
      <p><a class="go" href="${escapeHtml(bank.hubUrl)}" rel="noreferrer">${escapeHtml(bank.hubLabel)}</a></p>
    </article>`;
  })
  .join("");

const kinds = ["all", ...Object.keys(kindLabel)];
const chips = kinds
  .map(
    (kind) =>
      `<button type="button" data-kind="${kind}" class="${kind === "all" ? "on" : ""}">${kind === "all" ? "All" : escapeHtml(kindLabel[kind])}</button>`,
  )
  .join("");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Rak — card circulars</title>
  <meta name="description" content="Weekly public digest of Malaysian credit-card notices for one wallet." />
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect fill='%238f2d28' width='32' height='32' rx='6'/%3E%3Ctext x='16' y='22' text-anchor='middle' fill='%23fffdf9' font-size='16' font-family='Georgia'%3ER%3C/text%3E%3C/svg%3E" />
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,520;9..144,640&family=Source+Sans+3:wght@400;600;700&display=swap" />
  <style>
    :root { color-scheme: light; --bg:#efeae1; --surface:#f7f4ee; --raised:#fffdf9; --ink:#1c1916; --muted:#6f675d; --line:#ddd4c6; --stamp:#8f2d28; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--ink); font-family: "Source Sans 3", sans-serif; font-size: 1.0625rem; line-height: 1.5; }
    h1, h2 { font-family: Fraunces, Georgia, serif; font-weight: 520; text-wrap: balance; }
    header { background: var(--surface); border-bottom: 1px solid var(--line); }
    .wrap { max-width: 46rem; margin: 0 auto; padding: 1.25rem 1rem 3rem; }
    .brand { font-family: Fraunces, Georgia, serif; font-size: 2.4rem; line-height: 1; margin: 0; }
    .lede { color: var(--muted); margin: 0.4rem 0 0; }
    .stamp { display: inline-block; margin-top: 0.8rem; background: var(--stamp); color: var(--raised); border-radius: 999px; padding: 0.25rem 0.75rem; font-size: 0.9rem; font-weight: 700; }
    .bar { display: flex; flex-wrap: wrap; gap: 0.5rem; margin: 1rem 0; }
    input, button { min-height: 2.75rem; border-radius: 999px; font: inherit; }
    input { flex: 1 1 12rem; border: 1px solid var(--line); background: var(--raised); padding: 0 1rem; color: var(--ink); }
    button { border: 0; background: var(--raised); color: var(--ink); padding: 0 1rem; font-weight: 700; cursor: pointer; }
    button.on { background: var(--stamp); color: var(--raised); }
    section { margin-top: 1.75rem; }
    h2 { font-size: 1.6rem; margin: 0 0 0.6rem; }
    .card { background: var(--raised); border: 1px solid var(--line); border-radius: 0.875rem; padding: 1rem 1.05rem; margin: 0 0 0.75rem; }
    .card h2 { font-size: 1.35rem; line-height: 1.25; }
    .meta, .when, .muted { color: var(--muted); font-size: 0.92rem; }
    .dot { display: inline-block; width: 0.5rem; height: 0.5rem; border-radius: 99px; background: var(--stamp); margin-right: 0.4rem; }
    .change { border-top: 1px solid var(--line); padding-top: 0.6rem; margin-top: 0.6rem; }
    .change dt { font-weight: 700; font-size: 0.92rem; }
    .change dd { margin: 0.15rem 0; }
    a.go { display: inline-flex; align-items: center; min-height: 2.75rem; background: var(--ink); color: var(--raised); text-decoration: none; font-weight: 700; font-size: 0.92rem; border-radius: 999px; padding: 0 1rem; }
    a.go:hover { background: var(--stamp); }
    .hidden { display: none; }
    footer { color: var(--muted); font-size: 0.92rem; margin-top: 2rem; }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <p class="brand">Rak</p>
      <p class="lede">Card circulars for one Malaysian wallet. Library compiled ${escapeHtml(pretty(library.compiledOn))}. Official pages last checked ${escapeHtml(pretty(checks.checkedOn || library.compiledOn))}.</p>
      <p class="stamp">${escapeHtml(String((checks.added ?? 0) + spotted.length))} spotted since the library</p>
    </div>
  </header>
  <main class="wrap">
    <div class="bar">
      <input id="q" type="search" placeholder="Search bank, card, or change" aria-label="Search notices" />
      ${chips}
    </div>
    <section id="spotted">
      <h2>Spotted this week</h2>
      ${
        spotted.length
          ? spotted.map(noticeHtml).join("")
          : `<p class="card muted">No new notice link on the official pages since the library was compiled. The weekly job still opens each bank page and records the check under Banks.</p>`
      }
    </section>
    <section id="ahead">
      <h2>Still ahead</h2>
      ${ahead.length ? ahead.map(noticeHtml).join("") : `<p class="card muted">Nothing dated after the last check.</p>`}
    </section>
    <section id="file">
      <h2>Already in the library</h2>
      ${rest.map(noticeHtml).join("")}
    </section>
    <section>
      <h2>Banks</h2>
      <p class="muted">These are the pages the Monday job opens. A new link is only listed above when the title looks like a card notice.</p>
      ${banksHtml}
    </section>
    <footer>
      <p>Rak does not read email and does not invent a before/after it could not read. Press items are labelled. If a write-up disagrees with the bank page, the bank page wins.</p>
    </footer>
  </main>
  <script>
    const q = document.getElementById("q");
    const buttons = [...document.querySelectorAll("button[data-kind]")];
    let kind = "all";
    function apply() {
      const needle = q.value.trim().toLowerCase();
      for (const card of document.querySelectorAll("article.card[data-kind]")) {
        const kindOk = kind === "all" || card.dataset.kind === kind;
        const textOk = !needle || (card.dataset.title || "").includes(needle) || card.textContent.toLowerCase().includes(needle);
        card.classList.toggle("hidden", !(kindOk && textOk));
      }
    }
    q.addEventListener("input", apply);
    for (const button of buttons) {
      button.addEventListener("click", () => {
        kind = button.dataset.kind;
        for (const other of buttons) other.classList.toggle("on", other === button);
        apply();
      });
    }
  </script>
</body>
</html>
`;

mkdirSync(new URL("dist", root), { recursive: true });
writeFileSync(new URL("dist/index.html", root), html);
writeFileSync(new URL("dist/.nojekyll", root), "");
console.log("wrote dist/index.html", html.length);
