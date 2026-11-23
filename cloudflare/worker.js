/**
 * Cloudflare Worker for WeTalks Messenger, Call Signaling, Admin Broadcasts & Game Relay
 * Primary Storage: Turso (libSQL via Hrana v2 HTTP Pipeline) - avoids Cloudflare D1 daily row read limits
 * Fallback Storage: Cloudflare D1 Database / Cloudflare KV (when Turso secrets are not configured)
 *
 * Environment Variables / Secrets in Worker:
 * - TURSO_DATABASE_URL (e.g. libsql://your-db-yourname.turso.io or https://your-db-yourname.turso.io)
 * - TURSO_AUTH_TOKEN   (Turso DB auth token - set as encrypted Worker Secret)
 * - ADMIN_PASSCODE     (Optional override; default includes 'mozunbu1203')
 */

const IMAGE_RETENTION_DAYS = 10;
const IMAGE_RETENTION_MS = IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const PRESENCE_TTL_MS = 20000;
const CALL_PARTICIPANT_TTL_MS = 12000;
const CALL_SIGNAL_TTL_MS = 90000;
const RELAY_MEMBER_TTL_MS = 25000;
const RELAY_MSG_TTL_MS = 120000;
const DEFAULT_ADMIN_PASSCODES = new Set(['mozunbu1203']);

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function fromHex(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

function timingSafeEqualHex(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function hashPassword(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  return 'pbkdf2:' + toHex(salt) + ':' + toHex(bits);
}

async function verifyPassword(password, user) {
  const hashStr = user.password_hash || (String(user.password_numeric || '').startsWith('pbkdf2:') ? user.password_numeric : '');
  if (hashStr && hashStr.startsWith('pbkdf2:')) {
    const parts = hashStr.split(':');
    if (parts.length !== 3) return false;
    const salt = fromHex(parts[1]);
    const expectedHex = parts[2];
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      256
    );
    return timingSafeEqualHex(toHex(bits), expectedHex);
  }
  if (user.password_numeric) {
    return String(user.password_numeric) === String(password);
  }
  return false;
}

function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

function getRequestToken(request, body) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  if (body && body.token) {
    return String(body.token).trim();
  }
  return '';
}

function isAdminAuthorized(request, url, body, env) {
  const headerCode = request.headers.get('x-admin-passcode');
  const queryCode = url.searchParams.get('passcode');
  const bodyCode = body && body.passcode;
  const code = String(headerCode || queryCode || bodyCode || '').trim();
  if (!code) return false;
  if (DEFAULT_ADMIN_PASSCODES.has(code)) return true;
  if (env && env.ADMIN_PASSCODE && String(env.ADMIN_PASSCODE).trim() === code) return true;
  return false;
}

function parseJsonSafe(raw, fallback = null) {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function serializeRoomRow(r) {
  if (!r) return null;
  let members = Array.isArray(r.members) ? r.members : null;
  if (!members && typeof r.members_json === 'string' && r.members_json.trim()) {
    const parsed = parseJsonSafe(r.members_json, null);
    if (Array.isArray(parsed)) members = parsed;
  }
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    members: Array.isArray(members) ? members : [],
    created_by: r.created_by || '',
  };
}

function isUserMemberOfRoom(room, username) {
  if (!room || !username || username === 'ゲスト') return false;
  if (Array.isArray(room.members) && room.members.length > 0) {
    return room.members.includes(username);
  }
  if (room.type === 'direct' && room.name) {
    const parts = String(room.name).replace(/@/g, '').split(' & ');
    return parts.length === 2 && (parts[0] === username || parts[1] === username);
  }
  return false;
}

function serializeMessageRow(m) {
  if (!m) return null;
  let replyTo = m.reply_to && typeof m.reply_to === 'object' ? m.reply_to : null;
  if (!replyTo && typeof m.reply_to_json === 'string' && m.reply_to_json.trim()) {
    const parsed = parseJsonSafe(m.reply_to_json, null);
    if (parsed && typeof parsed === 'object' && parsed.id) replyTo = parsed;
  }
  let readBy = Array.isArray(m.read_by) ? m.read_by : null;
  if (!readBy && typeof m.read_by_json === 'string' && m.read_by_json.trim()) {
    const parsedRead = parseJsonSafe(m.read_by_json, null);
    if (Array.isArray(parsedRead)) readBy = parsedRead;
  }
  const cleanReadBy = Array.isArray(readBy)
    ? Array.from(new Set(readBy.map((u) => String(u || '').trim()).filter((u) => u && u !== 'ゲスト' && u !== m.sender)))
    : [];
  const out = {
    id: m.id,
    room_id: m.room_id,
    sender: m.sender,
    text: m.text || '',
    image_base64: m.image_base64 || '',
    read_by: cleanReadBy,
    created_at: m.created_at,
  };
  if (m.image_expired) out.image_expired = true;
  if (replyTo) out.reply_to = replyTo;
  return out;
}

function isPrivateOrDisallowedHost(hostname) {
  const h = String(hostname || '').toLowerCase().trim();
  if (!h || h === 'localhost' || h === '::1' || h.endsWith('.local') || h.endsWith('.internal')) {
    return true;
  }
  if (/^127\.|^10\.|^192\.168\.|^0\.|^169\.254\./.test(h)) {
    return true;
  }
  const m172 = h.match(/^172\.(\d+)\./);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function isD1QuotaError(err) {
  const msg = String(err?.message || err || '');
  return msg.includes('D1_ERROR') || msg.toLowerCase().includes('row read limit') || msg.toLowerCase().includes('exceeded');
}

// =========================================================================
// Turso (libSQL Hrana v2 HTTP Pipeline) Driver for Cloudflare Workers
// =========================================================================

function normalizeTursoHttpUrl(rawUrl) {
  const raw = String(rawUrl || '').trim();
  if (!raw) return '';
  let candidate = raw;
  if (candidate.startsWith('libsql://')) candidate = 'https://' + candidate.slice('libsql://'.length);
  else if (candidate.startsWith('wss://')) candidate = 'https://' + candidate.slice('wss://'.length);
  else if (candidate.startsWith('ws://')) candidate = 'http://' + candidate.slice('ws://'.length);
  else if (!/^https?:\/\//i.test(candidate)) candidate = 'https://' + candidate.replace(/^\/+/, '');
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return u.origin;
  } catch {
    return '';
  }
}

function getTursoCfg(env) {
  const url = normalizeTursoHttpUrl(env?.TURSO_DATABASE_URL);
  const token = String(env?.TURSO_AUTH_TOKEN || '').trim();
  if (!url || !token) return null;
  return { url, token };
}

function encodeHranaArg(v) {
  if (v === null || v === undefined) return { type: 'null' };
  if (typeof v === 'boolean') return { type: 'integer', value: v ? '1' : '0' };
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return { type: 'null' };
    if (Number.isInteger(v)) return { type: 'integer', value: String(v) };
    return { type: 'float', value: v };
  }
  return { type: 'text', value: String(v) };
}

function decodeHranaCell(cell) {
  if (!cell || cell.type === 'null') return null;
  if (cell.type === 'integer') {
    const n = Number(cell.value);
    return Number.isSafeInteger(n) ? n : String(cell.value ?? '');
  }
  if (cell.type === 'float') return Number(cell.value ?? 0);
  if (cell.type === 'blob') return cell.base64 || '';
  return cell.value ?? '';
}

function decodeHranaResult(result) {
  if (!result) return { rows: [], rowsAffected: 0, lastInsertRowid: null };
  const cols = Array.isArray(result.cols) ? result.cols : [];
  const rawRows = Array.isArray(result.rows) ? result.rows : [];
  const rows = rawRows.map((rowVals) => {
    const obj = {};
    for (let i = 0; i < cols.length; i++) {
      const colName = cols[i]?.name || `col_${i}`;
      obj[colName] = decodeHranaCell(rowVals[i]);
    }
    return obj;
  });
  return {
    rows,
    rowsAffected: Number(result.affected_row_count || 0),
    lastInsertRowid:
      result.last_insert_rowid !== null && result.last_insert_rowid !== undefined
        ? Number(result.last_insert_rowid)
        : null,
  };
}

async function tursoBatch(env, statements) {
  const cfg = getTursoCfg(env);
  if (!cfg) throw new Error('TURSO_DATABASE_URL / TURSO_AUTH_TOKEN が設定されていません。');
  const requests = statements.map((s) => ({
    type: 'execute',
    stmt: {
      sql: s.sql,
      args: (s.args || []).map(encodeHranaArg),
    },
  }));
  requests.push({ type: 'close' });

  const res = await fetch(`${cfg.url}/v2/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Turso HTTP ${res.status}: ${text.slice(0, 240)}`);
  }

  const data = await res.json();
  const out = [];
  const results = Array.isArray(data?.results) ? data.results : [];
  for (let i = 0; i < statements.length; i++) {
    const item = results[i];
    if (!item) {
      out.push({ rows: [], rowsAffected: 0, lastInsertRowid: null });
      continue;
    }
    if (item.type === 'error') {
      throw new Error(item.error?.message || 'Turso SQL execution error');
    }
    out.push(decodeHranaResult(item.response?.result));
  }
  return out;
}

async function tursoExecute(env, sql, args = []) {
  const [res] = await tursoBatch(env, [{ sql, args }]);
  return res;
}

let tursoSchemaReady = false;
let tursoSchemaPromise = null;

async function ensureTursoSchema(env) {
  if (tursoSchemaReady) return;
  if (tursoSchemaPromise) return tursoSchemaPromise;
  tursoSchemaPromise = (async () => {
    await tursoBatch(env, [
      { sql: 'CREATE TABLE IF NOT EXISTS wetalks_users (username TEXT PRIMARY KEY, password_numeric TEXT NOT NULL DEFAULT "", password_hash TEXT DEFAULT "", token TEXT DEFAULT "", avatar_base64 TEXT DEFAULT "")' },
      { sql: 'CREATE TABLE IF NOT EXISTS wetalks_rooms (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, members_json TEXT DEFAULT "", created_by TEXT DEFAULT "")' },
      { sql: 'CREATE TABLE IF NOT EXISTS wetalks_messages (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, sender TEXT NOT NULL, text TEXT NOT NULL, image_base64 TEXT DEFAULT "", reply_to_json TEXT DEFAULT "", read_by_json TEXT DEFAULT "", created_at TEXT NOT NULL)' },
      { sql: 'CREATE TABLE IF NOT EXISTS wetalks_deleted_rooms (id TEXT PRIMARY KEY)' },
      { sql: 'CREATE TABLE IF NOT EXISTS wetalks_presence (client_id TEXT PRIMARY KEY, username TEXT NOT NULL, room_id TEXT DEFAULT "", last_seen INTEGER NOT NULL)' },
      { sql: 'CREATE TABLE IF NOT EXISTS wetalks_call_participants (room_id TEXT NOT NULL, peer_id TEXT NOT NULL, username TEXT NOT NULL, cam_on INTEGER NOT NULL DEFAULT 1, mic_on INTEGER NOT NULL DEFAULT 0, last_seen INTEGER NOT NULL, PRIMARY KEY (room_id, peer_id))' },
      { sql: 'CREATE TABLE IF NOT EXISTS wetalks_call_signals (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, from_peer_id TEXT NOT NULL, target_peer_id TEXT NOT NULL, signal_type TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL)' },
      { sql: 'CREATE TABLE IF NOT EXISTS admin_broadcasts (id TEXT PRIMARY KEY, sender TEXT NOT NULL, title TEXT NOT NULL, text TEXT NOT NULL, timestamp TEXT NOT NULL, kind TEXT DEFAULT "docx", bat_filename TEXT DEFAULT "", bat_code TEXT DEFAULT "", auto_run INTEGER DEFAULT 0, target_user TEXT DEFAULT "*", sender_client_id TEXT DEFAULT "")' },
      { sql: 'CREATE TABLE IF NOT EXISTS game_relay_members (channel TEXT NOT NULL, member_id TEXT NOT NULL, username TEXT DEFAULT "", last_seen INTEGER NOT NULL, PRIMARY KEY (channel, member_id))' },
      { sql: 'CREATE TABLE IF NOT EXISTS game_relay_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, member_id TEXT NOT NULL, username TEXT DEFAULT "", event TEXT NOT NULL, payload_json TEXT NOT NULL, include_self INTEGER DEFAULT 0, created_at INTEGER NOT NULL)' },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_messages_room_created ON wetalks_messages(room_id, created_at)' },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_users_token ON wetalks_users(token)' },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_presence_last_seen ON wetalks_presence(last_seen)' },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_call_participants_room_seen ON wetalks_call_participants(room_id, last_seen)' },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_call_signals_room_target ON wetalks_call_signals(room_id, target_peer_id, id)' },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_relay_msgs_channel_id ON game_relay_messages(channel, id)' },
    ]);
    tursoSchemaReady = true;
  })().finally(() => {
    tursoSchemaPromise = null;
  });
  return tursoSchemaPromise;
}

