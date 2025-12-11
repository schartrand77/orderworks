"use client";

import Link from "next/link";
import { useState } from "react";
import { STATUS_OPTIONS } from "@/lib/format";
import { ManualJobForm } from "@/components/manual-job-form";

interface Props {
  status?: string;
  createdFrom?: string;
  createdTo?: string;
}

export function JobFilters({ status, createdFrom, createdTo }: Props) {
  const [isManualJobOpen, setManualJobOpen] = useState(false);

  return (
    <>
      <form
        className="flex flex-wrap items-end gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-[0_25px_70px_rgba(0,0,0,0.55)]"
        method="get"
      >
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
      </form>
      <ManualJobForm isOpen={isManualJobOpen} onClose={() => setManualJobOpen(false)} />
    </>
  );
}
