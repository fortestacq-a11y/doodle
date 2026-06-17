import { db } from "./index.js";
import crypto from "crypto";

async function check() {
  const keys = await db.apiKey.findMany();
  console.log("Keys in DB:", keys.length);
  for (const k of keys) {
    console.log("  Hash:", k.keyHash);
  }
  const testHash = crypto.createHash("sha256").update("nexus_test_key_12345").digest("hex");
  console.log("Test hash:", testHash);
  const match = keys.find((k) => k.keyHash === testHash);
  console.log("Match:", !!match);
  await db.$disconnect();
}
check();
