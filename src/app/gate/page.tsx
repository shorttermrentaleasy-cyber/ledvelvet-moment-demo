import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

function getAllowedAdmins(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export const dynamic = "force-dynamic";

export default async function GatePage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase().trim();

  if (!email) redirect("/login");

  // Admin → /admin
  if (getAllowedAdmins().includes(email)) {
    redirect("/admin");
  }

  // Non-admin → /lvpeople
  redirect("/lvpeople");
}
