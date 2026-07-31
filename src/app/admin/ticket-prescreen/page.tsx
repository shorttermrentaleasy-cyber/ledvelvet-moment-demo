import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";
import TicketPrescreenClient from "./TicketPrescreenClient";

export const dynamic = "force-dynamic";

export default async function TicketPrescreenPage() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || "").trim().toLowerCase();
  const allowed = String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!email) redirect("/admin/login");
  if (!allowed.includes(email)) redirect("/admin/auth-error?error=AccessDenied");

  return <TicketPrescreenClient />;
}
