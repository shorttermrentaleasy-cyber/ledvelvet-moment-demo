import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const dynamic = "force-dynamic";

export default async function EnterPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect("/login");
  }

  const role = (session as any)?.role as string | undefined;

  if (role === "admin") redirect("/admin");
  if (role === "member") redirect("/lvpeople");

  redirect("/login?error=AccessDenied");
}
