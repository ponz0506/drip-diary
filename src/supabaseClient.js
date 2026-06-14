import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error("Supabaseの環境変数(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)が設定されていません。");
}

export const supabase = createClient(url, anon);
