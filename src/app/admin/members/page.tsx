"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";

type Member = {
  id: string;
  barcode: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  membership_group: string | null;
  status: string | null;
  membership_issued_at?: string | null;
  membership_expires_at?: string | null;
  source?: string | null;
  is_present?: boolean;
  updated_at: string;
  raw?: Record<string, unknown> | null;
};

type SyncState = {
  status?: string;
  last_success_at?: string | null;
  last_error?: string | null;
  fetched_count?: number;
  missing_count?: number;
};

const PAGE_SIZE = 50;

function errorMessage(value: unknown) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  return "Errore sconosciuto";
}

async function fetchJson(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    cache: "no-store",
    credentials: "include",
    headers: { Accept: "application/json", ...(init?.headers || {}) },
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) {
    throw new Error(json?.error || `Errore HTTP ${response.status}`);
  }
  return json;
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function parseDelimited(text: string) {
  const lines = text.replace(/\r/g, "").split("\n").filter((line) => line.trim());
  if (lines.length < 2) throw new Error("File non valido o vuoto.");
  const separator = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(separator).map(normalizeHeader);
  const value = (parts: string[], names: string[]) => {
    const index = headers.findIndex((header) => names.includes(header));
    return index >= 0 ? (parts[index] || "").trim() : "";
  };
  return lines.slice(1).map((line) => {
    const parts = line.split(separator);
    const firstName = value(parts, ["nome", "nome iscritto", "first name", "firstname"]);
    const lastName = value(parts, ["cognome", "last name", "lastname"]);
    const fullName = value(parts, ["nominativo", "nome e cognome", "full name", "fullname"]);
    return {
      barcode: value(parts, ["barcode", "bar code", "codice a barre", "codice", "tessera", "card"])
        .replace(/^=\"/, "").replace(/\"$/, "").replace(/^'/, ""),
      first_name: firstName || null,
      last_name: lastName || null,
      full_name: fullName || [firstName, lastName].filter(Boolean).join(" ") || null,
      email: value(parts, ["email", "e-mail", "mail"]) || null,
      phone: value(parts, ["telefono", "phone", "cellulare"]) || null,
      membership_group: value(parts, ["codicegruppo", "codice gruppo", "gruppo", "membership group"]) || null,
      status: value(parts, ["stato", "status", "validità tessera", "validita tessera"]) || "DA VERIFICARE",
      raw: Object.fromEntries(headers.map((header, index) => [header, (parts[index] || "").trim()])),
    };
  }).filter((row) => row.barcode);
}

function formatDate(value?: string | null, withTime = false) {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return withTime ? date.toLocaleString("it-IT") : date.toLocaleDateString("it-IT");
}

function memberName(member: Member) {
  return member.full_name || [member.first_name, member.last_name].filter(Boolean).join(" ") || "Senza nome";
}

function sourceLabel(member: Member) {
  if (member.source === "wallyfor_api") return member.is_present === false ? "Non più presente" : "Wallyfor";
  return "Import XLS";
}

export default function AdminMembersPage() {
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Member[]>([]);
  const [total, setTotal] = useState(0);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [selected, setSelected] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fallbackOpen, setFallbackOpen] = useState(false);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total ? page * PAGE_SIZE + 1 : 0;
  const to = Math.min((page + 1) * PAGE_SIZE, total);

  async function loadMembers() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
      if (query) params.set("q", query);
      if (status !== "all") params.set("status", status);
      const json = await fetchJson(`/api/admin/wallyfor/list?${params}`);
      setRows(json.rows || []);
      setTotal(Number(json.count || 0));
    } catch (reason) {
      setRows([]);
      setTotal(0);
      setError(errorMessage(reason));
    } finally {
      setLoading(false);
    }
  }

  async function loadSyncState() {
    try {
      const json = await fetchJson("/api/admin/wallyfor/refresh");
      setSyncState(json.state || null);
    } catch {
      setSyncState(null);
    }
  }

  useEffect(() => { void loadMembers(); }, [page, query, status]);
  useEffect(() => { void loadSyncState(); }, []);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(0);
    setQuery(queryInput.trim());
  }

  async function refreshWallyfor() {
    setSyncing(true);
    setMessage(null);
    setError(null);
    try {
      const json = await fetchJson("/api/admin/wallyfor/refresh", { method: "POST" });
      setMessage(`Aggiornamento completato: ${Number(json.fetched || 0)} soci ricevuti.`);
      setPage(0);
      await Promise.all([loadMembers(), loadSyncState()]);
    } catch (reason) {
      setError(errorMessage(reason));
      await loadSyncState();
    } finally {
      setSyncing(false);
    }
  }

  async function importFile(file: File | null) {
    if (!file) return;
    setImporting(true);
    setMessage(null);
    setError(null);
    try {
      const parsed = parseDelimited(await file.text());
      if (!parsed.length) throw new Error("Nessuna riga valida con barcode.");
      let imported = 0;
      for (let start = 0; start < parsed.length; start += 500) {
        const batch = parsed.slice(start, start + 500);
        const json = await fetchJson("/api/admin/wallyfor/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: batch }),
        });
        imported += Number(json.imported || batch.length);
      }
      setMessage(`Import di emergenza completato: ${imported} righe elaborate.`);
      setPage(0);
      await loadMembers();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setImporting(false);
    }
  }

  const statusOptions = useMemo(() => ["all", "ATTIVA", "NON ATTIVA", "SCADUTA", "DA VERIFICARE"], []);

  return (
    <main style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.header}>
          <div>
            <div style={styles.kicker}>LED VELVET • ADMIN</div>
            <h1 style={styles.h1}>Gestione soci</h1>
            <p style={styles.sub}>Cerca e consulta l’anagrafica aggiornata da Wallyfor.</p>
          </div>
          <Link href="/admin" style={styles.button}>← Dashboard</Link>
        </header>

        <section style={styles.summaryGrid}>
          <div style={styles.metricCard}><span style={styles.metricLabel}>Soci trovati</span><strong style={styles.metricValue}>{total.toLocaleString("it-IT")}</strong></div>
          <div style={styles.metricCard}><span style={styles.metricLabel}>Ultimo aggiornamento</span><strong style={styles.metricText}>{formatDate(syncState?.last_success_at, true)}</strong></div>
          <div style={styles.metricCard}><span style={styles.metricLabel}>Sincronizzazione</span><strong style={styles.metricText}>{syncState?.status === "error" ? "Errore" : syncState?.status === "success" ? "Regolare" : "Da verificare"}</strong></div>
        </section>

        <section style={styles.card}>
          <div style={styles.actionsTop}>
            <form onSubmit={submitSearch} style={styles.searchForm}>
              <input value={queryInput} onChange={(event) => setQueryInput(event.target.value)} style={styles.input} placeholder="Nome, cognome, email, telefono o barcode" />
              <select value={status} onChange={(event) => { setPage(0); setStatus(event.target.value); }} style={styles.select} aria-label="Filtra per stato">
                {statusOptions.map((value) => <option key={value} value={value}>{value === "all" ? "Tutti gli stati" : value}</option>)}
              </select>
              <button style={styles.primaryButton} type="submit">Cerca</button>
              {(query || status !== "all") && <button type="button" style={styles.button} onClick={() => { setQueryInput(""); setQuery(""); setStatus("all"); setPage(0); }}>Azzera</button>}
            </form>
            <button type="button" style={styles.primaryButton} disabled={syncing} onClick={refreshWallyfor}>{syncing ? "Aggiornamento…" : "Aggiorna da Wallyfor"}</button>
          </div>
          {syncState?.status === "error" && syncState.last_error && <div style={styles.errorBox}>Ultimo errore sync: {syncState.last_error}</div>}
          {message && <div style={styles.okBox}>{message}</div>}
          {error && <div style={styles.errorBox}>{error}</div>}
        </section>

        <section style={styles.card}>
          <div style={styles.listHeader}>
            <div><div style={styles.cardTitle}>Elenco soci</div><div style={styles.cardDesc}>{loading ? "Caricamento…" : `${from}–${to} di ${total.toLocaleString("it-IT")}`}</div></div>
            <div style={styles.pagination}>
              <button style={styles.button} disabled={page === 0 || loading} onClick={() => setPage((value) => value - 1)}>← Precedenti</button>
              <span style={styles.pageLabel}>Pagina {page + 1} di {pageCount}</span>
              <button style={styles.button} disabled={page + 1 >= pageCount || loading} onClick={() => setPage((value) => value + 1)}>Successivi →</button>
            </div>
          </div>

          {!loading && rows.length === 0 ? <div style={styles.empty}>Nessun socio corrisponde ai filtri.</div> : (
            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead><tr><th style={styles.th}>Socio</th><th style={styles.th}>Contatti</th><th style={styles.th}>Gruppo</th><th style={styles.th}>Stato</th><th style={styles.th}>Scadenza</th><th style={styles.th}>Origine</th><th style={styles.th}></th></tr></thead>
                <tbody>{rows.map((member) => (
                  <tr key={member.id}>
                    <td style={styles.td}><strong>{memberName(member)}</strong><div style={styles.mono}>{member.barcode || "—"}</div></td>
                    <td style={styles.td}><div>{member.email || "—"}</div><div style={styles.muted}>{member.phone || "—"}</div></td>
                    <td style={styles.td}>{member.membership_group || "—"}</td>
                    <td style={styles.td}><span style={member.status === "ATTIVA" ? styles.activeBadge : styles.inactiveBadge}>{member.status || "—"}</span></td>
                    <td style={styles.td}>{formatDate(member.membership_expires_at)}</td>
                    <td style={styles.td}>{sourceLabel(member)}</td>
                    <td style={styles.tdRight}><button style={styles.primaryButton} onClick={() => setSelected(member)}>Apri</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>

        <section style={styles.fallbackCard}>
          <button type="button" style={styles.fallbackToggle} onClick={() => setFallbackOpen((value) => !value)}>{fallbackOpen ? "▾" : "▸"} Procedura di emergenza — Import XLS/CSV</button>
          {fallbackOpen && <div style={styles.fallbackBody}><p style={styles.cardDesc}>Usare soltanto se la sincronizzazione Wallyfor non è disponibile. I dati importati restano riconoscibili nella colonna Origine.</p><label style={importing ? styles.disabledButton : styles.button}>{importing ? "Importazione…" : "Scegli file XLS/CSV"}<input hidden type="file" accept=".csv,.xls,text/csv,application/vnd.ms-excel" disabled={importing} onChange={(event) => void importFile(event.target.files?.[0] || null)} /></label></div>}
        </section>
      </div>

      {selected && <div style={styles.overlay} onClick={() => setSelected(null)}><section style={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div style={styles.modalHeader}><div><div style={styles.kicker}>SCHEDA SOCIO</div><h2 style={styles.modalTitle}>{memberName(selected)}</h2></div><button style={styles.button} onClick={() => setSelected(null)}>✕</button></div>
        <div style={styles.detailGrid}>
          <div style={styles.qrBox}>{selected.barcode ? <QRCode value={selected.barcode} size={190} /> : <span>QR non disponibile</span>}<div style={styles.monoDark}>{selected.barcode || "—"}</div></div>
          <div style={styles.details}>
            <Detail label="Email" value={selected.email} /><Detail label="Telefono" value={selected.phone} /><Detail label="Gruppo" value={selected.membership_group} /><Detail label="Stato tessera" value={selected.status} /><Detail label="Emissione" value={formatDate(selected.membership_issued_at)} /><Detail label="Scadenza" value={formatDate(selected.membership_expires_at)} /><Detail label="Origine dato" value={sourceLabel(selected)} /><Detail label="Ultimo aggiornamento" value={formatDate(selected.updated_at, true)} />
          </div>
        </div>
      </section></div>}
    </main>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return <div style={styles.detail}><span style={styles.detailLabel}>{label}</span><strong>{value || "—"}</strong></div>;
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", color: "rgba(255,255,255,.94)", background: "radial-gradient(900px 500px at 10% 0%, rgba(255,0,199,.18), transparent 60%), radial-gradient(900px 600px at 95% 10%, rgba(0,255,209,.13), transparent 55%), #070812" },
  wrap: { maxWidth: 1180, margin: "0 auto", padding: "28px 18px 50px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18 }, kicker: { fontSize: 12, letterSpacing: 2, opacity: .7, marginBottom: 6 }, h1: { fontSize: 34, margin: 0 }, sub: { opacity: .72, margin: "8px 0 0" },
  summaryGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12, marginBottom: 14 }, metricCard: { padding: 16, borderRadius: 16, background: "rgba(255,255,255,.055)", border: "1px solid rgba(255,255,255,.1)" }, metricLabel: { display: "block", fontSize: 12, opacity: .65, marginBottom: 6 }, metricValue: { fontSize: 28 }, metricText: { fontSize: 15 },
  card: { borderRadius: 18, padding: 16, marginBottom: 14, background: "linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.03))", border: "1px solid rgba(255,255,255,.1)", boxShadow: "0 18px 50px rgba(0,0,0,.35)" }, actionsTop: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }, searchForm: { display: "flex", gap: 8, flexWrap: "wrap", flex: "1 1 650px" },
  input: { flex: "1 1 270px", minWidth: 0, borderRadius: 12, padding: "10px 12px", border: "1px solid rgba(255,255,255,.16)", background: "rgba(0,0,0,.2)", color: "white", fontSize: 14 }, select: { borderRadius: 12, padding: "10px 12px", border: "1px solid rgba(255,255,255,.16)", background: "#131520", color: "white" },
  button: { display: "inline-block", textDecoration: "none", borderRadius: 999, padding: "9px 12px", border: "1px solid rgba(255,255,255,.16)", background: "rgba(0,0,0,.18)", color: "white", cursor: "pointer", fontSize: 13 }, primaryButton: { borderRadius: 999, padding: "9px 12px", border: "1px solid rgba(0,255,209,.35)", background: "rgba(0,255,209,.1)", color: "white", cursor: "pointer", whiteSpace: "nowrap" }, disabledButton: { borderRadius: 999, padding: "9px 12px", border: "1px solid rgba(255,255,255,.1)", opacity: .5 },
  okBox: { marginTop: 12, padding: 10, borderRadius: 12, background: "rgba(0,255,209,.08)", border: "1px solid rgba(0,255,209,.22)", fontSize: 13 }, errorBox: { marginTop: 12, padding: 10, borderRadius: 12, background: "rgba(255,40,90,.1)", border: "1px solid rgba(255,40,90,.25)", fontSize: 13 },
  listHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }, cardTitle: { fontWeight: 800, marginBottom: 4 }, cardDesc: { fontSize: 13, opacity: .7, lineHeight: 1.45 }, pagination: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }, pageLabel: { fontSize: 12, opacity: .7 },
  tableWrap: { overflowX: "auto", borderRadius: 14, border: "1px solid rgba(255,255,255,.1)" }, table: { width: "100%", borderCollapse: "collapse", minWidth: 980 }, th: { textAlign: "left", padding: "10px 12px", fontSize: 12, opacity: .68, background: "rgba(0,0,0,.18)", borderBottom: "1px solid rgba(255,255,255,.1)" }, td: { padding: "11px 12px", fontSize: 13, borderBottom: "1px solid rgba(255,255,255,.075)", verticalAlign: "middle" }, tdRight: { padding: "11px 12px", textAlign: "right", borderBottom: "1px solid rgba(255,255,255,.075)" }, muted: { opacity: .62, marginTop: 4 }, mono: { fontFamily: "monospace", opacity: .62, marginTop: 4, fontSize: 12 }, activeBadge: { display: "inline-block", padding: "5px 8px", borderRadius: 999, background: "rgba(0,255,209,.12)", border: "1px solid rgba(0,255,209,.25)" }, inactiveBadge: { display: "inline-block", padding: "5px 8px", borderRadius: 999, background: "rgba(255,180,40,.1)", border: "1px solid rgba(255,180,40,.23)" }, empty: { padding: 18, border: "1px dashed rgba(255,255,255,.17)", borderRadius: 14, opacity: .72 },
  fallbackCard: { borderRadius: 16, padding: 14, background: "rgba(255,255,255,.025)", border: "1px solid rgba(255,255,255,.08)" }, fallbackToggle: { border: 0, background: "transparent", color: "white", cursor: "pointer", fontWeight: 700, padding: 0 }, fallbackBody: { marginTop: 12 },
  overlay: { position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.68)", display: "grid", placeItems: "center", padding: 16 }, modal: { width: "min(760px, 96vw)", maxHeight: "92vh", overflowY: "auto", borderRadius: 20, padding: 18, background: "#10121d", border: "1px solid rgba(255,255,255,.14)", boxShadow: "0 30px 90px rgba(0,0,0,.6)" }, modalHeader: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 16 }, modalTitle: { margin: 0, fontSize: 24 }, detailGrid: { display: "grid", gridTemplateColumns: "minmax(220px, .8fr) minmax(280px, 1.2fr)", gap: 16 }, qrBox: { background: "white", color: "#111", borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 250 }, monoDark: { fontFamily: "monospace", marginTop: 12, fontSize: 12, wordBreak: "break-all", textAlign: "center" }, details: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }, detail: { padding: 11, borderRadius: 12, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.04)", overflowWrap: "anywhere" }, detailLabel: { display: "block", fontSize: 11, opacity: .6, marginBottom: 5 },
};
