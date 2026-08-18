import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { createClient } from "@supabase/supabase-js";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getAllowedAdmins() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function getSelectedMemberBarcode(email: string) {
  const value = cookies().get("lv_member_access")?.value || "";
  const separator = value.lastIndexOf(".");
  const secret = process.env.NEXTAUTH_SECRET;
  if (separator < 1 || !secret) return null;

  const barcode = value.slice(0, separator);
  const received = value.slice(separator + 1);
  const expected = createHmac("sha256", secret)
    .update(`${email}:${barcode}`)
    .digest("hex");

  return received.length === expected.length &&
    timingSafeEqual(Buffer.from(received), Buffer.from(expected))
    ? barcode
    : null;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").toLowerCase().trim();

  if (!email) return Response.json({ ok: true, authenticated: false });

  const isAdmin = getAllowedAdmins().includes(email);
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;

  if (!url || !key) {
    return Response.json({ ok: false, error: "Configurazione soci non disponibile." }, { status: 500 });
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: rows, error } = await supabase
    .from("wallyfor_members")
    .select("barcode, first_name, last_name, email, membership_group, status, membership_expires_at")
    .ilike("email", email)
    .order("first_name", { ascending: true })
    .order("last_name", { ascending: true })
    .eq("source", "wallyfor_api")
    .eq("is_present", true);

  if (error) {
    return Response.json({ ok: false, error: "Impossibile leggere il profilo socio." }, { status: 500 });
  }

  const members = (rows || []).map((member) => ({
    id: member.barcode,
    fullName: [member.first_name, member.last_name].filter(Boolean).join(" ").trim() || email,
    group: member.membership_group,
    status: member.status,
    expiresAt: member.membership_expires_at,
    barcode: member.barcode,
  }));
  const isMember = members.length > 0;
  const selectedBarcode = getSelectedMemberBarcode(email);
  const selectedMember = selectedBarcode
    ? members.find((member) => member.barcode === selectedBarcode) || null
    : null;
  const activeMember = members.length === 1 ? members[0] : selectedMember;
  const qualification = isAdmin && isMember
    ? "Amministratore e socio"
    : isAdmin
      ? "Amministratore"
      : isMember
        ? "Socio"
        : "Non socio";

  return Response.json({
    ok: true,
    authenticated: true,
    profile: {
      email,
      fullName: activeMember?.fullName || session?.user?.name || email,
      qualification,
      isAdmin,
      isMember,
      member: activeMember,
      members,
      requiresMemberChoice: members.length > 1 && !activeMember,
      canChangeMember: members.length > 1 && Boolean(activeMember),
    },
  });
}
