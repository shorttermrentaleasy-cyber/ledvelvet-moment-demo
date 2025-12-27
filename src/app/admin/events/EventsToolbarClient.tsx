"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function EventsToolbarClient() {
  const router = useRouter();

  return (
    <div style={styles.wrap}>
      <button
        onClick={() => router.push("/admin/events/create")}
        style={styles.primaryBtn}
      >
        + Create event
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    margin: "16px 0 24px",
  },
  primaryBtn: {
    padding: "12px 18px",
    borderRadius: 16,
    border: "1px solid rgba(0,255,209,0.75)",
    background:
      "linear-gradient(90deg, rgba(0,255,209,0.35), rgba(255,0,199,0.30))",
    color: "rgba(255,255,255,0.95)",
    fontWeight: 700,
    fontSize: 14,
    cursor: "pointer",
    textShadow: "0 1px 10px rgba(0,0,0,0.65)",
    boxShadow:
      "0 0 0 1px rgba(0,255,209,0.35), 0 12px 30px rgba(0,0,0,0.45)",
  },
  ghostBtn: {
    padding: "12px 16px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.22)",
    background: "rgba(0,0,0,0.22)",
    color: "rgba(255,255,255,0.9)",
    fontWeight: 650,
    fontSize: 14,
    cursor: "pointer",
  },
};
