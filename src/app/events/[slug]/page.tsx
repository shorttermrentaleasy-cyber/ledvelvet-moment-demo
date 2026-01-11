import Link from "next/link";
import { notFound } from "next/navigation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AirtableRecord<T> = {
  id: string;
  fields: T;
};

type DeepDiveFields = {
  slug?: string;
  event_ref?: string[]; // linked record ids
  title_override?: string;
  subtitle?: string;

  hero_media_type?: "image" | "youtube" | "mp4";
  hero_image?: Array<{ url: string }>;
  hero_youtube_url?: string;
  hero_mp4_url?: string;

  concept?: string;

  atmosphere_sound?: string[];
  atmosphere_light?: string[];
  atmosphere_energy?: string[];

  // ✅ NEW: MP3 mood track (Airtable Attachment)
  music_mood?: Array<{ url: string; filename?: string }>;

  place_story?: string;

  gallery?: Array<{ url: string }>;

  lineup_text?: string;

  invite_text?: string;

  cta_primary_label?: string; // e.g. Buy Ticket / Request Access / Coming Soon / None
  cta_secondary_label?: string; // optional

  is_published?: boolean;
};

type EventFields = {
  name?: string;
  city?: string;
  date?: string;
  ticketUrl?: string;
  teaserUrl?: string;
  aftermovieUrl?: string;
  posterSrc?: Array<{ url: string }> | string;
  status?: string;
};

function envOrThrow(key: string) {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env: ${key}`);
  return v;
}

async function airtableFetch<T>(path: string) {
  const apiKey = envOrThrow("AIRTABLE_TOKEN");
  const res = await fetch(`https://api.airtable.com/v0/${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message || `Airtable error (${res.status})`);
  }
  return json as T;
}

function safeText(v?: string) {
  return (v || "").trim();
}

function tagPill(t: string) {
  return (
    <span
      key={t}
      className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] tracking-[0.18em] uppercase text-white/80"
    >
      {t}
    </span>
  );
}

