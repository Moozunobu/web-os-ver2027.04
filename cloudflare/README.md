# WeTalks × Turso (libSQL) & Cloudflare Worker / GitHub Pages セットアップガイド

Cloudflare D1 の無料枠読み取り上限（`D1_ERROR: exceeded D1's free tier daily row read limit`）を解消し、**GitHub Pages 公開時でも WeTalks の全機能・ビデオ通話・管理者配信・オンライン対戦**を制限なく動かすための構成ガイドです。

---

## 1. Turso (libSQL) データベースの作成（推奨・メインDB）

1. [Turso CLI](https://docs.turso.tech/cli/installation) をインストール・ログインします：
   ```bash
   turso auth login
   ```
2. データベースを作成します（東京リージョン推奨: `nrt`）：
   ```bash
   turso db create wetalks-db --location nrt
   ```
3. 接続 URL とトークンを取得します：
   ```bash
   turso db show wetalks-db --url
   turso db tokens create wetalks-db
   ```
4. （任意・自動作成も可能）スキーマを適用します：
   ```bash
   turso db shell wetalks-db < cloudflare/schema.sql
   ```
   ※ テーブルは初回アクセス時にも自動で `CREATE TABLE IF NOT EXISTS` されます。

---

## 2. Cloudflare Worker へ Turso を接続（GitHub Pages からの API 窓口として使う場合）

Cloudflare Worker 自体を「Turso へのプロキシ API（読み取り制限なし）」として使います：

1. Cloudflare Dashboard または Wrangler CLI で Worker の環境変数/シークレットを設定します：
   ```bash
   cd cloudflare
   npx wrangler secret put TURSO_DATABASE_URL   # 例: libsql://wetalks-db-xxx.turso.io
   npx wrangler secret put TURSO_AUTH_TOKEN     # 上で生成したトークン
   npx wrangler deploy
   ```
2. Worker の概要ページで `TURSO_DATABASE_URL` と `TURSO_AUTH_TOKEN` が設定されている状態で `https://<your-worker>.workers.dev/api/wetalks/health` を開くと：
   ```json
   { "status": "ok", "hasTurso": true, "tursoConnected": true, "primaryStorage": "turso" }
   ```
   と表示されます。

> **注意**: GitHub Pages（`*.github.io`）の静的サイトから直接 Turso に接続すると `TURSO_AUTH_TOKEN` がブラウザに露出してしまうため、必ず **Cloudflare Worker** または **Node.js (`server.ts`)** を経由して Turso に接続してください。

---

## 3. 既存の Cloudflare D1 データを Turso へ移行する

### 方法 A: D1 無料枠上限に達している場合（Wrangler CLI エクスポート → Turso インポート）
D1 の日次読み取り制限が来て API が使えない場合でも、Wrangler で直接ダンプできます：
```bash
# 1. D1 から SQL ファイルをエクスポート
npx wrangler d1 export wetalks-db --remote --output=d1-export.sql

# 2. .env に TURSO_DATABASE_URL と TURSO_AUTH_TOKEN を設定して移行スクリプトを実行
npx tsx scripts/migrate-cf-to-turso.ts --from-sql d1-export.sql
```
またはエクスポートした `.sql` / `.json` ファイルを WeTalks の **「設定 (⚙) → Cloudflare D1 → Turso データ移行」** からアップロードして取り込めます。

### 方法 B: Worker に D1 と Turso の両方をバインドした状態で一括移行
```bash
# Worker のパスコード (デフォルト: mozunbu1203) を使って Worker 内部から Turso へ直接コピー
curl -X POST "https://<your-worker>.workers.dev/api/wetalks/admin/migrate-to-turso" \
  -H "x-admin-passcode: mozunbu1203"
```

### 方法 C: WeTalks 管理画面 / API から別 Worker URL 経由で移行
```bash
npx tsx scripts/migrate-cf-to-turso.ts --from-worker https://wetalks-backend.your-subdomain.workers.dev
```

---

## 4. GitHub Actions で公開する設定（GitHub Pages）

GitHub リポジトリの **Settings → Secrets and variables → Actions → Variables** に以下を設定すると、デプロイ時に自動的にバックエンド URL が組み込まれます（`VITE_` は公開設定値のためトークン類は絶対に入れないでください）：

- `VITE_API_BASE_URL`: `https://<your-worker-or-node-backend>.workers.dev`
- `VITE_WS_BASE_URL`: Node バックエンドがある場合のみ `wss://<your-node-backend>`（Cloudflare Worker のみの場合は空欄で自動 HTTP シグナリング＆ポーリングが動作します）
