import type { MetadataRoute } from "next";

const siteUrl = "https://www.ledvelvet.it";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/about`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/society`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/become-member`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${siteUrl}/lvpeople`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${siteUrl}/legal`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/cookie-policy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/termini`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${siteUrl}/trasparenza`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
