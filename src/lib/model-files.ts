import type { Job } from "@/generated/prisma/client";

const MODEL_EXTENSIONS = [".stl", ".3mf", ".obj", ".step", ".stp", ".igs", ".iges", ".amf", ".ply"];
const URL_KEYS = ["url", "href", "file", "fileUrl", "downloadUrl", "link", "value", "src"];

export interface ModelFile {
  url: string;
  label: string;
}

type JobModelFileInput = Pick<Job, "metadata" | "lineItems" | "notes">;

export function extractModelFiles(job: JobModelFileInput): ModelFile[] {
  const sources: Array<{ value: unknown; label?: string }> = [
    { value: job.metadata ?? null },
    { value: job.lineItems ?? null, label: "Line items" },
    { value: job.notes ?? null, label: "Notes" },
  ];

  const seen = new Set<string>();
  const files: ModelFile[] = [];

  for (const source of sources) {
    const discovered = collectModelFiles(source.value, source.label);
    for (const file of discovered) {
      const normalized = normalizeUrl(file.url);
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      files.push({ url: normalized, label: file.label });
    }
  }

  return files;
}

export function buildBambuStudioLink(fileUrl: string) {
  return `bambu-studio://project/open?url=${encodeURIComponent(fileUrl)}`;
}

function collectModelFiles(value: unknown, labelHint?: string): ModelFile[] {
  if (!value) {
    return [];
  }

  if (typeof value === "string") {
    return extractFromString(value, labelHint);
  }

  if (Array.isArray(value)) {
    const files: ModelFile[] = [];
    value.forEach((item, index) => {
      const derivedLabel = labelHint ? labelHint : `File ${index + 1}`;
      files.push(...collectModelFiles(item, derivedLabel));
    });
    return files;
  }

  if (isPlainObject(value)) {
    const files: ModelFile[] = [];
    const record = value as Record<string, unknown>;

    for (const key of URL_KEYS) {
      const candidate = record[key];
      if (typeof candidate === "string") {
        const matches = extractFromString(candidate, labelHint ?? guessLabel(record, key));
        files.push(...matches);
      }
    }

    for (const [key, child] of Object.entries(record)) {
      files.push(...collectModelFiles(child, labelHint ?? prettifyLabel(key)));
    }
    return files;
  }

  return [];
}

function extractFromString(value: string, labelHint?: string): ModelFile[] {
  const matches = findUrls(value);
  if (matches.length === 0) {
    return [];
  }
  return matches.map((url) => ({
    url,
    label: deriveLabel(url, labelHint),
  }));
}

function findUrls(value: string) {
  const trimmed = value.trim();
  const urls = new Set<string>();

  if (looksLikeModelUrl(trimmed)) {
    urls.add(trimmed);
  }

  const regex = /https?:\/\/[^\s"']+/gi;
  const inlineMatches = trimmed.match(regex);
  if (inlineMatches) {
    for (const match of inlineMatches) {
      if (looksLikeModelUrl(match)) {
        urls.add(match);
      }
    }
  }

  return Array.from(urls);
}

function looksLikeModelUrl(candidate: string) {
  if (!candidate.startsWith("http://") && !candidate.startsWith("https://")) {
    return false;
  }
  const normalized = candidate.split("?")[0]?.split("#")[0]?.toLowerCase() ?? candidate.toLowerCase();
  return MODEL_EXTENSIONS.some((ext) => normalized.endsWith(ext));
}

function normalizeUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.toString();
  } catch {
    return null;
  }
}

function deriveLabel(url: string, labelHint?: string) {
  if (labelHint) {
    return prettifyLabel(labelHint);
  }
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname ?? "";
    const segment = pathname.split("/").filter(Boolean).pop();
    if (segment) {
      return decodeURIComponent(segment);
    }
  } catch {
    // Ignore parse errors and fall back to generic label.
  }
  return "Model file";
}

function prettifyLabel(value: string) {
  const normalized = value.replace(/[_-]+/g, " ").trim();
  if (!normalized) {
    return "Model file";
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  return Object.getPrototypeOf(value) === Object.prototype;
}

function guessLabel(record: Record<string, unknown>, fallbackKey: string) {
  const labelFromRecord =
    typeof record.name === "string"
      ? record.name
      : typeof record.filename === "string"
        ? record.filename
        : typeof record.title === "string"
          ? record.title
          : undefined;
  return labelFromRecord ?? prettifyLabel(fallbackKey);
}
