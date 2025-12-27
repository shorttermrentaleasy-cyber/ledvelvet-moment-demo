import AdminTopbarClient from "./AdminTopbarClient";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/authOptions";

export const dynamic = "force-dynamic";

export default async function AdminHomePage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/admin/login");

  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (!session.user?.email || !allowed.includes(session.user.email.toLowerCase())) {
    redirect("/admin/login");
  }

  return (
    <main style={styles.page}>
      <div style={styles.bgGlowA} />
      <div style={styles.bgGlowB} />

      <div style={styles.wrap}>
        <AdminTopbarClient />

        <header style={styles.header}>
          <div>
            <div style={styles.kicker}>LED VELVET • ADMIN</div>
            <h1 style={styles.h1}>Dashboard</h1>
            <p style={styles.sub}>Scegli cosa vuoi gestire.</p>
            <p style={styles.user}>Logged in as: {session.user.email}</p>
          </div>
        </header>

        <div style={styles.grid}>
          <Card
            title="Events"
            desc="Crea e modifica eventi"
            href="/admin/events"
          />

          <Card
            title="Sponsors"
            desc="Crea e gestisci sponsor"
            href="/admin/sponsors"
          />

          <Card
            title="Associati"
            desc="Gestione soci / membership"
            href="/admin/members"
            disabled
          />

          <Card
            title="Settings"
            desc="Impostazioni admin"
            href="/admin/settings"
            disabled
          />
        </div>

        <p style={styles.note}>
          Nota: le sezioni disabilitate le attiviamo dopo, una alla volta.
        </p>
      </div>
    </main>
  );
}

function Card({
  title,
  desc,
  href,
  disabled,
}: {
  title: string;
  desc: string;
  href: string;
  disabled?: boolean;
}) {
  const inner = (
    <div style={disabled ? styles.cardDisabled : styles.card}>
      <div style={styles.cardTitle}>{title}</div>
      <div style={styles.cardDesc}>{desc}</div>
      <div style={styles.cardCta}>{disabled ? "Coming soon" : "Open →"}</div>
    </div>
  );

  if (disabled) return inner;

  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      {inner}
    </Link>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    color: "rgba(255,255,255,0.92)",
    background:
      "radial-gradient(1200px 600px at 20% -10%, rgba(255,0,199,0.18), transparent 60%), radial-gradient(1000px 700px at 90% 10%, rgba(0,255,209,0.14), transparent 55%), #070812",
    position: "relative",
    overflow: "hidden",
  },
  bgGlowA: {
    position: "absolute",
    inset: "-220px auto auto -220px",
    width: 560,
    height: 560,
    background: "radial-gradient(circle, rgba(255,0,199,0.25), transparent 60%)",
    filter: "blur(10px)",
    pointerEvents: "none",
  },
  bgGlowB: {
    position: "absolute",
    inset: "auto -260px -260px auto",
    width: 680,
    height: 680,
    background: "radial-gradient(circle, rgba(0,255,209,0.20), transparent 60%)",
    filter: "blur(12px)",
    pointerEvents: "none",
  },
  wrap: {
    position: "relative",
    maxWidth: 980,
    margin: "0 auto",
    padding: "28px 18px 48px",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 18,
  },
  kicker: { fontSize: 12, letterSpacing: 2, opacity: 0.7, marginBottom: 6 },
  h1: { fontSize: 34, margin: 0, lineHeight: 1.1 },
  sub: { margin: "10px 0 0", opacity: 0.75 },
  user: { margin: "8px 0 0", opacity: 0.55, fontSize: 13 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14,
    marginTop: 18,
  },
  card: {
    borderRadius: 18,
    padding: 16,
    background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
    backdropFilter: "blur(10px)",
    cursor: "pointer",
  },
  cardDisabled: {
    borderRadius: 18,
    padding: 16,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    opacity: 0.55,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 750,
    marginBottom: 6,
    color: "rgba(255,255,255,0.95)",
  },
  cardDesc: { fontSize: 13, opacity: 0.75, marginBottom: 12 },
  cardCta: {
    fontSize: 12,
    opacity: 0.9,
    display: "inline-block",
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(0,255,209,0.35)",
    background: "rgba(0,0,0,0.22)",
  },
  note: { marginTop: 14, fontSize: 12, opacity: 0.6 },
};
