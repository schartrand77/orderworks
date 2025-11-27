type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface NumericPrintTime {
  minutes: number;
}

interface LabelPrintTime {
  label: string;
}

type PrintTimeCandidate = NumericPrintTime | LabelPrintTime;

type UnitHint = "minutes" | "hours" | "auto";

const PRINT_KEY_MATCHERS = ["time", "duration"];

/**
 * Attempt to extract the approximate print time from MakerWorks job metadata.
 * The metadata fields are free-form (based on form builder slugs), so this
 * helper searches for any key that references printing time/duration and
 * tolerates a variety of value formats (numbers, strings like "2h 30m", etc).
 */
export function deriveApproximatePrintTime(metadata: unknown): { formatted: string; minutes?: number } | null {
  const candidate = findPrintTimeCandidate(metadata);
  if (!candidate) {
    return null;
  }

  if ("minutes" in candidate) {
    const minutes = Math.round(candidate.minutes);
    if (minutes <= 0) {
      return null;
    }
    return {
      minutes,
      formatted: formatMinutes(minutes),
    };
  }

  const label = candidate.label.trim();
  return label.length > 0 ? { formatted: label } : null;
}

function findPrintTimeCandidate(value: unknown): PrintTimeCandidate | null {
  if (!isPlainObject(value) && !Array.isArray(value)) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findPrintTimeCandidate(item);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  for (const [key, child] of Object.entries(value)) {
    if (isPrintTimeKey(key)) {
      const parsed = parsePrintTimeValue(child, key);
      if (parsed) {
        return parsed;
      }
    }

    if (isPlainObject(child) || Array.isArray(child)) {
      const nested = findPrintTimeCandidate(child);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function isPlainObject(value: unknown): value is Record<string, JsonValue> {
  if (value === null) {
    return false;
  }
  if (typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  return true;
}

function isPrintTimeKey(key: string) {
  const normalized = key.toLowerCase();
  return normalized.includes("print") && PRINT_KEY_MATCHERS.some((matcher) => normalized.includes(matcher));
}

function parsePrintTimeValue(value: unknown, key: string): PrintTimeCandidate | null {
  if (value === null || value === undefined) {
    return null;
  }

  const unitHint = detectUnitHint(key);

  if (typeof value === "number") {
    return formatNumericCandidate(value, unitHint);
  }

  if (typeof value === "string") {
    return parseStringCandidate(value, unitHint);
  }

  if (isPlainObject(value)) {
    const hours = readNumeric(value, ["hours", "hour", "hrs", "hr"]);
    const minutes = readNumeric(value, ["minutes", "minute", "mins", "min"]);

    if (hours !== null || minutes !== null) {
      const totalMinutes = (hours ?? 0) * 60 + (minutes ?? 0);
      if (Number.isFinite(totalMinutes) && totalMinutes > 0) {
        return { minutes: totalMinutes };
      }
    }
  }

  return null;
}

function detectUnitHint(key: string): UnitHint {
  const normalized = key.toLowerCase();
  if (normalized.includes("minute") || normalized.includes("min")) {
    return "minutes";
  }
  if (normalized.includes("hour") || normalized.includes("hr")) {
    return "hours";
  }
  return "auto";
}

function parseStringCandidate(raw: string, unitHint: UnitHint): PrintTimeCandidate | null {
  const value = raw.trim();
  if (value.length === 0) {
    return null;
  }

  const durationFromString = parseDurationString(value);
  if (durationFromString !== null) {
    return { minutes: durationFromString };
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return formatNumericCandidate(numeric, unitHint);
  }

  const normalizedUnit = detectUnitHint(value);
  const rangeMatch = value.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    if (Number.isFinite(start) && Number.isFinite(end)) {
      const average = (start + end) / 2;
      const minutes = convertToMinutes(average, normalizedUnit);
      if (minutes !== null) {
        return { minutes };
      }
    }
  }

  return { label: value };
}

function parseDurationString(value: string): number | null {
  const colonMatch = value.match(/^(\d+)\s*:\s*(\d{1,2})$/);
  if (colonMatch) {
    const hours = Number(colonMatch[1]);
    const minutes = Number(colonMatch[2]);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      return hours * 60 + minutes;
    }
  }

  const hourRegex = /([\d.]+)\s*(hours?|hrs?|h)\b/gi;
  const minuteRegex = /([\d.]+)\s*(minutes?|mins?|m)\b/gi;

  let totalMinutes = 0;
  let hasMatch = false;

  for (const match of value.matchAll(hourRegex)) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) {
      totalMinutes += parsed * 60;
      hasMatch = true;
    }
  }

  for (const match of value.matchAll(minuteRegex)) {
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed)) {
      totalMinutes += parsed;
      hasMatch = true;
    }
  }

  if (hasMatch && totalMinutes > 0) {
    return totalMinutes;
  }

  return null;
}

function formatNumericCandidate(value: number, unitHint: UnitHint): PrintTimeCandidate | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  const minutes = convertToMinutes(value, unitHint);
  return minutes !== null ? { minutes } : null;
}

function convertToMinutes(value: number, unitHint: UnitHint): number | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  if (unitHint === "minutes") {
    return value;
  }
  if (unitHint === "hours") {
    return value * 60;
  }
  // Auto-detect: treat larger numbers as minutes, small (<=10) as hours.
  if (value <= 10) {
    return value * 60;
  }
  return value;
}

function formatMinutes(totalMinutes: number) {
  const minutes = Math.round(totalMinutes);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining === 0 ? `${hours}h` : `${hours}h ${remaining}m`;
}

function readNumeric(source: Record<string, JsonValue>, keys: string[]): number | null {
  if (keys.length === 0) {
    return null;
  }
  const lookup = new Map<string, JsonValue>();
  for (const [candidateKey, candidateValue] of Object.entries(source)) {
    lookup.set(candidateKey.toLowerCase(), candidateValue);
  }
  for (const key of keys) {
    const candidate = lookup.get(key.toLowerCase());
    if (candidate === undefined) {
      continue;
    }
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }
  return null;
}
