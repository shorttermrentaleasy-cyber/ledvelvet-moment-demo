"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function AdminAuthErrorPage() {
  const params = useSearchParams();
  const error = params.get("error");

  return (
    <main style={styles.page}>
      <div style={styles.bgGlowA} />
      <div style={styles.bgGlowB} />

      <div style={styles.card}>
        <div style={styles.kicker}>LED VELVET • ADMIN</div>
        <h1 style={styles.h1}>Access Denied</h1>

        <p style={styles.sub}>
          {error === "AccessDenied"
            ? "La tua email non è autorizzata come amministratore."
            : "Errore di autenticazione."}
        </p>

        <div style={styles.actions}>
          <Link href="/admin/login" style={styles.primaryBtn}>
            Torna al login
          </Link>
        </div>
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
    maxWidth: 460,
    width: "100%",
    padding: 26,
    borderRadius: 22,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
    backdropFilter: "blur(14px)",
    textAlign: "center",
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
  },
  actions: {
    marginTop: 20,
    display: "flex",
    justifyContent: "center",
  },
  primaryBtn: {
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
