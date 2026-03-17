/**
 * Extract first image URL from HTML content
 */
export function extractImageFromHtml(htmlContent) {
  if (!htmlContent) return null;
  
  // Try img src
  const imgMatch = htmlContent.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) return imgMatch[1];
  
  // Try picture source srcset
  const pictureMatch = htmlContent.match(/<source[^>]+srcset=["']([^"']+)["']/i);
  if (pictureMatch) {
    const srcset = pictureMatch[1];
    const firstUrl = srcset.split(',')[0].trim().split(/\s+/)[0];
    return firstUrl;
  }
  
  return null;
}

/**
 * Get image from article (checks content, description, or both)
 */
export function getArticleImage(article) {
  if (!article) return null;
  
  // Try content first
  if (article.content) {
    const img = extractImageFromHtml(article.content);
    if (img) return img;
  }
  
  // Try description
  if (article.description) {
    const img = extractImageFromHtml(article.description);
    if (img) return img;
  }
  
  return null;
}

/**
 * Create a valid image URL with fallback for CORS/invalid URLs
 */
export function normalizeImageUrl(url) {
  if (!url) return null;
  
  try {
    // If already absolute, return as-is
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    
    // If protocol-relative, make it https
    if (url.startsWith('//')) {
      return 'https:' + url;
    }
    
    // If relative, can't resolve without base — skip
    return null;
  } catch {
    return null;
  }
}