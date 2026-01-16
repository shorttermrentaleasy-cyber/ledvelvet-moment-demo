"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  return (
    <main style={styles.page}>
      <div style={styles.bgGlowA} />
      <div style={styles.bgGlowB} />

      <div style={styles.card}>
        {/* Top bar: kicker + Home */}
        <div style={styles.topRow}>
          <div style={styles.kicker}>LED VELVET • ADMIN</div>
          <a href="/moment2" style={styles.homeLink}>
            HOME
          </a>
        </div>

        <h1 style={styles.h1}>Login</h1>
        <p style={styles.sub}>
          Inserisci la tua email admin.
          <br />
          Riceverai un link di accesso sicuro.
        </p>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!email) return;
            setLoading(true);
            await signIn("email", {
              email,
              callbackUrl: "/admin",
            });
          }}
          style={styles.form}
        >
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email admin"
            type="email"
            required
            style={styles.input}
          />

          <button type="submit" style={styles.primaryBtn} disabled={loading}>
            {loading ? "Invio…" : "Invia link"}
          </button>
        </form>

        <p style={styles.note}>
          Accesso riservato agli amministratori autorizzati.
        </p>
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
  },
  bgGlowA: {
    position: "absolute",
    inset: "-200px auto auto -200px",
    width: 520,
    height: 520,
    background: "radial-gradient(circle, rgba(255,0,199,0.25), transparent 60%)",
    filter: "blur(10px)",
    pointerEvents: "none",
  },
  bgGlowB: {
    position: "absolute",
    inset: "auto -220px -220px auto",
    width: 620,
    height: 620,
    background: "radial-gradient(circle, rgba(0,255,209,0.18), transparent 60%)",
    filter: "blur(12px)",
    pointerEvents: "none",
  },
  card: {
    position: "relative",
    width: "100%",
    maxWidth: 420,
    padding: 24,
    borderRadius: 20,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
    backdropFilter: "blur(12px)",
  },

  topRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 10,
  },
  kicker: {
    fontSize: 12,
    letterSpacing: 2,
    opacity: 0.7,
    marginBottom: 0,
    whiteSpace: "nowrap",
  },
  homeLink: {
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    opacity: 0.75,
    color: "rgba(255,255,255,0.92)",
    textDecoration: "none",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.04)",
    padding: "8px 12px",
    borderRadius: 999,
    lineHeight: 1,
  },

  h1: {
    fontSize: 28,
    margin: 0,
    lineHeight: 1.1,
  },
  sub: {
    marginTop: 10,
    opacity: 0.75,
    fontSize: 14,
  },
  form: {
    marginTop: 20,
    display: "grid",
    gap: 14,
  },
  input: {
    height: 44,
    padding: "0 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.18)",
    outline: "none",
    background: "rgba(5,6,14,0.55)",
    color: "rgba(255,255,255,0.95)",
    colorScheme: "dark",
  },
  primaryBtn: {
    height: 46,
    borderRadius: 16,
    border: "1px solid rgba(0,255,209,0.75)",
    background:
      "linear-gradient(90deg, rgba(0,255,209,0.35), rgba(255,0,199,0.30))",
    color: "rgba(255,255,255,0.95)",
    fontWeight: 700,
    cursor: "pointer",
    textShadow: "0 1px 10px rgba(0,0,0,0.65)",
  },
  note: {
    marginTop: 16,
    fontSize: 12,
    opacity: 0.55,
    textAlign: "center",
  },
};
