import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 chars"),
  ENCRYPTION_KEY: z.string().length(64, "ENCRYPTION_KEY must be exactly 64 hex chars (32 bytes)"),
  API_URL: z.string().min(1, "API_URL is required"),
  DASHBOARD_URL: z.string().min(1, "DASHBOARD_URL is required"),
});

if (process.env.NODE_ENV === "test") {
  process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://localhost:5432/nexus";
  process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-minimum-32-characters!!";
  process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ?? "0000000000000000000000000000000000000000000000000000000000000000";
  process.env.API_URL = process.env.API_URL ?? "http://localhost:3001";
  process.env.DASHBOARD_URL = process.env.DASHBOARD_URL ?? "http://localhost:3000";
}

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;
