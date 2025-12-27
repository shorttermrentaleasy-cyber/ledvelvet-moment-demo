"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function EventsDeleteButtonClient({
  id,
  label,
}: {
  id: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expected = "DELETE";
  const canDelete = confirm.trim().toUpperCase() === expected && !loading;

  async function doDelete() {
    if (!canDelete) return;
    setLoading(true);
    setError(null);

    try {
      const r = await fetch("/api/admin/events/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const rawText = await r.text();
let data: any = {};
try {
  data = rawText ? JSON.parse(rawText) : {};
} catch {
  data = {};
}

if (!r.ok || !data.ok) {
  const msg =
    data?.error ||
    `HTTP ${r.status} ${r.statusText} - ${rawText?.slice(0, 300) || ""}`;
  console.error("DELETE failed:", { status: r.status, rawText, data });
  setError(msg);
  setLoading(false);
  return;
}

      setOpen(false);
      setConfirm("");
      router.refresh();
    } catch {
      setError("Errore di rete");
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setError(null);
          setConfirm("");
        }}
        style={styles.dangerBtn}
        title="Delete"
      >
        Delete
      </button>

      {open && (
        <div style={styles.overlay} onClick={() => !loading && setOpen(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTitle}>Delete event</div>
            <div style={styles.modalSub}>
              Questo elimina l’evento da Airtable. Azione irreversibile.
            </div>

            {label ? (
              <div style={styles.itemLine}>
                <span style={{ opacity: 0.65 }}>Evento:</span>{" "}
                <span style={{ fontWeight: 700 }}>{label}</span>
              </div>
            ) : null}

            <div style={styles.itemLine}>
              Scrivi <b>DELETE</b> per confermare:
            </div>

            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="DELETE"
              style={styles.input}
              disabled={loading}
              autoFocus
            />

            {error && <div style={styles.err}>{error}</div>}

            <div style={styles.actions}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={styles.ghostBtn}
                disabled={loading}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={doDelete}
                style={canDelete ? styles.dangerSolid : styles.dangerSolidDisabled}
                disabled={!canDelete}
              >
                {loading ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  dangerBtn: {
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,0,120,0.45)",
    background: "rgba(255,0,120,0.10)",
    color: "rgba(255,255,255,0.92)",
    textDecoration: "none",
    fontSize: 12,
    cursor: "pointer",
    marginLeft: 8,
  },
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.65)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 50,
  },
  modal: {
    width: "100%",
    maxWidth: 520,
    borderRadius: 18,
    padding: 18,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
    backdropFilter: "blur(14px)",
    color: "rgba(255,255,255,0.92)",
  },
  modalTitle: { fontSize: 18, fontWeight: 800 },
  modalSub: { marginTop: 6, opacity: 0.75, fontSize: 13 },
  itemLine: { marginTop: 12, fontSize: 13, opacity: 0.9 },
  input: {
    marginTop: 10,
    height: 44,
    width: "100%",
    padding: "0 12px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.16)",
    outline: "none",
    background: "rgba(5,6,14,0.55)",
    color: "rgba(255,255,255,0.95)",
    colorScheme: "dark",
  },
  err: {
    marginTop: 10,
    padding: 10,
    borderRadius: 12,
    border: "1px solid rgba(255,0,120,0.40)",
    background: "rgba(255,0,120,0.10)",
    fontSize: 12,
    color: "rgba(255,220,220,0.95)",
  },
  actions: {
    marginTop: 14,
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
  },
  ghostBtn: {
    padding: "10px 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.22)",
    background: "rgba(0,0,0,0.22)",
    color: "rgba(255,255,255,0.9)",
    fontWeight: 650,
    cursor: "pointer",
  },
  dangerSolid: {
    padding: "10px 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,0,120,0.65)",
    background: "rgba(255,0,120,0.25)",
    color: "rgba(255,255,255,0.95)",
    fontWeight: 800,
    cursor: "pointer",
  },
  dangerSolidDisabled: {
    padding: "10px 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.45)",
    fontWeight: 800,
    cursor: "not-allowed",
  },
};
