import { SupabaseClient } from "@supabase/supabase-js";

export type ResolvedDoorGate = {
  gate_id: string | null;
  door_role: "ordinary" | "loyalty" | "privileged" | null;
  gate_name: string | null;
  xceed_email: string | null;
  source: "door_gates" | "not_found";
};

export async function resolveDoorGateByXceedEmail(
  supabase: SupabaseClient,
  checkedInBy?: string | null
): Promise<ResolvedDoorGate> {
  const email = String(checkedInBy || "").trim().toLowerCase();

  if (!email) {
    return {
      gate_id: null,
      door_role: null,
      gate_name: null,
      xceed_email: null,
      source: "not_found",
    };
  }

  const { data, error } = await supabase
    .from("door_gates")
    .select("gate_id,name,door_role,xceed_email,active")
    .eq("xceed_email", email)
    .eq("active", true)
    .maybeSingle();

  if (error || !data) {
    return {
      gate_id: null,
      door_role: null,
      gate_name: null,
      xceed_email: email,
      source: "not_found",
    };
  }

  return {
    gate_id: data.gate_id,
    door_role: data.door_role,
    gate_name: data.name,
    xceed_email: data.xceed_email,
    source: "door_gates",
  };
}