import crypto from 'crypto';

export const TURSO_IMAGE_RETENTION_DAYS = 10;
export const TURSO_IMAGE_RETENTION_MS = TURSO_IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const PRESENCE_TTL_MS = 20000;
const CALL_PARTICIPANT_TTL_MS = 12000;
const CALL_SIGNAL_TTL_MS = 90000;
const RELAY_MEMBER_TTL_MS = 25000;
const RELAY_MSG_TTL_MS = 120000;

export interface TursoUserRow {
  username: string;
  password_numeric: string;
  password_hash: string;
  token: string;
  avatar_base64: string;
}

export interface TursoRoomDto {
  id: string;
  name: string;
  type: string;
  members: string[];
  created_by: string;
}

export interface TursoReplyRef {
  id: string;
  sender: string;
  text: string;
  has_image?: boolean;
}

export interface TursoMessageDto {
  id: string;
  room_id: string;
  sender: string;
  text: string;
  image_base64: string;
  image_expired?: boolean;
  reply_to?: TursoReplyRef;
  read_by: string[];
  created_at: string;
}

export interface TursoCallParticipant {
  peerId: string;
  username: string;
  camOn: boolean;
  micOn: boolean;
  lastSeen?: number;
}

export interface TursoAdminBroadcast {
  id: string;
  sender: string;
  title: string;
  text: string;
  timestamp: string;
  kind?: 'docx' | 'bat';
  batFilename?: string;
  batCode?: string;
  autoRun?: boolean;
  targetUser?: string;
  senderClientId?: string;
}

type HranaArg =
  | { type: 'null' }
  | { type: 'text'; value: string }
  | { type: 'integer'; value: string }
  | { type: 'float'; value: number };

interface HranaCol {
  name: string;
  decltype?: string | null;
}

interface HranaValue {
  type: 'null' | 'integer' | 'float' | 'text' | 'blob';
  value?: string | number | null;
  base64?: string;
}

interface HranaExecuteResult {
  cols: HranaCol[];
  rows: HranaValue[][];
  affected_row_count: number;
  last_insert_rowid: string | null;
}

export function normalizeTursoHttpUrl(rawUrl?: string): string {
  const raw = String(rawUrl || process.env.TURSO_DATABASE_URL || '').trim();
  if (!raw) return '';
  let candidate = raw;
  if (candidate.startsWith('libsql://')) {
    candidate = 'https://' + candidate.slice('libsql://'.length);
  } else if (candidate.startsWith('wss://')) {
    candidate = 'https://' + candidate.slice('wss://'.length);
  } else if (candidate.startsWith('ws://')) {
    candidate = 'http://' + candidate.slice('ws://'.length);
  } else if (!/^https?:\/\//i.test(candidate)) {
    candidate = 'https://' + candidate.replace(/^\/+/, '');
  }
  try {
    const u = new URL(candidate);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return u.origin;
  } catch {
    return '';
  }
}

export function getTursoConfig(): { url: string; token: string } | null {
  const url = normalizeTursoHttpUrl(process.env.TURSO_DATABASE_URL);
  const token = String(process.env.TURSO_AUTH_TOKEN || '').trim();
  if (!url || !token) return null;
  return { url, token };
}

export function hasTursoConfig(): boolean {
  return Boolean(getTursoConfig());
}

function encodeArg(v: unknown): HranaArg {
  if (v === null || v === undefined) return { type: 'null' };
  if (typeof v === 'boolean') return { type: 'integer', value: v ? '1' : '0' };
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return { type: 'null' };
    if (Number.isInteger(v)) return { type: 'integer', value: String(v) };
    return { type: 'float', value: v };
  }
  return { type: 'text', value: String(v) };
}

function decodeCell(cell: HranaValue | undefined): any {
  if (!cell || cell.type === 'null') return null;
  if (cell.type === 'integer') {
    const n = Number(cell.value);
    return Number.isSafeInteger(n) ? n : String(cell.value ?? '');
  }
  if (cell.type === 'float') return Number(cell.value ?? 0);
  if (cell.type === 'blob') return cell.base64 || '';
  return cell.value ?? '';
}

function decodeResultRows(result?: HranaExecuteResult): {
  rows: Record<string, any>[];
  rowsAffected: number;
  lastInsertRowid: number | null;
} {
  if (!result) return { rows: [], rowsAffected: 0, lastInsertRowid: null };
  const cols = Array.isArray(result.cols) ? result.cols : [];
  const rawRows = Array.isArray(result.rows) ? result.rows : [];
  const rows = rawRows.map((rowVals) => {
    const obj: Record<string, any> = {};
    for (let i = 0; i < cols.length; i++) {
      const colName = cols[i]?.name || `col_${i}`;
      obj[colName] = decodeCell(rowVals[i]);
    }
    return obj;
  });
  return {
    rows,
    rowsAffected: Number(result.affected_row_count || 0),
    lastInsertRowid: result.last_insert_rowid !== null && result.last_insert_rowid !== undefined
      ? Number(result.last_insert_rowid)
      : null,
  };
}

export async function tursoBatch(
  statements: Array<{ sql: string; args?: unknown[] }>
): Promise<Array<{ rows: Record<string, any>[]; rowsAffected: number; lastInsertRowid: number | null }>> {
  const cfg = getTursoConfig();
  if (!cfg) {
    throw new Error('TURSO_DATABASE_URL / TURSO_AUTH_TOKEN が設定されていません。');
  }
  const requests = statements.map((s) => ({
    type: 'execute',
    stmt: {
      sql: s.sql,
      args: (s.args || []).map(encodeArg),
    },
  }));
  requests.push({ type: 'close' } as any);

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

  const data = (await res.json()) as {
    results?: Array<{
      type: 'ok' | 'error';
      response?: { type: string; result?: HranaExecuteResult };
      error?: { message?: string; code?: string };
    }>;
  };

  const out: Array<{ rows: Record<string, any>[]; rowsAffected: number; lastInsertRowid: number | null }> = [];
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
    out.push(decodeResultRows(item.response?.result));
  }
  return out;
}

export async function tursoExecute(sql: string, args: unknown[] = []) {
  const [res] = await tursoBatch([{ sql, args }]);
  return res;
}

let tursoSchemaInitPromise: Promise<void> | null = null;
let tursoSchemaInitialized = false;

