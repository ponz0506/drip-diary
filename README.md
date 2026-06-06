# Drip Diary

ハンドドリップの記録 × AIで「次の一杯」を育てるアプリ（Vite + React）。

このリポジトリは **AIなしのデモ版**です。記録・日記・My棚・プロフィールはすべて動き、データは**ブラウザのlocalStorage**に保存されます。AI診断は「準備中」のモック表示になっています（本番化の手順は最後尾）。

---

## 必要なもの
- Node.js 18 以上（推奨：LTS版）。確認: `node -v`

## ローカルで動かす
```bash
npm install      # 初回だけ。依存をインストール
npm run dev      # 開発サーバー起動（http://localhost:5173 が表示される）
```
ブラウザで表示されたURLを開けば動きます。コードを保存すると自動でリロードされます。

本番ビルドの確認:
```bash
npm run build    # dist/ に本番ファイルを生成
npm run preview  # ビルド結果をローカルで確認
```

---

## Vercelで公開する（公開URLを出す）

### 方法A：GitHub経由（おすすめ・自動デプロイ）
1. このフォルダをGitHubリポジトリにpushする
   ```bash
   git init
   git add .
   git commit -m "init: drip diary demo"
   git branch -M main
   git remote add origin <あなたのリポジトリURL>
   git push -u origin main
   ```
2. https://vercel.com にGitHubでログイン → **Add New → Project** → このリポジトリをImport
3. Vercelが「Vite」を自動検出します。設定はそのままでOK（Build: `vite build` / Output: `dist`）
4. **Deploy** を押すと、数十秒で `https://xxxx.vercel.app` の公開URLが発行されます
5. 以降、`main`にpushするたびに自動で再デプロイされます

### 方法B：Vercel CLI（手元から直接）
```bash
npm i -g vercel
vercel           # 初回は質問に答えるだけ。プレビューURLが出る
vercel --prod    # 本番URLとして公開
```

---

## データについて（デモ版）
- 記録・豆・ミル・ドリッパー・定番レシピ・プロフィールは、**その端末/ブラウザのlocalStorage**に保存されます。
- 別の端末やブラウザとは共有されません（本番でバックエンドを入れると共有・同期できます）。

---

## 本番化（あとでAIとログインを有効化する）
1. **バックエンドを用意**（例：Supabase）。認証・データベース・サーバー関数をセットアップ。
2. `src/App.jsx` の先頭の `AI_ENABLED` を `true` にし、AI呼び出し（`callAI` / `genRecipe`）の `fetch` 先を、APIキーを持つ**自前のサーバー関数のURL**に変更（キーは絶対にフロントに置かない）。
3. `store`（`src/App.jsx` 内）の中身を localStorage から **Supabaseの読み書き**に差し替える。データ構造はそのまま流用できる設計です。
4. その後、Capacitor等で包めば App Store / Google Play 申請に進めます。

> メモ：依存パッケージのバージョンは作成時点のものです。うまくいかない場合は `npm create vite@latest` で最新のVite+Reactテンプレートを作り、`src/App.jsx` と `src/main.jsx`、`index.html` を本リポジトリの内容に置き換えてください。
