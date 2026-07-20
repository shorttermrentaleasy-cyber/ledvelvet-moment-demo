import { createClient } from "@supabase/supabase-js";
import { fetchAllWallyforMembers } from "@/lib/wallyfor";

function requiredEnv(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function fullName(firstName: string | null, lastName: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || null;
}

export type WallyforSyncResult = {
  sync_id: string;
  fetched: number;
  pages: number;
  missing: number;
  updated_count: number;
  inserted_count: number;
  completed_at: string;
};

export async function syncWallyforSnapshot(): Promise<WallyforSyncResult> {
  const startedAt = new Date().toISOString();
  const syncId = crypto.randomUUID();
  const supabase = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { data: currentState, error: stateError } = await supabase
    .from("wallyfor_sync_state")
    .select("status,started_at")
    .eq("id", 1)
    .maybeSingle();
  if (stateError) throw stateError;
  const runningSince = currentState?.started_at
    ? new Date(currentState.started_at).getTime()
    : 0;
  if (
    currentState?.status === "running" &&
    runningSince > Date.now() - 10 * 60 * 1000
  ) {
    throw new Error("Wallyfor sync already running");
  }

  const { error: startError } = await supabase.from("wallyfor_sync_state").upsert({
    id: 1,
    status: "running",
    started_at: startedAt,
    last_error: null,
  });
  if (startError) throw startError;

  try {
    // Nessuna scrittura avviene finché l'intera paginazione non è conclusa.
    const snapshot = await fetchAllWallyforMembers();
    if (snapshot.members.length === 0) {
      const { count, error: countError } = await supabase
        .from("wallyfor_members")
        .select("id", { count: "exact", head: true })
        .eq("source", "wallyfor_api");
      if (countError) throw countError;
      if ((count || 0) > 0) {
        throw new Error("Wallyfor returned an empty snapshot; existing members were preserved");
      }
    }
    const seenAt = new Date().toISOString();
    const batchSize = 500;

    for (let start = 0; start < snapshot.members.length; start += batchSize) {
      const rows = snapshot.members.slice(start, start + batchSize).map((member) => ({
        barcode: member.barcode,
        first_name: member.first_name,
        last_name: member.last_name,
        full_name: fullName(member.first_name, member.last_name),
        email: member.email,
        phone: member.phone,
        membership_group: member.membership_group,
        status: member.status || "DA VERIFICARE",
        membership_expires_at: member.membership_expires_at,
        raw: member.raw,
        source: "wallyfor_api",
        is_present: true,
        last_seen_at: seenAt,
        last_seen_sync_id: syncId,
        missing_since: null,
        updated_at: seenAt,
      }));

      const { error } = await supabase
        .from("wallyfor_members")
        .upsert(rows, { onConflict: "barcode" });
      if (error) throw error;
    }

    // Solo dopo il salvataggio completo si marcano gli ex-presenti non restituiti.
    const { data: missingRows, error: missingError } = await supabase
      .from("wallyfor_members")
      .update({ is_present: false, missing_since: seenAt, updated_at: seenAt })
      .eq("source", "wallyfor_api")
      .eq("is_present", true)
      .neq("last_seen_sync_id", syncId)
      .select("id");
    if (missingError) throw missingError;

    const { data: membersSync, error: membersSyncError } = await supabase.rpc(
      "sync_wallyfor_to_members",
      { p_limit: 20000 }
    );
    if (membersSyncError) throw membersSyncError;

    const counts = Array.isArray(membersSync) ? membersSync[0] : membersSync;
    const completedAt = new Date().toISOString();
    const result: WallyforSyncResult = {
      sync_id: syncId,
      fetched: snapshot.members.length,
      pages: snapshot.pages,
      missing: missingRows?.length || 0,
      updated_count: Number(counts?.updated_count || 0),
      inserted_count: Number(counts?.inserted_count || 0),
      completed_at: completedAt,
    };

    const { error: completeError } = await supabase.from("wallyfor_sync_state").upsert({
      id: 1,
      status: "success",
      started_at: startedAt,
      completed_at: completedAt,
      last_success_at: completedAt,
      last_error: null,
      fetched_count: result.fetched,
      missing_count: result.missing,
      pages_count: result.pages,
    });
    if (completeError) throw completeError;

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase.from("wallyfor_sync_state").upsert({
      id: 1,
      status: "error",
      completed_at: new Date().toISOString(),
      last_error: message.slice(0, 1000),
    });
    throw error;
  }
}

export async function getWallyforSyncState() {
  const supabase = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  const { data, error } = await supabase
    .from("wallyfor_sync_state")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
