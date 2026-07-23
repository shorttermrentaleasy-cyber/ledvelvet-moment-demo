"use client";

import { useRouter } from "next/navigation";

export default function AdminTopbarClient({ backHref }: { backHref?: string }) {
  const router = useRouter();

  return (
    <div style={styles.wrap}>
      <button
        onClick={() => window.close()}
        style={styles.ghostBtn}
        title="Close"
      >
        Close
      </button>

      {backHref ? (
        <button onClick={() => router.push(backHref)} style={styles.ghostBtn}>
          ← Back
        </button>
      ) : null}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: "flex",
    justifyContent: "flex-start",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  ghostBtn: {
    padding: "10px 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.22)",
    background: "rgba(0,0,0,0.22)",
    color: "rgba(255,255,255,0.9)",
    fontWeight: 650,
    fontSize: 14,
    cursor: "pointer",
  },
};
