/**
 * Cover lookup: Google Books first, Open Library as fallback.
 * `definitive` is false when a source failed (e.g. 429 quota), so callers
 * don't cache a "not found" that was really an error.
 */
export async function lookupCover(q: string): Promise<{ url: string | null; definitive: boolean }> {
  const google = await googleBooksCover(q);
  if (google.url) return google;
  const ol = await openLibraryCover(q);
  if (ol.url) return ol;
  return { url: null, definitive: google.definitive && ol.definitive };
}

/** Search for a cover image URL (https) or null. */
export async function findCover(q: string): Promise<string | null> {
  return (await lookupCover(q)).url;
}

async function googleBooksCover(q: string): Promise<{ url: string | null; definitive: boolean }> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5&printType=books`,
      { next: { revalidate: 86400 } } // cache 24h
    );
    if (!res.ok) return { url: null, definitive: false };

    const data = await res.json();
    const items = data.items || [];

    // Find the first result with a thumbnail
    for (const item of items) {
      const imageLinks = item.volumeInfo?.imageLinks;
      if (imageLinks) {
        // Prefer larger images, fall back to thumbnail
        const url = imageLinks.extraLarge || imageLinks.large || imageLinks.medium || imageLinks.small || imageLinks.thumbnail;
        if (url) {
          // Google Books returns http URLs, upgrade to https and remove edge=curl for cleaner images
          const clean = url
            .replace("http://", "https://")
            .replace("&edge=curl", "")
            .replace("zoom=1", "zoom=2"); // higher res
          return { url: clean, definitive: true };
        }
      }
    }
    return { url: null, definitive: true };
  } catch {
    return { url: null, definitive: false };
  }
}

async function openLibraryCover(q: string): Promise<{ url: string | null; definitive: boolean }> {
  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=5&fields=cover_i`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return { url: null, definitive: false };
    const data = await res.json();
    const doc = (data.docs || []).find((d: { cover_i?: number }) => d.cover_i);
    return { url: doc ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null, definitive: true };
  } catch {
    return { url: null, definitive: false };
  }
}
