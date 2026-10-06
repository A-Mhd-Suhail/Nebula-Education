--------------------------------------------------------------------------------
import { dbAdd } from "./store";
import { state } from "./state";

export async function audit(action: string, detail = ""): Promise<void> {
  const p = state.profile;
  if (!p) return;
  await dbAdd("auditLogs", {
    actor: p.uid, actorName: p.name, actorRole: p.role,
    action, detail, createdAt: Date.now(),
  });
}

