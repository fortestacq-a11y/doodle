#!/usr/bin/env node

import { execSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

const root = join(import.meta.dirname ?? __dirname, "..");

console.log("Nexus Setup Script");
console.log("==================\n");

// Check .env
const envPath = join(root, ".env");
if (!existsSync(envPath)) {
  console.log("Creating .env from .env.example...");
  execSync("cp .env.example .env", { cwd: root });
  console.log("Done. Edit .env with your configuration.\n");
} else {
  console.log(".env exists.\n");
}

// Install deps
console.log("Installing dependencies...");
execSync("pnpm install", { cwd: root, stdio: "inherit" });
console.log();

// Generate Prisma client
console.log("Generating Prisma client...");
execSync("pnpm db:generate", { cwd: root, stdio: "inherit" });
console.log();

console.log("Setup complete!");
console.log("\nNext steps:");
console.log("  1. Start PostgreSQL and Redis: docker compose up -d");
console.log("  2. Run migrations: pnpm db:migrate");
console.log("  3. Seed database: pnpm db:seed");
console.log("  4. Start API: pnpm --filter @nexus/api dev");
console.log("  5. Start Dashboard: pnpm --filter @nexus/dashboard dev");