export default async function EventDeepDivePage({
  params,
}: {
  params: { slug: string };
}) {
  const baseId = envOrThrow("AIRTABLE_BASE_ID");
  const deepTable = process.env.AIRTABLE_DEEPDIVE_TABLE || "EVENT_DEEPDIVE";
  const eventsTable = process.env.AIRTABLE_EVENTS_TABLE || "Events";

  const slug = (params.slug || "").trim();
  if (!slug) notFound();

  // 1) Load deep dive by slug
  const dd = await airtableFetch<{
    records: AirtableRecord<DeepDiveFields>[];
  }>(
    `${baseId}/${encodeURIComponent(deepTable)}?filterByFormula=${encodeURIComponent(
      `{slug}="${slug}"`
    )}`
  );

  const deep = dd.records?.[0];
  if (!deep?.fields) notFound();

  // published gate
  if (!deep.fields.is_published) notFound();

  // 2) Load linked event (optional but recommended)
  const eventId = deep.fields.event_ref?.[0];
  let event: AirtableRecord<EventFields> | null = null;

  if (eventId) {
    const ev = await airtableFetch<AirtableRecord<EventFields>>(
      `${baseId}/${encodeURIComponent(eventsTable)}/${eventId}`
    );
    event = ev || null;
  }

  const title =
    safeText(deep.fields.title_override) ||
    safeText(event?.fields?.name) ||
    "Led Velvet Event";

  const subtitle = safeText(deep.fields.subtitle);

  const concept = safeText(deep.fields.concept);
  const placeStory = safeText(deep.fields.place_story);
  const lineup = safeText(deep.fields.lineup_text);
  const invite = safeText(deep.fields.invite_text);

  const sound = deep.fields.atmosphere_sound || [];
  const light = deep.fields.atmosphere_light || [];
  const energy = deep.fields.atmosphere_energy || [];

  const ticketUrl = safeText(event?.fields?.ticketUrl);
  const city = safeText(event?.fields?.city);
  const date = safeText(event?.fields?.date);

  const heroType = deep.fields.hero_media_type || "image";
  const heroImgUrl = deep.fields.hero_image?.[0]?.url || "";
  const heroYouTubeUrl = safeText(deep.fields.hero_youtube_url);
  const heroMp4Url = safeText(deep.fields.hero_mp4_url);

  const gallery = deep.fields.gallery || [];

  const showAtmosphere = sound.length || light.length || energy.length;

  // ✅ NEW: mood track
  const moodTrackUrl = deep.fields.music_mood?.[0]?.url || "";
  const moodTrackName = deep.fields.music_mood?.[0]?.filename || "";

  return (
    <main className="min-h-screen bg-[#0B0B0C] text-[#EDEDED]">
      {/* Top bar */}
      <div className="sticky top-0 z-[200] border-b border-white/10 bg-black/60 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
          <Link
            href="/moment2"
            className="text-sm px-3 py-1.5 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 transition"
          >
            ← Torna agli eventi
          </Link>

          <div className="text-[11px] tracking-[0.22em] uppercase text-white/60">
            Led Velvet · Deep Dive
          </div>
        </div>
      </div>

      {/* Hero */}
      <section className="relative border-b border-white/10">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_10%,rgba(147,11,12,0.20),transparent_45%),radial-gradient(circle_at_80%_40%,rgba(255,255,255,0.08),transparent_55%)]" />

        <div className="relative mx-auto max-w-5xl px-4 py-10 md:py-14">
          <div className="grid gap-6 md:grid-cols-2 md:items-center">
            <div>
              <p className="text-xs tracking-[0.22em] uppercase text-white/60">
                {city ? `${city}${date ? " · " : ""}` : ""}
                {date || ""}
              </p>
              <h1 className="mt-3 text-4xl md:text-5xl font-semibold leading-tight">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-4 max-w-xl text-base md:text-lg text-white/80">
                  {subtitle}
                </p>
              ) : null}

              <div className="mt-6 flex flex-wrap gap-3">
                {ticketUrl ? (
                  <a
                    href={ticketUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center rounded-full border border-white/20 bg-white text-black px-5 py-2 text-xs tracking-[0.22em] uppercase hover:opacity-90"
                  >
                    Buy Ticket
                  </a>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-5 py-2 text-xs tracking-[0.22em] uppercase text-white/70">
                    Coming Soon
                  </span>
                )}

                <Link
                  href="/society"
                  className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-5 py-2 text-xs tracking-[0.22em] uppercase text-white/80 hover:bg-white/10"
                >
                  LV PEOPLE
                </Link>
              </div>
            </div>

            {/* Hero media */}
            <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
              {heroType === "youtube" && heroYouTubeUrl ? (
                <iframe
                  className="w-full aspect-video"
                  src={`https://www.youtube.com/embed/${
  			heroYouTubeUrl.includes("watch?v=")
    			? heroYouTubeUrl.split("watch?v=")[1].split("&")[0]
   			 : heroYouTubeUrl.includes("youtu.be/")
   			 ? heroYouTubeUrl.split("youtu.be/")[1].split("?")[0].split("&")[0]
    			: ""
			}`}

                  title="Hero video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : heroType === "mp4" && heroMp4Url ? (
                <video
                  className="w-full aspect-video object-cover"
                  src={heroMp4Url}
                  autoPlay
                  muted
                  loop
                  playsInline
                />
              ) : heroImgUrl ? (
                <img
                  src={heroImgUrl}
                  alt={title}
                  className="w-full aspect-video object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full aspect-video flex items-center justify-center text-white/50 text-sm">
                  Nessun hero media
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Content blocks */}
      <section className="mx-auto max-w-5xl px-4 py-10 md:py-14 grid gap-10">
        {/* Concept */}
        {concept ? (
          <article className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
            <h2 className="text-2xl font-semibold">Il Concept</h2>
            <p className="mt-4 text-white/85 leading-relaxed whitespace-pre-line">
              {concept}
            </p>
          </article>
        ) : null}

        {/* Atmosphere */}
        {showAtmosphere ? (
          <article className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
            <h2 className="text-2xl font-semibold">L’Atmosfera</h2>

            {sound.length ? (
              <div className="mt-5">
                <div className="text-xs tracking-[0.22em] uppercase text-white/60">
                  Sound
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {sound.map(tagPill)}
                </div>
              </div>
            ) : null}

            {light.length ? (
              <div className="mt-5">
                <div className="text-xs tracking-[0.22em] uppercase text-white/60">
                  Light
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {light.map(tagPill)}
                </div>
              </div>
            ) : null}

            {energy.length ? (
              <div className="mt-5">
                <div className="text-xs tracking-[0.22em] uppercase text-white/60">
                  Energy
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {energy.map(tagPill)}
                </div>
              </div>
            ) : null}
          </article>
        ) : null}

        {/* ✅ NEW: Mood Sound (MP3 player) */}
        {moodTrackUrl ? (
          <article className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
            <h2 className="text-2xl font-semibold">Mood Sound</h2>
            <p className="mt-2 text-white/70 text-sm leading-relaxed">
              Un frammento sonoro per entrare nell’atmosfera.
            </p>
            {moodTrackName ? (
              <p className="mt-2 text-xs text-white/50">{moodTrackName}</p>
            ) : null}

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
              <audio controls preload="none" className="w-full">
                <source src={moodTrackUrl} type="audio/mpeg" />
              </audio>
            </div>
          </article>
        ) : null}

        {/* Place */}
        {placeStory ? (
          <article className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
            <h2 className="text-2xl font-semibold">Il Luogo</h2>
            <p className="mt-4 text-white/85 leading-relaxed whitespace-pre-line">
              {placeStory}
            </p>
          </article>
        ) : null}

        {/* Visual Mood */}
        {gallery.length ? (
          <article className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
            <h2 className="text-2xl font-semibold">Mood Visivo</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-3">
              {gallery.slice(0, 12).map((g, idx) => (
                <div
                  key={idx}
                  className="rounded-2xl overflow-hidden border border-white/10 bg-black/30"
                >
                  <img
                    src={g.url}
                    alt={`Gallery ${idx + 1}`}
                    className="w-full h-44 object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </article>
        ) : null}

        {/* Line-up */}
        {lineup ? (
          <article className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
            <h2 className="text-2xl font-semibold">Line-up</h2>
            <p className="mt-4 text-white/85 leading-relaxed whitespace-pre-line">
              {lineup}
            </p>
          </article>
        ) : null}

        {/* Participation */}
        {(invite || ticketUrl) ? (
          <article className="rounded-2xl border border-white/10 bg-white/5 p-6 md:p-8">
            <h2 className="text-2xl font-semibold">Partecipazione</h2>
            {invite ? (
              <p className="mt-4 text-white/85 leading-relaxed whitespace-pre-line">
                {invite}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap gap-3">
              {ticketUrl ? (
                <a
                  href={ticketUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-full border border-white/20 bg-white text-black px-5 py-2 text-xs tracking-[0.22em] uppercase hover:opacity-90"
                >
                  Buy Ticket
                </a>
              ) : null}

              <Link
                href="/society"
                className="inline-flex items-center rounded-full border border-white/20 bg-white/5 px-5 py-2 text-xs tracking-[0.22em] uppercase text-white/80 hover:bg-white/10"
              >
                Entra in LV PEOPLE
              </Link>
            </div>
          </article>
        ) : null}
      </section>
    </main>
  );
}
