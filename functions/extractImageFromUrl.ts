import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { url } = await req.json();

    if (!url) {
      return Response.json({ error: 'URL is required' }, { status: 400 });
    }

    // Fetch the article page with a timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    let html;
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        return Response.json({ imageUrl: null });
      }

      html = await response.text();
    } catch (e) {
      clearTimeout(timeoutId);
      return Response.json({ imageUrl: null });
    }

    // Extract image URL - try multiple strategies
    let imageUrl = null;

    // Strategy 1: og:image meta tag (most reliable for social sharing)
    const ogMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
    if (ogMatch) {
      imageUrl = ogMatch[1];
    }

    // Strategy 2: twitter:image meta tag
    if (!imageUrl) {
      const twitterMatch = html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i);
      if (twitterMatch) {
        imageUrl = twitterMatch[1];
      }
    }

    // Strategy 3: Look for first meaningful img tag (not tiny tracking pixels)
    if (!imageUrl) {
      const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*(?:width|height)=["']([0-9]+)["'][^>]*>/gi;
      let match;
      while ((match = imgRegex.exec(html)) !== null) {
        const src = match[1];
        const size = parseInt(match[2], 10);
        // Skip tiny images (likely tracking pixels)
        if (size >= 200) {
          imageUrl = src;
          break;
        }
      }
    }

    // Strategy 4: First img tag without size constraints
    if (!imageUrl) {
      const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch) {
        const src = imgMatch[1];
        // Skip data URIs and extremely short URLs
        if (!src.startsWith('data:') && src.length > 20) {
          imageUrl = src;
        }
      }
    }

    // Normalize the image URL to be absolute
    if (imageUrl) {
      if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        // Already absolute
      } else if (imageUrl.startsWith('//')) {
        imageUrl = 'https:' + imageUrl;
      } else if (imageUrl.startsWith('/')) {
        // Relative to domain
        try {
          const urlObj = new URL(url);
          imageUrl = urlObj.origin + imageUrl;
        } catch {
          imageUrl = null;
        }
      }
    }

    return Response.json({ imageUrl });
  } catch (error) {
    return Response.json({ imageUrl: null });
  }
});