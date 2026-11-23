#!/usr/bin/env npx tsx
/**
 * Cloudflare D1 / KV / Worker / JSON -> Turso (libSQL) Migration Script
 *
 * Usage:
 *   npx tsx scripts/migrate-cf-to-turso.ts --from-worker https://your-worker.workers.dev [--passcode mozunbu1203]
 *   npx tsx scripts/migrate-cf-to-turso.ts --from-json wetalks_db.json
 *   npx tsx scripts/migrate-cf-to-turso.ts --from-sql d1-export.sql
 *
 * Requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in environment / .env.
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {
  hasTursoConfig,
  tursoImportBundle,
  type WeTalksMigrationBundle,
} from '../server/turso';

dotenv.config();

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = 'true';
      }
    }
  }
  return out;
}

function splitSqlValuesTuple(tupleStr: string): string[] {
  const values: string[] = [];
  let cur = '';
  let inQuote = false;
  let quoteChar = "'";
  let i = 0;
  while (i < tupleStr.length) {
    const ch = tupleStr[i];
    if (inQuote) {
      if (ch === quoteChar) {
        if (tupleStr[i + 1] === quoteChar) {
          cur += quoteChar;
          i += 2;
          continue;
        }
        inQuote = false;
        cur += ch;
        i++;
        continue;
      }
      if (ch === '\\' && i + 1 < tupleStr.length) {
        const next = tupleStr[i + 1];
        if (next === 'n') cur += '\n';
        else if (next === 'r') cur += '\r';
        else if (next === 't') cur += '\t';
        else cur += next;
        i += 2;
        continue;
      }
      cur += ch;
      i++;
    } else {
      if (ch === "'" || ch === '"') {
        inQuote = true;
        quoteChar = ch;
        cur += ch;
        i++;
      } else if (ch === ',') {
        values.push(cur.trim());
        cur = '';
        i++;
      } else {
        cur += ch;
        i++;
      }
    }
  }
  if (cur.trim().length > 0) values.push(cur.trim());
  return values;
}

function unquoteSqlLiteral(raw: string): any {
  const s = raw.trim();
  if (!s || /^NULL$/i.test(s)) return '';
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s;
}

function extractSqlStatements(sqlContent: string): string[] {
  const statements: string[] = [];
  let cur = '';
  let inQuote = false;
  let quoteChar = "'";
  for (let i = 0; i < sqlContent.length; i++) {
    const ch = sqlContent[i];
    if (inQuote) {
      if (ch === quoteChar) {
        if (sqlContent[i + 1] === quoteChar) {
          cur += ch + quoteChar;
          i++;
          continue;
        }
        inQuote = false;
      }
      cur += ch;
    } else {
      if (ch === "'" || ch === '"') {
        inQuote = true;
        quoteChar = ch;
        cur += ch;
      } else if (ch === ';') {
        if (cur.trim()) statements.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  if (cur.trim()) statements.push(cur.trim());
  return statements;
}

function parseD1SqlDump(sqlContent: string): WeTalksMigrationBundle {
  const bundle: WeTalksMigrationBundle = {
    users: [],
    rooms: [],
    messages: [],
    deleted_rooms: [],
    broadcasts: [],
  };

  const stmts = extractSqlStatements(sqlContent);
  for (const stmt of stmts) {
    const m = stmt.match(
      /^INSERT\s+(?:OR\s+\w+\s+)?INTO\s+[`"[]?([a-zA-Z0-9_]+)[`"\]]?\s*(?:\(([^)]+)\))?\s*VALUES\s*(.+)$/is
    );
    if (!m) continue;
    const table = m[1].toLowerCase();
    const cols = m[2]
      ? m[2].split(',').map((c) => c.trim().replace(/^[`"[]|[`"\]]$/g, '').toLowerCase())
      : null;
    const valuesBlock = m[3].trim();

    // Parse tuples inside VALUES (...), (...)
    let i = 0;
    while (i < valuesBlock.length) {
      while (i < valuesBlock.length && valuesBlock[i] !== '(') i++;
      if (i >= valuesBlock.length) break;
      i++; // skip '('
      let tupleInner = '';
      let inQuote = false;
      let quoteChar = "'";
      let depth = 1;
      while (i < valuesBlock.length && depth > 0) {
        const ch = valuesBlock[i];
        if (inQuote) {
          if (ch === quoteChar) {
            if (valuesBlock[i + 1] === quoteChar) {
              tupleInner += ch + quoteChar;
              i += 2;
              continue;
            }
            inQuote = false;
          }
          tupleInner += ch;
          i++;
        } else {
          if (ch === "'" || ch === '"') {
            inQuote = true;
            quoteChar = ch;
            tupleInner += ch;
            i++;
          } else if (ch === '(') {
            depth++;
            tupleInner += ch;
            i++;
          } else if (ch === ')') {
            depth--;
            if (depth > 0) tupleInner += ch;
            i++;
          } else {
            tupleInner += ch;
            i++;
          }
        }
      }

      const rawVals = splitSqlValuesTuple(tupleInner).map(unquoteSqlLiteral);
      const rowObj: Record<string, any> = {};
      const defaultColsMap: Record<string, string[]> = {
        wetalks_users: ['username', 'password_numeric', 'password_hash', 'token', 'avatar_base64'],
        wetalks_rooms: ['id', 'name', 'type', 'members_json', 'created_by'],
        wetalks_messages: ['id', 'room_id', 'sender', 'text', 'image_base64', 'reply_to_json', 'read_by_json', 'created_at'],
        wetalks_deleted_rooms: ['id'],
        admin_broadcasts: ['id', 'sender', 'title', 'text', 'timestamp', 'kind', 'bat_filename', 'bat_code', 'auto_run', 'target_user', 'sender_client_id'],
      };
      const effectiveCols = cols || defaultColsMap[table] || [];
      effectiveCols.forEach((cName, idx) => {
        if (idx < rawVals.length) rowObj[cName] = rawVals[idx];
      });

      if (table === 'wetalks_users') bundle.users!.push(rowObj);
      else if (table === 'wetalks_rooms') bundle.rooms!.push(rowObj);
      else if (table === 'wetalks_messages') bundle.messages!.push(rowObj);
      else if (table === 'wetalks_deleted_rooms' && rowObj.id) bundle.deleted_rooms!.push(String(rowObj.id));
      else if (table === 'admin_broadcasts') bundle.broadcasts!.push(rowObj);
    }
  }

  return bundle;
}

async function fetchFromWorker(workerUrl: string, passcode: string): Promise<WeTalksMigrationBundle> {
  const base = workerUrl.replace(/\/+$/, '');
  const exportRes = await fetch(`${base}/api/wetalks/admin/export?passcode=${encodeURIComponent(passcode)}`, {
    headers: { 'x-admin-passcode': passcode },
  }).catch(() => null);

  if (exportRes && exportRes.ok) {
    return (await exportRes.json()) as WeTalksMigrationBundle;
  }

  const ovRes = await fetch(`${base}/api/wetalks/admin/overview?passcode=${encodeURIComponent(passcode)}`, {
    headers: { 'x-admin-passcode': passcode },
  });
  const ovData: any = await ovRes.json().catch(() => ({}));
  if (!ovRes.ok) {
    throw new Error(ovData?.error || `Worker HTTP ${ovRes.status}`);
  }
  const rooms = Array.isArray(ovData.rooms) ? ovData.rooms : [];
  const messages: any[] = [];
  for (const r of rooms) {
    const rmRes = await fetch(
      `${base}/api/wetalks/admin/rooms/${encodeURIComponent(r.id)}/messages?passcode=${encodeURIComponent(passcode)}`,
      { headers: { 'x-admin-passcode': passcode } }
    );
    if (rmRes.ok) {
      const rmData: any = await rmRes.json().catch(() => ({}));
      if (Array.isArray(rmData.messages)) messages.push(...rmData.messages);
    }
  }
  let broadcasts: any[] = [];
  try {
    const bcRes = await fetch(`${base}/api/admin/broadcasts`);
    if (bcRes.ok) {
      const data = await bcRes.json();
      if (Array.isArray(data)) broadcasts = data;
    }
  } catch {}
  return {
    users: Array.isArray(ovData.users) ? ovData.users : [],
    rooms,
    messages,
    broadcasts,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!hasTursoConfig()) {
    console.error('❌ TURSO_DATABASE_URL と TURSO_AUTH_TOKEN を .env または環境変数に設定してください。');
    process.exit(1);
  }

  let bundle: WeTalksMigrationBundle | null = null;
  if (args['from-worker']) {
    const passcode = args.passcode || 'mozunbu1203';
    console.log(`📡 Worker (${args['from-worker']}) からデータを取得中...`);
    bundle = await fetchFromWorker(args['from-worker'], passcode);
  } else if (args['from-json']) {
    const filePath = path.resolve(process.cwd(), args['from-json']);
    console.log(`📄 JSON (${filePath}) を読み込み中...`);
    bundle = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } else if (args['from-sql']) {
    const filePath = path.resolve(process.cwd(), args['from-sql']);
    console.log(`🗃️ D1 SQL (${filePath}) を解析中...`);
    bundle = parseD1SqlDump(fs.readFileSync(filePath, 'utf-8'));
  } else {
    console.log(
      '使い方:\n' +
        '  npx tsx scripts/migrate-cf-to-turso.ts --from-worker https://your-worker.workers.dev [--passcode mozunbu1203]\n' +
        '  npx tsx scripts/migrate-cf-to-turso.ts --from-json wetalks_db.json\n' +
        '  npx tsx scripts/migrate-cf-to-turso.ts --from-sql d1-export.sql'
    );
    process.exit(1);
  }

  if (!bundle) {
    console.error('❌ 移行データが空です。');
    process.exit(1);
  }

  console.log(
    `📦 取得完了: users=${bundle.users?.length || 0}, rooms=${bundle.rooms?.length || 0}, messages=${bundle.messages?.length || 0}, broadcasts=${bundle.broadcasts?.length || 0}`
  );
  const summary = await tursoImportBundle(bundle);
  console.log('✅ Turso への移行が完了しました:', summary);
}

main().catch((err) => {
  console.error('❌ 移行エラー:', err?.message || err);
  process.exit(1);
});
