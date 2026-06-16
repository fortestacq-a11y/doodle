import { db } from "./index.js";
import crypto from "crypto";

async function setup() {
  const user = await db.user.upsert({
    where: { email: "demo@nexus.dev" },
    update: {},
    create: { email: "demo@nexus.dev", name: "Demo User" },
  });

  const ws = await db.workspace.create({
    data: { name: "Demo Workspace", ownerId: user.id },
  });

  await db.workspaceMember.create({
    data: { workspaceId: ws.id, userId: user.id, role: "owner" },
  });

  const rawKey = "nexus_test_key_12345";
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  await db.apiKey.create({
    data: { workspaceId: ws.id, name: "Test Key", keyHash },
  });

  console.log("Workspace ID:", ws.id);
  console.log("API Key:", rawKey);
  console.log("Hash:", keyHash);
  await db.$disconnect();
}
setup();
