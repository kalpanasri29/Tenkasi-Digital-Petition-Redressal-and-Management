require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
// Disable caching across responses to ensure fresh data after updates
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
});

// Health: always 200 to satisfy platform readiness; includes dbOk flag
app.get('/health', async (req, res) => {
  let dbOk = true;
  try { await pool.query('select 1'); } catch (e) { dbOk = false; }
  res.json({ ok: true, dbOk });
});

// Bootstrap tables (compatible across Postgres versions)
const createSubmissionsSql = `
create table if not exists submissions (
  id text primary key,
  type text not null check (type in ('complaint','petition')),
  name text not null,
  phone text not null,
  email text,
  department text,
  category text,
  taluk text not null,
  firka text not null,
  village text not null,
  description text not null,
  urgency text not null check (urgency in ('low','medium','high')),
  status text not null,
  photos jsonb default '[]'::jsonb,
  timestamp timestamptz not null default now(),
  last_updated timestamptz not null default now()
)`;

const createOfficialsSql = `
create table if not exists officials (
  id serial primary key,
  username text unique not null,
  password text not null
)`;

const ensureHistorySql = `
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'submissions' AND column_name = 'history'
  ) THEN
    ALTER TABLE submissions ADD COLUMN history jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;`;

const ensureResolvedAtSql = `
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'submissions' AND column_name = 'resolved_at'
  ) THEN
    ALTER TABLE submissions ADD COLUMN resolved_at timestamptz;
  END IF;
END $$;`;

async function bootstrap() {
  // run sequentially to avoid multi-statement parser issues
  await pool.query(createSubmissionsSql);
  await pool.query(createOfficialsSql);
  await pool.query(ensureHistorySql);
  await pool.query(ensureResolvedAtSql);
  // Seed official if not exists
  const r = await pool.query('select 1 from officials where username=$1', ['Tenkasi Admin']);
  if (r.rowCount === 0) {
    await pool.query('insert into officials (username, password) values ($1,$2)', ['Tenkasi Admin', 'efvhuytgbnmki493401']);
  }
}
bootstrap().catch(console.error);

// Create submission
app.post('/api/submissions', async (req, res) => {
  const s = req.body;
  const id = s.id; // id generated on client for simplicity
  try {
    await pool.query(
      `insert into submissions (id, type, name, phone, email, department, category, taluk, firka, village, description, urgency, status, photos, timestamp, last_updated)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now(),now())`,
      [id, s.type, s.name, s.phone, s.email || null, s.department || null, s.category || null, s.taluk, s.firka, s.village, s.description, s.urgency, s.status || 'pending', JSON.stringify(s.photos || [])]
    );
    // append initial history event
    await pool.query(
      `update submissions
         set history = coalesce(history, '[]'::jsonb) || jsonb_build_array(
             jsonb_build_object('timestamp', now(), 'status', $1, 'response', null)
         )
       where id = $2`,
      [s.status || 'pending', id]
    );
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// List with filters
app.get('/api/submissions', async (req, res) => {
  const { type, status, category, department, taluk, firka, village, q } = req.query;
  const clauses = [];
  const params = [];
  function add(clause, value) { params.push(value); clauses.push(clause.replace('$i', '$' + params.length)); }
  if (type) add('type = $i', type);
  if (status) add('status = $i', status);
  if (category) add('category = $i', category);
  if (department) add('department = $i', department);
  if (taluk) add('taluk = $i', taluk);
  if (firka) add('firka = $i', firka);
  if (village) add('village = $i', village);
  if (q) { params.push('%' + q.toLowerCase() + '%'); clauses.push('(lower(id) like $' + params.length + ' or lower(description) like $' + params.length + ')'); }
  const sql = `select * from submissions ${clauses.length ? 'where ' + clauses.join(' and ') : ''} order by last_updated desc, timestamp desc limit 500`;
  try {
    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Get by id and phone for citizen tracking
app.get('/api/submissions/lookup', async (req, res) => {
  const { id, phone } = req.query;
  if (!id || !phone) return res.status(400).json({ ok: false, error: 'id and phone required' });
  try {
    const sql = `select * from submissions
      where lower(id) = lower($1)
        and right(regexp_replace(phone, '\\D', '', 'g'), 10) = right(regexp_replace($2, '\\D', '', 'g'), 10)
      limit 1`;
    const r = await pool.query(sql, [id, phone]);
    res.json(r.rows[0] || null);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Get one by id
app.get('/api/submissions/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const r = await pool.query('select * from submissions where id=$1 limit 1', [id]);
    res.json(r.rows[0] || null);
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// Update status and response (officials)
app.post('/api/submissions/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, response } = req.body;
  try {
    await pool.query(
      "update submissions set status=$1, last_updated=now(), description = case when $2 is not null then description || E'\\n\\n--- Official Response ---\\n' || $2 else description end, history = coalesce(history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('timestamp', now(), 'status', $1, 'response', $2)), resolved_at = case when $1='resolved' then now() else resolved_at end where id=$3",
      [status, response || null, id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// DC/DM PIN login (stateless)
app.post('/api/auth/dcdm', (req, res) => {
  const { pin } = req.body || {};
  if (pin === 'qdguckebg461293') return res.json({ ok: true });
  return res.status(401).json({ ok: false, error: 'Invalid PIN' });
});

// Official login
app.post('/api/auth/official', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ ok: false, error: 'Missing' });
  try {
    const r = await pool.query('select * from officials where username=$1 and password=$2', [username, password]);
    if (r.rowCount) return res.json({ ok: true });
    return res.status(401).json({ ok: false, error: 'Invalid credentials' });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

const path = require('path');
app.use(express.static(path.resolve(__dirname, '../')));
app.get('/', (req, res) => res.sendFile(path.resolve(__dirname, '../index.html')));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on ${port}`));