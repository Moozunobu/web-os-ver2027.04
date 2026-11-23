-- Complete SQLite / Turso (libSQL) / Cloudflare D1 Schema for WeTalks + Noon OS
-- Works seamlessly on Turso (`turso db shell <db-name> < cloudflare/schema.sql`) and D1.

-- 1. Users table (ユーザーテーブル)
CREATE TABLE IF NOT EXISTS wetalks_users (
  username TEXT PRIMARY KEY,
  password_numeric TEXT NOT NULL DEFAULT '',
  password_hash TEXT DEFAULT '',
  token TEXT DEFAULT '',
  avatar_base64 TEXT DEFAULT ''
);

-- 2. Rooms table (トークルームテーブル)
CREATE TABLE IF NOT EXISTS wetalks_rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  members_json TEXT DEFAULT '',
  created_by TEXT DEFAULT ''
);

-- 3. Messages table (メッセージテーブル)
CREATE TABLE IF NOT EXISTS wetalks_messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  sender TEXT NOT NULL,
  text TEXT NOT NULL,
  image_base64 TEXT DEFAULT '',
  reply_to_json TEXT DEFAULT '',
  read_by_json TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

-- 4. Deleted Rooms blocklist table (削除済みルーム管理)
CREATE TABLE IF NOT EXISTS wetalks_deleted_rooms (
  id TEXT PRIMARY KEY
);

-- 5. Active Presence table (リアルタイムオンライン管理)
CREATE TABLE IF NOT EXISTS wetalks_presence (
  client_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  room_id TEXT DEFAULT '',
  last_seen INTEGER NOT NULL
);

-- 6. Video/Voice Call Participants (HTTPシグナリング対応)
CREATE TABLE IF NOT EXISTS wetalks_call_participants (
  room_id TEXT NOT NULL,
  peer_id TEXT NOT NULL,
  username TEXT NOT NULL,
  cam_on INTEGER NOT NULL DEFAULT 1,
  mic_on INTEGER NOT NULL DEFAULT 0,
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (room_id, peer_id)
);

-- 7. Video/Voice Call WebRTC Signals (SDP Offer/Answer, ICE)
CREATE TABLE IF NOT EXISTS wetalks_call_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL,
  from_peer_id TEXT NOT NULL,
  target_peer_id TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- 8. Admin Broadcasts (Word通知 & .batファイル配信)
CREATE TABLE IF NOT EXISTS admin_broadcasts (
  id TEXT PRIMARY KEY,
  sender TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  kind TEXT DEFAULT 'docx',
  bat_filename TEXT DEFAULT '',
  bat_code TEXT DEFAULT '',
  auto_run INTEGER DEFAULT 0,
  target_user TEXT DEFAULT '*',
  sender_client_id TEXT DEFAULT ''
);

-- 9. Multiplayer Game HTTP Relay Members
CREATE TABLE IF NOT EXISTS game_relay_members (
  channel TEXT NOT NULL,
  member_id TEXT NOT NULL,
  username TEXT DEFAULT '',
  last_seen INTEGER NOT NULL,
  PRIMARY KEY (channel, member_id)
);

-- 10. Multiplayer Game HTTP Relay Messages
CREATE TABLE IF NOT EXISTS game_relay_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel TEXT NOT NULL,
  member_id TEXT NOT NULL,
  username TEXT DEFAULT '',
  event TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  include_self INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Indices for high performance query
CREATE INDEX IF NOT EXISTS idx_messages_room_created ON wetalks_messages(room_id, created_at);
CREATE INDEX IF NOT EXISTS idx_users_token ON wetalks_users(token);
CREATE INDEX IF NOT EXISTS idx_presence_last_seen ON wetalks_presence(last_seen);
CREATE INDEX IF NOT EXISTS idx_call_participants_room_seen ON wetalks_call_participants(room_id, last_seen);
CREATE INDEX IF NOT EXISTS idx_call_signals_room_target ON wetalks_call_signals(room_id, target_peer_id, id);
CREATE INDEX IF NOT EXISTS idx_relay_msgs_channel_id ON game_relay_messages(channel, id);
