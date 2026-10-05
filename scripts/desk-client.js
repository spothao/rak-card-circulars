const data = JSON.parse(document.getElementById("rak-data").textContent);
const library = data.library;
const spotted = data.spotted || [];
const checks = data.checks || {};
const kindLabel = library.kindLabel;
const kinds = ["all", ...Object.keys(kindLabel)];
const banks = library.banks;
const bankById = Object.fromEntries(banks.map((bank) => [bank.id, bank]));
const checkByBank = Object.fromEntries((checks.banks || []).map((row) => [row.bankId, row]));
const KEY = "rak-pages-desk";

function loadState() {
  const base = {
    view: "feed",
    openId: null,
    mineOnly: true,
    kind: "all",
    query: "",
    read: {},
    pinned: {},
    watching: {},
    checked: {},
    filed: [],
    addedCards: [],
    removed: {},
  };
  try {
    return Object.assign(base, JSON.parse(localStorage.getItem(KEY) || "{}"));
  } catch {
    return base;
  }
}

let state = loadState();

function save() {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      read: state.read,
      pinned: state.pinned,
      watching: state.watching,
      checked: state.checked,
      filed: state.filed,
      addedCards: state.addedCards,
      removed: state.removed,
      mineOnly: state.mineOnly,
    }),
  );
}

