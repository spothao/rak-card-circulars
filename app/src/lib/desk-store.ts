import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Card, Kind } from "@/data/catalog";

export type View = "feed" | "banks" | "wallet" | "file";

export type FiledNotice = {
  id: string;
  bankId: string;
  cardIds: string[];
  title: string;
  summary: string;
  kind: Kind;
  published: string | null;
  effective: string | null;
  sourceUrl: string;
};

type DeskState = {
  ready: boolean;
  view: View;
  openId: string | null;
  mineOnly: boolean;
  kind: Kind | "all";
  query: string;
  read: Record<string, true>;
  pinned: Record<string, true>;
  watching: Record<string, boolean>;
  checked: Record<string, string>;
  filed: FiledNotice[];
  addedCards: Card[];
  removed: Record<string, true>;
  setReady: (ready: boolean) => void;
  setView: (view: View) => void;
  setOpenId: (id: string | null) => void;
  setMineOnly: (value: boolean) => void;
  setKind: (kind: Kind | "all") => void;
  setQuery: (query: string) => void;
  toggleRead: (id: string) => void;
  markRead: (ids: string[]) => void;
  togglePin: (id: string) => void;
  toggleWatch: (cardId: string) => void;
  markChecked: (bankId: string, isoDay: string) => void;
  fileNotice: (notice: FiledNotice) => void;
  removeFiled: (id: string) => void;
  addCard: (card: Omit<Card, "id">) => void;
  removeCard: (id: string) => void;
  restoreCard: (id: string) => void;
};

export const useDesk = create<DeskState>()(
  persist(
    (set) => ({
      ready: false,
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
      setReady: (ready) => set({ ready }),
      setView: (view) => set({ view, openId: null }),
      setOpenId: (openId) => set({ openId }),
      setMineOnly: (mineOnly) => set({ mineOnly }),
      setKind: (kind) => set({ kind }),
      setQuery: (query) => set({ query }),
      toggleRead: (id) =>
        set((state) => {
          const read = { ...state.read };
          if (read[id]) delete read[id];
          else read[id] = true;
          return { read };
        }),
      markRead: (ids) =>
        set((state) => {
          const read = { ...state.read };
          for (const id of ids) read[id] = true;
          return { read };
        }),
      togglePin: (id) =>
        set((state) => {
          const pinned = { ...state.pinned };
          if (pinned[id]) delete pinned[id];
          else pinned[id] = true;
          return { pinned };
        }),
      toggleWatch: (cardId) =>
        set((state) => ({
          watching: {
            ...state.watching,
            [cardId]: state.watching[cardId] === false,
          },
        })),
      markChecked: (bankId, isoDay) =>
        set((state) => ({ checked: { ...state.checked, [bankId]: isoDay } })),
      fileNotice: (notice) => set((state) => ({ filed: [notice, ...state.filed], view: "feed", openId: notice.id })),
      removeFiled: (id) =>
        set((state) => ({
          filed: state.filed.filter((item) => item.id !== id),
          openId: state.openId === id ? null : state.openId,
        })),
      addCard: (card) =>
        set((state) => ({
          addedCards: [...(state.addedCards ?? []), { ...card, id: `added-${crypto.randomUUID()}` }],
        })),
      removeCard: (id) =>
        set((state) =>
          id.startsWith("added-")
            ? { addedCards: (state.addedCards ?? []).filter((card) => card.id !== id) }
            : { removed: { ...state.removed, [id]: true } },
        ),
      restoreCard: (id) =>
        set((state) => {
          const removed = { ...state.removed };
          delete removed[id];
          return { removed };
        }),
    }),
    {
      name: "rak-desk",
      skipHydration: true,
      partialize: (state) => ({
        read: state.read,
        pinned: state.pinned,
        watching: state.watching,
        checked: state.checked,
        filed: state.filed,
        addedCards: state.addedCards,
        removed: state.removed,
        mineOnly: state.mineOnly,
      }),
    },
  ),
);

export function isWatching(watching: Record<string, boolean>, cardId: string) {
  return watching[cardId] !== false;
}
