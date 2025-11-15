import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  MAKERWORKS_WEBHOOK_SECRET: z.string().min(1, "MAKERWORKS_WEBHOOK_SECRET is required"),
});

type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) {
    return cached;
  }

  const parsed = envSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
    MAKERWORKS_WEBHOOK_SECRET: process.env.MAKERWORKS_WEBHOOK_SECRET,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.errors.map((error) => `${error.path.join(".")}: ${error.message}`).join("; "));
  }

  cached = parsed.data;
  return cached;
}
