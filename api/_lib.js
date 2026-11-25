// Núcleo do agendamento: regras da barbearia, banco (Upstash Redis via REST), avisos e login do painel.
const crypto = require('crypto');

// ---------- Regras da barbearia (edite aqui) ----------
const SERVICES = { 'Corte': 45, 'Barba': 30, 'Corte + Barba': 75, 'Pigmentação': 20, 'Sobrancelha': 15, 'Corte Kids': 30 };
const BARBERS = ['Barbeiro 1', 'Barbeiro 2', 'Barbeiro 3'];
const SLOT = 30; // minutos
const OPEN = { 1: [8, 19], 2: [8, 19], 3: [8, 19], 4: [8, 19], 5: [8, 19], 6: [8, 16] }; // 0 = domingo, fechado
const TZ = 'America/Sao_Paulo';
const KEEP = 60 * 60 * 24 * 120; // guarda agendamentos por 120 dias

// ---------- Tempo no fuso de São Paulo ----------
function nowParts() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, min: (+p.hour % 24) * 60 + +p.minute };
}
const toMin = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const toHHMM = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const validDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d + 'T12:00:00Z'));
const weekday = d => new Date(d + 'T12:00:00Z').getUTCDay();

// Horários de início possíveis num dia (sem olhar ocupação)
function dayStarts(date) {
  const h = OPEN[weekday(date)];
  if (!h) return [];
  const out = [];
  for (let m = h[0] * 60; m < h[1] * 60; m += SLOT) out.push(m);
  return out;
}
const closeMin = date => (OPEN[weekday(date)] || [0, 0])[1] * 60;
const slotsFor = service => Math.ceil(SERVICES[service] / SLOT);

// Campos ocupados por um atendimento que começa em `start`
function fieldsFor(barber, start, n) {
  const f = [];
  for (let i = 0; i < n; i++) f.push(`${barber}|${toHHMM(start + i * SLOT)}`);
  return f;
}

// ---------- Banco ----------
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const MEMORY = process.env.MEMORY_STORE === '1';
const configured = () => MEMORY || !!(REDIS_URL && REDIS_TOKEN);

async function redis(cmd) {
  const r = await fetch(REDIS_URL, { method: 'POST', headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

const RESERVE_LUA = "for i=2,#ARGV do if redis.call('HEXISTS',KEYS[1],ARGV[i])==1 then return 0 end end " +
  "for i=2,#ARGV do redis.call('HSET',KEYS[1],ARGV[i],ARGV[1]) end redis.call('EXPIRE',KEYS[1]," + KEEP + ") return 1";

const mem = global.__agMem || (global.__agMem = { h: {}, s: {} });
const db = {
  async hgetall(k) {
    if (MEMORY) return { ...(mem.h[k] || {}) };
    const a = await redis(['HGETALL', k]) || [];
    const o = {}; for (let i = 0; i < a.length; i += 2) o[a[i]] = a[i + 1]; return o;
  },
  async reserve(k, value, fields) { // tudo ou nada
    if (MEMORY) { const h = mem.h[k] || (mem.h[k] = {}); if (fields.some(f => f in h)) return false; fields.forEach(f => h[f] = value); return true; }
    return (await redis(['EVAL', RESERVE_LUA, '1', k, value, ...fields])) === 1;
  },
  async hdel(k, fields) {
    if (!fields.length) return;
    if (MEMORY) { fields.forEach(f => delete (mem.h[k] || {})[f]); return; }
    await redis(['HDEL', k, ...fields]);
  },
  async set(k, v) { if (MEMORY) { mem.s[k] = v; return; } await redis(['SET', k, v, 'EX', String(KEEP)]); },
  async get(k) { if (MEMORY) return mem.s[k] ?? null; return redis(['GET', k]); },
  async mget(keys) { if (!keys.length) return []; if (MEMORY) return keys.map(k => mem.s[k] ?? null); return redis(['MGET', ...keys]); },
  async hit(k, ttl) { // contador para limitar tentativas
    if (MEMORY) { mem.s[k] = (mem.s[k] || 0) + 1; return mem.s[k]; }
    const n = await redis(['INCR', k]); if (n === 1) await redis(['EXPIRE', k, String(ttl)]); return n;
  }
};

// Horários livres. barber = nome ou 'Sem preferência'
async function freeStarts(date, service, barber) {
  const n = slotsFor(service), close = closeMin(date), now = nowParts();
  const taken = await db.hgetall(`ag:${date}`);
  const list = barber && BARBERS.includes(barber) ? [barber] : BARBERS;
  return dayStarts(date).filter(start => {
    if (date < now.date || (date === now.date && start <= now.min + 15)) return false;
    if (start + n * SLOT > close) return false;
    return list.some(b => fieldsFor(b, start, n).every(f => !(f in taken)));
  }).map(toHHMM);
}

// ---------- Aviso no WhatsApp (CallMeBot) ----------
// CALLMEBOT = "5511999999999:1234567" (vários separados por vírgula)
async function notify(text) {
  const list = (process.env.CALLMEBOT || '').split(',').map(s => s.trim()).filter(Boolean);
  await Promise.all(list.map(async pair => {
    const [phone, apikey] = pair.split(':');
    if (!phone || !apikey) return;
    const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
    try { await fetch(url, { signal: AbortSignal.timeout(7000) }); } catch (e) { console.error('callmebot', e.message); }
  }));
}

// ---------- Login do painel ----------
const SECRET = () => (process.env.ADMIN_PASSWORD || '') + '|' + (process.env.ADMIN_SECRET || 'mestre');
function sign(exp) { return crypto.createHmac('sha256', SECRET()).update(String(exp)).digest('hex'); }
const makeToken = () => { const exp = Date.now() + 1000 * 60 * 60 * 12; return `${exp}.${sign(exp)}`; };
function checkToken(req) {
  if (!process.env.ADMIN_PASSWORD) return false;
  const t = (req.headers.authorization || '').replace(/^Bearer /, '');
  const [exp, sig] = t.split('.');
  if (!exp || !sig || +exp < Date.now()) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function passwordOk(p) {
  const real = process.env.ADMIN_PASSWORD || '';
  if (!real) return false;
  const a = crypto.createHash('sha256').update(String(p || '')).digest(), b = crypto.createHash('sha256').update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

// ---------- HTTP ----------
function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return {}; }
}
const query = req => req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
const ip = req => String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '?').split(',')[0].trim();
const dateLabel = d => new Date(d + 'T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: '2-digit' });

module.exports = { SERVICES, BARBERS, SLOT, nowParts, toMin, toHHMM, validDate, dayStarts, slotsFor, fieldsFor, closeMin, configured, db, freeStarts, notify, makeToken, checkToken, passwordOk, send, readBody, query, ip, dateLabel };
