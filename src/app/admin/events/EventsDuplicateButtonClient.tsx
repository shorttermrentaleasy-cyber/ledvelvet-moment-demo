"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function EventsDuplicateButtonClient({
  id,
  label,
}: {
  id: string;
  label?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function duplicate() {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const r = await fetch("/api/admin/events/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      const raw = await r.text();
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {};
      }

      const newId = data?.id || data?.record?.id;

      if (!r.ok || !data.ok || !newId) {
        const msg = data?.error || `HTTP ${r.status} ${r.statusText}`;
        console.error("DUPLICATE failed:", { status: r.status, raw, data });
        setError(msg);
        setLoading(false);
        return;
      }

      router.push(`/admin/events/edit?id=${encodeURIComponent(newId)}`);
      router.refresh();
    } catch {
      setError("Errore di rete");
      setLoading(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        onClick={duplicate}
        disabled={loading}
        style={loading ? styles.btnDisabled : styles.btn}
        title={label ? `Duplicate: ${label}` : "Duplicate"}
      >
        {loading ? "Duplicating…" : "Duplicate"}
      </button>

      {error ? <span style={styles.err}>{error}</span> : null}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  btn: {
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid rgba(0,255,209,0.40)",
    background: "rgba(0,255,209,0.10)",
    color: "rgba(255,255,255,0.92)",
    fontSize: 12,
    cursor: "pointer",
    marginLeft: 8,
  },
  btnDisabled: {
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    cursor: "not-allowed",
    marginLeft: 8,
  },
  err: {
    marginLeft: 8,
    fontSize: 12,
    color: "rgba(255,160,180,0.95)",
    opacity: 0.9,
  },
};