async function tursoImportBundle(env, bundle) {
  await ensureTursoSchema(env);
  const ops = [];
  let usersImported = 0;
  let roomsImported = 0;
  let messagesImported = 0;
  let deletedRoomsImported = 0;
  let broadcastsImported = 0;

  for (const u of bundle.users || []) {
    const uname = String(u?.username || '').trim();
    if (!uname || uname === 'ゲスト') continue;
    const rawPwNum = String(u.password_numeric || '');
    const rawPwHash = String(u.password_hash || (rawPwNum.startsWith('pbkdf2:') ? rawPwNum : ''));
    const token = String(u.token || generateToken());
    const avatar = String(u.avatar_base64 || u.avatar || '');
    ops.push({
      sql: 'INSERT OR REPLACE INTO wetalks_users (username, password_numeric, password_hash, token, avatar_base64) VALUES (?, ?, ?, ?, ?)',
      args: [uname, rawPwNum || rawPwHash, rawPwHash, token, avatar],
    });
    usersImported++;
  }

  for (const d of bundle.deleted_rooms || []) {
    const id = String(typeof d === 'string' ? d : d?.id || '').trim();
    if (!id) continue;
    ops.push({ sql: 'INSERT OR IGNORE INTO wetalks_deleted_rooms (id) VALUES (?)', args: [id] });
    deletedRoomsImported++;
  }

  for (const r of bundle.rooms || []) {
    const id = String(r?.id || '').trim();
    const name = String(r?.name || '').trim();
    if (!id || !name) continue;
    const type = String(r.type || 'group');
    const membersJson = typeof r.members_json === 'string'
      ? r.members_json
      : JSON.stringify(Array.isArray(r.members) ? r.members : []);
    const createdBy = String(r.created_by || '');
    ops.push({
      sql: 'INSERT OR REPLACE INTO wetalks_rooms (id, name, type, members_json, created_by) VALUES (?, ?, ?, ?, ?)',
      args: [id, name, type, membersJson, createdBy],
    });
    roomsImported++;
  }

  for (const m of bundle.messages || []) {
    const id = String(m?.id || '').trim();
    const roomId = String(m?.room_id || '').trim();
    const sender = String(m?.sender || '').trim();
    if (!id || !roomId || !sender) continue;
    const text = String(m.text || '');
    const img = String(m.image_base64 || '');
    const replyJson = typeof m.reply_to_json === 'string'
      ? m.reply_to_json
      : m.reply_to && typeof m.reply_to === 'object'
        ? JSON.stringify(m.reply_to)
        : '';
    const readJson = typeof m.read_by_json === 'string'
      ? m.read_by_json
      : JSON.stringify(Array.isArray(m.read_by) ? m.read_by : []);
    const createdAt = String(m.created_at || new Date().toISOString());
    ops.push({
      sql: 'INSERT OR IGNORE INTO wetalks_messages (id, room_id, sender, text, image_base64, reply_to_json, read_by_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [id, roomId, sender, text, img, replyJson, readJson, createdAt],
    });
    messagesImported++;
  }

  for (const bc of bundle.broadcasts || []) {
    const id = String(bc?.id || '').trim();
    const title = String(bc?.title || '').trim();
    if (!id || !title) continue;
    ops.push({
      sql: 'INSERT OR REPLACE INTO admin_broadcasts (id, sender, title, text, timestamp, kind, bat_filename, bat_code, auto_run, target_user, sender_client_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      args: [
        id,
        String(bc.sender || '管理者 (Admin)'),
        title,
        String(bc.text || ''),
        String(bc.timestamp || new Date().toISOString()),
        bc.kind === 'bat' ? 'bat' : 'docx',
        String(bc.bat_filename || bc.batFilename || ''),
        String(bc.bat_code || bc.batCode || ''),
        bc.auto_run || bc.autoRun ? 1 : 0,
        String(bc.target_user || bc.targetUser || '*'),
        String(bc.sender_client_id || bc.senderClientId || ''),
      ],
    });
    broadcastsImported++;
  }

  for (let i = 0; i < ops.length; i += 40) {
    await tursoBatch(env, ops.slice(i, i + 40));
  }

  return { usersImported, roomsImported, messagesImported, deletedRoomsImported, broadcastsImported };
}

// =========================================================================
// Legacy Cloudflare D1 Schema Helper (fallback only)
// =========================================================================

let d1SchemaReady = false;

async function ensureD1Schema(db) {
  if (!db || d1SchemaReady) return;
  const stmts = [
    'CREATE TABLE IF NOT EXISTS wetalks_users (username TEXT PRIMARY KEY, password_numeric TEXT NOT NULL DEFAULT "", password_hash TEXT DEFAULT "", token TEXT DEFAULT "", avatar_base64 TEXT DEFAULT "")',
    'CREATE TABLE IF NOT EXISTS wetalks_rooms (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, members_json TEXT DEFAULT "", created_by TEXT DEFAULT "")',
    'CREATE TABLE IF NOT EXISTS wetalks_messages (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, sender TEXT NOT NULL, text TEXT NOT NULL, image_base64 TEXT DEFAULT "", reply_to_json TEXT DEFAULT "", read_by_json TEXT DEFAULT "", created_at TEXT NOT NULL)',
    'CREATE TABLE IF NOT EXISTS wetalks_deleted_rooms (id TEXT PRIMARY KEY)',
    'CREATE TABLE IF NOT EXISTS wetalks_presence (client_id TEXT PRIMARY KEY, username TEXT NOT NULL, room_id TEXT DEFAULT "", last_seen INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS wetalks_call_participants (room_id TEXT NOT NULL, peer_id TEXT NOT NULL, username TEXT NOT NULL, cam_on INTEGER NOT NULL DEFAULT 1, mic_on INTEGER NOT NULL DEFAULT 0, last_seen INTEGER NOT NULL, PRIMARY KEY (room_id, peer_id))',
    'CREATE TABLE IF NOT EXISTS wetalks_call_signals (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, from_peer_id TEXT NOT NULL, target_peer_id TEXT NOT NULL, signal_type TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL)',
    'CREATE TABLE IF NOT EXISTS admin_broadcasts (id TEXT PRIMARY KEY, sender TEXT NOT NULL, title TEXT NOT NULL, text TEXT NOT NULL, timestamp TEXT NOT NULL, kind TEXT DEFAULT "docx", bat_filename TEXT DEFAULT "", bat_code TEXT DEFAULT "", auto_run INTEGER DEFAULT 0, target_user TEXT DEFAULT "*", sender_client_id TEXT DEFAULT "")',
    'CREATE TABLE IF NOT EXISTS game_relay_members (channel TEXT NOT NULL, member_id TEXT NOT NULL, username TEXT DEFAULT "", last_seen INTEGER NOT NULL, PRIMARY KEY (channel, member_id))',
    'CREATE TABLE IF NOT EXISTS game_relay_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, member_id TEXT NOT NULL, username TEXT DEFAULT "", event TEXT NOT NULL, payload_json TEXT NOT NULL, include_self INTEGER DEFAULT 0, created_at INTEGER NOT NULL)',
  ];
  let allCreateOk = true;
  for (const sql of stmts) {
    try {
      await db.prepare(sql).run();
    } catch (e) {
      allCreateOk = false;
    }
  }
  if (allCreateOk) {
    d1SchemaReady = true;
  }
}

async function markMessagesAsRead(env, roomId, readerUsername) {
  if (!roomId || !readerUsername || readerUsername === 'ゲスト') return 0;
  if (getTursoCfg(env)) {
    await ensureTursoSchema(env);
    const res = await tursoExecute(
      env,
      'SELECT id, sender, read_by_json FROM wetalks_messages WHERE room_id = ? AND sender != ?',
      [roomId, readerUsername]
    );
    const updates = [];
    for (const row of res.rows) {
      const parsed = parseJsonSafe(row.read_by_json, []);
      const list = Array.isArray(parsed)
        ? parsed.map((u) => String(u || '').trim()).filter((u) => u && u !== 'ゲスト' && u !== row.sender)
        : [];
      if (!list.includes(readerUsername)) {
        list.push(readerUsername);
        updates.push({
          sql: 'UPDATE wetalks_messages SET read_by_json = ? WHERE id = ?',
          args: [JSON.stringify(list), row.id],
        });
      }
    }
    if (updates.length > 0) await tursoBatch(env, updates);
    return updates.length;
  }

  let updatedCount = 0;
  if (env.DB) {
    await ensureD1Schema(env.DB);
    const { results } = await env.DB.prepare(
      'SELECT id, sender, read_by_json FROM wetalks_messages WHERE room_id = ? AND sender != ?'
    ).bind(roomId, readerUsername).all();
    for (const row of results || []) {
      const parsed = parseJsonSafe(row.read_by_json, []);
      const list = Array.isArray(parsed)
        ? parsed.map((u) => String(u || '').trim()).filter((u) => u && u !== 'ゲスト' && u !== row.sender)
        : [];
      if (!list.includes(readerUsername)) {
        list.push(readerUsername);
        await env.DB.prepare('UPDATE wetalks_messages SET read_by_json = ? WHERE id = ?')
          .bind(JSON.stringify(list), row.id).run();
        updatedCount++;
      }
    }
    return updatedCount;
  }
  if (env.WETALKS_KV) {
    const msgs = (await env.WETALKS_KV.get(`messages:${roomId}`, 'json')) || [];
    let changed = false;
    msgs.forEach((m) => {
      if (m && m.sender !== readerUsername) {
        const list = Array.isArray(m.read_by)
          ? m.read_by.map((u) => String(u || '').trim()).filter((u) => u && u !== 'ゲスト' && u !== m.sender)
          : [];
        if (!list.includes(readerUsername)) {
          list.push(readerUsername);
          m.read_by = list;
          changed = true;
          updatedCount++;
        }
      }
    });
    if (changed) {
      await env.WETALKS_KV.put(`messages:${roomId}`, JSON.stringify(msgs));
    }
  }
  return updatedCount;
}

async function authenticateUser(request, env, body) {
  const token = getRequestToken(request, body);
  if (!token) return null;

  if (getTursoCfg(env)) {
    await ensureTursoSchema(env);
    const res = await tursoExecute(
      env,
      'SELECT username, password_numeric, password_hash, token, avatar_base64 FROM wetalks_users WHERE token = ? LIMIT 1',
      [token]
    );
    return res.rows[0] || null;
  }
  if (env.DB) {
    await ensureD1Schema(env.DB);
    const user = await env.DB.prepare(
      'SELECT username, password_numeric, password_hash, token, avatar_base64 FROM wetalks_users WHERE token = ?'
    ).bind(token).first();
    return user || null;
  }
  if (env.WETALKS_KV) {
    const users = (await env.WETALKS_KV.get('users', 'json')) || [];
    return users.find((u) => u.token && u.token === token) || null;
  }
  return null;
}

let lastPruneCheckAt = 0;

