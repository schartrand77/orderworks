import Link from "next/link";
import { STATUS_OPTIONS } from "@/lib/format";

interface Props {
  status?: string;
  createdFrom?: string;
  createdTo?: string;
}

export function JobFilters({ status, createdFrom, createdTo }: Props) {
  return (
    <form className="flex flex-wrap items-end gap-4 rounded-lg border border-zinc-200 bg-white p-4" method="get">
      <div className="flex flex-col text-sm">
        <label className="mb-1 font-medium text-zinc-700" htmlFor="status">
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={status ?? ""}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col text-sm">
        <label className="mb-1 font-medium text-zinc-700" htmlFor="createdFrom">
          Created after
        </label>
        <input
          id="createdFrom"
          name="createdFrom"
          type="date"
          defaultValue={createdFrom ?? ""}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex flex-col text-sm">
        <label className="mb-1 font-medium text-zinc-700" htmlFor="createdTo">
          Created before
        </label>
        <input
          id="createdTo"
          name="createdTo"
          type="date"
          defaultValue={createdTo ?? ""}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700"
        >
          Apply filters
        </button>
        <Link
          href="/"
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Reset
        </Link>
      </div>
    </form>
  );
}
