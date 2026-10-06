-- ============================================================
-- user_data の変更履歴（サーバー側の自動バックアップ）
--
-- user_data が上書きされるたびに、上書き「前」の内容を user_data_history に
-- データベース自身が自動でコピーする。アプリのバグでデータが上書きされても、
-- 直前の内容が必ず残る。アプリ（クライアント）からは履歴の読み取りのみ可能で、
-- 追加・変更・削除はできない。
--
-- 実行方法：Supabase ダッシュボード → SQL Editor にこのファイルの内容を貼り付けて Run。
-- 何度実行しても同じ結果になるように書いてある。
-- ============================================================

-- 1. 履歴テーブル（アカウント削除時は一緒に削除される）
create table if not exists public.user_data_history (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  value      jsonb,
  changed_at timestamptz not null default now()
);
create index if not exists user_data_history_user_key_time
  on public.user_data_history (user_id, key, changed_at desc);

-- 2. 行レベルセキュリティ：自分の履歴の「読み取り」だけを許可
--    （insert / update / delete のポリシーを作らない＝アプリからは書き換え不可）
alter table public.user_data_history enable row level security;
drop policy if exists "read own history" on public.user_data_history;
create policy "read own history" on public.user_data_history
  for select using (auth.uid() = user_id);

-- 3. トリガー関数：上書き前の内容を履歴にコピーし、古い履歴を間引く
create or replace function public.capture_user_data_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 内容が変わっていない保存は記録しない
  if old.value is not distinct from new.value then
    return new;
  end if;

  insert into public.user_data_history (user_id, key, value)
  values (old.user_id, old.key, to_jsonb(old.value));

  -- 間引き：直近7日はすべて残す / 7〜90日前は1日の最後の1件だけ残す / 90日より前は削除
  delete from public.user_data_history h
  where h.user_id = old.user_id
    and h.key = old.key
    and (
      h.changed_at < now() - interval '90 days'
      or (
        h.changed_at < now() - interval '7 days'
        and exists (
          select 1 from public.user_data_history h2
          where h2.user_id = h.user_id
            and h2.key = h.key
            and date_trunc('day', h2.changed_at) = date_trunc('day', h.changed_at)
            and h2.changed_at > h.changed_at
        )
      )
    );

  return new;
end;
$$;

-- 4. トリガー登録（user_data が更新されるたびに自動実行）
drop trigger if exists user_data_history_trg on public.user_data;
create trigger user_data_history_trg
  after update on public.user_data
  for each row execute function public.capture_user_data_history();