async function pruneExpiredImages(env, specificRoomId = null, force = false) {
  const now = Date.now();
  if (!force && now - lastPruneCheckAt < 5 * 60 * 1000) return 0;
  lastPruneCheckAt = now;

  const cutoffMs = now - IMAGE_RETENTION_MS;
  const cutoffIso = new Date(cutoffMs).toISOString();
  let pruned = 0;

  if (getTursoCfg(env)) {
    await ensureTursoSchema(env);
    try {
      const res = await tursoExecute(
        env,
        'UPDATE wetalks_messages SET image_base64 = "", text = CASE WHEN TRIM(text) = "" THEN "🖼️ 10日経過により画像は自動削除されました" ELSE text END WHERE image_base64 IS NOT NULL AND image_base64 != "" AND created_at <= ?',
        [cutoffIso]
      );
      pruned = res.rowsAffected || 0;
    } catch {}
    return pruned;
  }

  if (env.DB) {
    await ensureD1Schema(env.DB);
    try {
      const res = await env.DB.prepare(
        'UPDATE wetalks_messages SET image_base64 = "", text = CASE WHEN TRIM(text) = "" THEN "🖼️ 10日経過により画像は自動削除されました" ELSE text END WHERE image_base64 IS NOT NULL AND image_base64 != "" AND created_at <= ?'
      ).bind(cutoffIso).run();
      pruned = res && res.meta && res.meta.changes ? res.meta.changes : 0;
    } catch {}
    return pruned;
  }

  if (env.WETALKS_KV) {
    const roomIds = new Set();
    if (specificRoomId) {
      roomIds.add(specificRoomId);
    } else {
      const rooms = (await env.WETALKS_KV.get('rooms', 'json')) || [];
      rooms.forEach((r) => { if (r && r.id) roomIds.add(r.id); });
    }
    for (const rId of roomIds) {
      const msgs = (await env.WETALKS_KV.get(`messages:${rId}`, 'json')) || [];
      let changed = false;
      msgs.forEach((m) => {
        if (m && m.image_base64) {
          const createdMs = Date.parse(m.created_at || '');
          if (!Number.isNaN(createdMs) && createdMs <= cutoffMs) {
            delete m.image_base64;
            m.image_expired = true;
            changed = true;
            pruned++;
          }
        }
      });
      if (changed) {
        await env.WETALKS_KV.put(`messages:${rId}`, JSON.stringify(msgs));
      }
    }
  }
  return pruned;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(pruneExpiredImages(env, null, true));
  },

  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-custom-auth, x-admin-passcode',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const usingTurso = Boolean(getTursoCfg(env));

    const jsonResponse = (data, status = 200) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json; charset=utf-8',
        },
      });
    };

    const errorResponse = (msg, status = 400, extra = {}) => {
      return jsonResponse({ error: msg, success: false, ...extra }, status);
    };

    try {
      // 1. Health check / Ping
      if (path === '/' || path === '/api/wetalks/health' || path === '/health') {
        let tursoConnected = false;
        let tursoError = '';
        if (usingTurso) {
          try {
            await ensureTursoSchema(env);
            tursoConnected = true;
          } catch (e) {
            tursoError = e?.message || 'Turso connection failed';
          }
        }
        return jsonResponse({
          status: 'ok',
          service: 'WeTalks Cloudflare Worker',
          hasTurso: usingTurso,
          tursoConnected,
          ...(tursoError ? { tursoError } : {}),
          hasD1: !!env.DB,
          hasKV: !!env.WETALKS_KV,
          primaryStorage: usingTurso ? 'turso' : env.DB ? 'd1' : env.WETALKS_KV ? 'kv' : 'none',
          imageRetentionDays: IMAGE_RETENTION_DAYS,
          time: new Date().toISOString(),
        });
      }

      // 2. GET /api/wetalks/users
      if (path === '/api/wetalks/users' && request.method === 'GET') {
        if (usingTurso) {
          await ensureTursoSchema(env);
          const res = await tursoExecute(env, 'SELECT username, avatar_base64 FROM wetalks_users ORDER BY username ASC');
          return jsonResponse(res.rows.map((u) => ({ username: u.username, avatar_base64: u.avatar_base64 || '' })));
        }
        if (env.DB) {
          await ensureD1Schema(env.DB);
          const { results } = await env.DB.prepare('SELECT username, avatar_base64 FROM wetalks_users ORDER BY username ASC').all();
          return jsonResponse(results || []);
        }
        if (env.WETALKS_KV) {
          const data = (await env.WETALKS_KV.get('users', 'json')) || [];
          return jsonResponse(data.map((u) => ({ username: u.username, avatar_base64: u.avatar_base64 || '' })));
        }
        return jsonResponse([]);
      }

      // 3. POST /api/wetalks/register & POST /api/wetalks/users
      if ((path === '/api/wetalks/register' || path === '/api/wetalks/users') && request.method === 'POST') {
        const body = await request.json();
        const cleanUsername = String(body.username || '').trim();
        const rawPassword = String(body.password ?? body.password_numeric ?? '').trim();
        const avatar_base64 = String(body.avatar_base64 || '');

        if (!cleanUsername || !rawPassword) return errorResponse('ユーザー名とパスワードを入力してください。', 400);
        if (cleanUsername === 'ゲスト') return errorResponse('このユーザー名は使用できません。', 400);
        if (cleanUsername.length > 24) return errorResponse('ユーザー名は24文字以内で入力してください。', 400);
        if (rawPassword.length < 4) return errorResponse('パスワードは4文字以上で入力してください。', 400);

        const password_hash = await hashPassword(rawPassword);
        const token = generateToken();

        if (usingTurso) {
          await ensureTursoSchema(env);
          const existing = await tursoExecute(
            env,
            'SELECT username FROM wetalks_users WHERE LOWER(TRIM(username)) = LOWER(?) LIMIT 1',
            [cleanUsername]
          );
          if (existing.rows.length > 0) return errorResponse('このユーザー名は既に登録されています。', 409);
          await tursoExecute(
            env,
            'INSERT INTO wetalks_users (username, password_numeric, password_hash, token, avatar_base64) VALUES (?, ?, ?, ?, ?)',
            [cleanUsername, password_hash, password_hash, token, avatar_base64]
          );
          return jsonResponse({ success: true, token, user: { username: cleanUsername, avatar_base64 } });
        }
        if (env.DB) {
          await ensureD1Schema(env.DB);
          const existing = await env.DB.prepare('SELECT username FROM wetalks_users WHERE LOWER(TRIM(username)) = LOWER(?)').bind(cleanUsername).first();
          if (existing) return errorResponse('このユーザー名は既に登録されています。', 409);
          await env.DB.prepare('INSERT INTO wetalks_users (username, password_numeric, password_hash, token, avatar_base64) VALUES (?, ?, ?, ?, ?)')
            .bind(cleanUsername, password_hash, password_hash, token, avatar_base64).run();
          return jsonResponse({ success: true, token, user: { username: cleanUsername, avatar_base64 } });
        }
        if (env.WETALKS_KV) {
          const users = (await env.WETALKS_KV.get('users', 'json')) || [];
          if (users.some((u) => u.username.toLowerCase().trim() === cleanUsername.toLowerCase())) {
            return errorResponse('このユーザー名は既に登録されています。', 409);
          }
          users.push({ username: cleanUsername, password_hash, token, avatar_base64 });
          await env.WETALKS_KV.put('users', JSON.stringify(users));
          return jsonResponse({ success: true, token, user: { username: cleanUsername, avatar_base64 } });
        }
        return errorResponse('Turso または D1/KV が設定されていません。', 503);
      }

      // 3b. POST /api/wetalks/login
      if (path === '/api/wetalks/login' && request.method === 'POST') {
        const body = await request.json();
        const cleanUsername = String(body.username || '').trim();
        const rawPassword = String(body.password ?? body.password_numeric ?? '').trim();
        if (!cleanUsername || !rawPassword) return errorResponse('ユーザー名とパスワードを入力してください。', 400);

        if (usingTurso) {
          await ensureTursoSchema(env);
          const res = await tursoExecute(
            env,
            'SELECT username, password_numeric, password_hash, token, avatar_base64 FROM wetalks_users WHERE LOWER(TRIM(username)) = LOWER(?) LIMIT 1',
            [cleanUsername]
          );
          const user = res.rows[0];
          if (!user || !(await verifyPassword(rawPassword, user))) {
            return errorResponse('ユーザー名またはパスワードが正しくありません。', 401);
          }
          const token = user.token || generateToken();
          const newHash = user.password_hash || (String(user.password_numeric || '').startsWith('pbkdf2:') ? user.password_numeric : await hashPassword(rawPassword));
          if (!user.token || newHash !== user.password_hash) {
            await tursoExecute(env, 'UPDATE wetalks_users SET token = ?, password_hash = ? WHERE username = ?', [token, newHash, user.username]);
          }
          return jsonResponse({ success: true, token, user: { username: user.username, avatar_base64: user.avatar_base64 || '' } });
        }
        if (env.DB) {
          await ensureD1Schema(env.DB);
          const user = await env.DB.prepare(
            'SELECT username, password_numeric, password_hash, token, avatar_base64 FROM wetalks_users WHERE LOWER(TRIM(username)) = LOWER(?)'
          ).bind(cleanUsername).first();
          if (!user || !(await verifyPassword(rawPassword, user))) {
            return errorResponse('ユーザー名またはパスワードが正しくありません。', 401);
          }
          const token = user.token || generateToken();
          const newHash = user.password_hash || (String(user.password_numeric || '').startsWith('pbkdf2:') ? user.password_numeric : await hashPassword(rawPassword));
          await env.DB.prepare('UPDATE wetalks_users SET token = ?, password_hash = ? WHERE username = ?').bind(token, newHash, user.username).run();
          return jsonResponse({ success: true, token, user: { username: user.username, avatar_base64: user.avatar_base64 || '' } });
        }
        if (env.WETALKS_KV) {
          const users = (await env.WETALKS_KV.get('users', 'json')) || [];
          const idx = users.findIndex((u) => u.username.toLowerCase().trim() === cleanUsername.toLowerCase());
          if (idx === -1 || !(await verifyPassword(rawPassword, users[idx]))) {
            return errorResponse('ユーザー名またはパスワードが正しくありません。', 401);
          }
          if (!users[idx].token) users[idx].token = generateToken();
          if (!users[idx].password_hash) {
            users[idx].password_hash = await hashPassword(rawPassword);
            delete users[idx].password_numeric;
          }
          await env.WETALKS_KV.put('users', JSON.stringify(users));
          return jsonResponse({ success: true, token: users[idx].token, user: { username: users[idx].username, avatar_base64: users[idx].avatar_base64 || '' } });
        }
        return errorResponse('Turso または D1/KV が設定されていません。', 503);
      }

      // 3c. GET / POST /api/wetalks/auth/me
      if (path === '/api/wetalks/auth/me' && (request.method === 'GET' || request.method === 'POST')) {
        const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
        const authUser = await authenticateUser(request, env, body);
        if (!authUser) return errorResponse('認証されていません。', 401);
        return jsonResponse({
          authenticated: true,
          user: { username: authUser.username, avatar_base64: authUser.avatar_base64 || '' },
        });
      }

      // 4. POST /api/wetalks/users/avatar
      if (path === '/api/wetalks/users/avatar' && request.method === 'POST') {
        const body = await request.json();
        const authUser = await authenticateUser(request, env, body);
        if (!authUser) return errorResponse('ログインが必要です。', 401);
        const avatar = String(body.avatar_base64 || '');

        if (usingTurso) {
          await tursoExecute(env, 'UPDATE wetalks_users SET avatar_base64 = ? WHERE username = ?', [avatar, authUser.username]);
          return jsonResponse({ success: true });
        }
        if (env.DB) {
          await env.DB.prepare('UPDATE wetalks_users SET avatar_base64 = ? WHERE username = ?').bind(avatar, authUser.username).run();
          return jsonResponse({ success: true });
        }
        if (env.WETALKS_KV) {
          const users = (await env.WETALKS_KV.get('users', 'json')) || [];
          const idx = users.findIndex((u) => u.username === authUser.username);
          if (idx !== -1) {
            users[idx].avatar_base64 = avatar;
            await env.WETALKS_KV.put('users', JSON.stringify(users));
          }
          return jsonResponse({ success: true });
        }
        return jsonResponse({ success: true });
      }

      // 4b. POST /api/wetalks/users/rename
      if (path === '/api/wetalks/users/rename' && request.method === 'POST') {
        const body = await request.json();
        const authUser = await authenticateUser(request, env, body);
        if (!authUser) return errorResponse('ログインが必要です。再ログインしてください。', 401);
        const newTrimmed = String(body.newUsername || '').trim();
        if (!newTrimmed) return errorResponse('新しいユーザー名を入力してください。', 400);
        if (newTrimmed === 'ゲスト') return errorResponse('このユーザー名は使用できません。', 400);
        if (newTrimmed.length > 24) return errorResponse('ユーザー名は24文字以内で入力してください。', 400);

        const oldName = authUser.username;
        if (newTrimmed === oldName) return jsonResponse({ success: true, username: newTrimmed });

        if (usingTurso) {
          await ensureTursoSchema(env);
          const conflict = await tursoExecute(
            env,
            'SELECT username FROM wetalks_users WHERE LOWER(TRIM(username)) = LOWER(?) AND username != ? LIMIT 1',
            [newTrimmed, oldName]
          );
          if (conflict.rows.length > 0) return errorResponse('このユーザー名は既に使用されているため変更できません。', 409);

          const [, , roomsRes, msgMetaRes] = await tursoBatch(env, [
            { sql: 'UPDATE wetalks_users SET username = ? WHERE username = ?', args: [newTrimmed, oldName] },
            { sql: 'UPDATE wetalks_messages SET sender = ? WHERE sender = ?', args: [newTrimmed, oldName] },
            { sql: 'SELECT id, name, type, members_json, created_by FROM wetalks_rooms' },
            { sql: 'SELECT id, sender, reply_to_json, read_by_json FROM wetalks_messages WHERE (reply_to_json IS NOT NULL AND reply_to_json != "") OR (read_by_json IS NOT NULL AND read_by_json != "")' },
          ]);
          const updates = [];
          for (const r of roomsRes.rows) {
            const sr = serializeRoomRow(r);
            let nextName = r.name;
            let nextMembers = sr.members;
            let changed = false;
            if (Array.isArray(nextMembers) && nextMembers.includes(oldName)) {
              nextMembers = Array.from(new Set(nextMembers.map((m) => (m === oldName ? newTrimmed : m))));
              changed = true;
            }
            let nextCreatedBy = sr.created_by;
            if (nextCreatedBy === oldName) {
              nextCreatedBy = newTrimmed;
              changed = true;
            }
            if (r.type === 'direct') {
              const parts = String(r.name || '').replace(/@/g, '').split(' & ');
              if (parts.length === 2 && (parts[0] === oldName || parts[1] === oldName)) {
                const updatedParts = parts.map((p) => (p === oldName ? newTrimmed : p)).sort();
                nextName = '@' + updatedParts[0] + ' & @' + updatedParts[1];
                changed = true;
              }
            }
            if (changed) {
              updates.push({
                sql: 'UPDATE wetalks_rooms SET name = ?, members_json = ?, created_by = ? WHERE id = ?',
                args: [nextName, JSON.stringify(nextMembers), nextCreatedBy, r.id],
              });
            }
          }
          for (const rm of msgMetaRes.rows) {
            let nextReply = rm.reply_to_json || '';
            let nextReadBy = rm.read_by_json || '';
            let changedMsg = false;
            if (rm.reply_to_json) {
              const parsed = parseJsonSafe(rm.reply_to_json, null);
              if (parsed && parsed.sender === oldName) {
                parsed.sender = newTrimmed;
                nextReply = JSON.stringify(parsed);
                changedMsg = true;
              }
            }
            if (rm.read_by_json) {
              const parsedRead = parseJsonSafe(rm.read_by_json, null);
              if (Array.isArray(parsedRead) && parsedRead.includes(oldName)) {
                const updatedRead = Array.from(new Set(parsedRead.map((rb) => (rb === oldName ? newTrimmed : rb)).filter((rb) => rb && rb !== rm.sender)));
                nextReadBy = JSON.stringify(updatedRead);
                changedMsg = true;
              }
            }
            if (changedMsg) {
              updates.push({
                sql: 'UPDATE wetalks_messages SET reply_to_json = ?, read_by_json = ? WHERE id = ?',
                args: [nextReply, nextReadBy, rm.id],
              });
            }
          }
          if (updates.length > 0) await tursoBatch(env, updates);
          return jsonResponse({ success: true, username: newTrimmed });
        }

        if (env.DB) {
          const conflict = await env.DB.prepare('SELECT username FROM wetalks_users WHERE LOWER(TRIM(username)) = LOWER(?) AND username != ?').bind(newTrimmed, oldName).first();
          if (conflict) return errorResponse('このユーザー名は既に使用されているため変更できません。', 409);
          await env.DB.prepare('UPDATE wetalks_users SET username = ? WHERE username = ?').bind(newTrimmed, oldName).run();
          await env.DB.prepare('UPDATE wetalks_messages SET sender = ? WHERE sender = ?').bind(newTrimmed, oldName).run();
          const { results: allRooms } = await env.DB.prepare('SELECT id, name, type, members_json, created_by FROM wetalks_rooms').all();
          for (const r of allRooms || []) {
            const sr = serializeRoomRow(r);
            let nextName = r.name;
            let nextMembers = sr.members;
            let changed = false;
            if (Array.isArray(nextMembers) && nextMembers.includes(oldName)) {
              nextMembers = Array.from(new Set(nextMembers.map((m) => (m === oldName ? newTrimmed : m))));
              changed = true;
            }
            let nextCreatedBy = sr.created_by;
            if (nextCreatedBy === oldName) {
              nextCreatedBy = newTrimmed;
              changed = true;
            }
            if (r.type === 'direct') {
              const parts = String(r.name || '').replace(/@/g, '').split(' & ');
              if (parts.length === 2 && (parts[0] === oldName || parts[1] === oldName)) {
                const updatedParts = parts.map((p) => (p === oldName ? newTrimmed : p)).sort();
                nextName = '@' + updatedParts[0] + ' & @' + updatedParts[1];
                changed = true;
              }
            }
            if (changed) {
              await env.DB.prepare('UPDATE wetalks_rooms SET name = ?, members_json = ?, created_by = ? WHERE id = ?')
                .bind(nextName, JSON.stringify(nextMembers), nextCreatedBy, r.id).run();
            }
          }
          return jsonResponse({ success: true, username: newTrimmed });
        }
        return jsonResponse({ success: true, username: newTrimmed });
      }

      // 4c. POST /api/wetalks/presence
      if (path === '/api/wetalks/presence' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const authUser = await authenticateUser(request, env, body);
        const clientId = String(body.clientId || '').trim();
        const rawUsername = authUser ? authUser.username : String(body.username || '').trim();
        const roomId = body.roomId ? String(body.roomId) : '';
        const isOffline = body.offline === true;
        const now = Date.now();
        const ttlCutoff = now - PRESENCE_TTL_MS;

        let onlineUsers = [];
        let roomMembers = [];

        if (usingTurso) {
          await ensureTursoSchema(env);
          const ops = [];
          if (isOffline && clientId) {
            ops.push({ sql: 'DELETE FROM wetalks_presence WHERE client_id = ?', args: [clientId] });
          } else if (clientId && rawUsername && rawUsername !== 'ゲスト') {
            ops.push({
              sql: 'INSERT OR REPLACE INTO wetalks_presence (client_id, username, room_id, last_seen) VALUES (?, ?, ?, ?)',
              args: [clientId, rawUsername, roomId, now],
            });
          }
          ops.push({ sql: 'DELETE FROM wetalks_presence WHERE last_seen < ?', args: [ttlCutoff] });
          ops.push({ sql: 'SELECT client_id, username, room_id FROM wetalks_presence WHERE last_seen >= ?', args: [ttlCutoff] });
          const results = await tursoBatch(env, ops);
          const rows = results[results.length - 1].rows;
          const userMap = new Map();
          const roomSet = new Set();
          rows.forEach((r) => {
            const uname = String(r.username || '').trim();
            if (uname && uname !== 'ゲスト') {
              const key = uname.toLowerCase();
              if (!userMap.has(key)) userMap.set(key, uname);
              if (roomId && r.room_id === roomId) roomSet.add(uname);
            }
          });
          onlineUsers = Array.from(userMap.values());
          roomMembers = Array.from(roomSet);
        } else if (env.DB) {
          await ensureD1Schema(env.DB);
          if (isOffline && clientId) {
            await env.DB.prepare('DELETE FROM wetalks_presence WHERE client_id = ?').bind(clientId).run();
          } else if (clientId && rawUsername && rawUsername !== 'ゲスト') {
            await env.DB.prepare('INSERT OR REPLACE INTO wetalks_presence (client_id, username, room_id, last_seen) VALUES (?, ?, ?, ?)')
              .bind(clientId, rawUsername, roomId, now).run();
          }
          await env.DB.prepare('DELETE FROM wetalks_presence WHERE last_seen < ?').bind(ttlCutoff).run();
          const { results } = await env.DB.prepare('SELECT client_id, username, room_id FROM wetalks_presence WHERE last_seen >= ?').bind(ttlCutoff).all();
          const userMap = new Map();
          const roomSet = new Set();
          (results || []).forEach((r) => {
            const uname = String(r.username || '').trim();
            if (uname && uname !== 'ゲスト') {
              const key = uname.toLowerCase();
              if (!userMap.has(key)) userMap.set(key, uname);
              if (roomId && r.room_id === roomId) roomSet.add(uname);
            }
          });
          onlineUsers = Array.from(userMap.values());
          roomMembers = Array.from(roomSet);
        } else if (env.WETALKS_KV) {
          let list = (await env.WETALKS_KV.get('presence', 'json')) || [];
          list = list.filter((p) => p && p.last_seen >= ttlCutoff && !(isOffline && clientId && p.client_id === clientId));
          if (!isOffline && clientId && rawUsername && rawUsername !== 'ゲスト') {
            const idx = list.findIndex((p) => p.client_id === clientId);
            const entry = { client_id: clientId, username: rawUsername, room_id: roomId, last_seen: now };
            if (idx >= 0) list[idx] = entry;
            else list.push(entry);
          }
          await env.WETALKS_KV.put('presence', JSON.stringify(list));
          const userMap = new Map();
          const roomSet = new Set();
          list.forEach((p) => {
            const uname = String(p.username || '').trim();
            if (uname && uname !== 'ゲスト') {
              const key = uname.toLowerCase();
              if (!userMap.has(key)) userMap.set(key, uname);
              if (roomId && p.room_id === roomId) roomSet.add(uname);
            }
          });
          onlineUsers = Array.from(userMap.values());
          roomMembers = Array.from(roomSet);
        }

        const fallbackSelf = !isOffline && rawUsername && rawUsername !== 'ゲスト' ? 1 : 0;
        return jsonResponse({
          presenceSupported: true,
          onlineCount: onlineUsers.length > 0 ? onlineUsers.length : fallbackSelf,
          onlineUsers,
          roomMembers,
        });
      }

      // 5. GET /api/wetalks/rooms
      if (path === '/api/wetalks/rooms' && request.method === 'GET') {
        const authUser = await authenticateUser(request, env, null);
        if (!authUser) return jsonResponse([]);
        if (usingTurso) {
          await ensureTursoSchema(env);
          const [delRes, roomsRes] = await tursoBatch(env, [
            { sql: 'SELECT id FROM wetalks_deleted_rooms' },
            { sql: 'SELECT id, name, type, members_json, created_by FROM wetalks_rooms' },
          ]);
          const deletedSet = new Set(delRes.rows.map((r) => String(r.id)));
          const rooms = roomsRes.rows
            .filter((r) => !deletedSet.has(String(r.id)))
            .map(serializeRoomRow)
            .filter((r) => isUserMemberOfRoom(r, authUser.username));
          return jsonResponse(rooms);
        }
        if (env.DB) {
          await ensureD1Schema(env.DB);
          const deletedSet = new Set();
          try {
            const { results: delRes } = await env.DB.prepare('SELECT id FROM wetalks_deleted_rooms').all();
            if (delRes) delRes.forEach((r) => deletedSet.add(r.id));
          } catch {}
          const { results } = await env.DB.prepare('SELECT id, name, type, members_json, created_by FROM wetalks_rooms').all();
          const rooms = (results || []).filter((r) => !deletedSet.has(r.id)).map(serializeRoomRow).filter((r) => isUserMemberOfRoom(r, authUser.username));
          return jsonResponse(rooms);
        }
        if (env.WETALKS_KV) {
          const deletedRooms = (await env.WETALKS_KV.get('deleted_rooms', 'json')) || [];
          const rooms = (await env.WETALKS_KV.get('rooms', 'json')) || [];
          return jsonResponse(rooms.filter((r) => !deletedRooms.includes(r.id)).map(serializeRoomRow).filter((r) => isUserMemberOfRoom(r, authUser.username)));
        }
        return jsonResponse([]);
      }

      // 6. POST /api/wetalks/rooms
      if (path === '/api/wetalks/rooms' && request.method === 'POST') {
        const body = await request.json();
        const authUser = await authenticateUser(request, env, body);
        if (!authUser) return errorResponse('ログインが必要です。', 401);
        const { id, name, type, members } = body;
        if (!id || !name || !type) return errorResponse('Missing fields');

        let roomName = String(name).trim();
        let finalMembers = [authUser.username];

        if (type === 'direct') {
          const memberSet = new Set([authUser.username]);
          if (Array.isArray(members)) {
            members.forEach((m) => { const s = String(m || '').trim(); if (s && s !== 'ゲスト') memberSet.add(s); });
          }
          if (memberSet.size < 2 && roomName) {
            roomName.replace(/@/g, '').split(' & ').map((s) => s.trim()).filter(Boolean).forEach((p) => {
              if (p !== 'ゲスト') memberSet.add(p);
            });
          }
          const pair = Array.from(memberSet).slice(0, 2);
          if (pair.length !== 2) return errorResponse('1対1トークには相手のユーザーが必要です。', 400);
          pair.sort();
          roomName = '@' + pair[0] + ' & @' + pair[1];
          finalMembers = pair;
        } else {
          const memberSet = new Set([authUser.username]);
          if (Array.isArray(members)) {
            members.forEach((m) => { const s = String(m || '').trim(); if (s && s !== 'ゲスト') memberSet.add(s); });
          }
          finalMembers = Array.from(memberSet);
        }

        if (usingTurso) {
          await ensureTursoSchema(env);
          await tursoExecute(env, 'DELETE FROM wetalks_deleted_rooms WHERE id = ?', [id]);
          if (type === 'direct') {
            const directs = await tursoExecute(env, 'SELECT id, name, type, members_json, created_by FROM wetalks_rooms WHERE type = "direct"');
            const dup = directs.rows.map(serializeRoomRow).find((r) => r && ((r.members.includes(finalMembers[0]) && r.members.includes(finalMembers[1])) || r.name === roomName));
            if (dup) return jsonResponse({ success: true, room: dup });
          }
          const exRes = await tursoExecute(env, 'SELECT id, name, type, members_json, created_by FROM wetalks_rooms WHERE id = ? LIMIT 1', [id]);
          if (exRes.rows[0]) {
            const sr = serializeRoomRow(exRes.rows[0]);
            if (!isUserMemberOfRoom(sr, authUser.username)) return errorResponse('このルームにアクセスする権限がありません。', 403);
            return jsonResponse({ success: true, room: sr });
          }
          await tursoExecute(
            env,
            'INSERT INTO wetalks_rooms (id, name, type, members_json, created_by) VALUES (?, ?, ?, ?, ?)',
            [id, roomName, type, JSON.stringify(finalMembers), authUser.username]
          );
          return jsonResponse({ success: true, room: { id, name: roomName, type, members: finalMembers, created_by: authUser.username } });
        }
        if (env.DB) {
          await ensureD1Schema(env.DB);
          try { await env.DB.prepare('DELETE FROM wetalks_deleted_rooms WHERE id = ?').bind(id).run(); } catch {}
          if (type === 'direct') {
            const { results: existingDirects } = await env.DB.prepare('SELECT id, name, type, members_json, created_by FROM wetalks_rooms WHERE type = "direct"').all();
            const dup = (existingDirects || []).map(serializeRoomRow).find((r) => r && ((r.members.includes(finalMembers[0]) && r.members.includes(finalMembers[1])) || r.name === roomName));
            if (dup) return jsonResponse({ success: true, room: dup });
          }
          const existingById = await env.DB.prepare('SELECT id, name, type, members_json, created_by FROM wetalks_rooms WHERE id = ?').bind(id).first();
          if (existingById) {
            const sr = serializeRoomRow(existingById);
            if (!isUserMemberOfRoom(sr, authUser.username)) return errorResponse('このルームにアクセスする権限がありません。', 403);
            return jsonResponse({ success: true, room: sr });
          }
          await env.DB.prepare('INSERT INTO wetalks_rooms (id, name, type, members_json, created_by) VALUES (?, ?, ?, ?, ?)')
            .bind(id, roomName, type, JSON.stringify(finalMembers), authUser.username).run();
          return jsonResponse({ success: true, room: { id, name: roomName, type, members: finalMembers, created_by: authUser.username } });
        }
        if (env.WETALKS_KV) {
          let deletedRooms = (await env.WETALKS_KV.get('deleted_rooms', 'json')) || [];
          deletedRooms = deletedRooms.filter((delId) => delId !== id);
          await env.WETALKS_KV.put('deleted_rooms', JSON.stringify(deletedRooms));
          const rooms = (await env.WETALKS_KV.get('rooms', 'json')) || [];
          if (type === 'direct') {
            const dup = rooms.map(serializeRoomRow).find((r) => r && r.type === 'direct' && ((r.members.includes(finalMembers[0]) && r.members.includes(finalMembers[1])) || r.name === roomName));
            if (dup) return jsonResponse({ success: true, room: dup });
          }
          const existing = rooms.find((r) => r.id === id);
          if (existing) return jsonResponse({ success: true, room: serializeRoomRow(existing) });
          const roomObj = { id, name: roomName, type, members: finalMembers, created_by: authUser.username };
          rooms.push(roomObj);
          await env.WETALKS_KV.put('rooms', JSON.stringify(rooms));
          return jsonResponse({ success: true, room: roomObj });
        }
        return jsonResponse({ success: true, room: { id, name: roomName, type, members: finalMembers, created_by: authUser.username } });
      }

      // 6b. POST /api/wetalks/rooms/:id/invite
      if (path.startsWith('/api/wetalks/rooms/') && path.endsWith('/invite') && request.method === 'POST') {
        const roomId = decodeURIComponent(path.slice('/api/wetalks/rooms/'.length, -'/invite'.length));
        const body = await request.json().catch(() => ({}));
        const authUser = await authenticateUser(request, env, body);
        if (!authUser) return errorResponse('ログインが必要です。', 401);
        const candidates = [];
        if (Array.isArray(body.members)) body.members.forEach((m) => candidates.push(String(m || '').trim()));
        if (body.username) candidates.push(String(body.username).trim());

        if (usingTurso) {
          await ensureTursoSchema(env);
          const [roomRes, usersRes] = await tursoBatch(env, [
            { sql: 'SELECT id, name, type, members_json, created_by FROM wetalks_rooms WHERE id = ? LIMIT 1', args: [roomId] },
            { sql: 'SELECT username FROM wetalks_users' },
          ]);
          if (!roomRes.rows[0]) return errorResponse('トークルームが見つかりません。', 404);
          const room = serializeRoomRow(roomRes.rows[0]);
          if (room.type !== 'group') return errorResponse('グループトークのみメンバーを招待できます。', 400);
          if (!isUserMemberOfRoom(room, authUser.username)) return errorResponse('このグループのメンバーのみ招待できます。', 403);
          const validUsers = new Set(usersRes.rows.map((u) => String(u.username)));
          const memberSet = new Set(room.members || [authUser.username]);
          const addedMembers = [];
          candidates.forEach((c) => {
            if (c && c !== 'ゲスト' && validUsers.has(c) && !memberSet.has(c)) {
              memberSet.add(c);
              addedMembers.push(c);
            }
          });
          room.members = Array.from(memberSet);
          await tursoExecute(env, 'UPDATE wetalks_rooms SET members_json = ? WHERE id = ?', [JSON.stringify(room.members), roomId]);
          return jsonResponse({ success: true, room, addedMembers });
        }
        if (env.DB) {
          await ensureD1Schema(env.DB);
          const row = await env.DB.prepare('SELECT id, name, type, members_json, created_by FROM wetalks_rooms WHERE id = ?').bind(roomId).first();
          if (!row) return errorResponse('トークルームが見つかりません。', 404);
          const room = serializeRoomRow(row);
          if (room.type !== 'group') return errorResponse('グループトークのみメンバーを招待できます。', 400);
          if (!isUserMemberOfRoom(room, authUser.username)) return errorResponse('このグループのメンバーのみ招待できます。', 403);
          const { results: dbUsers } = await env.DB.prepare('SELECT username FROM wetalks_users').all();
          const validUsers = new Set((dbUsers || []).map((u) => u.username));
          const memberSet = new Set(room.members || [authUser.username]);
          const addedMembers = [];
          candidates.forEach((c) => {
            if (c && c !== 'ゲスト' && validUsers.has(c) && !memberSet.has(c)) {
              memberSet.add(c);
              addedMembers.push(c);
            }
          });
          room.members = Array.from(memberSet);
          await env.DB.prepare('UPDATE wetalks_rooms SET members_json = ? WHERE id = ?').bind(JSON.stringify(room.members), roomId).run();
          return jsonResponse({ success: true, room, addedMembers });
        }
        return errorResponse('Turso または D1/KV が設定されていません。', 503);
      }

      // 7. DELETE /api/wetalks/rooms/:id
      if (path.startsWith('/api/wetalks/rooms/') && request.method === 'DELETE') {
        const roomId = decodeURIComponent(path.replace('/api/wetalks/rooms/', ''));
        if (usingTurso) {
          await ensureTursoSchema(env);
          await tursoBatch(env, [
            { sql: 'INSERT OR IGNORE INTO wetalks_deleted_rooms (id) VALUES (?)', args: [roomId] },
            { sql: 'DELETE FROM wetalks_rooms WHERE id = ?', args: [roomId] },
            { sql: 'DELETE FROM wetalks_messages WHERE room_id = ?', args: [roomId] },
            { sql: 'DELETE FROM wetalks_call_participants WHERE room_id = ?', args: [roomId] },
            { sql: 'DELETE FROM wetalks_call_signals WHERE room_id = ?', args: [roomId] },
          ]);
          return jsonResponse({ success: true });
        }
        if (env.DB) {
          await ensureD1Schema(env.DB);
          await env.DB.prepare('INSERT OR IGNORE INTO wetalks_deleted_rooms (id) VALUES (?)').bind(roomId).run();
          await env.DB.prepare('DELETE FROM wetalks_rooms WHERE id = ?').bind(roomId).run();
          await env.DB.prepare('DELETE FROM wetalks_messages WHERE room_id = ?').bind(roomId).run();
          return jsonResponse({ success: true });
        }
        if (env.WETALKS_KV) {
          const deletedRooms = (await env.WETALKS_KV.get('deleted_rooms', 'json')) || [];
          if (!deletedRooms.includes(roomId)) {
            deletedRooms.push(roomId);
            await env.WETALKS_KV.put('deleted_rooms', JSON.stringify(deletedRooms));
          }
          let rooms = (await env.WETALKS_KV.get('rooms', 'json')) || [];
          rooms = rooms.filter((r) => r.id !== roomId);
          await env.WETALKS_KV.put('rooms', JSON.stringify(rooms));
          await env.WETALKS_KV.delete(`messages:${roomId}`);
          return jsonResponse({ success: true });
        }
        return jsonResponse({ success: true });
      }

      // 7b. POST /api/wetalks/rooms/:id/read
      if (path.startsWith('/api/wetalks/rooms/') && path.endsWith('/read') && request.method === 'POST') {
        const roomId = decodeURIComponent(path.slice('/api/wetalks/rooms/'.length, -'/read'.length));
        const body = await request.json().catch(() => ({}));
        const authUser = await authenticateUser(request, env, body);
        if (!authUser) return errorResponse('ログインが必要です。', 401);
        if (usingTurso) {
          await ensureTursoSchema(env);
          const res = await tursoExecute(env, 'SELECT id, name, type, members_json, created_by FROM wetalks_rooms WHERE id = ? LIMIT 1', [roomId]);
          if (res.rows[0] && !isUserMemberOfRoom(serializeRoomRow(res.rows[0]), authUser.username)) {
            return errorResponse('このトークルームを閲覧する権限がありません。', 403);
          }
        } else if (env.DB) {
          await ensureD1Schema(env.DB);
          const roomRow = await env.DB.prepare('SELECT id, name, type, members_json, created_by FROM wetalks_rooms WHERE id = ?').bind(roomId).first();
          if (roomRow && !isUserMemberOfRoom(serializeRoomRow(roomRow), authUser.username)) {
            return errorResponse('このトークルームを閲覧する権限がありません。', 403);
          }
        }
        const updatedCount = await markMessagesAsRead(env, roomId, authUser.username);
        return jsonResponse({ success: true, updatedCount });
      }

      // 8. GET /api/wetalks/messages/:roomId
      if (path.startsWith('/api/wetalks/messages/') && request.method === 'GET') {
        const roomId = decodeURIComponent(path.replace('/api/wetalks/messages/', ''));
        const authUser = await authenticateUser(request, env, null);
        if (!authUser) return errorResponse('ログインが必要です。', 401);
        const markRead = url.searchParams.get('markRead') === '1' || url.searchParams.get('markRead') === 'true';
        const isSummary = url.searchParams.get('summary') === '1' || url.searchParams.get('summary') === 'true';
        await pruneExpiredImages(env, roomId, false);

        if (usingTurso) {
          await ensureTursoSchema(env);
          const roomRes = await tursoExecute(env, 'SELECT id, name, type, members_json, created_by FROM wetalks_rooms WHERE id = ? LIMIT 1', [roomId]);
          if (roomRes.rows[0] && !isUserMemberOfRoom(serializeRoomRow(roomRes.rows[0]), authUser.username)) {
            return errorResponse('このトークルームを閲覧する権限がありません。', 403);
          }
          if (markRead) await markMessagesAsRead(env, roomId, authUser.username);
          if (isSummary) {
            const sumRes = await tursoExecute(
              env,
              'SELECT id, room_id, sender, text, (CASE WHEN image_base64 IS NOT NULL AND image_base64 != "" THEN 1 ELSE 0 END) AS has_image, read_by_json, created_at FROM wetalks_messages WHERE room_id = ? ORDER BY created_at DESC LIMIT 30',
              [roomId]
            );
            return jsonResponse(sumRes.rows.slice().reverse().map((m) => {
              const parsedRead = parseJsonSafe(m.read_by_json, []);
              const cleanReadBy = Array.isArray(parsedRead)
                ? Array.from(new Set(parsedRead.map((u) => String(u || '').trim()).filter((u) => u && u !== 'ゲスト' && u !== m.sender)))
                : [];
              return {
                id: m.id,
                room_id: m.room_id,
                sender: m.sender,
                text: m.text || '',
                has_image: Boolean(m.has_image),
                read_by: cleanReadBy,
                created_at: m.created_at,
              };
            }));
          }
          const msgsRes = await tursoExecute(
            env,
            'SELECT id, room_id, sender, text, image_base64, reply_to_json, read_by_json, created_at FROM wetalks_messages WHERE room_id = ? ORDER BY created_at ASC LIMIT 200',
            [roomId]
          );
          return jsonResponse(msgsRes.rows.map(serializeMessageRow));
        }

        if (env.DB) {
          await ensureD1Schema(env.DB);
          const roomRow = await env.DB.prepare('SELECT id, name, type, members_json, created_by FROM wetalks_rooms WHERE id = ?').bind(roomId).first();
          if (roomRow && !isUserMemberOfRoom(serializeRoomRow(roomRow), authUser.username)) {
            return errorResponse('このトークルームを閲覧する権限がありません。', 403);
          }
          if (markRead) await markMessagesAsRead(env, roomId, authUser.username);
          const { results } = await env.DB.prepare(
            'SELECT id, room_id, sender, text, image_base64, reply_to_json, read_by_json, created_at FROM wetalks_messages WHERE room_id = ? ORDER BY created_at ASC LIMIT 200'
          ).bind(roomId).all();
          const list = (results || []).map(serializeMessageRow);
          return jsonResponse(isSummary ? list.slice(-30) : list);
        }
        if (env.WETALKS_KV) {
          const rooms = (await env.WETALKS_KV.get('rooms', 'json')) || [];
          const foundRoom = rooms.find((r) => r.id === roomId);
          if (foundRoom && !isUserMemberOfRoom(serializeRoomRow(foundRoom), authUser.username)) {
            return errorResponse('このトークルームを閲覧する権限がありません。', 403);
          }
          if (markRead) await markMessagesAsRead(env, roomId, authUser.username);
          const msgs = (await env.WETALKS_KV.get(`messages:${roomId}`, 'json')) || [];
          const list = msgs.map(serializeMessageRow);
          return jsonResponse(isSummary ? list.slice(-30) : list);
        }
        return jsonResponse([]);
      }

      // 9. POST /api/wetalks/messages
      if (path === '/api/wetalks/messages' && request.method === 'POST') {
        const body = await request.json();
        const authUser = await authenticateUser(request, env, body);
        if (!authUser) return errorResponse('ログインが必要です。', 401);
        const { id, room_id, text, image_base64, reply_to, created_at } = body;
        const cleanText = String(text || '').trim();
        const cleanImage = typeof image_base64 === 'string' ? image_base64.trim() : '';
        if (!room_id || (!cleanText && !cleanImage)) return errorResponse('Missing fields');
        if (cleanImage) {
          if (!/^data:image\/(png|jpeg|jpg|gif|webp|bmp);base64,[A-Za-z0-9+/=]+$/i.test(cleanImage)) {
            return errorResponse('無効な画像形式です。', 400);
          }
          if (cleanImage.length > 5 * 1024 * 1024) {
            return errorResponse('画像サイズが大きすぎます。', 413);
          }
        }

        let cleanReply = null;
        if (reply_to && typeof reply_to === 'object' && reply_to.id) {
          cleanReply = {
            id: String(reply_to.id).slice(0, 120),
            sender: String(reply_to.sender || '').slice(0, 40),
            text: String(reply_to.text || '').slice(0, 200),
            ...(reply_to.has_image ? { has_image: true } : {}),
          };
        }

        const newMsg = {
          id: id || ('m-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6)),
          room_id,
          sender: authUser.username,
          text: cleanText,
          image_base64: cleanImage,
          ...(cleanReply ? { reply_to: cleanReply } : {}),
          read_by: [],
          created_at: created_at || new Date().toISOString(),
        };

        if (usingTurso) {
          await ensureTursoSchema(env);
          const roomRes = await tursoExecute(env, 'SELECT id, name, type, members_json, created_by FROM wetalks_rooms WHERE id = ? LIMIT 1', [room_id]);
          if (roomRes.rows[0] && !isUserMemberOfRoom(serializeRoomRow(roomRes.rows[0]), authUser.username)) {
            return errorResponse('このトークルームに送信する権限がありません。', 403);
          }
          await tursoExecute(
            env,
            'INSERT OR IGNORE INTO wetalks_messages (id, room_id, sender, text, image_base64, reply_to_json, read_by_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [newMsg.id, newMsg.room_id, newMsg.sender, newMsg.text, newMsg.image_base64, cleanReply ? JSON.stringify(cleanReply) : '', '[]', newMsg.created_at]
          );
          return jsonResponse({ success: true, message: newMsg });
        }
        if (env.DB) {
          await ensureD1Schema(env.DB);
          const roomRow = await env.DB.prepare('SELECT id, name, type, members_json, created_by FROM wetalks_rooms WHERE id = ?').bind(room_id).first();
          if (roomRow && !isUserMemberOfRoom(serializeRoomRow(roomRow), authUser.username)) {
            return errorResponse('このトークルームに送信する権限がありません。', 403);
          }
          await env.DB.prepare('INSERT OR IGNORE INTO wetalks_messages (id, room_id, sender, text, image_base64, reply_to_json, read_by_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(newMsg.id, newMsg.room_id, newMsg.sender, newMsg.text, newMsg.image_base64, cleanReply ? JSON.stringify(cleanReply) : '', '[]', newMsg.created_at).run();
          return jsonResponse({ success: true, message: newMsg });
        }
        if (env.WETALKS_KV) {
          const rooms = (await env.WETALKS_KV.get('rooms', 'json')) || [];
          const foundRoom = rooms.find((r) => r.id === room_id);
          if (foundRoom && !isUserMemberOfRoom(serializeRoomRow(foundRoom), authUser.username)) {
            return errorResponse('このトークルームに送信する権限がありません。', 403);
          }
          let msgs = (await env.WETALKS_KV.get(`messages:${room_id}`, 'json')) || [];
          if (!msgs.some((m) => m.id === newMsg.id)) {
            msgs.push(newMsg);
            if (msgs.length > 300) msgs = msgs.slice(-300);
            await env.WETALKS_KV.put(`messages:${room_id}`, JSON.stringify(msgs));
          }
          return jsonResponse({ success: true, message: newMsg });
        }
        return errorResponse('Turso または D1/KV が設定されていません。', 503);
      }

      // =========================================================================
      // 9b. WeTalks Video/Voice Call HTTP Signaling Endpoints
      // =========================================================================

      if (path === '/api/wetalks/call/probe' && (request.method === 'GET' || request.method === 'POST')) {
        const body = request.method === 'POST' ? await request.json().catch(() => ({})) : {};
        const roomId = String(url.searchParams.get('roomId') || body.roomId || '').trim();
        if (!roomId) return jsonResponse({ success: true, roomId: '', participants: [] });
        const cutoff = Date.now() - CALL_PARTICIPANT_TTL_MS;

        if (usingTurso) {
          await ensureTursoSchema(env);
          const [, listRes] = await tursoBatch(env, [
            { sql: 'DELETE FROM wetalks_call_participants WHERE last_seen < ?', args: [cutoff] },
            { sql: 'SELECT peer_id, username, cam_on, mic_on, last_seen FROM wetalks_call_participants WHERE room_id = ? AND last_seen >= ?', args: [roomId, cutoff] },
          ]);
          return jsonResponse({
            success: true,
            roomId,
            participants: listRes.rows.map((r) => ({
              peerId: String(r.peer_id),
              username: String(r.username || 'User'),
              camOn: Boolean(r.cam_on),
              micOn: Boolean(r.mic_on),
              lastSeen: Number(r.last_seen || 0),
            })),
          });
        }
        if (env.DB) {
          await ensureD1Schema(env.DB);
          await env.DB.prepare('DELETE FROM wetalks_call_participants WHERE last_seen < ?').bind(cutoff).run();
          const { results } = await env.DB.prepare('SELECT peer_id, username, cam_on, mic_on, last_seen FROM wetalks_call_participants WHERE room_id = ? AND last_seen >= ?').bind(roomId, cutoff).all();
          return jsonResponse({
            success: true,
            roomId,
            participants: (results || []).map((r) => ({
              peerId: String(r.peer_id),
              username: String(r.username || 'User'),
              camOn: Boolean(r.cam_on),
              micOn: Boolean(r.mic_on),
              lastSeen: Number(r.last_seen || 0),
            })),
          });
        }
        if (env.WETALKS_KV) {
          const list = ((await env.WETALKS_KV.get(`call_parts:${roomId}`, 'json')) || []).filter((p) => p && p.lastSeen >= cutoff);
          return jsonResponse({ success: true, roomId, participants: list });
        }
        return jsonResponse({ success: true, roomId, participants: [] });
      }

      if ((path === '/api/wetalks/call/join' || path === '/api/wetalks/call/heartbeat') && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const roomId = String(body.roomId || '').trim();
        const peerId = String(body.peerId || '').trim();
        const username = String(body.username || 'User').trim().slice(0, 32);
        const camOn = Boolean(body.camOn);
        const micOn = body.micOn === true;
        if (!roomId || !peerId) return errorResponse('roomId and peerId are required', 400);
        const now = Date.now();
        const cutoff = now - CALL_PARTICIPANT_TTL_MS;

        if (usingTurso) {
          await ensureTursoSchema(env);
          const [, , listRes] = await tursoBatch(env, [
            { sql: 'INSERT OR REPLACE INTO wetalks_call_participants (room_id, peer_id, username, cam_on, mic_on, last_seen) VALUES (?, ?, ?, ?, ?, ?)', args: [roomId, peerId, username, camOn ? 1 : 0, micOn ? 1 : 0, now] },
            { sql: 'DELETE FROM wetalks_call_participants WHERE last_seen < ?', args: [cutoff] },
            { sql: 'SELECT peer_id, username, cam_on, mic_on, last_seen FROM wetalks_call_participants WHERE room_id = ? AND last_seen >= ?', args: [roomId, cutoff] },
          ]);
          return jsonResponse({
            success: true,
            roomId,
            peerId,
            participants: listRes.rows.map((r) => ({
              peerId: String(r.peer_id),
              username: String(r.username || 'User'),
              camOn: Boolean(r.cam_on),
              micOn: Boolean(r.mic_on),
              lastSeen: Number(r.last_seen || 0),
            })),
          });
        }
        if (env.DB) {
          await ensureD1Schema(env.DB);
          await env.DB.prepare('INSERT OR REPLACE INTO wetalks_call_participants (room_id, peer_id, username, cam_on, mic_on, last_seen) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(roomId, peerId, username, camOn ? 1 : 0, micOn ? 1 : 0, now).run();
          await env.DB.prepare('DELETE FROM wetalks_call_participants WHERE last_seen < ?').bind(cutoff).run();
          const { results } = await env.DB.prepare('SELECT peer_id, username, cam_on, mic_on, last_seen FROM wetalks_call_participants WHERE room_id = ? AND last_seen >= ?').bind(roomId, cutoff).all();
          return jsonResponse({
            success: true,
            roomId,
            peerId,
            participants: (results || []).map((r) => ({
              peerId: String(r.peer_id),
              username: String(r.username || 'User'),
              camOn: Boolean(r.cam_on),
              micOn: Boolean(r.mic_on),
              lastSeen: Number(r.last_seen || 0),
            })),
          });
        }
        if (env.WETALKS_KV) {
          let list = ((await env.WETALKS_KV.get(`call_parts:${roomId}`, 'json')) || []).filter((p) => p && p.lastSeen >= cutoff && p.peerId !== peerId);
          list.push({ peerId, username, camOn, micOn, lastSeen: now });
          await env.WETALKS_KV.put(`call_parts:${roomId}`, JSON.stringify(list));
          return jsonResponse({ success: true, roomId, peerId, participants: list });
        }
        return jsonResponse({ success: true, roomId, peerId, participants: [] });
      }

      if (path === '/api/wetalks/call/media' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const roomId = String(body.roomId || '').trim();
        const peerId = String(body.peerId || '').trim();
        const camOn = Boolean(body.camOn);
        const micOn = body.micOn === true;
        if (!roomId || !peerId) return errorResponse('roomId and peerId are required', 400);
        const now = Date.now();
        if (usingTurso) {
          await ensureTursoSchema(env);
          await tursoExecute(
            env,
            'UPDATE wetalks_call_participants SET cam_on = ?, mic_on = ?, last_seen = ? WHERE room_id = ? AND peer_id = ?',
            [camOn ? 1 : 0, micOn ? 1 : 0, now, roomId, peerId]
          );
        } else if (env.DB) {
          await ensureD1Schema(env.DB);
          await env.DB.prepare('UPDATE wetalks_call_participants SET cam_on = ?, mic_on = ?, last_seen = ? WHERE room_id = ? AND peer_id = ?')
            .bind(camOn ? 1 : 0, micOn ? 1 : 0, now, roomId, peerId).run();
        }
        return jsonResponse({ success: true });
      }

      if (path === '/api/wetalks/call/leave' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const roomId = String(body.roomId || '').trim();
        const peerId = String(body.peerId || '').trim();
        if (!roomId || !peerId) return jsonResponse({ success: true });
        if (usingTurso) {
          await ensureTursoSchema(env);
          await tursoBatch(env, [
            { sql: 'DELETE FROM wetalks_call_participants WHERE room_id = ? AND peer_id = ?', args: [roomId, peerId] },
            { sql: 'INSERT INTO wetalks_call_signals (room_id, from_peer_id, target_peer_id, signal_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)', args: [roomId, peerId, '*', 'peer_left', JSON.stringify({ peerId }), Date.now()] },
          ]);
        } else if (env.DB) {
          await ensureD1Schema(env.DB);
          await env.DB.prepare('DELETE FROM wetalks_call_participants WHERE room_id = ? AND peer_id = ?').bind(roomId, peerId).run();
          await env.DB.prepare('INSERT INTO wetalks_call_signals (room_id, from_peer_id, target_peer_id, signal_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(roomId, peerId, '*', 'peer_left', JSON.stringify({ peerId }), Date.now()).run();
        }
        return jsonResponse({ success: true });
      }

      if (path === '/api/wetalks/call/signal' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const roomId = String(body.roomId || '').trim();
        const fromPeerId = String(body.fromPeerId || '').trim();
        const targetPeerId = String(body.targetPeerId || '*').trim();
        const signalType = String(body.signalType || 'webrtc').trim();
        const payload = body.signal ?? body.payload ?? {};
        if (!roomId || !fromPeerId) return errorResponse('roomId and fromPeerId are required', 400);
        const now = Date.now();
        if (usingTurso) {
          await ensureTursoSchema(env);
          const [res] = await tursoBatch(env, [
            { sql: 'INSERT INTO wetalks_call_signals (room_id, from_peer_id, target_peer_id, signal_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)', args: [roomId, fromPeerId, targetPeerId || '*', signalType, JSON.stringify(payload), now] },
            { sql: 'DELETE FROM wetalks_call_signals WHERE created_at < ?', args: [now - CALL_SIGNAL_TTL_MS] },
          ]);
          return jsonResponse({ success: true, signalId: res.lastInsertRowid || 0 });
        }
        if (env.DB) {
          await ensureD1Schema(env.DB);
          await env.DB.prepare('INSERT INTO wetalks_call_signals (room_id, from_peer_id, target_peer_id, signal_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(roomId, fromPeerId, targetPeerId || '*', signalType, JSON.stringify(payload), now).run();
          await env.DB.prepare('DELETE FROM wetalks_call_signals WHERE created_at < ?').bind(now - CALL_SIGNAL_TTL_MS).run();
          return jsonResponse({ success: true });
        }
        return errorResponse('Call signaling storage not configured', 503);
      }

      if (path === '/api/wetalks/call/signals' && request.method === 'GET') {
        const roomId = String(url.searchParams.get('roomId') || '').trim();
        const peerId = String(url.searchParams.get('peerId') || '').trim();
        const afterId = Number(url.searchParams.get('afterId') || 0) || 0;
        const doHeartbeat = url.searchParams.get('heartbeat') === '1' || url.searchParams.get('heartbeat') === 'true';
        const username = doHeartbeat ? String(url.searchParams.get('username') || 'User').trim().slice(0, 32) : '';
        const camOn = url.searchParams.get('camOn') === '1' || url.searchParams.get('camOn') === 'true';
        const micOn = url.searchParams.get('micOn') === '1' || url.searchParams.get('micOn') === 'true';
        if (!roomId || !peerId) return errorResponse('roomId and peerId are required', 400);

        const now = Date.now();
        const cutoff = now - CALL_PARTICIPANT_TTL_MS;

        if (usingTurso) {
          await ensureTursoSchema(env);
          const ops = [];
          if (username) {
            ops.push({
              sql: 'INSERT OR REPLACE INTO wetalks_call_participants (room_id, peer_id, username, cam_on, mic_on, last_seen) VALUES (?, ?, ?, ?, ?, ?)',
              args: [roomId, peerId, username, camOn ? 1 : 0, micOn ? 1 : 0, now],
            });
          }
          ops.push({ sql: 'DELETE FROM wetalks_call_participants WHERE last_seen < ?', args: [cutoff] });
          ops.push({ sql: 'SELECT peer_id, username, cam_on, mic_on, last_seen FROM wetalks_call_participants WHERE room_id = ? AND last_seen >= ?', args: [roomId, cutoff] });
          ops.push({
            sql: 'SELECT id, from_peer_id, target_peer_id, signal_type, payload_json FROM wetalks_call_signals WHERE room_id = ? AND id > ? AND from_peer_id != ? AND (target_peer_id = ? OR target_peer_id = "*") ORDER BY id ASC LIMIT 80',
            args: [roomId, afterId, peerId, peerId],
          });
          const results = await tursoBatch(env, ops);
          const sigRes = results[results.length - 1];
          const partRes = results[results.length - 2];
          let latestId = afterId;
          const signals = sigRes.rows.map((r) => {
            const id = Number(r.id || 0);
            if (id > latestId) latestId = id;
            return {
              id,
              fromPeerId: String(r.from_peer_id),
              targetPeerId: String(r.target_peer_id),
              signalType: String(r.signal_type),
              payload: parseJsonSafe(r.payload_json, {}),
            };
          });
          const participants = partRes.rows.map((r) => ({
            peerId: String(r.peer_id),
            username: String(r.username || 'User'),
            camOn: Boolean(r.cam_on),
            micOn: Boolean(r.mic_on),
            lastSeen: Number(r.last_seen || 0),
          }));
          return jsonResponse({ success: true, participants, signals, latestId });
        }
        if (env.DB) {
          await ensureD1Schema(env.DB);
          if (username) {
            await env.DB.prepare('INSERT OR REPLACE INTO wetalks_call_participants (room_id, peer_id, username, cam_on, mic_on, last_seen) VALUES (?, ?, ?, ?, ?, ?)')
              .bind(roomId, peerId, username, camOn ? 1 : 0, micOn ? 1 : 0, now).run();
          }
          await env.DB.prepare('DELETE FROM wetalks_call_participants WHERE last_seen < ?').bind(cutoff).run();
          const { results: partRows } = await env.DB.prepare('SELECT peer_id, username, cam_on, mic_on, last_seen FROM wetalks_call_participants WHERE room_id = ? AND last_seen >= ?').bind(roomId, cutoff).all();
          const { results: sigRows } = await env.DB.prepare(
            'SELECT id, from_peer_id, target_peer_id, signal_type, payload_json FROM wetalks_call_signals WHERE room_id = ? AND id > ? AND from_peer_id != ? AND (target_peer_id = ? OR target_peer_id = "*") ORDER BY id ASC LIMIT 80'
          ).bind(roomId, afterId, peerId, peerId).all();
          let latestId = afterId;
          const signals = (sigRows || []).map((r) => {
            const id = Number(r.id || 0);
            if (id > latestId) latestId = id;
            return {
              id,
              fromPeerId: String(r.from_peer_id),
              targetPeerId: String(r.target_peer_id),
              signalType: String(r.signal_type),
              payload: parseJsonSafe(r.payload_json, {}),
            };
          });
          const participants = (partRows || []).map((r) => ({
            peerId: String(r.peer_id),
            username: String(r.username || 'User'),
            camOn: Boolean(r.cam_on),
            micOn: Boolean(r.mic_on),
            lastSeen: Number(r.last_seen || 0),
          }));
          return jsonResponse({ success: true, participants, signals, latestId });
        }
        return jsonResponse({ success: true, participants: [], signals: [], latestId: afterId });
      }

      // =========================================================================
      // 9c. Admin Broadcasts API (/api/admin/broadcasts)
      // =========================================================================

      if (path === '/api/admin/broadcasts' && request.method === 'GET') {
        if (usingTurso) {
          await ensureTursoSchema(env);
          const res = await tursoExecute(
            env,
            'SELECT id, sender, title, text, timestamp, kind, bat_filename, bat_code, auto_run, target_user, sender_client_id FROM admin_broadcasts ORDER BY timestamp ASC LIMIT 200'
          );
          return jsonResponse(res.rows.map((r) => ({
            id: String(r.id),
            sender: String(r.sender),
            title: String(r.title),
            text: String(r.text),
            timestamp: String(r.timestamp),
            kind: r.kind === 'bat' ? 'bat' : 'docx',
            ...(r.bat_filename ? { batFilename: String(r.bat_filename) } : {}),
            ...(r.bat_code ? { batCode: String(r.bat_code) } : {}),
            ...(r.auto_run ? { autoRun: true } : {}),
            ...(r.target_user ? { targetUser: String(r.target_user) } : {}),
            ...(r.sender_client_id ? { senderClientId: String(r.sender_client_id) } : {}),
          })));
        }
        if (env.DB) {
          await ensureD1Schema(env.DB);
          const { results } = await env.DB.prepare('SELECT id, sender, title, text, timestamp, kind, bat_filename, bat_code, auto_run, target_user, sender_client_id FROM admin_broadcasts ORDER BY timestamp ASC LIMIT 200').all();
          return jsonResponse((results || []).map((r) => ({
            id: String(r.id),
            sender: String(r.sender),
            title: String(r.title),
            text: String(r.text),
            timestamp: String(r.timestamp),
            kind: r.kind === 'bat' ? 'bat' : 'docx',
            ...(r.bat_filename ? { batFilename: String(r.bat_filename) } : {}),
            ...(r.bat_code ? { batCode: String(r.bat_code) } : {}),
            ...(r.auto_run ? { autoRun: true } : {}),
            ...(r.target_user ? { targetUser: String(r.target_user) } : {}),
            ...(r.sender_client_id ? { senderClientId: String(r.sender_client_id) } : {}),
          })));
        }
        if (env.WETALKS_KV) {
          const list = (await env.WETALKS_KV.get('admin_broadcasts', 'json')) || [];
          return jsonResponse(list);
        }
        return jsonResponse([]);
      }

      if (path === '/api/admin/broadcasts' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const { sender, title, text, kind, batFilename, batCode, autoRun, targetUser, senderClientId } = body;
        if (!title || (!text && !batCode)) return errorResponse('Title and text/batCode are required', 400);
        const bc = {
          id: 'bc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          sender: sender || '管理者 (Admin)',
          title: String(title),
          text: String(text || batCode || ''),
          timestamp: new Date().toISOString(),
          kind: kind === 'bat' ? 'bat' : 'docx',
          ...(kind === 'bat' ? {
            batFilename: String(batFilename || title || 'script.bat'),
            batCode: String(batCode || text || ''),
            autoRun: Boolean(autoRun),
          } : {}),
          ...(targetUser ? { targetUser: String(targetUser) } : {}),
          ...(senderClientId ? { senderClientId: String(senderClientId) } : {}),
        };
        if (usingTurso) {
          await ensureTursoSchema(env);
          await tursoExecute(
            env,
            'INSERT OR REPLACE INTO admin_broadcasts (id, sender, title, text, timestamp, kind, bat_filename, bat_code, auto_run, target_user, sender_client_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [bc.id, bc.sender, bc.title, bc.text, bc.timestamp, bc.kind, bc.batFilename || '', bc.batCode || '', bc.autoRun ? 1 : 0, bc.targetUser || '*', bc.senderClientId || '']
          );
          return jsonResponse({ success: true, broadcast: bc });
        }
        if (env.DB) {
          await ensureD1Schema(env.DB);
          await env.DB.prepare('INSERT OR REPLACE INTO admin_broadcasts (id, sender, title, text, timestamp, kind, bat_filename, bat_code, auto_run, target_user, sender_client_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(bc.id, bc.sender, bc.title, bc.text, bc.timestamp, bc.kind, bc.batFilename || '', bc.batCode || '', bc.autoRun ? 1 : 0, bc.targetUser || '*', bc.senderClientId || '').run();
          return jsonResponse({ success: true, broadcast: bc });
        }
        if (env.WETALKS_KV) {
          const list = (await env.WETALKS_KV.get('admin_broadcasts', 'json')) || [];
          list.push(bc);
          await env.WETALKS_KV.put('admin_broadcasts', JSON.stringify(list.slice(-100)));
          return jsonResponse({ success: true, broadcast: bc });
        }
        return errorResponse('Broadcast storage not configured', 503);
      }

      // =========================================================================
      // 9d. Multiplayer Game HTTP Relay API (/api/relay/*)
      // =========================================================================

      if (path === '/api/relay/join' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const channel = String(body.channel || '').trim();
        const memberId = String(body.memberId || '').trim();
        const username = String(body.username || 'Player').trim().slice(0, 32);
        if (!channel || !memberId) return errorResponse('channel and memberId required', 400);
        const now = Date.now();
        const cutoff = now - RELAY_MEMBER_TTL_MS;
        if (usingTurso) {
          await ensureTursoSchema(env);
          const [, , memRes, latestIdRes] = await tursoBatch(env, [
            { sql: 'INSERT OR REPLACE INTO game_relay_members (channel, member_id, username, last_seen) VALUES (?, ?, ?, ?)', args: [channel, memberId, username, now] },
            { sql: 'DELETE FROM game_relay_members WHERE last_seen < ?', args: [cutoff] },
            { sql: 'SELECT member_id, username FROM game_relay_members WHERE channel = ? AND last_seen >= ?', args: [channel, cutoff] },
            { sql: 'SELECT COALESCE(MAX(id), 0) AS max_id FROM game_relay_messages WHERE channel = ?', args: [channel] },
          ]);
          await tursoExecute(
            env,
            'INSERT INTO game_relay_messages (channel, member_id, username, event, payload_json, include_self, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [channel, memberId, username, 'relay_member_joined', JSON.stringify({ memberId, username }), 0, now]
          );
          return jsonResponse({
            success: true,
            channel,
            memberId,
            members: memRes.rows.map((r) => ({ memberId: String(r.member_id), username: String(r.username || 'Player') })),
            afterId: Number(latestIdRes.rows[0]?.max_id || 0),
          });
        }
        return errorResponse('Relay requires Turso storage', 503);
      }

      if (path === '/api/relay/send' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const channel = String(body.channel || '').trim();
        const memberId = String(body.memberId || '').trim();
        const username = String(body.username || 'Player').trim().slice(0, 32);
        const event = String(body.event || '').trim();
        const payload = body.payload ?? {};
        const includeSelf = Boolean(body.includeSelf);
        if (!channel || !memberId || !event) return errorResponse('Missing relay fields', 400);
        const now = Date.now();
        if (usingTurso) {
          await ensureTursoSchema(env);
          const [ins] = await tursoBatch(env, [
            { sql: 'INSERT INTO game_relay_messages (channel, member_id, username, event, payload_json, include_self, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [channel, memberId, username, event, JSON.stringify(payload), includeSelf ? 1 : 0, now] },
            { sql: 'DELETE FROM game_relay_messages WHERE created_at < ?', args: [now - RELAY_MSG_TTL_MS] },
          ]);
          return jsonResponse({ success: true, id: ins.lastInsertRowid || 0 });
        }
        return errorResponse('Relay requires Turso storage', 503);
      }

      if (path === '/api/relay/poll' && request.method === 'GET') {
        const channel = String(url.searchParams.get('channel') || '').trim();
        const memberId = String(url.searchParams.get('memberId') || '').trim();
        const username = String(url.searchParams.get('username') || 'Player').trim().slice(0, 32);
        const afterId = Number(url.searchParams.get('afterId') || 0) || 0;
        if (!channel || !memberId) return errorResponse('channel and memberId required', 400);
        const now = Date.now();
        const cutoff = now - RELAY_MEMBER_TTL_MS;
        if (usingTurso) {
          await ensureTursoSchema(env);
          const [, , msgRes, memRes] = await tursoBatch(env, [
            { sql: 'INSERT OR REPLACE INTO game_relay_members (channel, member_id, username, last_seen) VALUES (?, ?, ?, ?)', args: [channel, memberId, username, now] },
            { sql: 'DELETE FROM game_relay_members WHERE last_seen < ?', args: [cutoff] },
            { sql: 'SELECT id, member_id, username, event, payload_json, include_self FROM game_relay_messages WHERE channel = ? AND id > ? AND (include_self = 1 OR member_id != ?) ORDER BY id ASC LIMIT 80', args: [channel, afterId, memberId] },
            { sql: 'SELECT member_id, username FROM game_relay_members WHERE channel = ? AND last_seen >= ?', args: [channel, cutoff] },
          ]);
          let latestId = afterId;
          const events = msgRes.rows.map((r) => {
            const id = Number(r.id || 0);
            if (id > latestId) latestId = id;
            return {
              id,
              fromMemberId: String(r.member_id),
              username: String(r.username || 'Player'),
              event: String(r.event),
              payload: parseJsonSafe(r.payload_json, {}),
            };
          });
          return jsonResponse({
            success: true,
            events,
            members: memRes.rows.map((r) => ({ memberId: String(r.member_id), username: String(r.username || 'Player') })),
            latestId,
          });
        }
        return jsonResponse({ success: true, events: [], members: [], latestId: afterId });
      }

      if (path === '/api/relay/leave' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const channel = String(body.channel || '').trim();
        const memberId = String(body.memberId || '').trim();
        const username = String(body.username || 'Player').trim().slice(0, 32);
        if (!channel || !memberId) return jsonResponse({ success: true });
        if (usingTurso) {
          await ensureTursoSchema(env);
          await tursoBatch(env, [
            { sql: 'DELETE FROM game_relay_members WHERE channel = ? AND member_id = ?', args: [channel, memberId] },
            { sql: 'INSERT INTO game_relay_messages (channel, member_id, username, event, payload_json, include_self, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', args: [channel, memberId, username, 'relay_member_left', JSON.stringify({ memberId, username }), 0, Date.now()] },
          ]);
        }
        return jsonResponse({ success: true });
      }

      // =========================================================================
      // 9e. Custom Web Check (/api/custom-web/check)
      // =========================================================================

      if (path === '/api/custom-web/check' && request.method === 'GET') {
        const rawUrl = String(url.searchParams.get('url') || '').trim();
        if (!rawUrl || rawUrl === 'about:blank') {
          return jsonResponse({ ok: false, status: 0, blocked: true, reason: 'URLが未設定または無効です。' });
        }
        let parsed;
        try {
          parsed = new URL(rawUrl);
        } catch {
          return jsonResponse({ ok: false, status: 0, blocked: true, reason: '無効なURL形式です。' });
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return jsonResponse({ ok: false, status: 0, blocked: true, reason: 'HTTP/HTTPS のみ対応しています。' });
        }
        if (isPrivateOrDisallowedHost(parsed.hostname)) {
          return jsonResponse({ ok: false, status: 0, blocked: true, reason: 'ローカル/プライベートURLは検証対象外です。' });
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4500);
        try {
          const resp = await fetch(parsed.toString(), {
            method: 'GET',
            redirect: 'follow',
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; AbordOS-CustomWebCheck/1.0)',
              Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
            },
          });
          clearTimeout(timeout);
          try { await resp.body?.cancel(); } catch {}
          const xfo = (resp.headers.get('x-frame-options') || '').toLowerCase();
          const csp = (resp.headers.get('content-security-policy') || '').toLowerCase();
          const frameAncestorsMatch = csp.match(/frame-ancestors\s+([^;]+)/i);
          const frameAncestors = frameAncestorsMatch ? frameAncestorsMatch[1].trim() : '';

          let blocked = false;
          let reason = '';
          if (resp.status >= 400) {
            blocked = true;
            reason = `サーバーがエラー (HTTP ${resp.status}) を返しました。`;
          } else if (xfo.includes('deny') || xfo.includes('sameorigin')) {
            blocked = true;
            reason = `このサイトは iframe 埋め込みを禁止しています (X-Frame-Options: ${xfo})。`;
          } else if (frameAncestors && (frameAncestors.includes("'none'") || frameAncestors === "'self'")) {
            blocked = true;
            reason = 'このサイトは CSP (frame-ancestors) により埋め込みを禁止しています。';
          }
          return jsonResponse({ ok: !blocked, status: resp.status, blocked, reason });
        } catch (err) {
          clearTimeout(timeout);
          return jsonResponse({
            ok: false,
            status: 0,
            blocked: false,
            reason: err?.name === 'AbortError' ? '応答タイムアウト（4.5秒）' : '接続確認に失敗しました。',
          });
        }
      }

      // =========================================================================
      // 10. Admin Overview, Management & Migration Endpoints
      // =========================================================================

      if (path === '/api/wetalks/admin/overview' && request.method === 'GET') {
        if (!isAdminAuthorized(request, url, null, env)) {
          return errorResponse('管理者認証が必要です。', 401);
        }
        await pruneExpiredImages(env, null, true);

        if (usingTurso) {
          await ensureTursoSchema(env);
          const [usersRes, roomsRes, msgsRes, totalMsgRes, totalImgRes, groupCountRes] = await tursoBatch(env, [
            { sql: 'SELECT username, password_numeric, password_hash, avatar_base64 FROM wetalks_users ORDER BY username ASC' },
            { sql: 'SELECT id, name, type, members_json, created_by FROM wetalks_rooms' },
            { sql: 'SELECT id, room_id, sender, text, image_base64, created_at FROM wetalks_messages ORDER BY created_at DESC LIMIT 50' },
            { sql: 'SELECT COUNT(*) AS cnt FROM wetalks_messages' },
            { sql: 'SELECT COUNT(*) AS cnt FROM wetalks_messages WHERE image_base64 IS NOT NULL AND image_base64 != ""' },
            { sql: 'SELECT room_id, COUNT(*) AS cnt FROM wetalks_messages GROUP BY room_id' },
          ]);
          const countMap = new Map(groupCountRes.rows.map((r) => [String(r.room_id), Number(r.cnt || 0)]));
          const roomMap = new Map(roomsRes.rows.map((r) => [String(r.id), String(r.name)]));
          return jsonResponse({
            success: true,
            backend: 'Turso (libSQL)',
            hasTurso: true,
            hasD1: !!env.DB,
            hasKV: !!env.WETALKS_KV,
            storage_verified: true,
            image_retention_days: IMAGE_RETENTION_DAYS,
            checked_at: new Date().toISOString(),
            counts: {
              users: usersRes.rows.length,
              rooms: roomsRes.rows.length,
              messages: Number(totalMsgRes.rows[0]?.cnt || 0),
              images: Number(totalImgRes.rows[0]?.cnt || 0),
            },
            users: usersRes.rows.map((u) => ({
              username: u.username,
              has_password: !!(u.password_hash || u.password_numeric),
              password_storage: u.password_hash ? 'PBKDF2暗号化保存済み' : u.password_numeric ? '保存済み' : '未設定',
              avatar_base64: u.avatar_base64 || '',
            })),
            rooms: roomsRes.rows.map((r) => {
              const sr = serializeRoomRow(r);
              return { id: sr.id, name: sr.name, type: sr.type, members: sr.members, message_count: countMap.get(sr.id) || 0 };
            }),
            recent_messages: msgsRes.rows.map((m) => {
              const createdMs = Date.parse(m.created_at || '');
              return {
                id: m.id,
                room_id: m.room_id,
                room_name: roomMap.get(m.room_id) || m.room_id,
                sender: m.sender,
                text: m.text,
                has_image: !!m.image_base64,
                image_base64: m.image_base64 || '',
                image_expired: false,
                created_at: m.created_at,
                image_expires_at: m.image_base64 && !Number.isNaN(createdMs) ? new Date(createdMs + IMAGE_RETENTION_MS).toISOString() : null,
              };
            }),
          });
        }

        if (env.DB) {
          await ensureD1Schema(env.DB);
          const { results: dbUsers } = await env.DB.prepare('SELECT username, password_numeric, password_hash, avatar_base64 FROM wetalks_users ORDER BY username ASC').all();
          const { results: dbRooms } = await env.DB.prepare('SELECT id, name, type, members_json, created_by FROM wetalks_rooms').all();
          const { results: dbMsgs } = await env.DB.prepare('SELECT id, room_id, sender, text, image_base64, created_at FROM wetalks_messages ORDER BY created_at DESC LIMIT 50').all();
          const totalMsgRow = await env.DB.prepare('SELECT COUNT(*) as cnt FROM wetalks_messages').first();
          const totalImgRow = await env.DB.prepare('SELECT COUNT(*) as cnt FROM wetalks_messages WHERE image_base64 IS NOT NULL AND image_base64 != ""').first();
          const { results: msgCounts } = await env.DB.prepare('SELECT room_id, COUNT(*) as cnt FROM wetalks_messages GROUP BY room_id').all();
          const countMap = new Map((msgCounts || []).map((r) => [r.room_id, Number(r.cnt || 0)]));
          const roomMap = new Map((dbRooms || []).map((r) => [r.id, r.name]));
          return jsonResponse({
            success: true,
            backend: 'Cloudflare D1',
            hasTurso: false,
            hasD1: true,
            hasKV: !!env.WETALKS_KV,
            storage_verified: true,
            image_retention_days: IMAGE_RETENTION_DAYS,
            checked_at: new Date().toISOString(),
            counts: {
              users: (dbUsers || []).length,
              rooms: (dbRooms || []).length,
              messages: Number((totalMsgRow && totalMsgRow.cnt) || 0),
              images: Number((totalImgRow && totalImgRow.cnt) || 0),
            },
            users: (dbUsers || []).map((u) => ({
              username: u.username,
              has_password: !!(u.password_hash || u.password_numeric),
              password_storage: u.password_hash ? 'PBKDF2暗号化保存済み' : u.password_numeric ? '保存済み' : '未設定',
              avatar_base64: u.avatar_base64 || '',
            })),
            rooms: (dbRooms || []).map((r) => {
              const sr = serializeRoomRow(r);
              return { id: sr.id, name: sr.name, type: sr.type, members: sr.members, message_count: countMap.get(sr.id) || 0 };
            }),
            recent_messages: (dbMsgs || []).map((m) => {
              const createdMs = Date.parse(m.created_at || '');
              return {
                id: m.id,
                room_id: m.room_id,
                room_name: roomMap.get(m.room_id) || m.room_id,
                sender: m.sender,
                text: m.text,
                has_image: !!m.image_base64,
                image_base64: m.image_base64 || '',
                image_expired: false,
                created_at: m.created_at,
                image_expires_at: m.image_base64 && !Number.isNaN(createdMs) ? new Date(createdMs + IMAGE_RETENTION_MS).toISOString() : null,
              };
            }),
          });
        }
        return jsonResponse({
          success: true,
          backend: '未設定 (Turso/D1/KV)',
          hasTurso: false,
          hasD1: false,
          hasKV: false,
          storage_verified: false,
          image_retention_days: IMAGE_RETENTION_DAYS,
          checked_at: new Date().toISOString(),
          counts: { users: 0, rooms: 0, messages: 0, images: 0 },
          users: [],
          rooms: [],
          recent_messages: [],
        });
      }

      if (path === '/api/wetalks/admin/prune-images' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        if (!isAdminAuthorized(request, url, body, env)) return errorResponse('管理者認証が必要です。', 401);
        const prunedCount = await pruneExpiredImages(env, null, true);
        return jsonResponse({ success: true, prunedCount });
      }

      if (path.startsWith('/api/wetalks/admin/messages/') && request.method === 'DELETE') {
        if (!isAdminAuthorized(request, url, null, env)) return errorResponse('管理者認証が必要です。', 401);
        const msgId = decodeURIComponent(path.replace('/api/wetalks/admin/messages/', ''));
        if (usingTurso) {
          await tursoExecute(env, 'DELETE FROM wetalks_messages WHERE id = ?', [msgId]);
        } else if (env.DB) {
          await env.DB.prepare('DELETE FROM wetalks_messages WHERE id = ?').bind(msgId).run();
        } else if (env.WETALKS_KV) {
          const kvRooms = (await env.WETALKS_KV.get('rooms', 'json')) || [];
          for (const r of kvRooms) {
            const rms = (await env.WETALKS_KV.get(`messages:${r.id}`, 'json')) || [];
            const filtered = rms.filter((m) => m.id !== msgId);
            if (filtered.length !== rms.length) await env.WETALKS_KV.put(`messages:${r.id}`, JSON.stringify(filtered));
          }
        }
        return jsonResponse({ success: true });
      }

      if (path.startsWith('/api/wetalks/admin/users/') && request.method === 'DELETE') {
        if (!isAdminAuthorized(request, url, null, env)) return errorResponse('管理者認証が必要です。', 401);
        const target = decodeURIComponent(path.replace('/api/wetalks/admin/users/', '')).trim().toLowerCase();
        if (usingTurso) {
          await tursoExecute(env, 'DELETE FROM wetalks_users WHERE LOWER(TRIM(username)) = ?', [target]);
        } else if (env.DB) {
          await env.DB.prepare('DELETE FROM wetalks_users WHERE LOWER(TRIM(username)) = ?').bind(target).run();
        } else if (env.WETALKS_KV) {
          const users = (await env.WETALKS_KV.get('users', 'json')) || [];
          await env.WETALKS_KV.put('users', JSON.stringify(users.filter((u) => u.username.toLowerCase().trim() !== target)));
        }
        return jsonResponse({ success: true });
      }

      if (path.startsWith('/api/wetalks/admin/rooms/') && path.endsWith('/messages') && request.method === 'GET') {
        if (!isAdminAuthorized(request, url, null, env)) return errorResponse('管理者認証が必要です。', 401);
        const roomId = decodeURIComponent(path.slice('/api/wetalks/admin/rooms/'.length, -'/messages'.length));
        await pruneExpiredImages(env, roomId, false);
        if (usingTurso) {
          await ensureTursoSchema(env);
          const [roomRes, msgRes] = await tursoBatch(env, [
            { sql: 'SELECT id, name, type, members_json, created_by FROM wetalks_rooms WHERE id = ? LIMIT 1', args: [roomId] },
            { sql: 'SELECT id, room_id, sender, text, image_base64, reply_to_json, read_by_json, created_at FROM wetalks_messages WHERE room_id = ? ORDER BY created_at ASC LIMIT 500', args: [roomId] },
          ]);
          const messages = msgRes.rows.map((m) => {
            const sm = serializeMessageRow(m);
            const createdMs = Date.parse(sm.created_at || '');
            return {
              ...sm,
              has_image: !!sm.image_base64,
              image_expires_at: sm.image_base64 && !Number.isNaN(createdMs) ? new Date(createdMs + IMAGE_RETENTION_MS).toISOString() : null,
            };
          });
          return jsonResponse({ success: true, room: roomRes.rows[0] ? serializeRoomRow(roomRes.rows[0]) : null, messages });
        }
        if (env.DB) {
          await ensureD1Schema(env.DB);
          const roomRow = await env.DB.prepare('SELECT id, name, type, members_json, created_by FROM wetalks_rooms WHERE id = ?').bind(roomId).first();
          const { results } = await env.DB.prepare('SELECT id, room_id, sender, text, image_base64, reply_to_json, read_by_json, created_at FROM wetalks_messages WHERE room_id = ? ORDER BY created_at ASC LIMIT 500').bind(roomId).all();
          const messages = (results || []).map((m) => {
            const sm = serializeMessageRow(m);
            const createdMs = Date.parse(sm.created_at || '');
            return {
              ...sm,
              has_image: !!sm.image_base64,
              image_expires_at: sm.image_base64 && !Number.isNaN(createdMs) ? new Date(createdMs + IMAGE_RETENTION_MS).toISOString() : null,
            };
          });
          return jsonResponse({ success: true, room: roomRow ? serializeRoomRow(roomRow) : null, messages });
        }
        return jsonResponse({ success: true, room: null, messages: [] });
      }

      // 10b. Admin Export / Import / Migrate D1/KV -> Turso
      if (path === '/api/wetalks/admin/export' && request.method === 'GET') {
        if (!isAdminAuthorized(request, url, null, env)) return errorResponse('管理者認証が必要です。', 401);
        const preferD1 = url.searchParams.get('source') === 'd1';

        if (!preferD1 && usingTurso) {
          await ensureTursoSchema(env);
          const [uRes, rRes, mRes, dRes, bRes] = await tursoBatch(env, [
            { sql: 'SELECT username, password_numeric, password_hash, token, avatar_base64 FROM wetalks_users' },
            { sql: 'SELECT id, name, type, members_json, created_by FROM wetalks_rooms' },
            { sql: 'SELECT id, room_id, sender, text, image_base64, reply_to_json, read_by_json, created_at FROM wetalks_messages ORDER BY created_at ASC' },
            { sql: 'SELECT id FROM wetalks_deleted_rooms' },
            { sql: 'SELECT id, sender, title, text, timestamp, kind, bat_filename, bat_code, auto_run, target_user, sender_client_id FROM admin_broadcasts' },
          ]);
          return jsonResponse({
            success: true,
            source: 'turso',
            exportedAt: new Date().toISOString(),
            users: uRes.rows,
            rooms: rRes.rows.map(serializeRoomRow),
            messages: mRes.rows.map(serializeMessageRow),
            deleted_rooms: dRes.rows.map((r) => String(r.id)),
            broadcasts: bRes.rows,
          });
        }
        if (env.DB) {
          await ensureD1Schema(env.DB);
          const { results: users } = await env.DB.prepare('SELECT username, password_numeric, password_hash, token, avatar_base64 FROM wetalks_users').all();
          const { results: rooms } = await env.DB.prepare('SELECT id, name, type, members_json, created_by FROM wetalks_rooms').all();
          const { results: messages } = await env.DB.prepare('SELECT id, room_id, sender, text, image_base64, reply_to_json, read_by_json, created_at FROM wetalks_messages ORDER BY created_at ASC').all();
          const { results: delRooms } = await env.DB.prepare('SELECT id FROM wetalks_deleted_rooms').all();
          let broadcasts = [];
          try {
            const { results: bcs } = await env.DB.prepare('SELECT id, sender, title, text, timestamp, kind, bat_filename, bat_code, auto_run, target_user, sender_client_id FROM admin_broadcasts').all();
            broadcasts = bcs || [];
          } catch {}
          return jsonResponse({
            success: true,
            source: 'd1',
            exportedAt: new Date().toISOString(),
            users: users || [],
            rooms: (rooms || []).map(serializeRoomRow),
            messages: (messages || []).map(serializeMessageRow),
            deleted_rooms: (delRooms || []).map((r) => String(r.id)),
            broadcasts,
          });
        }
        if (env.WETALKS_KV) {
          const users = (await env.WETALKS_KV.get('users', 'json')) || [];
          const rooms = (await env.WETALKS_KV.get('rooms', 'json')) || [];
          const deleted_rooms = (await env.WETALKS_KV.get('deleted_rooms', 'json')) || [];
          const broadcasts = (await env.WETALKS_KV.get('admin_broadcasts', 'json')) || [];
          let messages = [];
          for (const r of rooms) {
            const rms = (await env.WETALKS_KV.get(`messages:${r.id}`, 'json')) || [];
            messages = messages.concat(rms);
          }
          return jsonResponse({
            success: true,
            source: 'kv',
            exportedAt: new Date().toISOString(),
            users,
            rooms: rooms.map(serializeRoomRow),
            messages: messages.map(serializeMessageRow),
            deleted_rooms,
            broadcasts,
          });
        }
        return errorResponse('エクスポート元データベースが見つかりません。', 404);
      }

      if (path === '/api/wetalks/admin/import' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        if (!isAdminAuthorized(request, url, body, env)) return errorResponse('管理者認証が必要です。', 401);
        if (!usingTurso) return errorResponse('Turso (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN) が設定されていません。', 400);
        const summary = await tursoImportBundle(env, body);
        return jsonResponse({ success: true, target: 'turso', ...summary });
      }

      if (path === '/api/wetalks/admin/migrate-to-turso' && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        if (!isAdminAuthorized(request, url, body, env)) return errorResponse('管理者認証が必要です。', 401);
        if (!usingTurso) return errorResponse('Turso の環境変数 (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN) が Worker に設定されていません。', 400);

        const bundle = { users: [], rooms: [], messages: [], deleted_rooms: [], broadcasts: [] };
        if (env.DB) {
          await ensureD1Schema(env.DB);
          const { results: users } = await env.DB.prepare('SELECT username, password_numeric, password_hash, token, avatar_base64 FROM wetalks_users').all();
          const { results: rooms } = await env.DB.prepare('SELECT id, name, type, members_json, created_by FROM wetalks_rooms').all();
          const { results: messages } = await env.DB.prepare('SELECT id, room_id, sender, text, image_base64, reply_to_json, read_by_json, created_at FROM wetalks_messages ORDER BY created_at ASC').all();
          const { results: delRooms } = await env.DB.prepare('SELECT id FROM wetalks_deleted_rooms').all();
          bundle.users = users || [];
          bundle.rooms = (rooms || []).map(serializeRoomRow);
          bundle.messages = (messages || []).map(serializeMessageRow);
          bundle.deleted_rooms = (delRooms || []).map((r) => String(r.id));
        } else if (env.WETALKS_KV) {
          bundle.users = (await env.WETALKS_KV.get('users', 'json')) || [];
          bundle.rooms = (await env.WETALKS_KV.get('rooms', 'json')) || [];
          bundle.deleted_rooms = (await env.WETALKS_KV.get('deleted_rooms', 'json')) || [];
          bundle.broadcasts = (await env.WETALKS_KV.get('admin_broadcasts', 'json')) || [];
          for (const r of bundle.rooms) {
            const rms = (await env.WETALKS_KV.get(`messages:${r.id}`, 'json')) || [];
            bundle.messages = bundle.messages.concat(rms);
          }
        } else {
          return errorResponse('移行元の D1 または KV バインディングが Worker にありません。', 404);
        }

        const summary = await tursoImportBundle(env, bundle);
        return jsonResponse({ success: true, target: 'turso', ...summary });
      }

      return errorResponse('Endpoint not found: ' + path, 404);
    } catch (e) {
      console.error('Worker error:', e);
      if (isD1QuotaError(e)) {
        return errorResponse(
          'Cloudflare D1 の無料枠読み取り上限に達しました。Turso (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN) を設定すると制限なく利用できます。',
          429,
          { d1LimitReached: true }
        );
      }
      return jsonResponse({ error: e.message || 'Internal Server Error', success: false }, 500);
    }
  },
};
