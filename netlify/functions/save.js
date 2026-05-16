// netlify/functions/save.js
// Receives the full content payload from the admin CMS,
// commits it to content.json in the GitHub repo via the GitHub API.
// Netlify detects the commit and auto-redeploys the site.
//
// Required environment variables (set in Netlify dashboard):
//   GITHUB_TOKEN   — Personal Access Token with repo scope
//   GITHUB_OWNER   — GitHub username or org (e.g. "samridhkudesia")
//   GITHUB_REPO    — Repo name (e.g. "portfolio")
//   GITHUB_BRANCH  — Branch to commit to (e.g. "main")
//   ADMIN_SECRET   — A secret string the admin panel sends to authenticate

const CONTENT_PATH = 'content.json';

exports.handler = async (event) => {
  // ── CORS preflight ──────────────────────────────────────
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // ── Auth ─────────────────────────────────────────────────
  const secret = event.headers['x-admin-secret'] || '';
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  // ── Parse body ───────────────────────────────────────────
  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
  }

  const {
    GITHUB_TOKEN,
    GITHUB_OWNER,
    GITHUB_REPO,
    GITHUB_BRANCH = 'main',
  } = process.env;

  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing GitHub env vars' }) };
  }

  const apiBase = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
  const ghHeaders = {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };

  try {
    // ── 1. Get the current SHA of content.json (needed for the update API) ──
    let currentSha = null;
    const getRes = await fetch(
      `${apiBase}/contents/${CONTENT_PATH}?ref=${GITHUB_BRANCH}`,
      { headers: ghHeaders }
    );
    if (getRes.ok) {
      const getJson = await getRes.json();
      currentSha = getJson.sha;
    } else if (getRes.status !== 404) {
      const err = await getRes.text();
      throw new Error(`GitHub GET failed: ${getRes.status} ${err}`);
    }

    // ── 2. Encode new content as base64 ──────────────────────────────────────
    const newContent = JSON.stringify(payload.content, null, 2);
    const encoded = Buffer.from(newContent, 'utf8').toString('base64');

    // ── 3. Commit the updated file ───────────────────────────────────────────
    const commitBody = {
      message: `cms: update content.json [${new Date().toISOString()}]`,
      content: encoded,
      branch: GITHUB_BRANCH,
      ...(currentSha ? { sha: currentSha } : {}),
    };

    const putRes = await fetch(
      `${apiBase}/contents/${CONTENT_PATH}`,
      {
        method: 'PUT',
        headers: ghHeaders,
        body: JSON.stringify(commitBody),
      }
    );

    if (!putRes.ok) {
      const err = await putRes.text();
      throw new Error(`GitHub PUT failed: ${putRes.status} ${err}`);
    }

    const putJson = await putRes.json();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        commit: putJson.commit?.sha,
        url: putJson.commit?.html_url,
      }),
    };
  } catch (err) {
    console.error('save.js error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
