export const dynamic = "force-dynamic";

export default function AdminVerifyPage() {
  return (
    <main style={styles.page}>
      <div style={styles.bgGlowA} />
      <div style={styles.bgGlowB} />

      <div style={styles.card}>
        <div style={styles.kicker}>LED VELVET • ADMIN</div>
        <h1 style={styles.h1}>Controlla la mail</h1>
        <p style={styles.sub}>
          Ti abbiamo inviato un link di accesso. Se non lo vedi, controlla anche lo spam.
        </p>

        <a href="/admin/login" style={styles.ghostBtn}>
          ← Torna al login
        </a>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "rgba(255,255,255,0.92)",
    background:
      "radial-gradient(1200px 600px at 20% -10%, rgba(255,0,199,0.18), transparent 60%), radial-gradient(1000px 700px at 90% 10%, rgba(0,255,209,0.14), transparent 55%), #070812",
    position: "relative",
    overflow: "hidden",
    padding: 24,
  },
  bgGlowA: {
    position: "absolute",
    inset: "-200px auto auto -200px",
    width: 520,
    height: 520,
    background: "radial-gradient(circle, rgba(255,0,199,0.25), transparent 60%)",
    filter: "blur(12px)",
    pointerEvents: "none",
  },
  bgGlowB: {
    position: "absolute",
    inset: "auto -220px -220px auto",
    width: 620,
    height: 620,
    background: "radial-gradient(circle, rgba(0,255,209,0.18), transparent 60%)",
    filter: "blur(14px)",
    pointerEvents: "none",
  },
  card: {
    position: "relative",
    maxWidth: 520,
    width: "100%",
    padding: 26,
    borderRadius: 22,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
    backdropFilter: "blur(14px)",
  },
  kicker: {
    fontSize: 12,
    letterSpacing: 2,
    opacity: 0.7,
    marginBottom: 6,
  },
  h1: {
    fontSize: 28,
    margin: 0,
  },
  sub: {
    marginTop: 12,
    opacity: 0.75,
    fontSize: 14,
    lineHeight: 1.5,
  },
  ghostBtn: {
    marginTop: 18,
    display: "inline-block",
    padding: "12px 16px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.22)",
    background: "rgba(0,0,0,0.22)",
    color: "rgba(255,255,255,0.9)",
    textDecoration: "none",
    fontWeight: 650,
  },
};
