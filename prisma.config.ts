import { config as loadEnv } from "dotenv";
import { defineConfig, env } from "prisma/config";

if (!process.env.DATABASE_URL) {
  loadEnv();
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
