import "server-only";

export type LinkPreview = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
};

// Extracts a single <meta> content value by property or name attribute.
function getMeta(html: string, ...attrs: string[]): string | null {
  for (const attr of attrs) {
    // property="og:title" content="…"  OR  name="description" content="…"
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${attr}["'][^>]+content=["']([^"']+)["']`,
      "i"
    );
    let m = re.exec(html);
    if (m) return decodeHTMLEntities(m[1].trim());

    // Reversed attribute order: content="…" property="og:title"
    const re2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${attr}["']`,
      "i"
    );
    m = re2.exec(html);
    if (m) return decodeHTMLEntities(m[1].trim());
  }
  return null;
}

function getTitle(html: string): string | null {
  const m = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return m ? decodeHTMLEntities(m[1].trim()) : null;
}

function decodeHTMLEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&nbsp;/g, " ");
}

function resolveUrl(base: string, path: string | null): string | null {
  if (!path) return null;
  try {
    return new URL(path, base).href;
  } catch {
    return null;
  }
}

/**
 * Fetches OG / Twitter / standard metadata for a URL server-side.
 * Returns null if the fetch fails or times out.
 */
export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Identify as a bot so sites serve server-rendered HTML
        "User-Agent": "Mozilla/5.0 (compatible; OutsyBot/1.0; +https://outsy.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;

    // Read up to 64 KB — enough for <head> on any page
    const reader = res.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    const LIMIT = 64 * 1024;
    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.byteLength;
      if (total >= LIMIT) break;
    }
    reader.cancel().catch(() => {});
    const html = new TextDecoder().decode(
      chunks.reduce((acc, c) => {
        const merged = new Uint8Array(acc.length + c.length);
        merged.set(acc);
        merged.set(c, acc.length);
        return merged;
      }, new Uint8Array(0))
    );

    const title =
      getMeta(html, "og:title", "twitter:title") ??
      getTitle(html);

    const description =
      getMeta(html, "og:description", "twitter:description", "description");

    const rawImage =
      getMeta(html, "og:image", "og:image:url", "twitter:image", "twitter:image:src");
    const imageUrl = resolveUrl(url, rawImage);

    const siteName =
      getMeta(html, "og:site_name") ??
      (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; } })();

    return {
      title: title ?? null,
      description: description ? description.slice(0, 200) : null,
      imageUrl: imageUrl ?? null,
      siteName: siteName ?? null,
    };
  } catch {
    return null;
  }
}
