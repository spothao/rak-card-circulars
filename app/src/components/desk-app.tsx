import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import {
  Bookmark,
  Check,
  ChevronLeft,
  CreditCard,
  ExternalLink,
  Inbox,
  Landmark,
  Plus,
  Search,
} from "lucide-react";
import {
  COMPILED_ON,
  KIND_LABEL,
  bankById,
  banks,
  cardById,
  cards,
  notices,
  type Kind,
  type Notice,
  type Severity,
  type Card,
} from "@/data/catalog";
import { isWatching, useDesk, type FiledNotice, type View } from "@/lib/desk-store";

const KINDS: Array<Kind | "all"> = ["all", "points", "benefits", "fees", "terms", "product"];

function parseDay(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function todayIso(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function pretty(iso: string) {
  return format(parseDay(iso), "d MMM yyyy");
}

function daysFromToday(iso: string) {
  const today = parseDay(todayIso());
  return Math.round((parseDay(iso).getTime() - today.getTime()) / 86_400_000);
}

function filedToNotice(item: FiledNotice): Notice {
  return {
    id: item.id,
    bankId: item.bankId,
    title: item.title,
    published: item.published,
    effective: item.effective,
    kind: item.kind,
    severity: "watch",
    scope: "held",
    cardIds: item.cardIds,
    summary: item.summary,
    changes: [],
    sourceLabel: "Filed by you",
    sourceUrl: item.sourceUrl,
    sourceKind: "bank",
  };
}

function useCards() {
  const addedCards = useDesk((state) => state.addedCards);
  const removed = useDesk((state) => state.removed);
  return useMemo(
    () => [...cards, ...(addedCards ?? [])].filter((card) => !removed?.[card.id]),
    [addedCards, removed],
  );
}

function noticeHits(notice: Notice, watching: Record<string, boolean>, mineOnly: boolean, wallet: Card[]) {
  if (!mineOnly) return true;
  if (notice.scope === "other") return false;
  const held = new Set(wallet.map((card) => card.id));
  const ids = (notice.cardIds.length
    ? notice.cardIds
    : wallet.filter((card) => card.bankId === notice.bankId).map((card) => card.id)
  ).filter((id) => held.has(id));
  return ids.some((id) => isWatching(watching, id));
}

function severityLabel(severity: Severity) {
  if (severity === "action") return "Read this";
  if (severity === "watch") return "Check";
  return "For the file";
}

export function DeskApp() {
  const view = useDesk((state) => state.view);
  const setView = useDesk((state) => state.setView);
  const openId = useDesk((state) => state.openId);
  const setOpenId = useDesk((state) => state.setOpenId);
  const mineOnly = useDesk((state) => state.mineOnly);
  const setMineOnly = useDesk((state) => state.setMineOnly);
  const kind = useDesk((state) => state.kind);
  const setKind = useDesk((state) => state.setKind);
  const query = useDesk((state) => state.query);
  const setQuery = useDesk((state) => state.setQuery);
  const read = useDesk((state) => state.read);
  const pinned = useDesk((state) => state.pinned);
  const watching = useDesk((state) => state.watching);
  const checked = useDesk((state) => state.checked);
  const filed = useDesk((state) => state.filed);
  const walletCards = useCards();
  const markRead = useDesk((state) => state.markRead);
  const setReady = useDesk((state) => state.setReady);

  useEffect(() => {
    const result = useDesk.persist.rehydrate();
    void Promise.resolve(result).then(() => setReady(true));
  }, [setReady]);

  const library = useMemo(() => [...filed.map(filedToNotice), ...notices], [filed]);

  const mine = useMemo(
    () => library.filter((notice) => noticeHits(notice, watching, mineOnly, walletCards)),
    [library, watching, mineOnly, walletCards],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return mine
      .filter((notice) => kind === "all" || notice.kind === kind)
      .filter((notice) => {
        if (!needle) return true;
        const bank = bankById(notice.bankId);
        const names = notice.cardIds.map((id) => walletCards.find((card) => card.id === id)?.name ?? "").join(" ");
        const blob = [notice.title, notice.summary, bank?.name, names, notice.changes.map((row) => row.label).join(" ")]
          .join(" ")
          .toLowerCase();
        return blob.includes(needle);
      })
      .sort((a, b) => {
        const pin = Number(Boolean(pinned[b.id])) - Number(Boolean(pinned[a.id]));
        if (pin) return pin;
        const unread = Number(!read[a.id]) - Number(!read[b.id]);
        if (unread) return unread;
        const aDays = a.effective ? daysFromToday(a.effective) : -9999;
        const bDays = b.effective ? daysFromToday(b.effective) : -9999;
        const aSoon = aDays >= 0 ? aDays : 9999;
        const bSoon = bDays >= 0 ? bDays : 9999;
        if (aSoon !== bSoon) return aSoon - bSoon;
        const aDate = a.published ?? a.effective ?? "1970-01-01";
        const bDate = b.published ?? b.effective ?? "1970-01-01";
        return bDate.localeCompare(aDate);
      });
  }, [mine, kind, query, pinned, read, walletCards]);

  const upcoming = visible.filter((notice) => notice.effective && daysFromToday(notice.effective) >= 0);
  const unread = visible.filter((notice) => !read[notice.id] && !upcoming.includes(notice));
  const rest = visible.filter((notice) => read[notice.id] && !upcoming.includes(notice));
  const open = library.find((notice) => notice.id === openId) ?? null;
  const unreadCount = mine.filter((notice) => !read[notice.id]).length;
  const staleBanks = banks.filter((bank) => {
    const day = checked[bank.id];
    if (!day) return true;
    return daysFromToday(day) < -21;
  });

  function openNotice(id: string) {
    setOpenId(id);
    if (!read[id]) markRead([id]);
  }

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 md:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-display text-3xl leading-none text-ink">Rak</p>
              <p className="mt-1 max-w-xl text-muted">
                Card circulars for the 15 cards you listed, plus 10 other Malaysian issuers. Compiled {pretty(COMPILED_ON)} from public bank pages. Rak does not read your email.
              </p>
            </div>
            <p className="shrink-0 rounded-full bg-stamp px-3 py-1 text-sm font-semibold text-raised tabular-nums">
              {unreadCount} open
            </p>
          </div>
          <nav className="hidden gap-2 md:flex" aria-label="Sections">
            <NavButton view="feed" current={view} icon={<Inbox className="size-4" />} label="Feed" />
            <NavButton view="banks" current={view} icon={<Landmark className="size-4" />} label={`Banks${staleBanks.length ? ` · ${staleBanks.length}` : ""}`} />
            <NavButton view="wallet" current={view} icon={<CreditCard className="size-4" />} label="Wallet" />
            <NavButton view="file" current={view} icon={<Plus className="size-4" />} label="File a notice" />
          </nav>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-4 py-5 pb-28 md:grid-cols-[minmax(0,1fr)_22rem] md:px-6 md:pb-10">
        <div className={open && view === "feed" ? "hidden min-w-0 md:block" : "min-w-0"}>
          {view === "feed" ? (
            <Feed
              upcoming={upcoming}
              unread={unread}
              rest={rest}
              kind={kind}
              query={query}
              mineOnly={mineOnly}
              read={read}
              pinned={pinned}
              onOpen={openNotice}
              onKind={setKind}
              onQuery={setQuery}
              onMine={() => setMineOnly(!mineOnly)}
              onMarkVisible={() => markRead(visible.filter((notice) => !read[notice.id]).map((notice) => notice.id))}
            />
          ) : null}
          {view === "banks" ? <Banks checked={checked} watching={watching} read={read} library={library} /> : null}
          {view === "wallet" ? <Wallet watching={watching} /> : null}
          {view === "file" ? <FileForm /> : null}
        </div>
        <aside className={open && view === "feed" ? "md:sticky md:top-4 md:self-start" : "hidden md:block"}>
          {open && view === "feed" ? (
            <Detail notice={open} onBack={() => setOpenId(null)} />
          ) : (
            <div className="hidden rounded-card border border-line bg-raised p-5 md:block">
              <p className="font-display text-2xl">How to use this</p>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-muted">
                <li>Read anything dated after today first. Two CIMB items land this month.</li>
                <li>On Banks, open each official page and mark that you looked. Anything older than 21 days goes stale.</li>
                <li>File the email Rak cannot see. It stays on this browser only.</li>
              </ol>
              <p className="mt-4 text-sm text-muted">
                {staleBanks.length} of {banks.length} bank pages have not been checked in the last 21 days.
              </p>
            </div>
          )}
        </aside>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface md:hidden" aria-label="Sections">
        <div className="grid grid-cols-4">
          <Tab view="feed" current={view} label="Feed" />
          <Tab view="banks" current={view} label="Banks" />
          <Tab view="wallet" current={view} label="Wallet" />
          <Tab view="file" current={view} label="File" />
        </div>
      </nav>
    </div>
  );
}

