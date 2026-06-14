# Drip Diary (Stage 1: Supabase 接続版)

ハンドドリップの記録 × AIで「次の一杯」を育てるアプリ。
**ログイン・データ保存・AI診断**を Supabase で動かす本番構成です。

- ログイン：Supabase Auth（メール＋パスワード）
- データ保存：Supabase の `user_data` テーブル（ユーザーごと・RLSで保護）
- AI診断：Supabase Edge Function `ai`（Gemini無料枠を中継。APIキーはサーバーに隠す）

---

## 1. 必要な設定（初回のみ）

### (a) 環境変数 `.env`
プロジェクト直下に `.env` があり、次の2つが入っています（このzipには記入済み）。
```
VITE_SUPABASE_URL=...     # SupabaseのProject URL
VITE_SUPABASE_ANON_KEY=... # anon public キー（公開してよいキー）
```
※ `.env` は .gitignore 済みなのでGitHubには上がりません（正常）。

### (b) Supabase 側（テスト用に確認）
- **メール確認をオフにすると、登録後すぐログインできます**（テスト向け）。
  Supabase → Authentication → Sign In / Providers → Email の「Confirm email」をオフ。
  （本番運用ではオンに戻すのが安全です）
- `user_data` テーブルと `ai` 関数、`GEMINI_API_KEY` のSecret登録は設定済み。

---

## 2. ローカルで動かす
```bash
npm install      # @supabase/supabase-js も入ります
npm run dev      # http://localhost:5173
```
1. メールとパスワード（6文字以上）で「アカウントを作成」
2. ログインして記録 → 日記 → AI診断 が動けばOK
3. 別のブラウザ/端末で同じアカウントでログインすると、同じデータが見えます（同期）

---

## 3. 公開（Vercel）に反映
1. Vercel のプロジェクト → **Settings → Environment Variables** に、同じ2つを登録：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. 変更をGitHubにpush（または Vercel で Redeploy）すると、本番URLでもログイン・保存・AIが有効になります。

> 環境変数を入れずにデプロイすると、ログイン画面で接続エラーになります。必ずVercel側にも登録してください。

---

## モデル / コストについて
- AIは Edge Function 内で **Gemini 2.5 Flash（無料枠）** を呼んでいます。
  回数を増やしたい場合は関数内の `MODEL` を `gemini-2.5-flash-lite` に変更可。
- Supabase無料枠は1週間未使用で一時停止します（使えば解除）。
