// netlify/functions/proxy.js
// Server-side proxy for RSS feeds (Goodreads, YouTube, Substack).
// Avoids CORS issues and third-party rate limits in the browser.

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

  const targetUrl = event.queryStringParameters?.url;
  if (!targetUrl) {
    return { statusCode: 400, headers, body: 'Missing ?url= parameter' };
  }

  // Whitelist: only allow known RSS/feed domains
  const allowed = [
    'goodreads.com',
    'youtube.com',
    'substack.com',
  ];
  let parsedUrl;
  try { parsedUrl = new URL(targetUrl); } catch(_) {
    return { statusCode: 400, headers, body: 'Invalid URL' };
  }
  const host = parsedUrl.hostname.replace(/^www\./, '');
  // Allow substack custom domains too (anything ending in .substack.com or exact matches)
  const isAllowed = allowed.some(d => host === d || host.endsWith('.' + d));
  // Also allow custom Substack domains by checking the path contains /feed
  const isFeedPath = parsedUrl.pathname.includes('/feed') || parsedUrl.pathname.includes('feeds');
  if (!isAllowed && !isFeedPath) {
    return { statusCode: 403, headers, body: 'Domain not allowed: ' + host };
  }

  try {
    const res = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PortfolioBot/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { statusCode: res.status, headers, body: `Upstream error: ${res.status}` };
    const text = await res.text();
    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'text/xml; charset=utf-8' },
      body: text,
    };
  } catch (err) {
    return { statusCode: 502, headers, body: 'Fetch failed: ' + err.message };
  }
};
