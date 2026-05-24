// netlify/functions/save.js
//
// Receives the full content payload from the admin CMS
// and writes every table to Supabase using the service_role key.
// No GitHub commits. No redeployment needed for content changes.
// New posts appear on the site immediately after Publish.
//
// Required env vars (Netlify → Site → Environment variables):
//   SUPABASE_URL          https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY  service_role secret (bypasses RLS — keep private)
//   ADMIN_SECRET          secret the admin panel sends in X-Admin-Secret header

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST')   return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const secret = event.headers['x-admin-secret'] || '';
  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  let payload;
  try { payload = JSON.parse(event.body); }
  catch (e) { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) }; }

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars' }) };
  }

  const content = payload.content || {};

  // ── Supabase REST helpers ─────────────────────────────────────────────────────
  const sbBase = `${SUPABASE_URL}/rest/v1`;
  const sbHdrs = {
    apikey:         SUPABASE_SERVICE_KEY,
    Authorization:  `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
  };

  // Upsert: insert or update rows matched by primary key
  async function upsert(table, rows) {
    if (!rows || !rows.length) return;
    const res = await fetch(`${sbBase}/${table}`, {
      method: 'POST',
      headers: {
        ...sbHdrs,
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Supabase upsert ${table}: ${res.status} — ${txt}`);
    }
  }

  // Delete rows whose id is NOT in the keep set
  async function deleteStale(table, keepIds) {
    let filter;
    if (!keepIds.length) {
      // No rows to keep — delete everything
      filter = `?id=neq.___nobody___`; // always-true filter that deletes all
    } else {
      // PostgREST "not in" syntax for text IDs: ?id=not.in.(val1,val2,...)
      // IDs must NOT be quoted for text columns in PostgREST
      const list = keepIds.map(id => String(id).replace(/[(),]/g, '')).join(',');
      filter = `?id=not.in.(${list})`;
    }
    const res = await fetch(`${sbBase}/${table}${filter}`, {
      method: 'DELETE',
      headers: { ...sbHdrs, Prefer: 'return=minimal' },
    });
    // 204 No Content is success; ignore 404 (nothing to delete)
    if (!res.ok && res.status !== 404) {
      throw new Error(`Supabase delete stale ${table}: ${res.status} — ${await res.text()}`);
    }
  }

  try {
    // Ensure every post has a slug
    const posts = (content.write || []).map(p => ({
      ...p,
      slug: p.slug || slugify(p.title || p.id),
    }));

    // ── 1. site_config (single row, always id = 'main') ──────────────────────
    await upsert('site_config', [{
      id:         'main',
      hero:       content.hero       || {},
      resume:     content.resume     || {},
      contact:    content.contact    || {},
      visibility: content.visibility || {},
      updated_at: new Date().toISOString(),
    }]);

    // ── 2. timeline ──────────────────────────────────────────────────────────
    const tlRows = (content.timeline || []).map((t, i) => ({
      id:         String(t.id),
      position:   i,
      company:    t.company    || '',
      role:       t.role       || '',
      subtext:    t.subtext    || '',
      website:    t.website    || '',
      start_date: t.startDate  || '',
      end_date:   t.endDate    || '',
      duration:   t.duration   || '',
      bullets:    t.bullets    || [],
      updated_at: new Date().toISOString(),
    }));
    await upsert('timeline', tlRows);
    await deleteStale('timeline', tlRows.map(r => r.id));

    // ── 3. projects ──────────────────────────────────────────────────────────
    const projRows = (content.projects || []).map((p, i) => ({
      id:          String(p.id),
      position:    i,
      title:       p.title       || '',
      description: p.description || '',
      url:         p.url         || '',
      tags:        p.tags        || [],
      updated_at:  new Date().toISOString(),
    }));
    await upsert('projects', projRows);
    await deleteStale('projects', projRows.map(r => r.id));

    // ── 4. quiz ──────────────────────────────────────────────────────────────
    const quizRows = (content.quiz || []).map((q, i) => ({
      id:        String(q.id),
      position:  i,
      title:     q.title || '',
      link:      q.link  || '',
      image:     q.image || '',
      blurb:     q.blurb || '',
      date:      q.date  || null,
      updated_at: new Date().toISOString(),
    }));
    await upsert('quiz', quizRows);
    await deleteStale('quiz', quizRows.map(r => r.id));

    // ── 5. posts ─────────────────────────────────────────────────────────────
    const postRows = posts.map(p => ({
      id:         String(p.id),
      title:      p.title    || '',
      subtitle:   p.subtitle || '',
      slug:       p.slug,
      date:       p.date     || null,
      content:    p.content  || '',
      updated_at: new Date().toISOString(),
    }));
    await upsert('posts', postRows);
    await deleteStale('posts', postRows.map(r => r.id));

    // ── 6. sections ──────────────────────────────────────────────────────────
    const sectionRows = (content.sections || []).map((s, i) => ({
      id:        s.id,
      position:  i,
      name:      s.name  || '',
      blurb:     s.blurb || '',
      updated_at: new Date().toISOString(),
    }));
    if (sectionRows.length) await upsert('sections', sectionRows);

    // ── 7. wishlist_items ────────────────────────────────────────────────────
    const wishRows = (content.wishlistItems || []).map((w, i) => ({
      id:        String(w.id || i),
      position:  i,
      title:     w.title || '',
      blurb:     w.blurb || '',
      url:       w.url   || '',
      image:     w.image || '',
      updated_at: new Date().toISOString(),
    }));
    await upsert('wishlist_items', wishRows);
    await deleteStale('wishlist_items', wishRows.map(r => r.id));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok:    true,
        saved: {
          timeline:      tlRows.length,
          projects:      projRows.length,
          quiz:          quizRows.length,
          posts:         postRows.length,
          sections:      sectionRows.length,
          wishlistItems: wishRows.length,
        },
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

function slugify(str) {
  return (str || 'untitled')
    .toLowerCase().trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'untitled';
}
