import { Prisma } from "@/generated/prisma/client";

/**
 * Normalizes optional JSON-ish values so that Prisma accepts them.
 * Undefined stays undefined (field omitted), null becomes Prisma.JsonNull,
 * and all other values pass through as-is.
 */
export function jsonOrNull(value: unknown): Prisma.InputJsonValue | Prisma.JsonNullValueInput | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return Prisma.JsonNull;
  }
  return value as Prisma.InputJsonValue;
}
