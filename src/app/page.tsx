import Link from "next/link";

export const dynamic = "force-dynamic";

// Ora il sito vive su admin.ledvelvet.it, quindi same-origin va bene.
// Quando passerai al dominio pubblico (ledvelvet.it), cambia SOLO questa costante.
const PUBLIC_SITE_ORIGIN = ""; // es: "https://ledvelvet.it"

function publicHref(path: string) {
  return PUBLIC_SITE_ORIGIN ? `${PUBLIC_SITE_ORIGIN}${path}` : path;
}

export default function Home() {
  return (
    <main style={styles.page}>
      <div style={styles.bgGlowA} />
      <div style={styles.bgGlowB} />

      <div style={styles.wrap}>
        <header style={styles.header}>
          <div>
            <div style={styles.kicker}>LED VELVET</div>
            <h1 style={styles.h1}>Choose your entrance</h1>
            <p style={styles.sub}>
              Public site for the experience. Admin dashboard for management.
            </p>
          </div>
        </header>

        <div style={styles.grid}>
          {/* PUBLIC */}
          <a href={publicHref("/moment2")} style={{ textDecoration: "none" }}>
            <div style={styles.cardPrimary}>
              <div style={styles.cardTitle}>Enter the site</div>
              <div style={styles.cardDesc}>
                Momenti: hero, events, atmosphere (public experience).
              </div>
              <div style={styles.cardCtaPrimary}>Open →</div>
            </div>
          </a>

          {/* ADMIN */}
          <Link href="/admin/login" style={{ textDecoration: "none" }}>
            <div style={styles.card}>
              <div style={styles.cardTitle}>Admin dashboard</div>
              <div style={styles.cardDesc}>
                Login required. Manage hero, events, sponsors.
              </div>
              <div style={styles.cardCta}>Login →</div>
            </div>
          </Link>
        </div>

        <div style={styles.footerNote}>
          <span style={{ opacity: 0.8 }}>LedVelvet</span>{" "}
          <span style={{ opacity: 0.5 }}>— ethereal clubbing in unconventional places</span>
        </div>
      </div>
    </main>
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
    padding: "44px 18px 48px",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 18,
  },
  kicker: { fontSize: 12, letterSpacing: 2, opacity: 0.7, marginBottom: 10 },
  h1: { fontSize: 40, margin: 0, lineHeight: 1.06 },
  sub: { margin: "12px 0 0", opacity: 0.75, maxWidth: 560 },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 14,
    marginTop: 22,
  },
  cardPrimary: {
    borderRadius: 18,
    padding: 18,
    background:
      "linear-gradient(180deg, rgba(255,0,199,0.12), rgba(255,255,255,0.05))",
    border: "1px solid rgba(255,0,199,0.22)",
    boxShadow: "0 18px 55px rgba(0,0,0,0.55)",
    cursor: "pointer",
  },
  card: {
    borderRadius: 18,
    padding: 18,
    background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
    cursor: "pointer",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 780,
    marginBottom: 6,
    color: "rgba(255,255,255,0.95)",
  },
  cardDesc: { fontSize: 13, opacity: 0.75, marginBottom: 14, lineHeight: 1.35 },
  cardCtaPrimary: {
    fontSize: 12,
    opacity: 0.95,
    display: "inline-block",
    padding: "7px 12px",
    borderRadius: 999,
    border: "1px solid rgba(0,255,209,0.35)",
    background: "rgba(0,0,0,0.25)",
  },
  cardCta: {
    fontSize: 12,
    opacity: 0.9,
    display: "inline-block",
    padding: "7px 12px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.22)",
  },
  footerNote: { marginTop: 22, fontSize: 12, opacity: 0.65 },
};