function NavButton({
  view,
  current,
  icon,
  label,
}: {
  view: View;
  current: View;
  icon: ReactNode;
  label: string;
}) {
  const setView = useDesk((state) => state.setView);
  const active = view === current;
  return (
    <button
      type="button"
      onClick={() => setView(view)}
      className={
        "inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold " +
        (active ? "bg-ink text-raised" : "bg-bg text-ink")
      }
    >
      {icon}
      {label}
    </button>
  );
}

function Tab({ view, current, label }: { view: View; current: View; label: string }) {
  const setView = useDesk((state) => state.setView);
  const active = view === current;
  return (
    <button
      type="button"
      onClick={() => setView(view)}
      className={"min-h-14 text-sm font-semibold " + (active ? "text-stamp" : "text-muted")}
    >
      {label}
    </button>
  );
}

function Feed({
  upcoming,
  unread,
  rest,
  kind,
  query,
  mineOnly,
  read,
  pinned,
  onOpen,
  onKind,
  onQuery,
  onMine,
  onMarkVisible,
}: {
  upcoming: Notice[];
  unread: Notice[];
  rest: Notice[];
  kind: Kind | "all";
  query: string;
  mineOnly: boolean;
  read: Record<string, true>;
  pinned: Record<string, true>;
  onOpen: (id: string) => void;
  onKind: (kind: Kind | "all") => void;
  onQuery: (query: string) => void;
  onMine: () => void;
  onMarkVisible: () => void;
}) {
  const total = upcoming.length + unread.length + rest.length;
  return (
    <section>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label className="relative min-w-0 w-full flex-1 sm:w-auto">
            <span className="sr-only">Search notices</span>
            <Search className="pointer-events-none absolute top-3 left-3 size-4 text-muted" />
            <input
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder="Search bank, card, or change"
              className="min-h-11 w-full rounded-full border border-line bg-raised pr-4 pl-10"
            />
          </label>
          <button
            type="button"
            onClick={onMine}
            className={"min-h-11 rounded-full px-4 text-sm font-semibold " + (mineOnly ? "bg-ink text-raised" : "border border-line bg-raised")}
            aria-pressed={mineOnly}
          >
            {mineOnly ? "My cards" : "Whole banks"}
          </button>
        </div>
        <div className="flex min-w-0 max-w-full gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Notice type">
          {KINDS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={kind === item}
              onClick={() => onKind(item)}
              className={
                "min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold " +
                (kind === item ? "bg-stamp text-raised" : "bg-raised text-ink")
              }
            >
              {item === "all" ? "All" : KIND_LABEL[item]}
            </button>
          ))}
        </div>
        {upcoming.some((notice) => !read[notice.id]) || unread.length ? (
          <button type="button" onClick={onMarkVisible} className="self-start text-sm font-semibold text-stamp">
            Mark these open notices read
          </button>
        ) : null}
      </div>

      {total === 0 ? (
        <p className="mt-8 rounded-card border border-line bg-raised p-5 text-muted">
          Nothing in this cut of the library. Turn on “Whole banks”, or file the email yourself.
        </p>
      ) : (
        <div className="mt-6 space-y-8">
          {upcoming.length ? (
            <Group title="Still ahead" hint="Effective date has not passed.">
              {upcoming.map((notice) => (
                <Row key={notice.id} notice={notice} read={Boolean(read[notice.id])} pinned={Boolean(pinned[notice.id])} onOpen={onOpen} />
              ))}
            </Group>
          ) : null}
          {unread.length ? (
            <Group title="Unread, already in force" hint="These changed before today. Worth one pass.">
              {unread.map((notice) => (
                <Row key={notice.id} notice={notice} read={false} pinned={Boolean(pinned[notice.id])} onOpen={onOpen} />
              ))}
            </Group>
          ) : null}
          {rest.length ? (
            <Group title="Read" hint="Already opened on this browser.">
              {rest.map((notice) => (
                <Row key={notice.id} notice={notice} read pinned={Boolean(pinned[notice.id])} onOpen={onOpen} />
              ))}
            </Group>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Group({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl">{title}</h2>
          {hint ? <p className="text-sm text-muted">{hint}</p> : null}
        </div>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({
  notice,
  read,
  pinned,
  onOpen,
}: {
  notice: Notice;
  read: boolean;
  pinned: boolean;
  onOpen: (id: string) => void;
}) {
  const bank = bankById(notice.bankId);
  const when = notice.effective ? timing(notice.effective) : notice.published ? `Dated ${pretty(notice.published)}` : "Undated";
  return (
    <button
      type="button"
      onClick={() => onOpen(notice.id)}
      className="block w-full rounded-card border border-line bg-raised p-4 text-left"
    >
      <span className="flex items-center gap-2 text-sm text-muted">
        <span className={"size-2 shrink-0 rounded-full " + (read ? "bg-line" : "bg-stamp")} aria-hidden />
        <span>{bank?.short}</span>
        <span aria-hidden>·</span>
        <span>{KIND_LABEL[notice.kind]}</span>
        {pinned ? <Bookmark className="size-3.5 text-stamp" aria-label="Pinned" /> : null}
        {notice.id.startsWith("filed-") ? <span className="text-stamp">Yours</span> : null}
        {notice.sourceKind === "press" ? <span>Press</span> : null}
      </span>
      <span className="mt-1 block font-display text-xl leading-snug break-words">{notice.title}</span>
      <span className="mt-1 block text-sm text-muted">{when}</span>
    </button>
  );
}

function timing(effective: string) {
  const days = daysFromToday(effective);
  if (days > 1) return `Takes effect ${pretty(effective)} · in ${days} days`;
  if (days === 1) return `Takes effect tomorrow, ${pretty(effective)}`;
  if (days === 0) return `Takes effect today, ${pretty(effective)}`;
  return `In force since ${pretty(effective)}`;
}

function Detail({ notice, onBack }: { notice: Notice; onBack: () => void }) {
  const read = useDesk((state) => Boolean(state.read[notice.id]));
  const pinned = useDesk((state) => Boolean(state.pinned[notice.id]));
  const toggleRead = useDesk((state) => state.toggleRead);
  const togglePin = useDesk((state) => state.togglePin);
  const removeFiled = useDesk((state) => state.removeFiled);
  const bank = bankById(notice.bankId);
  const wallet = useCards();
  const hitCards = (notice.cardIds.length ? notice.cardIds : wallet.filter((card) => card.bankId === notice.bankId).map((card) => card.id))
    .map((id) => wallet.find((card) => card.id === id)?.name ?? cardById(id)?.name)
    .filter(Boolean);

  return (
    <article className="rounded-card border border-line bg-raised p-5">
      <button type="button" onClick={onBack} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold md:hidden">
        <ChevronLeft className="size-4" />
        Feed
      </button>
      <p className="text-sm font-semibold text-stamp">{severityLabel(notice.severity)}</p>
      <h2 className="mt-1 text-3xl leading-tight">{notice.title}</h2>
      <p className="mt-2 text-sm text-muted">
        {bank?.name}
        {notice.published ? ` · notice ${pretty(notice.published)}` : ""}
        {notice.effective ? ` · ${timing(notice.effective)}` : ""}
      </p>
      <p className="mt-4">{notice.summary}</p>
      {notice.changes.length ? (
        <dl className="mt-4 space-y-3">
          {notice.changes.map((row) => (
            <div key={row.label} className="border-t border-line pt-3">
              <dt className="text-sm font-semibold">{row.label}</dt>
              <dd className="mt-1 text-sm text-muted">Before: {row.before}</dd>
              <dd className="text-sm">Now: {row.after}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-4 rounded-card bg-stamp-soft px-3 py-3 text-sm">
          The bank did not put a simple before/after in what we could read. Use the source link.
        </p>
      )}
      <p className="mt-4 text-sm text-muted">Touches: {hitCards.join(", ") || bank?.short}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {notice.sourceUrl ? (
          <a
            href={notice.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-raised"
          >
            {notice.sourceLabel}
            <ExternalLink className="size-4" />
          </a>
        ) : (
          <p className="text-sm text-muted">{notice.sourceLabel}</p>
        )}
        <button type="button" onClick={() => togglePin(notice.id)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold">
          <Bookmark className={"size-4 " + (pinned ? "fill-stamp text-stamp" : "")} />
          {pinned ? "Pinned" : "Pin"}
        </button>
        <button type="button" onClick={() => toggleRead(notice.id)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold">
          <Check className="size-4" />
          {read ? "Mark unread" : "Mark read"}
        </button>
        {notice.id.startsWith("filed-") ? (
          <button type="button" onClick={() => removeFiled(notice.id)} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-stamp">
            Delete filing
          </button>
        ) : null}
      </div>
      {notice.sourceKind === "press" ? (
        <p className="mt-4 text-sm text-muted">Press report. If it disagrees with the bank page, the bank page wins.</p>
      ) : null}
    </article>
  );
}

function Banks({
  checked,
  watching,
  read,
  library,
}: {
  checked: Record<string, string>;
  watching: Record<string, boolean>;
  read: Record<string, true>;
  library: Notice[];
}) {
  const markChecked = useDesk((state) => state.markChecked);
  const wallet = useCards();
  return (
    <section className="space-y-3">
      <h2 className="text-3xl">Official pages</h2>
      <p className="text-muted">
        The feed is a snapshot. The next revision will land on these pages, or in email, before it lands here. Mark a page when you have actually opened it.
      </p>
      {banks.map((bank) => {
        const held = wallet.filter((card) => card.bankId === bank.id && isWatching(watching, card.id));
        const open = library.filter(
          (notice) => notice.bankId === bank.id && noticeHits(notice, watching, true, wallet) && !read[notice.id],
        ).length;
        const day = checked[bank.id];
        const stale = !day || daysFromToday(day) < -21;
        return (
          <article key={bank.id} className="rounded-card border border-line bg-raised p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-2xl">{bank.short}</h3>
                <p className="text-sm text-muted">
                  {held.map((card) => card.name).join(" · ") ||
                    (wallet.some((card) => card.bankId === bank.id) ? "No card watched" : "Issuer watch")}
                </p>
              </div>
              <p className={"text-sm font-semibold tabular-nums " + (open ? "text-stamp" : "text-muted")}>{open} open</p>
            </div>
            <p className={"mt-2 text-sm " + (stale ? "text-stamp" : "text-muted")}>
              {day ? `You looked ${formatDistanceToNowStrict(parseDay(day), { addSuffix: true })}` : "Not checked in Rak yet"}
              {stale ? " — due" : ""}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <a
                href={bank.hubUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-raised"
              >
                {bank.hubLabel}
                <ExternalLink className="size-4" />
              </a>
              <button
                type="button"
                onClick={() => markChecked(bank.id, todayIso())}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold"
              >
                <Check className="size-4" />
                I looked today
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function Wallet({ watching }: { watching: Record<string, boolean> }) {
  const toggleWatch = useDesk((state) => state.toggleWatch);
  const addCard = useDesk((state) => state.addCard);
  const removeCard = useDesk((state) => state.removeCard);
  const restoreCard = useDesk((state) => state.restoreCard);
  const removed = useDesk((state) => state.removed);
  const wallet = useCards();
  const [bankId, setBankId] = useState(banks[0]?.id ?? "cimb");
  const [name, setName] = useState("");
  const [network, setNetwork] = useState("Visa");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError("Name the card.");
      return;
    }
    addCard({
      bankId,
      name: name.trim(),
      network: network.trim() || "Card",
      note: note.trim() || "Added in this browser.",
    });
    setName("");
    setNote("");
    setError("");
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-3xl">Wallet</h2>
        <p className="text-muted">Add a card you hold, ignore one, or remove it. Removed starter cards can be put back. This stays in this browser.</p>
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-card border border-line bg-raised p-4">
        <Field label="Bank">
          <select value={bankId} onChange={(event) => setBankId(event.target.value)} className="min-h-11 w-full rounded-card border border-line bg-surface px-3">
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Card name">
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Visa Infinite" className="min-h-11 w-full rounded-card border border-line bg-surface px-3" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Network">
            <input value={network} onChange={(event) => setNetwork(event.target.value)} placeholder="Visa" className="min-h-11 w-full rounded-card border border-line bg-surface px-3" />
          </Field>
          <Field label="Note, optional">
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="What you use it for" className="min-h-11 w-full rounded-card border border-line bg-surface px-3" />
          </Field>
        </div>
        {error ? <p className="text-sm text-stamp">{error}</p> : null}
        <button type="submit" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-stamp px-5 font-semibold text-raised">
          <Plus className="size-4" />
          Add card
        </button>
      </form>
      {banks.map((bank) => (
        <section key={bank.id}>
          <h3 className="text-xl">{bank.short}</h3>
          {wallet.some((card) => card.bankId === bank.id) ? (
          <div className="mt-2 space-y-3">
            {wallet
              .filter((card) => card.bankId === bank.id)
              .map((card) => {
                const on = isWatching(watching, card.id);
                const yours = card.id.startsWith("added-");
                return (
                  <article key={card.id} className="rounded-card border border-line bg-raised p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-display text-xl">{card.name}</p>
                        <p className="text-sm text-muted">
                          {card.network}
                          {yours ? " · Yours" : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleWatch(card.id)}
                        aria-pressed={on}
                        className={"min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold " + (on ? "bg-ink text-raised" : "border border-line")}
                      >
                        {on ? "Watching" : "Ignored"}
                      </button>
                    </div>
                    <p className="mt-2 text-sm text-muted">{card.note}</p>
                    <button type="button" onClick={() => removeCard(card.id)} className="mt-2 min-h-11 text-sm font-semibold text-stamp">
                      Remove card
                    </button>
                  </article>
                );
              })}
          </div>
          ) : (
            <p className="mt-2 text-sm text-muted">No card in your wallet. This issuer is still watched.</p>
          )}
        </section>
      ))}
      {cards.some((card) => removed?.[card.id]) ? (
        <section>
          <h3 className="text-xl">Removed</h3>
          <div className="mt-2 space-y-3">
            {cards
              .filter((card) => removed?.[card.id])
              .map((card) => (
                <article key={card.id} className="rounded-card border border-line bg-raised p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-xl">{card.name}</p>
                      <p className="text-sm text-muted">{bankById(card.bankId)?.short} · {card.network}</p>
                    </div>
                    <button type="button" onClick={() => restoreCard(card.id)} className="min-h-11 shrink-0 rounded-full border border-line px-4 text-sm font-semibold">
                      Put back
                    </button>
                  </div>
                </article>
              ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

function FileForm() {
  const fileNotice = useDesk((state) => state.fileNotice);
  const [bankId, setBankId] = useState(banks[0]?.id ?? "cimb");
  const [cardIds, setCardIds] = useState<string[]>([]);
  const [kind, setKind] = useState<Kind>("benefits");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [published, setPublished] = useState("");
  const [effective, setEffective] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [error, setError] = useState("");
  const bankCards = useCards().filter((card) => card.bankId === bankId);

  function toggleCard(id: string) {
    setCardIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (title.trim().length < 4 || summary.trim().length < 12) {
      setError("Add a title and a short note of what changed.");
      return;
    }
    const notice: FiledNotice = {
      id: `filed-${crypto.randomUUID()}`,
      bankId,
      cardIds: cardIds.length ? cardIds : bankCards.map((card) => card.id),
      title: title.trim(),
      summary: summary.trim(),
      kind,
      published: published || todayIso(),
      effective: effective || null,
      sourceUrl: sourceUrl.trim(),
    };
    fileNotice(notice);
    setTitle("");
    setSummary("");
    setPublished("");
    setEffective("");
    setSourceUrl("");
    setCardIds([]);
    setError("");
  }

  return (
    <section>
      <h2 className="text-3xl">File a notice</h2>
      <p className="mt-1 text-muted">
        Paste what the bank emailed you. It stays in this browser. It is not sent anywhere, and it will not sync to another phone.
      </p>
      <form onSubmit={submit} className="mt-4 space-y-4 rounded-card border border-line bg-raised p-4">
        <Field label="Bank">
          <select
            value={bankId}
            onChange={(event) => {
              setBankId(event.target.value);
              setCardIds([]);
            }}
            className="min-h-11 w-full rounded-card border border-line bg-surface px-3"
          >
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
          </select>
        </Field>
        <fieldset>
          <legend className="text-sm font-semibold">Cards</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {bankCards.map((card) => {
              const on = cardIds.includes(card.id);
              return (
                <button
                  key={card.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleCard(card.id)}
                  className={"min-h-11 rounded-full px-3 text-sm font-semibold " + (on ? "bg-ink text-raised" : "border border-line")}
                >
                  {card.name}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-sm text-muted">Leave them all off to file against every card you hold at this bank.</p>
        </fieldset>
        <Field label="Type">
          <select value={kind} onChange={(event) => setKind(event.target.value as Kind)} className="min-h-11 w-full rounded-card border border-line bg-surface px-3">
            {(Object.keys(KIND_LABEL) as Kind[]).map((item) => (
              <option key={item} value={item}>
                {KIND_LABEL[item]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Title">
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="min-h-11 w-full rounded-card border border-line bg-surface px-3" />
        </Field>
        <Field label="What changed">
          <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={4} className="w-full rounded-card border border-line bg-surface px-3 py-2" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Notice date">
            <input type="date" value={published} onChange={(event) => setPublished(event.target.value)} className="min-h-11 w-full rounded-card border border-line bg-surface px-3" />
          </Field>
          <Field label="Effective date">
            <input type="date" value={effective} onChange={(event) => setEffective(event.target.value)} className="min-h-11 w-full rounded-card border border-line bg-surface px-3" />
          </Field>
        </div>
        <Field label="Link, if you have one">
          <input
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://"
            inputMode="url"
            className="min-h-11 w-full rounded-card border border-line bg-surface px-3"
          />
        </Field>
        {error ? <p className="text-sm text-stamp">{error}</p> : null}
        <button type="submit" className="min-h-11 rounded-full bg-stamp px-5 font-semibold text-raised">
          Add to the feed
        </button>
      </form>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}
