"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type TabKey = "wallyfor" | "legacy";

type WallyRow = {
  id: string;
  barcode: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  status: string | null;
  raw: any;
  updated_at: string;
};

function normHeader(s: string) {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[_\-]+/g, " ");
}

function pick(h: string) {
  return normHeader(h);
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return { headers: [], rows: [] };

  const delim = lines[0].includes(";") ? ";" : ",";

  const headers = lines[0].split(delim).map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(delim);
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (parts[idx] || "").trim();
    });
    rows.push(obj);
  }

  return { headers, rows };
}

function mapWallyRow(obj: Record<string, string>) {
  const keys = Object.keys(obj);
  const getBy = (cands: string[]) => {
    const found = keys.find((k) => cands.includes(pick(k)));
    return found ? obj[found] : "";
  };

  const barcode = getBy(["barcode", "bar code", "codice a barre", "codice", "tessera", "card"]);
  const first = getBy(["nome iscritto", "nome", "first name", "firstname"]);
  const last = getBy(["cognome", "last name", "lastname"]);
  const full = getBy(["nominativo", "nome e cognome", "full name", "fullname"]);
  const email = getBy(["email", "e-mail", "mail"]);

  const status = getBy([
    "anno validità tessera",
    "anno validita tessera",
    "validità tessera",
    "validita tessera",
    "stato",
    "status",
  ]);

  const full_name = full || [first, last].filter(Boolean).join(" ").trim();

  return {
    barcode: (barcode || "").trim(),
    first_name: first ? first.trim() : null,
    last_name: last ? last.trim() : null,
    full_name: full_name || null,
    email: email ? email.trim() : null,
    status: status ? status.trim() : null,
    raw: obj,
  };
}

function getRawField(raw: any, label: string) {
  if (!raw || typeof raw !== "object") return "";
  const v = raw[label];
  return v ? String(v).trim() : "";
}

async function fetchJsonSafe(input: RequestInfo, init?: RequestInit) {
  const res = await fetch(input, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers || {}),
    },
    credentials: "include",
  });

  const ct = res.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    const txt = await res.text().catch(() => "");
    const preview = (txt || "").slice(0, 180).replace(/\s+/g, " ").trim();
    throw new Error(`Non-JSON response (${res.status}). Preview: ${preview || "—"}`);
  }

  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

