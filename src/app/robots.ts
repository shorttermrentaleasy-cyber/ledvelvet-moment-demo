import type { MetadataRoute } from "next";

const siteUrl = "https://www.ledvelvet.it";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin/",
        "/api/",
        "/auth/",
        "/door/",
        "/doorcheck/",
        "/gate/",
        "/login/",
        "/lvpeople/accessi/",
        "/lvpeople/login/",
        "/momentold/",
        "/verify/",
        "/xceed-test/",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