function todayIso(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

function parseDay(iso) {
  const parts = iso.split("-").map(Number);
  return Date.UTC(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
}

function daysFromToday(iso) {
  return Math.round((parseDay(iso) - parseDay(todayIso())) / 86400000);
}

function pretty(iso) {
  if (!iso) return "";
  const parts = iso.split("-").map(Number);
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function esc(value) {
  const named = { "&": "amp", "<": "lt", ">": "gt", '"': "quot" };
  return String(value ?? "").replace(/[&<>"]/g, (ch) => "&" + named[ch] + ";");
}

function walletCards() {
  return [...library.cards, ...(state.addedCards || [])].filter((card) => !state.removed?.[card.id]);
}

function isWatching(id) {
  return state.watching[id] !== false;
}

function filedToNotice(item) {
  return {
    id: item.id,
    bankId: item.bankId,
    title: item.title,
    published: item.published,
    effective: item.effective,
    kind: item.kind,
    severity: "watch",
    scope: "held",
    cardIds: item.cardIds || [],
    summary: item.summary,
    changes: [],
    sourceLabel: "Filed by you",
    sourceUrl: item.sourceUrl || "",
    sourceKind: "bank",
    yours: true,
  };
}

function allNotices() {
  return [...(state.filed || []).map(filedToNotice), ...spotted.map((item) => ({ ...item, fromPage: true })), ...library.notices];
}

function noticeHits(notice, mineOnly) {
  if (!mineOnly) return true;
  if (notice.scope === "other") return false;
  const held = new Set(walletCards().map((card) => card.id));
  const ids = (notice.cardIds?.length ? notice.cardIds : walletCards().filter((card) => card.bankId === notice.bankId).map((card) => card.id)).filter((id) => held.has(id));
  return ids.some((id) => isWatching(id));
}

function cardName(id) {
  return walletCards().find((card) => card.id === id)?.name || library.cards.find((card) => card.id === id)?.name || "";
}

function visibleNotices() {
  const needle = state.query.trim().toLowerCase();
  return allNotices()
    .filter((notice) => noticeHits(notice, state.mineOnly))
    .filter((notice) => state.kind === "all" || notice.kind === state.kind)
    .filter((notice) => {
      if (!needle) return true;
      const bank = bankById[notice.bankId];
      const names = (notice.cardIds || []).map(cardName).join(" ");
      const blob = [notice.title, notice.summary, bank?.name, names, (notice.changes || []).map((row) => row.label).join(" ")].join(" ").toLowerCase();
      return blob.includes(needle);
    })
    .sort((a, b) => {
      const pin = Number(Boolean(state.pinned[b.id])) - Number(Boolean(state.pinned[a.id]));
      if (pin) return pin;
      const unread = Number(!state.read[a.id]) - Number(!state.read[b.id]);
      if (unread) return unread;
      const aDays = a.effective ? daysFromToday(a.effective) : -9999;
      const bDays = b.effective ? daysFromToday(b.effective) : -9999;
      const aSoon = aDays >= 0 ? aDays : 9999;
      const bSoon = bDays >= 0 ? bDays : 9999;
      if (aSoon !== bSoon) return aSoon - bSoon;
      return (b.published || b.effective || "1970-01-01").localeCompare(a.published || a.effective || "1970-01-01");
    });
}

function timing(effective) {
  const days = daysFromToday(effective);
  if (days > 1) return "Takes effect " + pretty(effective) + " · in " + days + " days";
  if (days === 1) return "Takes effect tomorrow, " + pretty(effective);
  if (days === 0) return "Takes effect today, " + pretty(effective);
  return "In force since " + pretty(effective);
}

function whenLine(notice) {
  if (notice.effective) return timing(notice.effective);
  if (notice.published) return "Dated " + pretty(notice.published);
  if (typeof notice.spotted === "string") return "Spotted " + pretty(notice.spotted);
  return "";
}

function severityLabel(severity) {
  if (severity === "action") return "Read this";
  if (severity === "watch") return "Check";
  return "For the file";
}

function staleBanks() {
  return banks.filter((bank) => {
    const day = state.checked[bank.id];
    if (!day) return true;
    return daysFromToday(day) < -21;
  });
}

function openCount() {
  return allNotices().filter((notice) => noticeHits(notice, state.mineOnly) && !state.read[notice.id]).length;
}

function rowHtml(notice) {
  const bank = bankById[notice.bankId];
  const open = state.openId === notice.id;
  return (
    '<button type="button" class="card link" data-act="open" data-id="' +
    esc(notice.id) +
    '"><p class="meta"><span class="dot' +
    (state.read[notice.id] ? " off" : "") +
    '"></span>' +
    esc(bank?.short || notice.bankId) +
    " · " +
    esc(kindLabel[notice.kind] || notice.kind) +
    (state.pinned[notice.id] ? " · Pinned" : "") +
    (notice.yours ? " · Yours" : "") +
    (notice.fromPage ? " · New on the page" : "") +
    (notice.sourceKind === "press" ? " · Press" : "") +
    "</p><h2>" +
    esc(notice.title) +
    '</h2><p class="when">' +
    esc(whenLine(notice)) +
    "</p></button>" +
    (open ? detailHtml(notice) : "")
  );
}

function detailHtml(notice) {
  const bank = bankById[notice.bankId];
  const held = new Set(walletCards().map((card) => card.id));
  const names = (notice.cardIds?.length ? notice.cardIds : walletCards().filter((card) => card.bankId === notice.bankId).map((card) => card.id))
    .map(cardName)
    .filter(Boolean);
  const changes = (notice.changes || [])
    .map(
      (row) =>
        '<div class="change"><dt>' +
        esc(row.label) +
        '</dt><dd class="muted">Before: ' +
        esc(row.before) +
        "</dd><dd>Now: " +
        esc(row.after) +
        "</dd></div>",
    )
    .join("");
  return (
    '<article class="card detail"><p class="stamp-text">' +
    esc(severityLabel(notice.severity)) +
    "</p><p class=\"muted\">" +
    esc(bank?.name || "") +
    (notice.published ? " · notice " + esc(pretty(notice.published)) : "") +
    (notice.effective ? " · " + esc(timing(notice.effective)) : "") +
    "</p><p>" +
    esc(notice.summary) +
    "</p>" +
    (changes ? "<dl>" + changes + "</dl>" : "") +
    '<p class="muted">Touches: ' +
    esc(names.join(", ") || bank?.short || "") +
    (notice.cardIds?.some((id) => !held.has(id)) ? "" : "") +
    "</p>" +
    (notice.sourceUrl
      ? '<p><a class="go" href="' + esc(notice.sourceUrl) + '" rel="noreferrer">' + esc(notice.sourceLabel || "Source") + "</a></p>"
      : "") +
    '<div class="bar">' +
    '<button type="button" data-act="pin" data-id="' +
    esc(notice.id) +
    '">' +
    (state.pinned[notice.id] ? "Unpin" : "Pin") +
    "</button>" +
    '<button type="button" data-act="unread" data-id="' +
    esc(notice.id) +
    '">' +
    (state.read[notice.id] ? "Mark unread" : "Mark read") +
    "</button>" +
    (notice.yours ? '<button type="button" class="danger" data-act="delete-filed" data-id="' + esc(notice.id) + '">Delete filing</button>' : "") +
    "</div>" +
    (notice.sourceKind === "press" ? '<p class="muted">Press report. If it disagrees with the bank page, the bank page wins.</p>' : "") +
    "</article>"
  );
}

function feedHtml() {
  const list = visibleNotices();
  const upcoming = list.filter((notice) => notice.effective && daysFromToday(notice.effective) >= 0);
  const unread = list.filter((notice) => !state.read[notice.id] && !upcoming.includes(notice));
  const rest = list.filter((notice) => state.read[notice.id] && !upcoming.includes(notice));
  const chips = kinds
    .map(
      (kind) =>
        '<button type="button" data-act="kind" data-kind="' +
        kind +
        '" class="' +
        (state.kind === kind ? "on" : "") +
        '">' +
        esc(kind === "all" ? "All" : kindLabel[kind]) +
        "</button>",
    )
    .join("");
  function block(title, items, empty) {
    return "<section><h2>" + title + "</h2>" + (items.length ? items.map(rowHtml).join("") : '<p class="card muted">' + empty + "</p>") + "</section>";
  }
  return (
    '<div class="bar">' +
    '<input id="q" type="search" placeholder="Search bank, card, or change" aria-label="Search notices" value="' +
    esc(state.query) +
    '" />' +
    '<button type="button" data-act="mine" class="' +
    (state.mineOnly ? "on" : "") +
    '">' +
    (state.mineOnly ? "My cards" : "Whole banks") +
    "</button></div>" +
    '<div class="bar" role="tablist">' +
    chips +
    '<button type="button" data-act="mark-visible">Mark these read</button></div>' +
    '<div id="list">' +
    block("Still ahead", upcoming, "Nothing dated after today for this filter.") +
    block("Unread", unread, "No unread notices in this filter.") +
    block("Already read", rest, "Nothing read yet in this filter.") +
    "</div>"
  );
}

function banksHtml() {
  return (
    "<section><h2>Official pages</h2><p class=\"muted\">The feed is a snapshot. The next revision lands on these pages, or in email, before it lands here. Mark a page when you have actually opened it. The Monday job still checks every issuer.</p>" +
    banks
      .map((bank) => {
        const held = walletCards().filter((card) => card.bankId === bank.id && isWatching(card.id));
        const open = allNotices().filter((notice) => notice.bankId === bank.id && noticeHits(notice, true) && !state.read[notice.id]).length;
        const day = state.checked[bank.id];
        const stale = !day || daysFromToday(day) < -21;
        const row = checkByBank[bank.id];
        const job = row
          ? row.ok
            ? "Monday check " + pretty(row.checkedOn) + " · " + row.links + " links, " + row.added + " new"
            : "Monday check failed " + pretty(row.checkedOn) + (row.error ? " · " + row.error : row.status ? " · HTTP " + row.status : "")
          : "Monday check has not recorded this issuer yet";
        const looked = day ? "You looked on " + pretty(day) : "Not checked in Rak yet";
        return (
          '<article class="card"><div class="split"><div><h2>' +
          esc(bank.short) +
          '</h2><p class="muted">' +
          esc(held.map((card) => card.name).join(" · ") || (walletCards().some((card) => card.bankId === bank.id) ? "No card watched" : "No card in your wallet. Watched for issuer notices.")) +
          '</p></div><p class="' +
          (open ? "stamp-text" : "muted") +
          '">' +
          open +
          ' open</p></div><p class="' +
          (stale ? "stamp-text" : "muted") +
          '">' +
          esc(looked) +
          (stale ? " — due" : "") +
          '</p><p class="muted">' +
          esc(job) +
          '</p><div class="bar"><a class="go" href="' +
          esc(bank.hubUrl) +
          '" rel="noreferrer">' +
          esc(bank.hubLabel) +
          '</a><button type="button" data-act="looked" data-id="' +
          esc(bank.id) +
          '">I looked today</button></div></article>'
        );
      })
      .join("") +
    "</section>"
  );
}

function walletHtml() {
  const removed = library.cards.filter((card) => state.removed?.[card.id]);
  const groups = banks
    .map((bank) => {
      const cards = walletCards().filter((card) => card.bankId === bank.id);
      const body = cards.length
        ? cards
            .map((card) => {
              const on = isWatching(card.id);
              const yours = String(card.id).startsWith("added-");
              return (
                '<article class="card"><div class="split"><div><h2>' +
                esc(card.name) +
                '</h2><p class="muted">' +
                esc(card.network) +
                (yours ? " · Yours" : "") +
                '</p></div><button type="button" data-act="watch" data-id="' +
                esc(card.id) +
                '" class="' +
                (on ? "on" : "") +
                '">' +
                (on ? "Watching" : "Ignored") +
                "</button></div><p class=\"muted\">" +
                esc(card.note || "") +
                '</p><button type="button" class="danger" data-act="remove-card" data-id="' +
                esc(card.id) +
                '">Remove card</button></article>'
              );
            })
            .join("")
        : '<p class="muted">No card in your wallet. This issuer is still watched.</p>';
      return "<section><h2>" + esc(bank.short) + "</h2>" + body + "</section>";
    })
    .join("");
  const gone = removed.length
    ? "<section><h2>Removed</h2>" +
      removed
        .map(
          (card) =>
            '<article class="card"><div class="split"><div><h2>' +
            esc(card.name) +
            '</h2><p class="muted">' +
            esc((bankById[card.bankId]?.short || "") + " · " + card.network) +
            '</p></div><button type="button" data-act="restore" data-id="' +
            esc(card.id) +
            '">Put back</button></div></article>',
        )
        .join("") +
      "</section>"
    : "";
  const options = banks.map((bank) => '<option value="' + esc(bank.id) + '">' + esc(bank.name) + "</option>").join("");
  return (
    "<section><h2>Wallet</h2><p class=\"muted\">Add a card you hold, ignore one, or remove it. A removed starter card can be put back. This stays in this browser.</p>" +
    '<form id="add-card" class="card stack"><label>Bank<select name="bank">' +
    options +
    '</select></label><label>Card name<input name="name" placeholder="Visa Infinite" required /></label><div class="pair"><label>Network<input name="network" value="Visa" /></label><label>Note, optional<input name="note" placeholder="What you use it for" /></label></div><button type="submit" class="go">Add card</button></form></section>' +
    groups +
    gone
  );
}

function fileHtml() {
  const options = banks.map((bank) => '<option value="' + esc(bank.id) + '">' + esc(bank.name) + "</option>").join("");
  const kindOptions = Object.keys(kindLabel)
    .map((kind) => '<option value="' + kind + '">' + esc(kindLabel[kind]) + "</option>")
    .join("");
  return (
    '<section><h2>File a notice</h2><p class="muted">Paste what the bank emailed you. It stays in this browser. It is not sent anywhere.</p>' +
    '<form id="file-notice" class="card stack"><label>Bank<select name="bank" id="file-bank">' +
    options +
    '</select></label><fieldset><legend>Cards</legend><div id="file-cards" class="bar"></div><p class="muted">Leave them all off to file against every card you hold at this bank.</p></fieldset><label>Type<select name="kind">' +
    kindOptions +
    '</select></label><label>Title<input name="title" required /></label><label>What changed<textarea name="summary" rows="4" required></textarea></label><div class="pair"><label>Notice date<input type="date" name="published" /></label><label>Effective date<input type="date" name="effective" /></label></div><label>Link, if you have one<input name="sourceUrl" placeholder="https://" inputmode="url" /></label><p id="file-error" class="stamp-text" hidden></p><button type="submit" class="go">Add to the feed</button></form></section>'
  );
}

function paintFileCards() {
  const box = document.getElementById("file-cards");
  const select = document.getElementById("file-bank");
  if (!box || !select) return;
  const cards = walletCards().filter((card) => card.bankId === select.value);
  box.innerHTML = cards.length
    ? cards
        .map(
          (card) =>
            '<button type="button" data-act="file-card" data-id="' + esc(card.id) + '">' + esc(card.name) + "</button>",
        )
        .join("")
    : '<p class="muted">No card in the wallet for this bank yet.</p>';
}

function render(partial) {
  document.getElementById("open-count").textContent = openCount() + " open";
  const stale = staleBanks().length;
  const labels = [
    ["feed", "Feed"],
    ["banks", "Banks" + (stale ? " · " + stale : "")],
    ["wallet", "Wallet"],
    ["file", "File a notice"],
  ];
  const nav = labels
    .map(
      ([view, label]) =>
        '<button type="button" data-act="view" data-view="' + view + '" class="' + (state.view === view ? "on" : "") + '">' + esc(label) + "</button>",
    )
    .join("");
  document.getElementById("nav").innerHTML = nav;
  document.getElementById("dock").innerHTML = labels
    .map(
      ([view, label]) =>
        '<button type="button" data-act="view" data-view="' +
        view +
        '" class="' +
        (state.view === view ? "on" : "") +
        '">' +
        esc(view === "file" ? "File" : label.split(" · ")[0]) +
        "</button>",
    )
    .join("");
  if (partial && state.view === "feed" && document.getElementById("list")) {
    const list = visibleNotices();
    const upcoming = list.filter((notice) => notice.effective && daysFromToday(notice.effective) >= 0);
    const unread = list.filter((notice) => !state.read[notice.id] && !upcoming.includes(notice));
    const rest = list.filter((notice) => state.read[notice.id] && !upcoming.includes(notice));
    function block(title, items, empty) {
      return "<section><h2>" + title + "</h2>" + (items.length ? items.map(rowHtml).join("") : '<p class="card muted">' + empty + "</p>") + "</section>";
    }
    document.getElementById("list").innerHTML =
      block("Still ahead", upcoming, "Nothing dated after today for this filter.") +
      block("Unread", unread, "No unread notices in this filter.") +
      block("Already read", rest, "Nothing read yet in this filter.");
    document.querySelectorAll("[data-act='kind']").forEach((button) => button.classList.toggle("on", button.dataset.kind === state.kind));
    const mine = document.querySelector("[data-act='mine']");
    if (mine) {
      mine.classList.toggle("on", state.mineOnly);
      mine.textContent = state.mineOnly ? "My cards" : "Whole banks";
    }
    return;
  }
  const view = document.getElementById("view");
  if (state.view === "banks") view.innerHTML = banksHtml();
  else if (state.view === "wallet") view.innerHTML = walletHtml();
  else if (state.view === "file") {
    view.innerHTML = fileHtml();
    paintFileCards();
  } else view.innerHTML = feedHtml();
}

document.body.addEventListener("click", (event) => {
  const el = event.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;
  if (act === "view") {
    state.view = el.dataset.view;
    state.openId = null;
    render();
    return;
  }
  if (act === "kind") {
    state.kind = el.dataset.kind;
    render(true);
    return;
  }
  if (act === "mine") {
    state.mineOnly = !state.mineOnly;
    save();
    render(true);
    return;
  }
  if (act === "mark-visible") {
    for (const notice of visibleNotices()) state.read[notice.id] = true;
    save();
    render(true);
    return;
  }
  if (act === "open") {
    state.openId = state.openId === id ? null : id;
    if (state.openId) state.read[id] = true;
    save();
    render(true);
    return;
  }
  if (act === "pin") {
    if (state.pinned[id]) delete state.pinned[id];
    else state.pinned[id] = true;
    save();
    render(true);
    return;
  }
  if (act === "unread") {
    if (state.read[id]) delete state.read[id];
    else state.read[id] = true;
    save();
    render(true);
    return;
  }
  if (act === "delete-filed") {
    state.filed = state.filed.filter((item) => item.id !== id);
    if (state.openId === id) state.openId = null;
    save();
    render();
    return;
  }
  if (act === "looked") {
    state.checked[id] = todayIso();
    save();
    render();
    return;
  }
  if (act === "watch") {
    state.watching[id] = state.watching[id] === false;
    save();
    render();
    return;
  }
  if (act === "remove-card") {
    if (String(id).startsWith("added-")) state.addedCards = (state.addedCards || []).filter((card) => card.id !== id);
    else state.removed = Object.assign({}, state.removed, { [id]: true });
    save();
    render();
    return;
  }
  if (act === "restore") {
    const removed = Object.assign({}, state.removed);
    delete removed[id];
    state.removed = removed;
    save();
    render();
    return;
  }
  if (act === "file-card") {
    el.classList.toggle("on");
  }
});

document.body.addEventListener("input", (event) => {
  if (event.target.id === "q") {
    state.query = event.target.value;
    render(true);
  }
});

document.body.addEventListener("change", (event) => {
  if (event.target.id === "file-bank") paintFileCards();
});

document.body.addEventListener("submit", (event) => {
  if (event.target.id === "add-card") {
    event.preventDefault();
    const form = new FormData(event.target);
    const name = String(form.get("name") || "").trim();
    if (name.length < 2) return;
    state.addedCards = [
      ...(state.addedCards || []),
      {
        id: "added-" + crypto.randomUUID(),
        bankId: String(form.get("bank")),
        name,
        network: String(form.get("network") || "Card").trim() || "Card",
        note: String(form.get("note") || "").trim() || "Added in this browser.",
      },
    ];
    save();
    render();
    return;
  }
  if (event.target.id === "file-notice") {
    event.preventDefault();
    const form = new FormData(event.target);
    const title = String(form.get("title") || "").trim();
    const summary = String(form.get("summary") || "").trim();
    const error = document.getElementById("file-error");
    if (title.length < 4 || summary.length < 12) {
      error.hidden = false;
      error.textContent = "Add a title and a short note of what changed.";
      return;
    }
    const bankId = String(form.get("bank"));
    const picked = [...document.querySelectorAll("[data-act='file-card'].on")].map((button) => button.dataset.id);
    const bankCards = walletCards().filter((card) => card.bankId === bankId);
    const notice = {
      id: "filed-" + crypto.randomUUID(),
      bankId,
      cardIds: picked.length ? picked : bankCards.map((card) => card.id),
      title,
      summary,
      kind: String(form.get("kind") || "benefits"),
      published: String(form.get("published") || "") || todayIso(),
      effective: String(form.get("effective") || "") || null,
      sourceUrl: String(form.get("sourceUrl") || "").trim(),
    };
    state.filed = [notice, ...(state.filed || [])];
    state.view = "feed";
    state.openId = notice.id;
    state.read[notice.id] = true;
    save();
    render();
  }
});

render();
