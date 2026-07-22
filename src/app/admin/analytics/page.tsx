"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type EventItem = {
  id: string;
  name: string;
  starts_at?: string | null;
  venue?: string | null;
  city?: string | null;
};

type EventOverview = EventItem & {
  total: number;
  checked_in: number;
  active: number;
  cancelled: number;
  other: number;
  valid_tickets: number;
  conversion_rate: number;
};

function euro(value: any) {
  const n = Number(value || 0);

  const formatted = new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(n);

  return `${formatted} €`;
}

function intNum(value: any) {
  return Number(value || 0).toLocaleString("it-IT");
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventOverview, setEventOverview] = useState<EventOverview[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [overviewError, setOverviewError] = useState("");
  const [eventId, setEventId] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
const typeOrder = ["ticket", "drink", "bottle-service", "guest-list", "penalty"];

const typeLabels: Record<string, string> = {
  ticket: "Ticket",
  drink: "Drink",
  "bottle-service": "Tavoli",
  "guest-list": "Guest List",
  penalty: "Penali Ritardo",
};

  const selectedEvent = useMemo(
    () => events.find((e) => e.id === eventId),
    [events, eventId]
  );

  useEffect(() => {
    async function loadEvents() {
      const [eventsRes, overviewRes] = await Promise.all([
        fetch("/api/admin/analytics-events", { cache: "no-store" }),
        fetch("/api/analytics/events-overview", { cache: "no-store" }),
      ]);
      const eventsJson = await eventsRes.json();
      const overviewJson = await overviewRes.json();

      setEvents(eventsJson.events || []);
      if (overviewJson.ok) {
        setEventOverview(overviewJson.events || []);
      } else {
        setOverviewError(overviewJson.error || "Impossibile caricare l'archivio eventi");
      }
      setOverviewLoading(false);
    }

    loadEvents().catch((error) => {
      setOverviewError(error?.message || "Impossibile caricare l'archivio eventi");
      setOverviewLoading(false);
    });
  }, []);

  async function loadData(id?: string) {
    const useId = id || eventId;
    if (!useId) return;

    setLoading(true);

    const params = new URLSearchParams({
      eventId: useId,
      t: String(Date.now()),
    });
    const res = await fetch(`/api/analytics/event-summary?${params}`, {
      cache: "no-store",
    });
    const json = await res.json();

    setData(json);
    setLoading(false);
  }

  function openEvent(id: string) {
    setEventId(id);
    loadData(id);
    window.setTimeout(() => {
      document.getElementById("event-detail")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 50);
  }

  const conversion = data?.totals?.conversion_rate
    ? (data.totals.conversion_rate * 100).toFixed(1)
    : "0.0";

  return (
    <div className="min-h-screen w-full overflow-x-hidden bg-[#09090d] text-white p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#18172b] via-[#141324] to-[#08080c] p-6 shadow-2xl">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>

<button
  onClick={() => router.push("/admin")}
  className="
    mb-4 inline-flex items-center gap-2
    rounded-full px-4 py-2
    text-xs uppercase tracking-[0.2em]
    border border-cyan-400/40
    bg-cyan-400/10
    text-cyan-200
    hover:bg-cyan-400/20
    hover:border-cyan-300
    transition-all
    shadow-[0_0_20px_rgba(0,255,209,0.15)]
  "
>
  ← Back
</button>

              <div className="text-xs uppercase tracking-[0.35em] text-cyan-300">
                LedVelvet Admin
              </div>
              <h1 className="mt-2 text-3xl font-bold md:text-4xl">
                Analytics Eventi
              </h1>
              <p className="mt-2 text-sm text-white/60">
                Dati automatici dalla Partner API Xceed
              </p>
            </div>

            <div className="w-full md:w-[420px]">
              <label className="mb-2 block text-xs uppercase tracking-[0.25em] text-white/50">
                Evento
              </label>
              <select
                value={eventId}
                onChange={(e) => {
                  setEventId(e.target.value);
                  loadData(e.target.value);
                }}
                className="w-full rounded-2xl border border-cyan-400/40 bg-black/60 px-4 py-3 text-sm text-white outline-none"
              >
                <option value="">Seleziona evento</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                    {ev.city ? ` - ${ev.city}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {selectedEvent && (
            <div className="mt-5 flex flex-wrap gap-3 text-sm text-white/70">
              <Badge>{selectedEvent.name}</Badge>
              {selectedEvent.city && <Badge>{selectedEvent.city}</Badge>}
              {selectedEvent.venue && <Badge>{selectedEvent.venue}</Badge>}
              {selectedEvent.starts_at && (
                <Badge>
                  {new Date(selectedEvent.starts_at).toLocaleDateString("it-IT")}
                </Badge>
              )}
            </div>
          )}
        </div>

        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 shadow-xl md:p-5">
          <div className="mb-4">
            <div className="text-xs uppercase tracking-[0.25em] text-cyan-200/80">
              Archivio eventi
            </div>
            <p className="mt-2 text-sm text-white/55">
              Riepilogo Xceed. Apri un evento per visualizzare tutte le statistiche.
            </p>
          </div>

          {overviewLoading && <div className="text-sm text-white/60">Caricamento eventi...</div>}
          {overviewError && <div className="text-sm text-red-300">{overviewError}</div>}

          {!overviewLoading && !overviewError && (
            <div className="overflow-hidden rounded-2xl border border-white/10">
              <div className="hidden grid-cols-[minmax(240px,1fr)_100px_100px_120px_90px_100px_150px] gap-3 bg-white/10 px-4 py-3 text-[11px] uppercase tracking-[0.12em] text-white/45 lg:grid">
                <div>Evento</div>
                <div className="text-right">Titoli</div>
                <div className="text-right">Ingressi</div>
                <div className="text-right">Non entrati</div>
                <div className="text-right">Annullati</div>
                <div className="text-right">Ingresso</div>
                <div />
              </div>

              <div className="divide-y divide-white/10">
                {eventOverview.map((event) => (
                  <div
                    key={event.id}
                    className="grid gap-4 bg-black/20 p-4 transition hover:bg-cyan-400/[0.06] lg:grid-cols-[minmax(240px,1fr)_100px_100px_120px_90px_100px_150px] lg:items-center lg:gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-white">{event.name}</div>
                      <div className="mt-1 text-xs text-white/45">
                        {event.starts_at
                          ? new Date(event.starts_at).toLocaleDateString("it-IT")
                          : "Data non disponibile"}
                        {event.city ? ` · ${event.city}` : ""}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5 lg:contents">
                      <OverviewValue label="Titoli" value={intNum(event.total)} />
                      <OverviewValue label="Ingressi" value={intNum(event.checked_in)} positive />
                      <OverviewValue label="Non entrati" value={intNum(event.active)} />
                      <OverviewValue label="Annullati" value={intNum(event.cancelled)} />
                      <OverviewValue
                        label="Ingresso"
                        value={`${(event.conversion_rate * 100).toFixed(1)}%`}
                        accent
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => openEvent(event.id)}
                      className="w-full rounded-xl border border-cyan-400/35 bg-cyan-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-400/20 lg:w-auto"
                    >
                      Apri statistiche
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <div id="event-detail" className="scroll-mt-4" />

        {loading && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            Caricamento analytics...
          </div>
        )}

        {data && data.ok && (
          <>
            
<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
  <Card title="Valore titoli" value={euro(data.totals.revenue_eur)} highlight />

  <Card title="Titoli validi" value={intNum(data.totals.tickets)} />
  <Card title="Ingressi tracciati" value={intNum(data.totals.checked_in_xceed)} />
  <Card title="Gate attribuiti" value={intNum(data.totals.mapped_gate_scans)} />

  <Card
    title="Ingressi non attribuibili"
    value={intNum(
      (data.totals.unmapped_gate_scans || 0) +
        (data.totals.missing_scanner_data_scans || 0)
    )}
    danger={
      (data.totals.unmapped_gate_scans || 0) +
        (data.totals.missing_scanner_data_scans || 0) >
      0
    }
  />
  <Card title="Tasso ingressi" value={`${conversion}%`} />

  <Card title="Senza ingresso tracciato" value={intNum(data.totals.not_arrived)} />
  <Card title="Senza prezzo" value={intNum(data.totals.missing_amount_tickets)} />
</div>



            <div
              className={`rounded-3xl border p-5 ${
                (data.totals.unmapped_gate_scans || 0) +
                    (data.totals.missing_scanner_data_scans || 0) >
                  0
                  ? "border-red-500/40 bg-red-950/30"
                  : "border-emerald-500/30 bg-emerald-950/20"
              }`}
            >
              <div className="text-xs uppercase tracking-[0.25em] text-white/60">
                Mappatura scanner Xceed
              </div>
              <div className="mt-2 text-lg">
                <b>{data.totals.mapped_gate_scans}</b> ingressi attribuiti ai gate;{" "}
                <b>{data.totals.unmapped_gate_scans || 0}</b> ingressi con email scanner
                non configurata;{" "}
                <b>{data.totals.missing_scanner_data_scans || 0}</b> ingressi per cui
                Xceed non fornisce il dato scanner.
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Panel title="Breakdown per tipo ticket">
                <div className="w-full overflow-x-auto rounded-2xl border border-white/10">
                  <table className="min-w-[620px] w-full text-sm">
                    <thead className="bg-white/10 text-white/50">
                      <tr>
                        <th className="px-3 py-3 md:px-4 text-left">Tipo</th>
                        <th className="px-3 py-3 md:px-4 text-right">Tot</th>
                        <th className="px-3 py-3 md:px-4 text-right">Entrati</th>
                        <th className="px-3 py-3 md:px-4 text-right">Out</th>
                        <th className="px-3 py-3 md:px-4 text-right">Valore</th>
                      </tr>
                    </thead>
                    <tbody>

{typeOrder
  .filter((k) => data.by_type?.[k])
  .map((key) => {
    const val = data.by_type[key];

    return (
      <tr key={key} className="border-t border-white/10 bg-black/20">
        <td className="px-4 py-3">{typeLabels[key] || key}</td>

        <td className="px-4 py-3 text-right">{intNum(val.total)}</td>

        <td className="px-4 py-3 text-right text-green-300">
          {intNum(val.in)}
        </td>

        <td className="px-4 py-3 text-right text-red-300">
          {intNum(val.out)}
        </td>

        <td className="px-4 py-3 text-right text-cyan-200">
          {euro(Number(val.revenue_eur))}
        </td>
      </tr>
    );
  })}

                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel title="Valore titoli per tipo">
                <div className="space-y-4">
{typeOrder
  .filter((k) => data.by_type?.[k])
  .map((k) => {
    const v = data.by_type[k];

    return (
      <BarRow
        key={k}
        label={typeLabels[k]}
        value={Number(v.revenue_eur || 0)}
        max={Number(data.totals.revenue_eur || 1)}
        money
      />
    );
  })}

                </div>
              </Panel>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Ingressi tracciati per ruolo">
                <div className="space-y-3">
                  {Object.entries(data.by_role || {}).map(([k, v]: any) => (
                    <BarRow
                      key={k}
                      label={k}
                      value={v}
                      max={data.totals.checked_in_xceed || 1}
                    />
                  ))}
                </div>
              </Panel>

              <Panel title="Ingressi tracciati per gate">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {Object.entries(data.by_gate || {}).map(([k, v]: any) => (
                    <div
                      key={k}
                      className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-center"
                    >
                      <div className="text-xs uppercase tracking-[0.2em] text-cyan-200/70">
                        {k}
                      </div>
                      <div className="mt-2 text-3xl font-bold">{v}</div>
                    </div>
                  ))}
                </div>
              </Panel>
            </div>

            <Panel title="Timeline ingressi tracciati">
              <div className="max-h-[420px] space-y-2 overflow-y-auto pr-2">
                {data.timeline.map((t: any, i: number) => {
                  const max = Math.max(
                    ...data.timeline.map((x: any) => Number(x.total || 0)),
                    1
                  );

                  return (
                    <BarRow
                      key={i}
                      label={new Date(t.time).toLocaleTimeString("it-IT", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      value={t.total}
                      max={max}
                    />
                  );
                })}
              </div>
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}

function OverviewValue({
  label,
  value,
  positive,
  accent,
}: {
  label: string;
  value: string;
  positive?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="lg:text-right">
      <div className="text-[10px] uppercase tracking-[0.12em] text-white/40 lg:hidden">
        {label}
      </div>
      <div
        className={`mt-1 font-semibold lg:mt-0 ${
          positive ? "text-green-300" : accent ? "text-cyan-200" : "text-white/85"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Card({
  title,
  value,
  danger,
  highlight,
}: {
  title: string;
  value: any;
  danger?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border p-5 shadow-xl ${
        danger
          ? "border-red-500/40 bg-red-950/30"
          : highlight
          ? "border-cyan-400/40 bg-cyan-400/10"
          : "border-white/10 bg-white/[0.06]"
      }`}
    >
      <div className="text-[11px] uppercase tracking-[0.2em] text-white/45">
        {title}
      </div>
      <div className="mt-2 text-2xl font-bold md:text-3xl">{value}</div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-xl">
      <h2 className="mb-4 text-sm uppercase tracking-[0.25em] text-cyan-200/80">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-cyan-100">
      {children}
    </span>
  );
}

function BarRow({
  label,
  value,
  max,
  money,
}: {
  label: string;
  value: number;
  max: number;
  money?: boolean;
}) {
  const pct = Math.max(2, Math.min(100, (Number(value) / max) * 100));

  return (
    <div>
      <div className="mb-1 flex justify-between gap-3 text-xs text-white/60">
        <span className="min-w-0 truncate">{label}</span>
        <span>{money ? euro(Number(value)) : intNum(value)}</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-cyan-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
