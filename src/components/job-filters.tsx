"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { STATUS_OPTIONS } from "@/lib/format";
import { ManualJobForm } from "@/components/manual-job-form";

interface Props {
  status?: string;
  createdFrom?: string;
  createdTo?: string;
  queue?: string;
  todayIso: string;
}

type SavedViewScope = "personal" | "global";

interface SavedView {
  id: string;
  name: string;
  scope: SavedViewScope;
  status?: string;
  createdFrom?: string;
  createdTo?: string;
  queue?: string;
}

const STORAGE_KEY = "orderworks.saved-filter-views.v1";
const EMPTY_SAVED_VIEWS: SavedView[] = [];
let cachedSerializedViews: string | null = null;
let cachedSavedViews: SavedView[] = EMPTY_SAVED_VIEWS;

function sanitizeSavedViews(raw: string | null): SavedView[] {
  if (!raw) {
    return EMPTY_SAVED_VIEWS;
  }
  try {
    const parsed = JSON.parse(raw) as SavedView[];
    if (!Array.isArray(parsed)) {
      return EMPTY_SAVED_VIEWS;
    }
    return parsed.filter((entry) => typeof entry?.id === "string" && typeof entry?.name === "string");
  } catch {
    return EMPTY_SAVED_VIEWS;
  }
}

function loadSavedViews() {
  if (typeof window === "undefined") {
    return EMPTY_SAVED_VIEWS;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === cachedSerializedViews) {
    return cachedSavedViews;
  }
  cachedSerializedViews = raw;
  cachedSavedViews = sanitizeSavedViews(raw);
  return cachedSavedViews;
}

function saveSavedViews(views: SavedView[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
  window.dispatchEvent(new Event("orderworks:saved-views-updated"));
}

function subscribeSavedViews(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const storageHandler = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      callback();
    }
  };
  const localHandler = () => callback();
  window.addEventListener("storage", storageHandler);
  window.addEventListener("orderworks:saved-views-updated", localHandler);
  return () => {
    window.removeEventListener("storage", storageHandler);
    window.removeEventListener("orderworks:saved-views-updated", localHandler);
  };
}

function buildQueryFromView(view: SavedView) {
  const params = new URLSearchParams();
  if (view.status) {
    params.set("status", view.status);
  }
  if (view.createdFrom) {
    params.set("createdFrom", view.createdFrom);
  }
  if (view.createdTo) {
    params.set("createdTo", view.createdTo);
  }
  if (view.queue) {
    params.set("queue", view.queue);
  }
  return params.toString();
}

