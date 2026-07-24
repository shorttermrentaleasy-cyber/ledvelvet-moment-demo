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
    .from("members")
    .select("id, first_name, last_name, email, membership_group, status, membership_expires_at, legacy_barcode")
    .ilike("email", email)
    .order("first_name", { ascending: true })
    .order("last_name", { ascending: true });

  if (error) {
    return Response.json({ ok: false, error: "Impossibile leggere il profilo socio." }, { status: 500 });
  }

  const members = (rows || []).map((member) => ({
    id: member.id,
    fullName: [member.first_name, member.last_name].filter(Boolean).join(" ").trim() || email,
    group: member.membership_group,
    status: member.status,
    expiresAt: member.membership_expires_at,
    barcode: member.legacy_barcode,
  }));
  const isMember = members.length > 0;
  const singleMember = members.length === 1 ? members[0] : null;
  const qualification = isAdmin && isMember
    ? "Amministratore e socio"
    : isAdmin
      ? "Amministratore"
      : "Socio";

  return Response.json({
    ok: true,
    authenticated: true,
    profile: {
      email,
      fullName: singleMember?.fullName || session?.user?.name || email,
      qualification,
      isAdmin,
      isMember,
      member: singleMember,
      members,
      requiresMemberChoice: members.length > 1,
    },
  });
}
