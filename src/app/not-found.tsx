export default function NotFound() {
  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.kicker}>LED VELVET</div>
        <h1 style={styles.h1}>404 – Not Found</h1>
        <p style={styles.sub}>
          La pagina che cerchi non esiste o è stata spostata.
        </p>

        <a href="/admin" style={styles.primaryBtn}>
          Vai alla dashboard
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
    background: "#070812",
    color: "#fff",
    padding: 24,
  },
  card: {
    maxWidth: 420,
    padding: 24,
    borderRadius: 18,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.12)",
  },
  kicker: {
    fontSize: 12,
    letterSpacing: 2,
    opacity: 0.6,
    marginBottom: 6,
  },
  h1: {
    fontSize: 26,
    margin: 0,
  },
  sub: {
    marginTop: 10,
    opacity: 0.75,
    fontSize: 14,
    marginBottom: 18,
  },
  primaryBtn: {
    display: "inline-block",
    padding: "12px 18px",
    borderRadius: 16,
    border: "1px solid rgba(0,255,209,0.75)",
    background:
      "linear-gradient(90deg, rgba(0,255,209,0.35), rgba(255,0,199,0.30))",
    color: "#fff",
    fontWeight: 700,
    textDecoration: "none",
  },
};
