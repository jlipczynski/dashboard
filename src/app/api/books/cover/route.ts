import { NextResponse } from "next/server";

// GET /api/books/cover?q=TITLE — search Google Books for a cover image
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  if (!q) {
    return NextResponse.json({ error: "Missing q parameter" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=5&printType=books`,
      { next: { revalidate: 86400 } } // cache 24h
    );

    if (!res.ok) {
      return NextResponse.json({ cover_url: null });
    }

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
          const cleanUrl = url
            .replace("http://", "https://")
            .replace("&edge=curl", "")
            .replace("zoom=1", "zoom=2"); // higher res
          return NextResponse.json({ cover_url: cleanUrl });
        }
      }
    }

    return NextResponse.json({ cover_url: null });
  } catch {
    return NextResponse.json({ cover_url: null });
  }
}
