/**
 * Calculate estimated read time in minutes
 */
export function calculateReadTime(text) {
  if (!text) return null;
  const wordCount = text.trim().split(/\s+/).length;
  const wordsPerMinute = 200;
  const minutes = Math.ceil(wordCount / wordsPerMinute);
  return minutes > 0 ? minutes : null;
}

/**
 * Get favicon URL from article URL
 */
export function getFaviconUrl(articleUrl) {
  if (!articleUrl) return null;
  try {
    const url = new URL(articleUrl);
    return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`;
  } catch {
    return null;
  }
}

/**
 * Extract publication domain name from URL (e.g., "Financial Post" from financialpost.com)
 */
export function getPublicationName(articleUrl) {
  if (!articleUrl) return null;
  try {
    const url = new URL(articleUrl);
    const hostname = url.hostname.replace('www.', '');
    // Convert domain to readable name (e.g., "financialpost.com" -> "Financial Post")
    const name = hostname.split('.')[0];
    return name.charAt(0).toUpperCase() + name.slice(1).replace(/[-_]/g, ' ');
  } catch {
    return null;
  }
}