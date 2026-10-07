-- ============================================================
-- 運営者（管理者）の印を付ける
--
-- アプリは、ログイン中のユーザーの app_metadata.role が "admin" のとき、
-- 運営者向けの機能（設定の「データをダウンロード」）を表示する。
-- app_metadata は利用者が自分で書き換えられず、ここ（SQL）からのみ設定できる。
--
-- 実行方法：Supabase ダッシュボード → SQL Editor に貼り付け、
--   'あなたのメールアドレス' を運営者のメールアドレスに書き換えてから Run。
--   ※ リポジトリは公開なので、メールアドレスを書き込んだ状態ではコミットしないこと。
-- 反映：実行後、アプリで一度ログアウトしてログインし直す（ログイン情報に印が入るため）。
-- ============================================================

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
where email = 'あなたのメールアドレス';

-- 確認（role が admin になっていればOK）
select email, raw_app_meta_data ->> 'role' as role
from auth.users
where raw_app_meta_data ->> 'role' = 'admin';

-- 印を外すとき
-- update auth.users set raw_app_meta_data = raw_app_meta_data - 'role' where email = 'あなたのメールアドレス';