export default function AdminMembersPage() {
  const [tab, setTab] = useState<TabKey>("wallyfor");

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");

  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<WallyRow[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  const [qrOpen, setQrOpen] = useState(false);
  const [qrValue, setQrValue] = useState<string>("");
  const [qrImgUrl, setQrImgUrl] = useState<string>("");

  // ✅ SOLO AGGIUNTA: totale soci dal DB (endpoint /api/admin/wallyfor/count)
  const [totalCount, setTotalCount] = useState<number | null>(null);

  const title = useMemo(() => {
    return tab === "wallyfor" ? "Associati — Wallyfor (ETS)" : "Associati — Legacy (Eventi / non-soci)";
  }, [tab]);

  const subtitle = useMemo(() => {
    return tab === "wallyfor"
      ? "Importa e visualizza i soci ETS (fonte: export Wallyfor). QR generato dal Barcode."
      : "Placeholder. Qui gestiremo i partecipanti/non-soci da convertire in ETS (step successivo).";
  }, [tab]);

  async function loadWallyfor() {
    setLoading(true);
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set("q", q.trim());
      if (status && status !== "all") qs.set("status", status);

      const json = await fetchJsonSafe(`/api/admin/wallyfor/list?${qs.toString()}`, { cache: "no-store" });
      if (!json?.ok) throw new Error(json?.error || "load_failed");
      setRows(json.rows || []);
    } catch (e: any) {
      setErr(e?.message || "load_failed");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  // ✅ SOLO AGGIUNTA: carica totale una volta (silenzioso se endpoint manca)
  useEffect(() => {
    fetch("/api/admin/wallyfor/count", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && typeof j.total === "number") setTotalCount(j.total);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (tab === "wallyfor") loadWallyfor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function onImportCsv(file: File | null) {
    if (!file) return;

    setImporting(true);
    setImportMsg(null);
    setErr(null);

    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (!parsed.headers.length) throw new Error("CSV non valido (header mancante).");

      const mapped = parsed.rows.map(mapWallyRow).filter((r) => r.barcode);
      if (mapped.length === 0) throw new Error("Nessuna riga valida: manca la colonna Barcode (o valori vuoti).");

      const json = await fetchJsonSafe("/api/admin/wallyfor/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: mapped }),
      });

      if (!json?.ok) throw new Error(json?.error || "import_failed");
      setImportMsg(`Import OK: ${json.imported} righe.`);
      await loadWallyfor();

      // ✅ SOLO AGGIUNTA: refresh totale dopo import
      fetch("/api/admin/wallyfor/count", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (j?.ok && typeof j.total === "number") setTotalCount(j.total);
        })
        .catch(() => {});
    } catch (e: any) {
      setErr(e?.message || "import_failed");
    } finally {
      setImporting(false);
    }
  }

  function openQr(barcode: string) {
    setQrValue(barcode);
    // ✅ QR senza dipendenze: immagine generata da servizio esterno
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=360x360&data=${encodeURIComponent(barcode)}`;
    setQrImgUrl(url);
    setQrOpen(true);
  }

  return (
    <main style={styles.page}>
      <div style={styles.bgGlowA} />
      <div style={styles.bgGlowB} />

      <div style={styles.wrap}>
        <header style={styles.header}>
          <div>
            <div style={styles.kicker}>LED VELVET • ADMIN</div>
            <h1 style={styles.h1}>{title}</h1>
            <p style={styles.sub}>{subtitle}</p>
          </div>

          <div style={styles.headerActions}>
            <Link href="/admin" style={styles.backBtn}>
              ← Back
            </Link>
          </div>
        </header>

        <section style={styles.tabsRow}>
          <button
            type="button"
            onClick={() => setTab("wallyfor")}
            style={tab === "wallyfor" ? styles.tabActive : styles.tab}
          >
            Wallyfor (ETS)
          </button>
          <button
            type="button"
            onClick={() => setTab("legacy")}
            style={tab === "legacy" ? styles.tabActive : styles.tab}
          >
            Legacy (Eventi / non-soci)
          </button>
        </section>

        {tab === "wallyfor" ? (
          <>
            <section style={styles.card}>
              <div style={styles.cardTop}>
                <div>
                  <div style={styles.cardTitle}>Import Wallyfor (CSV)</div>
                  <div style={styles.cardDesc}>
                    Carica l’export CSV Wallyfor. Upsert per <b>Barcode</b>. Tutte le colonne finiscono in <b>raw</b>.
                  </div>
                </div>

                <label style={importing ? styles.primaryBtnDisabled : styles.primaryBtn}>
                  {importing ? "Import in corso..." : "Import CSV"}
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    style={{ display: "none" }}
                    disabled={importing}
                    onChange={(e) => onImportCsv(e.target.files?.[0] || null)}
                  />
                </label>
              </div>

              {importMsg ? <div style={styles.okBox}>{importMsg}</div> : null}
              {err ? <div style={styles.errBox}>{String(err)}</div> : null}

              <div style={styles.filtersGrid}>
                <div style={styles.field}>
                  <div style={styles.label}>Cerca</div>
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="nome, email, barcode..."
                    style={styles.input}
                  />
                </div>

                <div style={styles.field}>
                  <div style={styles.label}>Stato / Validità</div>
                  <select value={status} onChange={(e) => setStatus(e.target.value)} style={styles.input}>
                    <option value="all">Tutti</option>
                    <option value="ATTIVA">ATTIVA</option>
                    <option value="NON ATTIVA">NON ATTIVA</option>
                  </select>
                </div>

                <div style={styles.field}>
                  <div style={styles.label}>Azioni</div>
                  <button type="button" style={styles.secondaryBtn} onClick={loadWallyfor} disabled={loading}>
                    {loading ? "Carico..." : "Refresh"}
                  </button>
                </div>

                <div style={styles.field}>
                  <div style={styles.label}>Totale</div>
                  <div style={styles.metric}>{totalCount ?? rows.length}</div>
                </div>
              </div>
            </section>

            <section style={styles.listCard}>
              <div style={styles.listHeader}>
                <div>
                  <div style={styles.cardTitle}>Lista soci ETS</div>
                  <div style={styles.cardDesc}>QR viene generato dal campo <b>Barcode</b>.</div>
                </div>
              </div>

              {rows.length === 0 ? (
                <div style={styles.empty}>
                  <div style={styles.emptyTitle}>Nessun dato</div>
                  <div style={styles.emptyDesc}>Importa un CSV Wallyfor per popolare la lista.</div>
                </div>
              ) : (
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Nome</th>
                        <th style={styles.th}>Email</th>
                        <th style={styles.th}>Telefono</th>
                        <th style={styles.th}>Codice fiscale</th>
                        <th style={styles.th}>Barcode</th>
                        <th style={styles.th}>Validità</th>
                        <th style={styles.th} />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const tel = getRawField(r.raw, "Telefono");
                        const cf = getRawField(r.raw, "Codice fiscale");
                        return (
                          <tr key={r.id}>
                            <td style={styles.td}>
                              {r.full_name || [r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}
                            </td>
                            <td style={styles.td}>{r.email || "—"}</td>
                            <td style={styles.td}>{tel || "—"}</td>
                            <td style={styles.tdMono}>{cf || "—"}</td>
                            <td style={styles.tdMono}>{r.barcode}</td>
                            <td style={styles.td}>{r.status || "—"}</td>
                            <td style={styles.tdRight}>
                              <button type="button" style={styles.qrBtn} onClick={() => openQr(r.barcode)}>
                                QR
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : (
          <section style={styles.listCard}>
            <div style={styles.empty}>
              <div style={styles.emptyTitle}>Legacy (placeholder)</div>
              <div style={styles.emptyDesc}>
                Step successivo: schema + import per partecipanti/non-soci, conversione a ETS.
              </div>
            </div>
          </section>
        )}

        {qrOpen ? (
          <div style={styles.modalOverlay} onClick={() => setQrOpen(false)}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalTop}>
                <div>
                  <div style={styles.modalTitle}>QR — Barcode</div>
                  <div style={styles.modalDesc}>{qrValue}</div>
                </div>
                <button type="button" style={styles.modalClose} onClick={() => setQrOpen(false)}>
                  ✕
                </button>
              </div>

              <div style={styles.qrBox}>
                {qrImgUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrImgUrl} alt="QR" style={{ width: 260, height: 260, borderRadius: 16 }} />
                ) : (
                  <div style={{ opacity: 0.75 }}>Genero QR...</div>
                )}
              </div>

              <div style={styles.modalHint}>
                Scannerizza questo QR in DoorCheck: verrà letto come <b>legacy_barcode</b>.
              </div>
            </div>
          </div>
        ) : null}

        <footer style={styles.footer}>
          <span style={{ opacity: 0.7 }}>Step: Wallyfor import/lista/QR + Telefono/CF.</span>
        </footer>
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
  wrap: { position: "relative", maxWidth: 1100, margin: "0 auto", padding: "28px 18px 48px" },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14 },
  headerActions: { display: "flex", gap: 10, alignItems: "center" },
  kicker: { fontSize: 12, letterSpacing: 2, opacity: 0.7, marginBottom: 6 },
  h1: { fontSize: 30, margin: 0, lineHeight: 1.15 },
  sub: { margin: "10px 0 0", opacity: 0.75, maxWidth: 800 },

  backBtn: {
    textDecoration: "none",
    color: "rgba(255,255,255,0.92)",
    borderRadius: 999,
    padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(0,0,0,0.18)",
    fontSize: 13,
  },

  tabsRow: { display: "flex", gap: 10, margin: "14px 0" },
  tab: {
    borderRadius: 999,
    padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.14)",
    color: "rgba(255,255,255,0.85)",
    cursor: "pointer",
    fontSize: 13,
  },
  tabActive: {
    borderRadius: 999,
    padding: "10px 12px",
    border: "1px solid rgba(0,255,209,0.35)",
    background: "rgba(0,255,209,0.10)",
    color: "rgba(255,255,255,0.95)",
    cursor: "pointer",
    fontSize: 13,
  },

  card: {
    borderRadius: 18,
    padding: 16,
    background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
    backdropFilter: "blur(10px)",
    marginBottom: 14,
  },
  cardTop: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" },
  cardTitle: { fontSize: 15, fontWeight: 750, marginBottom: 4 },
  cardDesc: { fontSize: 12.5, opacity: 0.75 },

  primaryBtn: {
    borderRadius: 999,
    padding: "10px 12px",
    border: "1px solid rgba(0,255,209,0.35)",
    background: "rgba(0,255,209,0.10)",
    color: "rgba(255,255,255,0.92)",
    cursor: "pointer",
    fontSize: 13,
    whiteSpace: "nowrap",
  },
  primaryBtnDisabled: {
    borderRadius: 999,
    padding: "10px 12px",
    border: "1px solid rgba(0,255,209,0.35)",
    background: "rgba(0,255,209,0.10)",
    color: "rgba(255,255,255,0.92)",
    cursor: "not-allowed",
    opacity: 0.6,
    fontSize: 13,
    whiteSpace: "nowrap",
  },
  secondaryBtn: {
    borderRadius: 999,
    padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.14)",
    color: "rgba(255,255,255,0.85)",
    cursor: "pointer",
    fontSize: 13,
    whiteSpace: "nowrap",
  },

  filtersGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12,
    marginTop: 14,
  },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 12, opacity: 0.75 },
  input: {
    borderRadius: 12,
    padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.18)",
    color: "rgba(255,255,255,0.92)",
    outline: "none",
    fontSize: 13,
    width: "100%",
  },
  metric: {
    borderRadius: 12,
    padding: "10px 12px",
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.14)",
    fontSize: 14,
    fontWeight: 800,
    textAlign: "center",
  },

  okBox: {
    marginTop: 10,
    borderRadius: 12,
    padding: "10px 12px",
    border: "1px solid rgba(0,255,209,0.22)",
    background: "rgba(0,255,209,0.08)",
    fontSize: 13,
    opacity: 0.9,
  },
  errBox: {
    marginTop: 10,
    borderRadius: 12,
    padding: "10px 12px",
    border: "1px solid rgba(255,0,70,0.22)",
    background: "rgba(255,0,70,0.10)",
    fontSize: 13,
    opacity: 0.95,
  },

  listCard: {
    borderRadius: 18,
    padding: 16,
    background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
    border: "1px solid rgba(255,255,255,0.10)",
    boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
    backdropFilter: "blur(10px)",
  },
  listHeader: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 },

  tableWrap: { overflowX: "auto", borderRadius: 14, border: "1px solid rgba(255,255,255,0.10)" },
  table: { width: "100%", borderCollapse: "collapse", minWidth: 980 },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: 12,
    opacity: 0.75,
    borderBottom: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.18)",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    fontSize: 13,
    opacity: 0.9,
    whiteSpace: "nowrap",
  },
  tdMono: {
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    fontSize: 13,
    opacity: 0.9,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    whiteSpace: "nowrap",
  },
  tdRight: {
    padding: "10px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    textAlign: "right",
    whiteSpace: "nowrap",
  },

  qrBtn: {
    borderRadius: 999,
    padding: "8px 10px",
    border: "1px solid rgba(0,255,209,0.28)",
    background: "rgba(0,255,209,0.08)",
    color: "rgba(255,255,255,0.92)",
    cursor: "pointer",
    fontSize: 12.5,
  },

  empty: {
    borderRadius: 14,
    padding: 16,
    border: "1px dashed rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.14)",
  },
  emptyTitle: { fontSize: 14, fontWeight: 750, marginBottom: 6 },
  emptyDesc: { fontSize: 12.5, opacity: 0.78, lineHeight: 1.35 },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 50,
  },
  modal: {
    width: "min(520px, 96vw)",
    borderRadius: 18,
    padding: 16,
    background: "rgba(10,10,18,0.92)",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "0 30px 90px rgba(0,0,0,0.6)",
    backdropFilter: "blur(10px)",
  },
  modalTop: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 12 },
  modalTitle: { fontSize: 15, fontWeight: 800, marginBottom: 4 },
  modalDesc: {
    fontSize: 12.5,
    opacity: 0.75,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  modalClose: {
    borderRadius: 999,
    padding: "8px 10px",
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.18)",
    color: "rgba(255,255,255,0.92)",
    cursor: "pointer",
    fontSize: 12,
  },
  qrBox: {
    borderRadius: 16,
    padding: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(0,0,0,0.18)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 290,
  },
  modalHint: { marginTop: 10, fontSize: 12.5, opacity: 0.75, lineHeight: 1.35 },

  footer: { marginTop: 14, fontSize: 12, opacity: 0.65 },
};
