const BUILDER_DEFAULT_PATTERNS = [
  /\bscale\s*(?:[:=]?\s*)(?:x\s*)?1(?:\.0+)?\s*(?=$|[,;|/)\]-]|\bfinish\b)/gi,
  /\bfinish\s*(?:[:=]?\s*)standard\s*(?=$|[,;|/)\]-]|\bscale\b)/gi,
];

function toFiniteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function readPath(source: unknown, path: string[]) {
  let current: unknown = source;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function cleanupDelimiters(input: string) {
  return input
    .replace(/\(\s*[,;|/-\s]*\)/g, "")
    .replace(/\[\s*[,;|/-\s]*]/g, "")
    .replace(/\{\s*[,;|/-\s]*}/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s*([,;|/])\s*/g, "$1 ")
    .replace(/\s*-\s*/g, " - ")
    .replace(/(?:^| )([,;|/-])(?: |$)/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/^[,;|/-]+\s*/g, "")
    .replace(/\s*[,;|/-]+$/g, "")
    .trim();
}

export function toCustomerFacingLineItemDescription(rawDescription: unknown, fallback: string) {
  const original = typeof rawDescription === "string" ? rawDescription.trim() : "";
  if (!original) {
    return fallback;
  }

  const withoutDefaults = BUILDER_DEFAULT_PATTERNS.reduce((current, pattern) => current.replace(pattern, ""), original);
  const cleaned = cleanupDelimiters(withoutDefaults);
  return cleaned.length > 0 ? cleaned : fallback;
}

export function toCustomerFacingUnitPriceCents(rawLineItem: unknown) {
  const customCentsCandidates = [
    ["customUnitPriceCents"],
    ["customPriceCents"],
    ["custom_price_cents"],
    ["pricing", "customUnitPriceCents"],
    ["pricing", "customPriceCents"],
    ["pricing", "custom_price_cents"],
  ];
  for (const path of customCentsCandidates) {
    const value = toFiniteNumber(readPath(rawLineItem, path));
    if (value !== null && value >= 0) {
      return Math.round(value);
    }
  }

  const customDollarCandidates = [
    ["customUnitPrice"],
    ["customPrice"],
    ["custom_price"],
    ["pricing", "customUnitPrice"],
    ["pricing", "customPrice"],
    ["pricing", "custom_price"],
  ];
  for (const path of customDollarCandidates) {
    const value = toFiniteNumber(readPath(rawLineItem, path));
    if (value !== null && value >= 0) {
      return Math.round(value * 100);
    }
  }

  const defaultCentsCandidates = [["unitPriceCents"], ["unit_price_cents"], ["pricing", "unitPriceCents"]];
  for (const path of defaultCentsCandidates) {
    const value = toFiniteNumber(readPath(rawLineItem, path));
    if (value !== null && value >= 0) {
      return Math.round(value);
    }
  }

  return null;
}
