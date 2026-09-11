import { revalidateTag } from "next/cache";

export const PUBLIC_AIRTABLE_REVALIDATE_SECONDS = 60 * 60 * 24;
export const PUBLIC_EVENTS_CACHE_TAG = "public-events";
export const PUBLIC_AIRTABLE_CONTENT_CACHE_TAG = "public-airtable-content";

export function invalidatePublicAirtableCache() {
  revalidateTag(PUBLIC_EVENTS_CACHE_TAG);
  revalidateTag(PUBLIC_AIRTABLE_CONTENT_CACHE_TAG);
}