export function JobFilters({ status, createdFrom, createdTo, queue, todayIso }: Props) {
  const router = useRouter();
  const [isManualJobOpen, setManualJobOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [viewScope, setViewScope] = useState<SavedViewScope>("personal");
  const [selectedViewId, setSelectedViewId] = useState("");
  const savedViews = useSyncExternalStore(subscribeSavedViews, loadSavedViews, () => EMPTY_SAVED_VIEWS);

  const builtInViews = useMemo<SavedView[]>(
    () => [
      { id: "builtin-today", name: "Today", scope: "global", createdFrom: todayIso },
      { id: "builtin-pending", name: "Pending", scope: "global", status: "pending" },
      { id: "builtin-printing", name: "Printing", scope: "global", status: "printing" },
      { id: "builtin-exceptions", name: "Exception queue", scope: "global", queue: "exceptions" },
    ],
    [todayIso],
  );
  const allViews = useMemo(() => {
    return [...builtInViews, ...savedViews];
  }, [builtInViews, savedViews]);

  function applyView(viewId: string) {
    const view = allViews.find((entry) => entry.id === viewId);
    if (!view) {
      return;
    }
    const query = buildQueryFromView(view);
    router.push(query ? `/?${query}` : "/");
  }

  function handleSaveCurrentView(formData: FormData) {
    const name = viewName.trim();
    if (!name) {
      return;
    }

    const nextView: SavedView = {
      id: `saved-${Date.now()}`,
      name,
      scope: viewScope,
      status: String(formData.get("status") ?? "").trim() || undefined,
      createdFrom: String(formData.get("createdFrom") ?? "").trim() || undefined,
      createdTo: String(formData.get("createdTo") ?? "").trim() || undefined,
      queue: String(formData.get("queue") ?? "").trim() || undefined,
    };

    const current = loadSavedViews();
    saveSavedViews([...current, nextView]);
    setViewName("");
  }

  function deleteSavedView(viewId: string) {
    const current = loadSavedViews();
    saveSavedViews(current.filter((entry) => entry.id !== viewId));
  }

  return (
    <>
      <form
        className="flex flex-wrap items-end gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_25px_70px_rgba(0,0,0,0.55)]"
        method="get"
      >
        <div className="flex min-w-[220px] flex-col text-sm text-zinc-200">
          <label className="mb-1 font-medium text-zinc-300" htmlFor="queue">
            Queue
          </label>
          <select
            id="queue"
            name="queue"
            defaultValue={queue ?? ""}
            className="rounded-md border border-white/10 bg-[#080808] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
          >
            <option value="">Primary queue</option>
            <option value="exceptions">Exception queue</option>
          </select>
        </div>
        <div className="flex flex-col text-sm text-zinc-200">
          <label className="mb-1 font-medium text-zinc-300" htmlFor="status">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ""}
            className="rounded-md border border-white/10 bg-[#080808] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col text-sm text-zinc-200">
          <label className="mb-1 font-medium text-zinc-300" htmlFor="createdFrom">
            Created after
          </label>
          <input
            id="createdFrom"
            name="createdFrom"
            type="date"
            defaultValue={createdFrom ?? ""}
            className="rounded-md border border-white/10 bg-[#080808] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
          />
        </div>
        <div className="flex flex-col text-sm text-zinc-200">
          <label className="mb-1 font-medium text-zinc-300" htmlFor="createdTo">
            Created before
          </label>
          <input
            id="createdTo"
            name="createdTo"
            type="date"
            defaultValue={createdTo ?? ""}
            className="rounded-md border border-white/10 bg-[#080808] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-md bg-gradient-to-b from-[#f6f6f6] to-[#cfcfcf] px-5 py-2 text-sm font-semibold text-[#111] shadow-[0_10px_35px_rgba(0,0,0,0.65)] transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/60"
            >
              Apply filters
            </button>
            <Link
              href="/"
              className="text-sm font-medium text-zinc-300 transition hover:text-white"
            >
              Reset
            </Link>
          </div>
          <button
            type="button"
            onClick={() => setManualJobOpen(true)}
            className="rounded-md border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/20"
          >
            Add manual job
          </button>
        </div>
        <div className="w-full border-t border-white/10 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">Saved filter views</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-[220px] flex-col text-sm text-zinc-200">
              <label className="mb-1 font-medium text-zinc-300" htmlFor="savedViewSelect">
                Apply view
              </label>
              <select
                id="savedViewSelect"
                value={selectedViewId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  setSelectedViewId(nextId);
                  if (nextId) {
                    applyView(nextId);
                  }
                }}
                className="rounded-md border border-white/10 bg-[#080808] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
              >
                <option value="">Select a view...</option>
                {allViews.map((view) => (
                  <option key={view.id} value={view.id}>
                    {view.name} ({view.scope})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-[170px] flex-col text-sm text-zinc-200">
              <label className="mb-1 font-medium text-zinc-300" htmlFor="viewName">
                New view name
              </label>
              <input
                id="viewName"
                value={viewName}
                onChange={(event) => setViewName(event.target.value)}
                className="rounded-md border border-white/10 bg-[#080808] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
                placeholder="Today / Pending"
              />
            </div>
            <div className="flex min-w-[140px] flex-col text-sm text-zinc-200">
              <label className="mb-1 font-medium text-zinc-300" htmlFor="viewScope">
                Scope
              </label>
              <select
                id="viewScope"
                value={viewScope}
                onChange={(event) => setViewScope(event.target.value as SavedViewScope)}
                className="rounded-md border border-white/10 bg-[#080808] px-3 py-2 text-sm text-zinc-100 outline-none transition focus:border-white/40"
              >
                <option value="personal">Personal</option>
                <option value="global">Global</option>
              </select>
            </div>
            <button
              type="button"
              onClick={(event) => {
                const form = event.currentTarget.form;
                if (!form) {
                  return;
                }
                const formData = new FormData(form);
                handleSaveCurrentView(formData);
              }}
              className="rounded-md border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/20"
            >
              Save current
            </button>
          </div>
          {savedViews.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {savedViews.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => deleteSavedView(view.id)}
                  className="rounded-full border border-white/15 bg-black/30 px-3 py-1 text-xs text-zinc-300 hover:border-red-300/50 hover:text-red-100"
                >
                  Delete {view.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </form>
      <ManualJobForm isOpen={isManualJobOpen} onClose={() => setManualJobOpen(false)} />
    </>
  );
}
