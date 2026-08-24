export type SponsorMetaOption = { id: string; label: string };

export type SponsorMeta = {
  status: SponsorMetaOption[];
  category: SponsorMetaOption[];
};

export class SponsorMetaError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "SponsorMetaError";
    this.status = status;
    this.details = details;
  }
}

export async function fetchSponsorMetaFromAirtable(): Promise<SponsorMeta> {
  const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
  const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
  const SPONSOR_TABLE_NAME =
    process.env.AIRTABLE_TABLE_SPONSOR ||
    process.env.AIRTABLE_TABLE_SPONSORS ||
    "SPONSORS";

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    throw new SponsorMetaError("Missing Airtable env vars", 500);
  }

  const response = await fetch(
    `https://api.airtable.com/v0/meta/bases/${AIRTABLE_BASE_ID}/tables`,
    {
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` },
      cache: "no-store",
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new SponsorMetaError("Airtable meta fetch failed", response.status, data);
  }

  const tables: any[] = Array.isArray(data.tables) ? data.tables : [];
  const table =
    tables.find(
      (candidate) =>
        String(candidate.name || "").toLowerCase() === SPONSOR_TABLE_NAME.toLowerCase()
    ) ||
    tables.find((candidate) => String(candidate.name || "").toLowerCase() === "sponsors") ||
    tables.find((candidate) => String(candidate.name || "").toLowerCase() === "sponsor");

  if (!table || !Array.isArray(table.fields)) {
    throw new SponsorMetaError("Sponsors table not found in Airtable meta", 404);
  }

  const extract = (fieldName: string): SponsorMetaOption[] => {
    const field = table.fields.find((candidate: any) => candidate.name === fieldName);
    const choices = field?.options?.choices || [];
    return choices.map((choice: any) => ({ id: choice.id, label: choice.name }));
  };

  return {
    status: extract("Status"),
    category: extract("Category"),
  };
}
