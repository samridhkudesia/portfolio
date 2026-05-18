// netlify/functions/proxy.js
//
// Server-side proxy for external RSS feeds that block browser CORS.
// Called by index.html for Goodreads and YouTube fetches.
// No auth needed — only fetches from a whitelist of allowed domains.
//
// Usage:
//   GET /.netlify/functions/proxy?url=https://www.goodreads.com/...
//   GET /.netlify/functions/proxy?url=https://www.youtube.com/feeds/...

const ALLOWED_ORIGINS = [
  'www.goodreads.com',
  'youtube.com',
  'www.youtube.com',
];

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'text/plain; charset=utf-8',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'GET')     return { statusCode: 405, headers, body: 'Method not allowed' };

  const target = event.queryStringParameters?.url || '';

  if (!target) {
    return { statusCode: 400, headers, body: 'Missing ?url= parameter' };
  }

  // Validate the target is on our allowlist
  let parsed;
  try { parsed = new URL(target); }
  catch (e) { return { statusCode: 400, headers, body: 'Invalid URL' }; }

  if (!ALLOWED_ORIGINS.includes(parsed.hostname)) {
    return { statusCode: 403, headers, body: `Domain not allowed: ${parsed.hostname}` };
  }

  try {
    const res = await fetch(target, {
      headers: {
        // Pretend to be a regular browser so Goodreads doesn't block us
        'User-Agent': 'Mozilla/5.0 (compatible; portfolio-rss-reader/1.0)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      // 10 second timeout
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers,
        body: `Upstream error: ${res.status} ${res.statusText}`,
      };
    }

    const body = await res.text();

    return {
      statusCode: 200,
      headers: {
        ...headers,
        // Don't cache in Netlify edge — always fresh
        'Cache-Control': 'no-store',
      },
      body,
    };
  } catch (err) {
    console.error('proxy.js error:', err.message);
    return {
      statusCode: 502,
      headers,
      body: `Proxy fetch failed: ${err.message}`,
    };
  }
};