export async function ensureTursoSchema(): Promise<void> {
  if (tursoSchemaInitialized) return;
  if (tursoSchemaInitPromise) return tursoSchemaInitPromise;

  tursoSchemaInitPromise = (async () => {
    const ddl: Array<{ sql: string }> = [
      {
        sql: `CREATE TABLE IF NOT EXISTS wetalks_users (username TEXT PRIMARY KEY, password_numeric TEXT NOT NULL DEFAULT '', password_hash TEXT DEFAULT '', token TEXT DEFAULT '', avatar_base64 TEXT DEFAULT '')`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS wetalks_rooms (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, members_json TEXT DEFAULT '', created_by TEXT DEFAULT '')`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS wetalks_messages (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, sender TEXT NOT NULL, text TEXT NOT NULL, image_base64 TEXT DEFAULT '', reply_to_json TEXT DEFAULT '', read_by_json TEXT DEFAULT '', created_at TEXT NOT NULL)`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS wetalks_deleted_rooms (id TEXT PRIMARY KEY)`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS wetalks_presence (client_id TEXT PRIMARY KEY, username TEXT NOT NULL, room_id TEXT DEFAULT '', last_seen INTEGER NOT NULL)`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS wetalks_call_participants (room_id TEXT NOT NULL, peer_id TEXT NOT NULL, username TEXT NOT NULL, cam_on INTEGER NOT NULL DEFAULT 1, mic_on INTEGER NOT NULL DEFAULT 0, last_seen INTEGER NOT NULL, PRIMARY KEY (room_id, peer_id))`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS wetalks_call_signals (id INTEGER PRIMARY KEY AUTOINCREMENT, room_id TEXT NOT NULL, from_peer_id TEXT NOT NULL, target_peer_id TEXT NOT NULL, signal_type TEXT NOT NULL, payload_json TEXT NOT NULL, created_at INTEGER NOT NULL)`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS admin_broadcasts (id TEXT PRIMARY KEY, sender TEXT NOT NULL, title TEXT NOT NULL, text TEXT NOT NULL, timestamp TEXT NOT NULL, kind TEXT DEFAULT 'docx', bat_filename TEXT DEFAULT '', bat_code TEXT DEFAULT '', auto_run INTEGER DEFAULT 0, target_user TEXT DEFAULT '*', sender_client_id TEXT DEFAULT '')`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS game_relay_members (channel TEXT NOT NULL, member_id TEXT NOT NULL, username TEXT DEFAULT '', last_seen INTEGER NOT NULL, PRIMARY KEY (channel, member_id))`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS game_relay_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT NOT NULL, member_id TEXT NOT NULL, username TEXT DEFAULT '', event TEXT NOT NULL, payload_json TEXT NOT NULL, include_self INTEGER DEFAULT 0, created_at INTEGER NOT NULL)`,
      },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_messages_room_created ON wetalks_messages(room_id, created_at)' },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_messages_created_at ON wetalks_messages(created_at)' },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_broadcasts_timestamp ON admin_broadcasts(timestamp)' },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_users_token ON wetalks_users(token)' },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_presence_last_seen ON wetalks_presence(last_seen)' },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_call_participants_room_seen ON wetalks_call_participants(room_id, last_seen)' },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_call_signals_room_target ON wetalks_call_signals(room_id, target_peer_id, id)' },
      { sql: 'CREATE INDEX IF NOT EXISTS idx_relay_msgs_channel_id ON game_relay_messages(channel, id)' },
    ];
    await tursoBatch(ddl);
    tursoSchemaInitialized = true;
  })().finally(() => {
    tursoSchemaInitPromise = null;
  });

  return tursoSchemaInitPromise;
}

export function hashPasswordPbkdf2(password: string): string {
  const salt = crypto.randomBytes(16);
  const bits = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  return 'pbkdf2:' + salt.toString('hex') + ':' + bits.toString('hex');
}

export function verifyPasswordCompat(password: string, user: Partial<TursoUserRow>): boolean {
  const hashStr =
    user.password_hash ||
    (String(user.password_numeric || '').startsWith('pbkdf2:') ? String(user.password_numeric) : '');
  if (hashStr && hashStr.startsWith('pbkdf2:')) {
    const parts = hashStr.split(':');
    if (parts.length !== 3) return false;
    try {
      const salt = Buffer.from(parts[1], 'hex');
      const expected = Buffer.from(parts[2], 'hex');
      const derived = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
      return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }
  if (hashStr && hashStr.includes(':')) {
    const [salt, storedHex] = hashStr.split(':');
    if (!salt || !storedHex) return false;
    try {
      const derived = crypto.scryptSync(password, salt, 64);
      const expected = Buffer.from(storedHex, 'hex');
      return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }
  if (user.password_numeric) {
    return String(user.password_numeric) === String(password);
  }
  return false;
}

function parseJsonSafe<T>(raw: unknown, fallback: T): T {
  if (!raw || typeof raw !== 'string') return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function serializeTursoRoom(r: any): TursoRoomDto {
  let members: string[] = [];
  if (Array.isArray(r.members)) {
    members = r.members.map(String);
  } else if (typeof r.members_json === 'string' && r.members_json.trim()) {
    const parsed = parseJsonSafe<unknown>(r.members_json, []);
    if (Array.isArray(parsed)) members = parsed.map((m) => String(m || '').trim()).filter(Boolean);
  }
  return {
    id: String(r.id),
    name: String(r.name),
    type: String(r.type || 'group'),
    members,
    created_by: String(r.created_by || ''),
  };
}

export function isMemberOfTursoRoom(room: TursoRoomDto, username: string): boolean {
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

export function serializeTursoMessage(m: any): TursoMessageDto {
  let replyTo: TursoReplyRef | undefined;
  if (m.reply_to && typeof m.reply_to === 'object' && m.reply_to.id) {
    replyTo = m.reply_to;
  } else if (typeof m.reply_to_json === 'string' && m.reply_to_json.trim()) {
    const parsed = parseJsonSafe<any>(m.reply_to_json, null);
    if (parsed && typeof parsed === 'object' && parsed.id) replyTo = parsed;
  }

  let readBy: string[] = [];
  if (Array.isArray(m.read_by)) {
    readBy = m.read_by;
  } else if (typeof m.read_by_json === 'string' && m.read_by_json.trim()) {
    const parsedRead = parseJsonSafe<unknown>(m.read_by_json, []);
    if (Array.isArray(parsedRead)) readBy = parsedRead.map(String);
  }

  const cleanReadBy = Array.from(
    new Set(readBy.map((u) => String(u || '').trim()).filter((u) => u && u !== 'ゲスト' && u !== m.sender))
  );

  const out: TursoMessageDto = {
    id: String(m.id),
    room_id: String(m.room_id),
    sender: String(m.sender),
    text: String(m.text || ''),
    image_base64: String(m.image_base64 || ''),
    read_by: cleanReadBy,
    created_at: String(m.created_at || ''),
  };
  if (replyTo) out.reply_to = replyTo;
  return out;
}

export async function tursoGetUserByToken(token: string): Promise<TursoUserRow | null> {
  if (!token) return null;
  await ensureTursoSchema();
  const res = await tursoExecute(
    'SELECT username, password_numeric, password_hash, token, avatar_base64 FROM wetalks_users WHERE token = ? LIMIT 1',
    [token]
  );
  return (res.rows[0] as TursoUserRow) || null;
}

export async function tursoListPublicUsers(): Promise<Array<{ username: string; avatar_base64: string }>> {
  await ensureTursoSchema();
  const res = await tursoExecute('SELECT username, avatar_base64 FROM wetalks_users ORDER BY username ASC');
  return res.rows.map((u) => ({
    username: String(u.username || ''),
    avatar_base64: String(u.avatar_base64 || ''),
  }));
}

export async function tursoRegisterUser(username: string, rawPassword: string, avatarBase64 = '') {
  await ensureTursoSchema();
  const cleanUsername = String(username || '').trim();
  const existing = await tursoExecute(
    'SELECT username FROM wetalks_users WHERE LOWER(TRIM(username)) = LOWER(?) LIMIT 1',
    [cleanUsername]
  );
  if (existing.rows.length > 0) {
    return { conflict: true as const };
  }
  const passwordHash = hashPasswordPbkdf2(rawPassword);
  const token = crypto.randomBytes(32).toString('hex');
  await tursoExecute(
    'INSERT INTO wetalks_users (username, password_numeric, password_hash, token, avatar_base64) VALUES (?, ?, ?, ?, ?)',
    [cleanUsername, passwordHash, passwordHash, token, avatarBase64]
  );
  return {
    conflict: false as const,
    token,
    user: { username: cleanUsername, avatar_base64: avatarBase64 },
  };
}

export async function tursoLoginUser(username: string, rawPassword: string) {
  await ensureTursoSchema();
  const cleanUsername = String(username || '').trim();
  const res = await tursoExecute(
    'SELECT username, password_numeric, password_hash, token, avatar_base64 FROM wetalks_users WHERE LOWER(TRIM(username)) = LOWER(?) LIMIT 1',
    [cleanUsername]
  );
  const user = res.rows[0] as TursoUserRow | undefined;
  if (!user || !verifyPasswordCompat(rawPassword, user)) {
    return null;
  }
  const token = user.token || crypto.randomBytes(32).toString('hex');
  const nextHash =
    user.password_hash && user.password_hash.startsWith('pbkdf2:')
      ? user.password_hash
      : hashPasswordPbkdf2(rawPassword);

  if (!user.token || nextHash !== user.password_hash) {
    await tursoExecute(
      'UPDATE wetalks_users SET token = ?, password_hash = ? WHERE username = ?',
      [token, nextHash, user.username]
    );
  }
  return {
    token,
    user: { username: user.username, avatar_base64: user.avatar_base64 || '' },
  };
}

export async function tursoUpdateAvatar(username: string, avatarBase64: string) {
  await ensureTursoSchema();
  await tursoExecute('UPDATE wetalks_users SET avatar_base64 = ? WHERE username = ?', [avatarBase64, username]);
}

export async function tursoRenameUser(oldName: string, newName: string) {
  await ensureTursoSchema();
  const conflict = await tursoExecute(
    'SELECT username FROM wetalks_users WHERE LOWER(TRIM(username)) = LOWER(?) AND username != ? LIMIT 1',
    [newName, oldName]
  );
  if (conflict.rows.length > 0) {
    return { conflict: true as const };
  }

  const [, , roomsRes, msgMetaRes] = await tursoBatch([
    { sql: 'UPDATE wetalks_users SET username = ? WHERE username = ?', args: [newName, oldName] },
    { sql: 'UPDATE wetalks_messages SET sender = ? WHERE sender = ?', args: [newName, oldName] },
    { sql: 'SELECT id, name, type, members_json, created_by FROM wetalks_rooms' },
    {
      sql: `SELECT id, sender, reply_to_json, read_by_json FROM wetalks_messages WHERE (reply_to_json IS NOT NULL AND reply_to_json != '') OR (read_by_json IS NOT NULL AND read_by_json != '')`,
    },
  ]);

  const updates: Array<{ sql: string; args: unknown[] }> = [];
  for (const r of roomsRes.rows) {
    const sr = serializeTursoRoom(r);
    let nextName = String(r.name || '');
    let nextMembers = sr.members;
    let changed = false;
    if (nextMembers.includes(oldName)) {
      nextMembers = Array.from(new Set(nextMembers.map((m) => (m === oldName ? newName : m))));
      changed = true;
    }
    let nextCreatedBy = sr.created_by;
    if (nextCreatedBy === oldName) {
      nextCreatedBy = newName;
      changed = true;
    }
    if (r.type === 'direct') {
      const parts = nextName.replace(/@/g, '').split(' & ');
      if (parts.length === 2 && (parts[0] === oldName || parts[1] === oldName)) {
        const updatedParts = parts.map((p) => (p === oldName ? newName : p)).sort();
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
    let nextReply = String(rm.reply_to_json || '');
    let nextReadBy = String(rm.read_by_json || '');
    let changedMsg = false;
    if (nextReply) {
      const parsed = parseJsonSafe<any>(nextReply, null);
      if (parsed && parsed.sender === oldName) {
        parsed.sender = newName;
        nextReply = JSON.stringify(parsed);
        changedMsg = true;
      }
    }
    if (nextReadBy) {
      const parsedRead = parseJsonSafe<unknown>(nextReadBy, null);
      if (Array.isArray(parsedRead) && parsedRead.includes(oldName)) {
        const updatedRead = Array.from(
          new Set(parsedRead.map((u) => (u === oldName ? newName : String(u))).filter((u) => u && u !== rm.sender))
        );
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

  if (updates.length > 0) {
    await tursoBatch(updates);
  }
  return { conflict: false as const };
}

export async function tursoSyncPresence(clientId: string, username: string, roomId: string, offline: boolean) {
  await ensureTursoSchema();
  const now = Date.now();
  const ttlCutoff = now - PRESENCE_TTL_MS;
  const ops: Array<{ sql: string; args: unknown[] }> = [];
  if (offline && clientId) {
    ops.push({ sql: 'DELETE FROM wetalks_presence WHERE client_id = ?', args: [clientId] });
  } else if (clientId && username && username !== 'ゲスト') {
    ops.push({
      sql: 'INSERT OR REPLACE INTO wetalks_presence (client_id, username, room_id, last_seen) VALUES (?, ?, ?, ?)',
      args: [clientId, username, roomId || '', now],
    });
  }
  ops.push({ sql: 'DELETE FROM wetalks_presence WHERE last_seen < ?', args: [ttlCutoff] });
  ops.push({
    sql: 'SELECT client_id, username, room_id FROM wetalks_presence WHERE last_seen >= ?',
    args: [ttlCutoff],
  });

  const results = await tursoBatch(ops);
  const rows = results[results.length - 1].rows;
  const userMap = new Map<string, string>();
  const roomSet = new Set<string>();
  for (const r of rows) {
    const uname = String(r.username || '').trim();
    if (uname && uname !== 'ゲスト') {
      const key = uname.toLowerCase();
      if (!userMap.has(key)) userMap.set(key, uname);
      if (roomId && r.room_id === roomId) roomSet.add(uname);
    }
  }
  const onlineUsers = Array.from(userMap.values());
  const roomMembers = Array.from(roomSet);
  const fallbackSelf = !offline && username && username !== 'ゲスト' ? 1 : 0;
  return {
    presenceSupported: true,
    onlineCount: onlineUsers.length > 0 ? onlineUsers.length : fallbackSelf,
    onlineUsers,
    roomMembers,
  };
}

export async function tursoGetRoomsForUser(username: string): Promise<TursoRoomDto[]> {
  await ensureTursoSchema();
  const [delRes, roomsRes] = await tursoBatch([
    { sql: 'SELECT id FROM wetalks_deleted_rooms' },
    { sql: 'SELECT id, name, type, members_json, created_by FROM wetalks_rooms' },
  ]);
  const deletedSet = new Set(delRes.rows.map((r) => String(r.id)));
  return roomsRes.rows
    .filter((r) => !deletedSet.has(String(r.id)))
    .map(serializeTursoRoom)
    .filter((r) => isMemberOfTursoRoom(r, username));
}

export async function tursoGetRoomById(roomId: string): Promise<TursoRoomDto | null> {
  await ensureTursoSchema();
  const res = await tursoExecute(
    'SELECT id, name, type, members_json, created_by FROM wetalks_rooms WHERE id = ? LIMIT 1',
    [roomId]
  );
  if (!res.rows[0]) return null;
  return serializeTursoRoom(res.rows[0]);
}

export async function tursoCreateRoom(
  authUsername: string,
  input: { id: string; name: string; type: string; members?: unknown[] }
) {
  await ensureTursoSchema();
  const { id, name, type, members } = input;
  let roomName = String(name).trim();
  let finalMembers = [authUsername];

  if (type === 'direct') {
    const memberSet = new Set<string>([authUsername]);
    if (Array.isArray(members)) {
      members.forEach((m) => {
        const s = String(m || '').trim();
        if (s && s !== 'ゲスト') memberSet.add(s);
      });
    }
    if (memberSet.size < 2 && roomName) {
      roomName
        .replace(/@/g, '')
        .split(' & ')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((p) => {
          if (p !== 'ゲスト') memberSet.add(p);
        });
    }
    const pair = Array.from(memberSet).slice(0, 2);
    if (pair.length !== 2) {
      return { error: '1対1トークには相手のユーザーが必要です。', status: 400 as const };
    }
    pair.sort();
    roomName = '@' + pair[0] + ' & @' + pair[1];
    finalMembers = pair;
  } else {
    const usersRes = await tursoExecute('SELECT username FROM wetalks_users');
    const registered = new Set(usersRes.rows.map((u) => String(u.username)));
    const memberSet = new Set<string>([authUsername]);
    if (Array.isArray(members)) {
      members.forEach((m) => {
        const s = String(m || '').trim();
        if (s && s !== 'ゲスト' && (registered.size === 0 || registered.has(s))) {
          memberSet.add(s);
        }
      });
    }
    finalMembers = Array.from(memberSet);
  }

  await tursoExecute('DELETE FROM wetalks_deleted_rooms WHERE id = ?', [id]);

  if (type === 'direct') {
    const directs = await tursoExecute(
      `SELECT id, name, type, members_json, created_by FROM wetalks_rooms WHERE type = 'direct'`
    );
    const dup = directs.rows.map(serializeTursoRoom).find(
      (r) =>
        (r.members.includes(finalMembers[0]) && r.members.includes(finalMembers[1])) || r.name === roomName
    );
    if (dup) {
      return { room: dup };
    }
  }

  const existing = await tursoGetRoomById(id);
  if (existing) {
    if (!isMemberOfTursoRoom(existing, authUsername)) {
      return { error: 'このルームにアクセスする権限がありません。', status: 403 as const };
    }
    return { room: existing };
  }

  await tursoExecute(
    'INSERT INTO wetalks_rooms (id, name, type, members_json, created_by) VALUES (?, ?, ?, ?, ?)',
    [id, roomName, type, JSON.stringify(finalMembers), authUsername]
  );

  return {
    room: { id, name: roomName, type, members: finalMembers, created_by: authUsername },
  };
}

export async function tursoInviteToRoom(roomId: string, authUsername: string, candidates: string[]) {
  await ensureTursoSchema();
  const [roomRes, usersRes] = await tursoBatch([
    { sql: 'SELECT id, name, type, members_json, created_by FROM wetalks_rooms WHERE id = ? LIMIT 1', args: [roomId] },
    { sql: 'SELECT username FROM wetalks_users' },
  ]);
  if (!roomRes.rows[0]) {
    return { error: 'トークルームが見つかりません。', status: 404 as const };
  }
  const room = serializeTursoRoom(roomRes.rows[0]);
  if (room.type !== 'group') {
    return { error: 'グループトークのみメンバーを招待できます。', status: 400 as const };
  }
  if (!isMemberOfTursoRoom(room, authUsername)) {
    return { error: 'このグループのメンバーのみ招待できます。', status: 403 as const };
  }

  const validUsers = new Set(usersRes.rows.map((u) => String(u.username)));
  const memberSet = new Set(room.members || [authUsername]);
  const addedMembers: string[] = [];
  candidates.forEach((c) => {
    const clean = String(c || '').trim();
    if (clean && clean !== 'ゲスト' && validUsers.has(clean) && !memberSet.has(clean)) {
      memberSet.add(clean);
      addedMembers.push(clean);
    }
  });
  room.members = Array.from(memberSet);
  await tursoExecute('UPDATE wetalks_rooms SET members_json = ? WHERE id = ?', [
    JSON.stringify(room.members),
    roomId,
  ]);
  return { room, addedMembers };
}

export async function tursoDeleteRoom(roomId: string) {
  await ensureTursoSchema();
  await tursoBatch([
    { sql: 'INSERT OR IGNORE INTO wetalks_deleted_rooms (id) VALUES (?)', args: [roomId] },
    { sql: 'DELETE FROM wetalks_rooms WHERE id = ?', args: [roomId] },
    { sql: 'DELETE FROM wetalks_messages WHERE room_id = ?', args: [roomId] },
    { sql: 'DELETE FROM wetalks_call_participants WHERE room_id = ?', args: [roomId] },
    { sql: 'DELETE FROM wetalks_call_signals WHERE room_id = ?', args: [roomId] },
  ]);
}

export async function tursoMarkMessagesRead(roomId: string, readerUsername: string): Promise<number> {
  if (!roomId || !readerUsername || readerUsername === 'ゲスト') return 0;
  await ensureTursoSchema();
  const res = await tursoExecute(
    'SELECT id, sender, read_by_json FROM wetalks_messages WHERE room_id = ? AND sender != ?',
    [roomId, readerUsername]
  );
  const updates: Array<{ sql: string; args: unknown[] }> = [];
  for (const row of res.rows) {
    const parsed = parseJsonSafe<unknown>(row.read_by_json, []);
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
  if (updates.length > 0) {
    await tursoBatch(updates);
  }
  return updates.length;
}

let lastPruneCheckAt = 0;

export async function tursoPruneExpiredImages(force = false): Promise<number> {
  const now = Date.now();
  if (!force && now - lastPruneCheckAt < 5 * 60 * 1000) return 0;
  lastPruneCheckAt = now;
  await ensureTursoSchema();
  const cutoffIso = new Date(now - TURSO_IMAGE_RETENTION_MS).toISOString();
  const res = await tursoExecute(
    `UPDATE wetalks_messages SET image_base64 = '', text = CASE WHEN TRIM(text) = '' THEN '🖼️ 10日経過により画像は自動削除されました' ELSE text END WHERE image_base64 IS NOT NULL AND image_base64 != '' AND created_at <= ?`,
    [cutoffIso]
  );
  return res.rowsAffected;
}

export async function tursoGetMessagesForRoom(
  roomId: string,
  options: { summary?: boolean; limit?: number; after?: string } = {}
) {
  await ensureTursoSchema();
  await tursoPruneExpiredImages(false);

  const after = String(options.after || '').trim();

  if (options.summary) {
    const lim = options.limit || (after ? 60 : 30);
    const res = await tursoExecute(
      after
        ? `SELECT id, room_id, sender, text, (CASE WHEN image_base64 IS NOT NULL AND image_base64 != '' THEN 1 ELSE 0 END) AS has_image, read_by_json, created_at FROM wetalks_messages WHERE room_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT ?`
        : `SELECT id, room_id, sender, text, (CASE WHEN image_base64 IS NOT NULL AND image_base64 != '' THEN 1 ELSE 0 END) AS has_image, read_by_json, created_at FROM wetalks_messages WHERE room_id = ? ORDER BY created_at DESC LIMIT ?`,
      after ? [roomId, after, lim] : [roomId, lim]
    );
    const rows = after ? res.rows : res.rows.slice().reverse();
    return rows.map((m) => {
      const parsedRead = parseJsonSafe<unknown>(m.read_by_json, []);
      const cleanReadBy = Array.isArray(parsedRead)
        ? Array.from(
            new Set(
              parsedRead
                .map((u) => String(u || '').trim())
                .filter((u) => u && u !== 'ゲスト' && u !== m.sender)
            )
          )
        : [];
      return {
        id: String(m.id),
        room_id: String(m.room_id),
        sender: String(m.sender),
        text: String(m.text || ''),
        has_image: Boolean(m.has_image),
        read_by: cleanReadBy,
        created_at: String(m.created_at || ''),
      };
    });
  }

  const lim = options.limit || (after ? 100 : 200);
  const res = await tursoExecute(
    after
      ? 'SELECT id, room_id, sender, text, image_base64, reply_to_json, read_by_json, created_at FROM wetalks_messages WHERE room_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT ?'
      : 'SELECT id, room_id, sender, text, image_base64, reply_to_json, read_by_json, created_at FROM wetalks_messages WHERE room_id = ? ORDER BY created_at ASC LIMIT ?',
    after ? [roomId, after, lim] : [roomId, lim]
  );
  return res.rows.map(serializeTursoMessage);
}

export async function tursoProbeMaxTimestamps() {
  await ensureTursoSchema();
  const [msgRes, bcRes] = await tursoBatch([
    { sql: 'SELECT MAX(created_at) AS max_msg_at FROM wetalks_messages' },
    { sql: 'SELECT MAX(timestamp) AS max_bc_at FROM admin_broadcasts' },
  ]);
  return {
    latestMsgAt: String(msgRes?.rows[0]?.max_msg_at || ''),
    latestBroadcastAt: String(bcRes?.rows[0]?.max_bc_at || ''),
  };
}

export async function tursoSyncSnapshot(params: {
  token?: string;
  after?: string;
  roomId?: string;
  roomAfter?: string;
  broadcastAfter?: string;
  includeRooms?: boolean;
}) {
  await ensureTursoSchema();
  const token = String(params.token || '').trim();
  const after = String(params.after || '').trim();
  const roomId = String(params.roomId || '').trim();
  const roomAfter = String(params.roomAfter || '').trim();
  const broadcastAfter = String(params.broadcastAfter || '').trim();
  const includeRooms = Boolean(params.includeRooms);

  const ops: Array<{ sql: string; args?: unknown[] }> = [
    { sql: 'SELECT MAX(created_at) AS max_msg_at FROM wetalks_messages' },
    { sql: 'SELECT MAX(timestamp) AS max_bc_at FROM admin_broadcasts' },
  ];
  const idxAuth = token
    ? ops.push({ sql: 'SELECT username FROM wetalks_users WHERE token = ? LIMIT 1', args: [token] }) - 1
    : -1;
  const idxBc =
    ops.push(
      broadcastAfter
        ? {
            sql: 'SELECT id, sender, title, text, timestamp, kind, bat_filename, bat_code, auto_run, target_user, sender_client_id FROM admin_broadcasts WHERE timestamp > ? ORDER BY timestamp ASC LIMIT 30',
            args: [broadcastAfter],
          }
        : {
            sql: 'SELECT id, sender, title, text, timestamp, kind, bat_filename, bat_code, auto_run, target_user, sender_client_id FROM admin_broadcasts ORDER BY timestamp ASC LIMIT 200',
          }
    ) - 1;
  const idxRooms =
    token && (includeRooms || after || roomId)
      ? ops.push({ sql: 'SELECT id, name, type, members_json, created_by FROM wetalks_rooms' }) - 1
      : -1;
  const idxGlobalMsgs =
    token && after
      ? ops.push({
          sql: `SELECT id, room_id, sender, text, (CASE WHEN image_base64 IS NOT NULL AND image_base64 != '' THEN 1 ELSE 0 END) AS has_image, read_by_json, created_at FROM wetalks_messages WHERE created_at > ? ORDER BY created_at ASC LIMIT 60`,
          args: [after],
        }) - 1
      : -1;
  const idxRoomMsgs =
    token && roomId && roomAfter
      ? ops.push({
          sql: 'SELECT id, room_id, sender, text, image_base64, reply_to_json, read_by_json, created_at FROM wetalks_messages WHERE room_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT 80',
          args: [roomId, roomAfter],
        }) - 1
      : -1;
  const idxRead =
    token && roomId
      ? ops.push({
          sql: 'SELECT id, sender, read_by_json FROM wetalks_messages WHERE room_id = ? ORDER BY created_at DESC LIMIT 25',
          args: [roomId],
        }) - 1
      : -1;

  const results = await tursoBatch(ops);
  const latestMsgAt = String(results[0]?.rows[0]?.max_msg_at || '');
  const latestBroadcastAt = String(results[1]?.rows[0]?.max_bc_at || '');
  const authUsername = idxAuth >= 0 ? String(results[idxAuth]?.rows[0]?.username || '') : '';

  const broadcasts = (results[idxBc]?.rows || []).map((r) => ({
    id: String(r.id),
    sender: String(r.sender),
    title: String(r.title),
    text: String(r.text),
    timestamp: String(r.timestamp),
    kind: (r.kind === 'bat' ? 'bat' : 'docx') as 'bat' | 'docx',
    ...(r.bat_filename ? { batFilename: String(r.bat_filename) } : {}),
    ...(r.bat_code ? { batCode: String(r.bat_code) } : {}),
    ...(r.auto_run ? { autoRun: true } : {}),
    ...(r.target_user ? { targetUser: String(r.target_user) } : {}),
    ...(r.sender_client_id ? { senderClientId: String(r.sender_client_id) } : {}),
  }));

  let rooms: ReturnType<typeof serializeTursoRoom>[] | undefined;
  let allowedRoomIds: Set<string> | null = null;
  if (idxRooms >= 0 && authUsername) {
    const allRooms = (results[idxRooms]?.rows || []).map(serializeTursoRoom);
    const myRooms = allRooms.filter((r) => isMemberOfTursoRoom(r, authUsername));
    allowedRoomIds = new Set(myRooms.map((r) => r.id));
    if (includeRooms) rooms = myRooms;
  }

  const messages =
    idxGlobalMsgs >= 0 && authUsername
      ? (results[idxGlobalMsgs]?.rows || [])
          .filter((m) => !allowedRoomIds || allowedRoomIds.has(String(m.room_id)))
          .map((m) => {
            const parsedRead = parseJsonSafe<unknown>(m.read_by_json, []);
            const cleanReadBy = Array.isArray(parsedRead)
              ? Array.from(
                  new Set(
                    parsedRead
                      .map((u) => String(u || '').trim())
                      .filter((u) => u && u !== 'ゲスト' && u !== m.sender)
                  )
                )
              : [];
            return {
              id: String(m.id),
              room_id: String(m.room_id),
              sender: String(m.sender),
              text: String(m.text || ''),
              has_image: Boolean(m.has_image),
              read_by: cleanReadBy,
              created_at: String(m.created_at || ''),
            };
          })
      : [];

  const roomMessages =
    idxRoomMsgs >= 0 && authUsername && (!allowedRoomIds || allowedRoomIds.has(roomId))
      ? (results[idxRoomMsgs]?.rows || []).map(serializeTursoMessage)
      : [];

  const readUpdates =
    idxRead >= 0 && authUsername && (!allowedRoomIds || allowedRoomIds.has(roomId))
      ? (results[idxRead]?.rows || []).map((r) => {
          const parsedRead = parseJsonSafe<unknown>(r.read_by_json, []);
          const cleanReadBy = Array.isArray(parsedRead)
            ? Array.from(
                new Set(
                  parsedRead
                    .map((u) => String(u || '').trim())
                    .filter((u) => u && u !== 'ゲスト' && u !== r.sender)
                )
              )
            : [];
          return { id: String(r.id), read_by: cleanReadBy };
        })
      : [];

  return {
    latestMsgAt,
    latestBroadcastAt,
    messages,
    roomMessages,
    readUpdates,
    broadcasts,
    ...(rooms ? { rooms } : {}),
  };
}

export async function tursoInsertMessage(msg: TursoMessageDto) {
  await ensureTursoSchema();
  await tursoExecute(
    'INSERT OR IGNORE INTO wetalks_messages (id, room_id, sender, text, image_base64, reply_to_json, read_by_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      msg.id,
      msg.room_id,
      msg.sender,
      msg.text,
      msg.image_base64 || '',
      msg.reply_to ? JSON.stringify(msg.reply_to) : '',
      JSON.stringify(msg.read_by || []),
      msg.created_at,
    ]
  );
  return msg;
}

export async function tursoGetAdminOverview() {
  await ensureTursoSchema();
  await tursoPruneExpiredImages(true);
  const [usersRes, roomsRes, msgsRes, totalMsgRes, totalImgRes, groupCountRes] = await tursoBatch([
    {
      sql: 'SELECT username, password_numeric, password_hash, avatar_base64 FROM wetalks_users ORDER BY username ASC',
    },
    { sql: 'SELECT id, name, type, members_json, created_by FROM wetalks_rooms' },
    {
      sql: 'SELECT id, room_id, sender, text, image_base64, created_at FROM wetalks_messages ORDER BY created_at DESC LIMIT 50',
    },
    { sql: 'SELECT COUNT(*) AS cnt FROM wetalks_messages' },
    { sql: `SELECT COUNT(*) AS cnt FROM wetalks_messages WHERE image_base64 IS NOT NULL AND image_base64 != ''` },
    { sql: 'SELECT room_id, COUNT(*) AS cnt FROM wetalks_messages GROUP BY room_id' },
  ]);

  const countMap = new Map(groupCountRes.rows.map((r) => [String(r.room_id), Number(r.cnt || 0)]));
  const roomMap = new Map(roomsRes.rows.map((r) => [String(r.id), String(r.name)]));

  return {
    success: true,
    backend: 'Turso (libSQL)',
    hasTurso: true,
    storage_verified: true,
    image_retention_days: TURSO_IMAGE_RETENTION_DAYS,
    checked_at: new Date().toISOString(),
    counts: {
      users: usersRes.rows.length,
      rooms: roomsRes.rows.length,
      messages: Number(totalMsgRes.rows[0]?.cnt || 0),
      images: Number(totalImgRes.rows[0]?.cnt || 0),
    },
    users: usersRes.rows.map((u) => ({
      username: String(u.username),
      has_password: Boolean(u.password_hash || u.password_numeric),
      password_storage: u.password_hash ? 'PBKDF2/scrypt暗号化保存済み' : u.password_numeric ? '保存済み' : '未設定',
      avatar_base64: String(u.avatar_base64 || ''),
    })),
    rooms: roomsRes.rows.map((r) => {
      const sr = serializeTursoRoom(r);
      return {
        id: sr.id,
        name: sr.name,
        type: sr.type,
        members: sr.members,
        message_count: countMap.get(sr.id) || 0,
      };
    }),
    recent_messages: msgsRes.rows.map((m) => {
      const createdMs = Date.parse(String(m.created_at || ''));
      return {
        id: String(m.id),
        room_id: String(m.room_id),
        room_name: roomMap.get(String(m.room_id)) || String(m.room_id),
        sender: String(m.sender),
        text: String(m.text || ''),
        has_image: Boolean(m.image_base64),
        image_base64: String(m.image_base64 || ''),
        image_expired: false,
        created_at: String(m.created_at || ''),
        image_expires_at:
          m.image_base64 && !Number.isNaN(createdMs)
            ? new Date(createdMs + TURSO_IMAGE_RETENTION_MS).toISOString()
            : null,
      };
    }),
  };
}

export async function tursoDeleteMessage(msgId: string) {
  await ensureTursoSchema();
  await tursoExecute('DELETE FROM wetalks_messages WHERE id = ?', [msgId]);
}

export async function tursoDeleteUser(targetUsernameLower: string) {
  await ensureTursoSchema();
  await tursoExecute('DELETE FROM wetalks_users WHERE LOWER(TRIM(username)) = ?', [targetUsernameLower]);
}

export async function tursoGetAdminRoomMessages(roomId: string) {
  await ensureTursoSchema();
  await tursoPruneExpiredImages(false);
  const [roomRes, msgRes] = await tursoBatch([
    { sql: 'SELECT id, name, type, members_json, created_by FROM wetalks_rooms WHERE id = ? LIMIT 1', args: [roomId] },
    {
      sql: 'SELECT id, room_id, sender, text, image_base64, reply_to_json, read_by_json, created_at FROM wetalks_messages WHERE room_id = ? ORDER BY created_at ASC LIMIT 500',
      args: [roomId],
    },
  ]);
  const room = roomRes.rows[0] ? serializeTursoRoom(roomRes.rows[0]) : null;
  const messages = msgRes.rows.map((row) => {
    const sm = serializeTursoMessage(row);
    const createdMs = Date.parse(sm.created_at || '');
    return {
      ...sm,
      has_image: Boolean(sm.image_base64),
      image_expires_at:
        sm.image_base64 && !Number.isNaN(createdMs)
          ? new Date(createdMs + TURSO_IMAGE_RETENTION_MS).toISOString()
          : null,
    };
  });
  return { success: true, room, messages };
}

// =========================================================================
// WeTalks Video/Voice Call HTTP + Turso Signaling (Enables GitHub Pages Calls)
// =========================================================================

export async function tursoProbeCallParticipants(roomId: string): Promise<TursoCallParticipant[]> {
  await ensureTursoSchema();
  const cutoff = Date.now() - CALL_PARTICIPANT_TTL_MS;
  const [, listRes] = await tursoBatch([
    { sql: 'DELETE FROM wetalks_call_participants WHERE last_seen < ?', args: [cutoff] },
    {
      sql: 'SELECT peer_id, username, cam_on, mic_on, last_seen FROM wetalks_call_participants WHERE room_id = ? AND last_seen >= ?',
      args: [roomId, cutoff],
    },
  ]);
  return listRes.rows.map((r) => ({
    peerId: String(r.peer_id),
    username: String(r.username || 'User'),
    camOn: Boolean(r.cam_on),
    micOn: Boolean(r.mic_on),
    lastSeen: Number(r.last_seen || 0),
  }));
}

export async function tursoJoinCall(
  roomId: string,
  peerId: string,
  username: string,
  camOn: boolean,
  micOn: boolean
): Promise<TursoCallParticipant[]> {
  await ensureTursoSchema();
  const now = Date.now();
  const cutoff = now - CALL_PARTICIPANT_TTL_MS;
  const [, , listRes] = await tursoBatch([
    {
      sql: 'INSERT OR REPLACE INTO wetalks_call_participants (room_id, peer_id, username, cam_on, mic_on, last_seen) VALUES (?, ?, ?, ?, ?, ?)',
      args: [roomId, peerId, username, camOn ? 1 : 0, micOn ? 1 : 0, now],
    },
    { sql: 'DELETE FROM wetalks_call_participants WHERE last_seen < ?', args: [cutoff] },
    {
      sql: 'SELECT peer_id, username, cam_on, mic_on, last_seen FROM wetalks_call_participants WHERE room_id = ? AND last_seen >= ?',
      args: [roomId, cutoff],
    },
  ]);
  return listRes.rows.map((r) => ({
    peerId: String(r.peer_id),
    username: String(r.username || 'User'),
    camOn: Boolean(r.cam_on),
    micOn: Boolean(r.mic_on),
    lastSeen: Number(r.last_seen || 0),
  }));
}

export async function tursoUpdateCallMedia(roomId: string, peerId: string, camOn: boolean, micOn: boolean) {
  await ensureTursoSchema();
  const now = Date.now();
  await tursoExecute(
    'UPDATE wetalks_call_participants SET cam_on = ?, mic_on = ?, last_seen = ? WHERE room_id = ? AND peer_id = ?',
    [camOn ? 1 : 0, micOn ? 1 : 0, now, roomId, peerId]
  );
}

export async function tursoLeaveCall(roomId: string, peerId: string) {
  await ensureTursoSchema();
  await tursoBatch([
    { sql: 'DELETE FROM wetalks_call_participants WHERE room_id = ? AND peer_id = ?', args: [roomId, peerId] },
    {
      sql: 'INSERT INTO wetalks_call_signals (room_id, from_peer_id, target_peer_id, signal_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [roomId, peerId, '*', 'peer_left', JSON.stringify({ peerId }), Date.now()],
    },
  ]);
}

export async function tursoSendCallSignal(
  roomId: string,
  fromPeerId: string,
  targetPeerId: string,
  signalType: string,
  payload: unknown
) {
  await ensureTursoSchema();
  const now = Date.now();
  const [res] = await tursoBatch([
    {
      sql: 'INSERT INTO wetalks_call_signals (room_id, from_peer_id, target_peer_id, signal_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      args: [roomId, fromPeerId, targetPeerId || '*', signalType, JSON.stringify(payload ?? {}), now],
    },
    { sql: 'DELETE FROM wetalks_call_signals WHERE created_at < ?', args: [now - CALL_SIGNAL_TTL_MS] },
  ]);
  return res.lastInsertRowid || 0;
}

export async function tursoPollCallSignals(
  roomId: string,
  peerId: string,
  afterId: number,
  heartbeatUsername?: string,
  camOn?: boolean,
  micOn?: boolean
) {
  await ensureTursoSchema();
  const now = Date.now();
  const cutoff = now - CALL_PARTICIPANT_TTL_MS;
  const ops: Array<{ sql: string; args: unknown[] }> = [];
  if (heartbeatUsername) {
    ops.push({
      sql: 'INSERT OR REPLACE INTO wetalks_call_participants (room_id, peer_id, username, cam_on, mic_on, last_seen) VALUES (?, ?, ?, ?, ?, ?)',
      args: [roomId, peerId, heartbeatUsername, camOn ? 1 : 0, micOn ? 1 : 0, now],
    });
  }
  ops.push({ sql: 'DELETE FROM wetalks_call_participants WHERE last_seen < ?', args: [cutoff] });
  ops.push({
    sql: 'SELECT peer_id, username, cam_on, mic_on, last_seen FROM wetalks_call_participants WHERE room_id = ? AND last_seen >= ?',
    args: [roomId, cutoff],
  });
  ops.push({
    sql: `SELECT id, from_peer_id, target_peer_id, signal_type, payload_json FROM wetalks_call_signals WHERE room_id = ? AND id > ? AND from_peer_id != ? AND (target_peer_id = ? OR target_peer_id = '*') ORDER BY id ASC LIMIT 80`,
    args: [roomId, afterId, peerId, peerId],
  });

  const results = await tursoBatch(ops);
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
      payload: parseJsonSafe<any>(r.payload_json, {}),
    };
  });

  const participants = partRes.rows.map((r) => ({
    peerId: String(r.peer_id),
    username: String(r.username || 'User'),
    camOn: Boolean(r.cam_on),
    micOn: Boolean(r.mic_on),
    lastSeen: Number(r.last_seen || 0),
  }));

  return { participants, signals, latestId };
}

// =========================================================================
// Admin Broadcasts & Game HTTP Relay in Turso
// =========================================================================

export async function tursoGetAdminBroadcasts(): Promise<TursoAdminBroadcast[]> {
  await ensureTursoSchema();
  const res = await tursoExecute(
    'SELECT id, sender, title, text, timestamp, kind, bat_filename, bat_code, auto_run, target_user, sender_client_id FROM admin_broadcasts ORDER BY timestamp ASC LIMIT 200'
  );
  return res.rows.map((r) => ({
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
  }));
}

export async function tursoInsertAdminBroadcast(bc: TursoAdminBroadcast) {
  await ensureTursoSchema();
  await tursoExecute(
    'INSERT OR REPLACE INTO admin_broadcasts (id, sender, title, text, timestamp, kind, bat_filename, bat_code, auto_run, target_user, sender_client_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      bc.id,
      bc.sender,
      bc.title,
      bc.text,
      bc.timestamp,
      bc.kind || 'docx',
      bc.batFilename || '',
      bc.batCode || '',
      bc.autoRun ? 1 : 0,
      bc.targetUser || '*',
      bc.senderClientId || '',
    ]
  );
  return bc;
}

export async function tursoRelayJoin(channel: string, memberId: string, username: string) {
  await ensureTursoSchema();
  const now = Date.now();
  const cutoff = now - RELAY_MEMBER_TTL_MS;
  const [, , membersRes, latestIdRes] = await tursoBatch([
    {
      sql: 'INSERT OR REPLACE INTO game_relay_members (channel, member_id, username, last_seen) VALUES (?, ?, ?, ?)',
      args: [channel, memberId, username, now],
    },
    { sql: 'DELETE FROM game_relay_members WHERE last_seen < ?', args: [cutoff] },
    {
      sql: 'SELECT member_id, username FROM game_relay_members WHERE channel = ? AND last_seen >= ?',
      args: [channel, cutoff],
    },
    {
      sql: 'SELECT COALESCE(MAX(id), 0) AS max_id FROM game_relay_messages WHERE channel = ?',
      args: [channel],
    },
  ]);
  // Notify other members of join
  await tursoExecute(
    'INSERT INTO game_relay_messages (channel, member_id, username, event, payload_json, include_self, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [channel, memberId, username, 'relay_member_joined', JSON.stringify({ memberId, username }), 0, now]
  );
  const members = membersRes.rows.map((r) => ({
    memberId: String(r.member_id),
    username: String(r.username || 'Player'),
  }));
  const afterId = Number(latestIdRes.rows[0]?.max_id || 0);
  return { members, afterId };
}

export async function tursoRelaySend(
  channel: string,
  memberId: string,
  username: string,
  event: string,
  payload: unknown,
  includeSelf = false
) {
  await ensureTursoSchema();
  const now = Date.now();
  const [ins] = await tursoBatch([
    {
      sql: 'INSERT INTO game_relay_messages (channel, member_id, username, event, payload_json, include_self, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [channel, memberId, username, event, JSON.stringify(payload ?? {}), includeSelf ? 1 : 0, now],
    },
    { sql: 'DELETE FROM game_relay_messages WHERE created_at < ?', args: [now - RELAY_MSG_TTL_MS] },
  ]);
  return ins.lastInsertRowid || 0;
}

export async function tursoRelayPoll(channel: string, memberId: string, username: string, afterId: number) {
  await ensureTursoSchema();
  const now = Date.now();
  const cutoff = now - RELAY_MEMBER_TTL_MS;
  const [, , msgRes, memRes] = await tursoBatch([
    {
      sql: 'INSERT OR REPLACE INTO game_relay_members (channel, member_id, username, last_seen) VALUES (?, ?, ?, ?)',
      args: [channel, memberId, username, now],
    },
    { sql: 'DELETE FROM game_relay_members WHERE last_seen < ?', args: [cutoff] },
    {
      sql: 'SELECT id, member_id, username, event, payload_json, include_self FROM game_relay_messages WHERE channel = ? AND id > ? AND (include_self = 1 OR member_id != ?) ORDER BY id ASC LIMIT 80',
      args: [channel, afterId, memberId],
    },
    {
      sql: 'SELECT member_id, username FROM game_relay_members WHERE channel = ? AND last_seen >= ?',
      args: [channel, cutoff],
    },
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
      payload: parseJsonSafe<any>(r.payload_json, {}),
    };
  });
  const members = memRes.rows.map((r) => ({
    memberId: String(r.member_id),
    username: String(r.username || 'Player'),
  }));
  return { events, members, latestId };
}

export async function tursoRelayLeave(channel: string, memberId: string, username: string) {
  await ensureTursoSchema();
  const now = Date.now();
  await tursoBatch([
    { sql: 'DELETE FROM game_relay_members WHERE channel = ? AND member_id = ?', args: [channel, memberId] },
    {
      sql: 'INSERT INTO game_relay_messages (channel, member_id, username, event, payload_json, include_self, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      args: [channel, memberId, username, 'relay_member_left', JSON.stringify({ memberId, username }), 0, now],
    },
  ]);
}

// =========================================================================
// Migration Export & Import (Cloudflare D1 / KV / wetalks_db.json -> Turso)
// =========================================================================

export interface WeTalksMigrationBundle {
  users?: any[];
  rooms?: any[];
  messages?: any[];
  deleted_rooms?: string[];
  broadcasts?: any[];
}

export async function tursoExportBundle(): Promise<WeTalksMigrationBundle> {
  await ensureTursoSchema();
  const [usersRes, roomsRes, msgsRes, delRes, bcRes] = await tursoBatch([
    { sql: 'SELECT username, password_numeric, password_hash, token, avatar_base64 FROM wetalks_users' },
    { sql: 'SELECT id, name, type, members_json, created_by FROM wetalks_rooms' },
    {
      sql: 'SELECT id, room_id, sender, text, image_base64, reply_to_json, read_by_json, created_at FROM wetalks_messages ORDER BY created_at ASC',
    },
    { sql: 'SELECT id FROM wetalks_deleted_rooms' },
    {
      sql: 'SELECT id, sender, title, text, timestamp, kind, bat_filename, bat_code, auto_run, target_user, sender_client_id FROM admin_broadcasts',
    },
  ]);

  return {
    users: usersRes.rows,
    rooms: roomsRes.rows.map(serializeTursoRoom),
    messages: msgsRes.rows.map(serializeTursoMessage),
    deleted_rooms: delRes.rows.map((r) => String(r.id)),
    broadcasts: bcRes.rows,
  };
}

export async function tursoImportBundle(bundle: WeTalksMigrationBundle): Promise<{
  usersImported: number;
  roomsImported: number;
  messagesImported: number;
  deletedRoomsImported: number;
  broadcastsImported: number;
}> {
  await ensureTursoSchema();
  const ops: Array<{ sql: string; args: unknown[] }> = [];
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
    const token = String(u.token || crypto.randomBytes(24).toString('hex'));
    const avatar = String(u.avatar_base64 || u.avatar || '');
    ops.push({
      sql: 'INSERT OR REPLACE INTO wetalks_users (username, password_numeric, password_hash, token, avatar_base64) VALUES (?, ?, ?, ?, ?)',
      args: [uname, rawPwNum || rawPwHash, rawPwHash, token, avatar],
    });
    usersImported++;
  }

  for (const d of bundle.deleted_rooms || []) {
    const id = String(typeof d === 'string' ? d : (d as any)?.id || '').trim();
    if (!id) continue;
    ops.push({ sql: 'INSERT OR IGNORE INTO wetalks_deleted_rooms (id) VALUES (?)', args: [id] });
    deletedRoomsImported++;
  }

  for (const r of bundle.rooms || []) {
    const id = String(r?.id || '').trim();
    const name = String(r?.name || '').trim();
    if (!id || !name) continue;
    const type = String(r.type || 'group');
    const membersJson =
      typeof r.members_json === 'string'
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
    const replyJson =
      typeof m.reply_to_json === 'string'
        ? m.reply_to_json
        : m.reply_to && typeof m.reply_to === 'object'
          ? JSON.stringify(m.reply_to)
          : '';
    const readJson =
      typeof m.read_by_json === 'string'
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

  // Execute in chunks of 40 statements per Turso pipeline request
  for (let i = 0; i < ops.length; i += 40) {
    await tursoBatch(ops.slice(i, i + 40));
  }

  return {
    usersImported,
    roomsImported,
    messagesImported,
    deletedRoomsImported,
    broadcastsImported,
  };
}
