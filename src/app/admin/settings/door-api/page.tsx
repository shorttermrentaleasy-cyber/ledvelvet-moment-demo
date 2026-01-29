import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import DoorApiKeyClient from "./DoorApiKeyClient";

export const dynamic = "force-dynamic";

export default async function DoorApiSettingsPage() {
  const session = await getServerSession(authOptions);
  const email = (session?.user?.email || "").toLowerCase().trim();
  if (!email) redirect("/admin/login");

  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (!allowed.includes(email)) redirect("/admin/auth-error?error=AccessDenied");

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-4">
          <div className="text-xs text-white/50">ADMIN • SETTINGS</div>
          <h1 className="text-2xl font-semibold">Door API Key</h1>
          <p className="mt-1 text-sm text-white/60">
            Gestisci la chiave usata da <span className="font-mono">/api/doorcheck</span>. Solo admin.
          </p>
        </div>

        <DoorApiKeyClient />
      </div>
    </main>
  );
}
