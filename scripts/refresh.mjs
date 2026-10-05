import { readFileSync, writeFileSync } from "node:fs";

const library = JSON.parse(readFileSync(new URL("../data/library.json", import.meta.url), "utf8"));
const spottedPath = new URL("../data/spotted.json", import.meta.url);
const checksPath = new URL("../data/checks.json", import.meta.url);

function readJson(url, fallback) {
  try {
    return JSON.parse(readFileSync(url, "utf8"));
  } catch {
    return fallback;
  }
}

const spotted = readJson(spottedPath, []);
const seenPath = new URL("../data/seen.json", import.meta.url);
const seenDoc = readJson(seenPath, null);
const seen = new Set((seenDoc && seenDoc.urls) || []);
const baselining = !seenDoc;
const today = new Date().toISOString().slice(0, 10);

function normalize(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    let path = parsed.pathname.replace(/\/+$/, "");
    if (!path) path = "/";
    return `${parsed.origin}${path}${parsed.search}`.toLowerCase();
  } catch {
    return String(url).trim().toLowerCase();
  }
}

const known = new Set([
  ...library.notices.map((notice) => normalize(notice.sourceUrl)),
  ...library.banks.map((bank) => normalize(bank.hubUrl)),
  ...spotted.map((item) => normalize(item.sourceUrl)),
  ...seen,
]);

const SKIP =
  /login|sign-?in|privacy|cookie|career|locator|facebook|instagram|linkedin|youtube|twitter|play\.google|apps\.apple|javascript:|#|mailto:|tel:/i;
const STRONG = /revision|revised|notice of|important notice|announcement|amendment|amendments/i;
const CARDISH = /credit card|card-i|cardholder|bonus point|treats ?point|rewards? point|visa|mastercard|american express|amex|cashback|enrich|air ?miles|contactless|tawarruq/i;
const NOT_CARD = /debit card|interbank giro|\bgiro\b|telegraphic|swift cable|savings account|current account|fixed deposit|casa-i/i;
const GENERIC = /^(download|view all|read more|learn more|find out|apply now|click here|see more)\b/i;

function isNotice(link) {
  const blob = `${link.title} ${link.url}`;
  if (GENERIC.test(link.title)) return false;
  if (NOT_CARD.test(blob)) return false;
  if (link.title.length < 28) return false;
  return STRONG.test(blob) && CARDISH.test(blob);
}

function decode(text) {
  let out = text.replace(/<[^>]+>/g, " ");
  let prev = "";
  while (out !== prev) {
    prev = out;
    out = out
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/g, " ")
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  }
  return out.replace(/\s+/g, " ").trim();
}

function cleanTitle(title) {
  let text = title.replace(/\bdownload link\b/gi, " ").replace(/\s+/g, " ").trim();
  const half = text.slice(0, Math.ceil(text.length / 2)).trim();
  if (half && text.endsWith(half) && text.startsWith(half)) text = half;
  return text;
}

function extractLinks(html, pageUrl) {
  const found = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html))) {
    const rawHref = match[1].trim();
    const title = cleanTitle(decode(match[2]));
    if (!title || title.length < 18 || title.length > 220) continue;
    if (SKIP.test(rawHref) || SKIP.test(title)) continue;
    let url;
    try {
      url = new URL(rawHref, pageUrl).href;
    } catch {
      continue;
    }
    if (!/^https?:$/i.test(new URL(url).protocol)) continue;
    found.push({ title, url });
  }
  return found;
}

function guessKind(title) {
  const text = title.toLowerCase();
  if (/point|miles|enrich|reward|cashback/.test(text)) return "points";
  if (/fee|charge|waiver/.test(text)) return "fees";
  if (/benefit|privilege|lounge/.test(text)) return "benefits";
  if (/terms|condition|agreement|amend/.test(text)) return "terms";
  return "product";
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; RakCardCirculars/1.0; +https://github.com/spothao/rak-card-circulars)",
        accept: "text/html,application/xhtml+xml",
      },
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text: text.slice(0, 1_500_000) };
  } finally {
    clearTimeout(timer);
  }
}

const checks = [];
let added = 0;

for (const bank of library.banks) {
  const check = { bankId: bank.id, checkedOn: today, ok: false, status: 0, links: 0, added: 0, error: "" };
  try {
    const result = await fetchText(bank.hubUrl);
    check.status = result.status;
    check.ok = result.ok;
    const links = extractLinks(result.text, bank.hubUrl);
    check.links = links.length;
    for (const link of links) {
      const key = normalize(link.url);
      if (known.has(key)) continue;
      if (!isNotice(link)) continue;
      console.log(`  ${baselining ? "baseline" : "new"} ${link.title}`);
      if (check.added >= 8) continue;
      const host = new URL(bank.hubUrl).hostname.replace(/^www\./, "");
      const linkHost = new URL(link.url).hostname.replace(/^www\./, "");
      if (linkHost !== host && !link.url.toLowerCase().endsWith(".pdf")) continue;
      const item = {
        id: `spot-${bank.id}-${key.slice(-24).replace(/[^a-z0-9]+/g, "-")}`,
        bankId: bank.id,
        title: link.title,
        published: null,
        effective: null,
        kind: guessKind(link.title),
        severity: "watch",
        scope: "bank",
        cardIds: library.cards.filter((card) => card.bankId === bank.id).map((card) => card.id),
        summary: `Spotted on ${bank.hubLabel} on ${today}. The weekly check only captured the title and link. Open the source before you rely on it.`,
        changes: [],
        sourceLabel: bank.hubLabel,
        sourceUrl: link.url,
        sourceKind: "bank",
        spotted: today,
      };
      seen.add(key);
      known.add(key);
      if (!baselining) {
        spotted.unshift(item);
        added += 1;
        check.added += 1;
      }
    }
  } catch (error) {
    check.error = error instanceof Error ? error.name : "fetch failed";
  }
  checks.push(check);
  console.log(`${bank.short}: status ${check.status} links ${check.links} new ${check.added}${check.error ? ` (${check.error})` : ""}`);
}

writeFileSync(seenPath, JSON.stringify({ baselinedOn: seenDoc?.baselinedOn || today, urls: [...seen].sort() }, null, 2) + "\n");
writeFileSync(spottedPath, JSON.stringify(spotted, null, 2) + "\n");
writeFileSync(
  checksPath,
  JSON.stringify({ checkedOn: today, added, banks: checks }, null, 2) + "\n",
);
console.log(`added ${added}`);
