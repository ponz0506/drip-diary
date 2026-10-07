import React, { useState, useEffect, useLayoutEffect, useRef, useContext, createContext } from "react";
import { supabase } from "./supabaseClient";
import { ORIGIN_KB, PROCESS_KB, ROAST_KB, expectedFlavors } from "./coffeeKnowledge";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, Legend,
} from "recharts";

const ToastCtx = createContext(() => {});

// ====== デザイントークン ======
const css = `
@import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;600;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap');
:root{
  --cream:#f1e8db; --paper:#faf6ef; --espresso:#2c1e15; --bean:#4a3424;
  --mocha:#6b4e3a; --crema:#c98a4b; --terra:#b3552f; --muted:#9b8775; --line:#e3d8c8; --danger:#c0392b;
}
*{box-sizing:border-box;}
html,body{overflow-x:hidden;max-width:100%;}
.cd-serif{font-family:'Shippori Mincho',serif;}
.cd-sans{font-family:'Zen Kaku Gothic New',sans-serif;}
input[type=range]{-webkit-appearance:none;height:4px;border-radius:4px;background:var(--line);outline:none;}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:20px;height:20px;border-radius:50%;background:var(--terra);cursor:pointer;border:3px solid var(--paper);box-shadow:0 1px 4px rgba(44,30,21,.3);}
.cd-fade{animation:cdfade .4s ease both;}
@keyframes cdfade{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
.cd-sheet{animation:cdsheet .28s cubic-bezier(.22,.61,.36,1) both;}
@keyframes cdsheet{from{transform:translateY(100%);}to{transform:translateY(0);}}
@keyframes cdpop{0%{opacity:0;transform:scale(.5);}40%{opacity:1;transform:scale(1.1);}100%{opacity:.9;transform:scale(1);}}
.cd-pulse{animation:cdpulse 1s ease-in-out infinite;}
@keyframes cdpulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.35;transform:scale(.75);}}
.cd-spin{width:18px;height:18px;border:2px solid var(--line);border-top-color:var(--terra);border-radius:50%;animation:cdspin .7s linear infinite;}
@keyframes cdspin{to{transform:rotate(360deg);}}
@keyframes cdtoast{from{opacity:0;transform:translate(-50%,10px);}to{opacity:1;transform:translate(-50%,0);}}
::-webkit-scrollbar{width:8px;}::-webkit-scrollbar-thumb{background:var(--line);border-radius:8px;}
`;

// 香りの選択肢。SCA「Coffee Taster's Flavor Wheel」（2016年、SCA・World Coffee Research）の分類を基にしている。
// 以前の16語（柑橘・ベリー・トロピカル・完熟果実・ナッツ・ミルクチョコ・ダークチョコ・キャラメル・花・紅茶・ハーブ・緑茶・
// スパイス・黒糖・土っぽい・焦げ・燻製）はすべて残し、過去の記録の香りもそのまま使えるようにしている
const FLAVOR_TREE = {
  "フルーツ": ["柑橘", "ベリー", "ブドウ", "リンゴ・洋梨", "桃・杏", "トロピカル", "ドライフルーツ", "完熟果実"],
  "花・お茶": ["花", "ジャスミン", "紅茶", "緑茶"],
  "甘さ": ["キャラメル", "黒糖", "はちみつ", "メープル", "バニラ"],
  "ナッツ・チョコ": ["ナッツ", "アーモンド", "ミルクチョコ", "ダークチョコ"],
  "スパイス": ["スパイス", "シナモン", "クローブ", "黒こしょう"],
  "発酵・お酒": ["ワイン", "ラム・洋酒", "発酵感"],
  "ハーブ・植物": ["ハーブ", "青草"],
  "ロースト": ["トースト・穀物", "タバコ", "焦げ・燻製", "土っぽい"],
};
// さらに細かい香り（任意）。フレーバーホイールの一番外側の言葉を基にしている。
// 好みの集計は中分類（FLAVOR_TREE の各語）で行い、ここは記録の補足として残す
const FLAVOR_DETAIL = {
  "柑橘": ["レモン", "オレンジ", "グレープフルーツ", "ライム"],
  "ベリー": ["ブルーベリー", "ラズベリー", "ストロベリー", "ブラックベリー", "カシス"],
  "ブドウ": ["赤ブドウ", "白ブドウ", "マスカット"],
  "リンゴ・洋梨": ["青リンゴ", "赤リンゴ", "洋梨"],
  "桃・杏": ["桃", "杏", "チェリー", "プラム"],
  "トロピカル": ["パイナップル", "マンゴー", "パッションフルーツ", "ココナッツ"],
  "ドライフルーツ": ["レーズン", "プルーン", "ドライイチジク"],
  "花": ["ローズ", "カモミール", "ハイビスカス"],
  "紅茶": ["ダージリン", "アールグレイ"],
  "黒糖": ["モラセス（糖蜜）"],
  "ナッツ": ["ピーナッツ", "ヘーゼルナッツ", "くるみ"],
  "ダークチョコ": ["カカオ"],
  "スパイス": ["アニス", "ナツメグ"],
  "ワイン": ["赤ワイン", "白ワイン"],
  "ラム・洋酒": ["ラム", "ウイスキー"],
  "ハーブ": ["ミント", "セージ"],
  "トースト・穀物": ["トースト", "麦芽"],
  "土っぽい": ["杉・木"],
};
// 記録の香り（最大3つ）。各要素は { small: 中分類, detail: 小分類（任意） }。
// 以前の記録（香り1つ：flavorSmall / flavorDetail）も同じ形で読む
const MAX_FLAVORS = 3;
const flavorsOf = (l) => Array.isArray(l?.flavors) ? l.flavors : (l?.flavorSmall ? [{ small: l.flavorSmall, detail: l.flavorDetail || "" }] : []);
const flavorLabel = (f) => f.detail || f.small; // 表示は一番細かい言葉だけ
const flavorText = (l, sep = "、") => flavorsOf(l).map(flavorLabel).join(sep);
// 香り（小分類）から、今の大分類を引く（以前の大分類名「フルーツ系」などで保存された記録の表示・編集用）
const flavorBigOf = (small) => Object.keys(FLAVOR_TREE).find(b => FLAVOR_TREE[b].includes(small)) || "";
const TASTE_AXES = ["酸味", "苦味", "甘味", "コク", "濃度感", "雑味"];
const ROAST_LEVELS = ["浅煎り", "中浅煎り", "中煎り", "中深煎り", "深煎り"];
const AVATAR_EMOJIS = ["☕", "🫖", "🌱", "🫘", "🍵", "🔥", "💧", "⏱️", "📓", "✨", "🐈", "🌙"];
const AVATAR_COLORS = ["#4a3424", "#b3552f", "#6b4e3a", "#c98a4b", "#2c1e15", "#7a8b6f", "#4a6b7a", "#8a5a7a"];

const uid = () => Math.random().toString(36).slice(2, 9);

// ====== ストレージ（Supabase user_data テーブル） ======
// ログイン中のユーザーの行だけを読み書きする（RLSで保護）。
let _uid = null; // 現在のユーザーID（ログイン時にセット）
let _ready = false; // このユーザーのデータを正しく読み込めたか。読み込み前・失敗時は一切書き込まない
const store = {
  // 「データが無い」と「読み込みに失敗した」を区別する。失敗時は例外を投げる
  // （以前は失敗を「データ無し」と扱い、初期データで本物のデータを上書きしていた）
  async load(k) {
    const { data, error } = await supabase.from("user_data").select("value").eq("key", k).maybeSingle();
    if (error) throw error;
    return data ? { exists: true, value: data.value } : { exists: false, value: undefined };
  },
  // 保存できたら true（通常の保存は結果を見ないが、バックアップからの復元では確認する）
  async set(k, v, { force = false } = {}) {
    try {
      if (!_uid || (!_ready && !force)) return false;
      const { error } = await supabase.from("user_data").upsert({ user_id: _uid, key: k, value: v });
      return !error;
    } catch (e) { return false; /* 通信エラー等 */ }
  },
};

// ====== バックアップ（書き出し・復元）======
const BACKUP_KEYS = ["cd_beans", "cd_grinders", "cd_drippers", "cd_favorites", "cd_logs", "cd_proposed", "cd_profile", "cd_bean_suggestions"];
const downloadJSON = (obj, filename) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
const backupFileName = (suffix = "") => {
  const d = new Date(), p = (n) => String(n).padStart(2, "0");
  return `drip-diary-backup-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${suffix}.json`;
};

// ====== 変更履歴（user_data_history、DBのトリガーが自動で記録）======
// 履歴の各行は「その変更で上書きされる前の値」。次の行（または現在の値）と比べると、何をした変更かが分かる
const CHANGE_NOUNS = { cd_logs: "記録", cd_beans: "豆", cd_favorites: "定番レシピ", cd_grinders: "ミル", cd_drippers: "ドリッパー" };
// 1つのキーの「変更前→変更後」から、「記録を追加」「豆を編集」のような説明を作る
const describeChange = (key, before, after, nameOfBean) => {
  if (key === "cd_proposed") return [{ text: "次の一杯の提案を更新", minor: true }];
  if (key === "cd_profile") return [{ text: "プロフィールを編集", minor: true }];
  if (key === "cd_bean_suggestions") return [{ text: "次に試したい豆を提案" }];
  const noun = CHANGE_NOUNS[key];
  if (!noun) return [];
  const label = (x) => key === "cd_logs"
    ? `${new Date(x.createdAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} ${nameOfBean(x.beanId) || x.beanName || "不明な豆"} ★${x.satisfaction ?? "-"}`
    : x.name;
  const a = Array.isArray(before) ? before : [], b = Array.isArray(after) ? after : [];
  const am = new Map(a.map(x => [x.id, x])), bm = new Map(b.map(x => [x.id, x]));
  const out = [];
  b.filter(x => !am.has(x.id)).forEach(x => out.push({ text: `${noun}を追加`, sub: label(x) }));
  a.filter(x => !bm.has(x.id)).forEach(x => out.push({ text: `${noun}を削除`, sub: label(x) }));
  b.filter(x => am.has(x.id) && JSON.stringify(am.get(x.id)) !== JSON.stringify(x)).forEach(x => {
    const o = am.get(x.id);
    const verb = key === "cd_beans" && !o.archived && x.archived ? "アーカイブ" : key === "cd_beans" && o.archived && !x.archived ? "使用中に戻す" : "編集";
    out.push({ text: `${noun}を${verb}`, sub: label(x) });
  });
  // 同じ種類の変更が複数あるときは1行にまとめる（例：記録を追加（3件））
  const merged = [];
  out.forEach(c => {
    const m = merged.find(x => x.text === c.text);
    if (m) { m.count++; if (m.subs.length < 2) m.subs.push(c.sub); } else merged.push({ text: c.text, count: 1, subs: [c.sub] });
  });
  return merged.map(m => ({ text: m.count > 1 ? `${m.text}（${m.count}件）` : m.text, sub: m.subs.join("、") + (m.count > 2 ? " ほか" : "") }));
};
const serverHistory = {
  // 変更の一覧（新しい順）。1分以内に続けて保存されたもの（例：記録と次の一杯）は1つの変更にまとめる
  async changes(current) {
    const { data, error } = await supabase.from("user_data_history").select("key, value, changed_at").order("changed_at", { ascending: false }).limit(150);
    if (error) throw error;
    const rows = data || [];
    // 豆の名前は、現在と履歴に出てくる豆から探す
    const beanPool = [...(current.cd_beans || []), ...rows.filter(r => r.key === "cd_beans").flatMap(r => Array.isArray(r.value) ? r.value : [])];
    const nameOfBean = (id) => beanPool.find(b => b.id === id)?.name;
    const groups = [];
    rows.forEach((r, i) => {
      // 変更後の値＝同じキーで1つ新しい履歴の値（無ければ現在の値）
      const newer = rows.slice(0, i).reverse().find(x => x.key === r.key);
      const items = describeChange(r.key, r.value, newer ? newer.value : current[r.key], nameOfBean);
      const t = new Date(r.changed_at).getTime();
      const last = groups[groups.length - 1];
      if (last && last.at - t < 60000) { last.at = t; last.items.unshift(...items); }
      else groups.push({ at: t, items });
    });
    // 主な変更があるときは「次の一杯の提案を更新」などの付随的な変更は表示しない
    return groups.map(g => {
      const major = g.items.filter(x => !x.minor);
      const items = (major.length ? major : g.items).filter((x, i, arr) => arr.findIndex(y => y.text === x.text && y.sub === x.sub) === i);
      return { at: g.at, items };
    }).filter(g => g.items.length);
  },
  // 時点 at の「直前」の全データ（＝1つ前の変更の「直後」の状態）。各キーについて at 以降で最初の履歴（＝その変更の前の値）、無ければ現在の値
  async stateBefore(at, current) {
    const iso = new Date(at).toISOString();
    const out = {};
    for (const k of BACKUP_KEYS) {
      const { data, error } = await supabase.from("user_data_history").select("value").eq("key", k).gte("changed_at", iso).order("changed_at", { ascending: true }).limit(1).maybeSingle();
      if (error) throw error;
      out[k] = data ? data.value : current[k];
    }
    return out;
  },
};

const SEED_BEAN = {
  id: uid(), name: "エチオピア イルガチェフェ",
  origin: "エチオピア / イルガチェフェ", variety: "ヘアルーム", process: "ウォッシュド",
  roastDate: "", roastLevel: "中浅煎り", shop: "近所の自家焙煎店",
  roasterNote: "華やかな柑橘とジャスミン、紅茶のような余韻",
};
const SEED_GRINDER = { id: uid(), name: "Comandante C40", type: "ハンドミル", note: "" };
const SEED_DRIPPER = { id: uid(), name: "Hario V60 02", type: "円錐", note: "" };

// 秒 ⇄ 分秒 の表示ヘルパー
const fmtTime = (s) => `${Math.floor(s / 60)}分${String(s % 60).padStart(2, "0")}秒`;

// 注ぐ量の％（全体湯量比）⇄ g の変換。pct が無い投は ml から逆算する
const pourPct = (p, water) => (typeof p.pct === "number" ? p.pct : (Number(water) ? Math.round((Number(p.ml) || 0) / Number(water) * 1000) / 10 : 0));
const pctToMl = (pct, water) => Math.round((Number(water) || 0) * (Number(pct) || 0) / 100);

// AIが返した注ぎを現実的なタイミングに整える（間隔30〜45秒、近すぎ/離れすぎを補正）
const sanitizePours = (pours, water) => {
  let ps = Array.isArray(pours) ? pours.filter(p => p && (typeof p.ml === "number" || typeof p.ml === "string")) : [];
  if (!ps.length) return [{ label: "1投目", t: 0, ml: Number(water) || 240 }];
  ps = ps.map((p, i) => ({ label: p.label || `${i + 1}投目`, t: Number(p.t) || 0, ml: Math.max(0, Math.round(Number(p.ml) || 0)), ...(Number(p.rate) > 0 ? { rate: Number(p.rate) } : {}) }));
  ps.sort((a, b) => a.t - b.t);
  ps[0].t = 0; ps[0].label = "1投目";
  for (let i = 1; i < ps.length; i++) {
    let gap = ps[i].t - ps[i - 1].t;
    if (!Number.isFinite(gap) || gap < 15) gap = 30; // 近すぎ→30秒
    if (gap > 60) gap = 45;                          // 離れすぎ→45秒
    ps[i].t = ps[i - 1].t + gap;
    ps[i].label = `${i + 1}投目`;
  }
  return ps;
};

// ====== 小物 ======
function Btn({ children, onClick, kind = "primary", disabled, style }) {
  const base = { fontFamily: "'Zen Kaku Gothic New',sans-serif", border: "none", borderRadius: 14, padding: "13px 20px", fontSize: 15, fontWeight: 700, cursor: disabled ? "default" : "pointer", transition: "transform .1s, opacity .2s", opacity: disabled ? .4 : 1, ...style };
  const kinds = {
    primary: { background: "var(--terra)", color: "#fff" },
    ghost: { background: "transparent", color: "var(--mocha)", border: "1.5px solid var(--line)" },
    soft: { background: "var(--cream)", color: "var(--bean)" },
  };
  return <button disabled={disabled} onClick={onClick} style={{ ...base, ...kinds[kind] }}
    onMouseDown={e => !disabled && (e.currentTarget.style.transform = "scale(.97)")}
    onMouseUp={e => (e.currentTarget.style.transform = "scale(1)")}
    onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}>{children}</button>;
}
const Field = ({ label, children }) => (
  <label style={{ display: "block", marginBottom: 16 }}>
    <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--mocha)", letterSpacing: ".04em", display: "block", marginBottom: 6 }}>{label}</span>
    {children}
  </label>
);
const inputStyle = { width: "100%", fontFamily: "'Zen Kaku Gothic New',sans-serif", fontSize: 15, padding: "11px 13px", borderRadius: 12, border: "1.5px solid var(--line)", background: "var(--paper)", color: "var(--espresso)", outline: "none" };
const cellInput = { width: "100%", minWidth: 0, fontFamily: "'Zen Kaku Gothic New',sans-serif", fontSize: 13.5, padding: "8px 4px", borderRadius: 8, border: "1.5px solid var(--line)", background: "var(--paper)", color: "var(--espresso)", outline: "none", textAlign: "center" };

// 線形アイコン
function Icon({ name, size = 22 }) {
  const p = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
    home: <><path d="M4 11l8-6 8 6" {...p} /><path d="M6.5 9.5V19h11V9.5" {...p} /></>,
    brew: <><path d="M8 3.2c-.5.7-.5 1.6 0 2.3M11.5 3.2c-.5.7-.5 1.6 0 2.3" {...p} /><path d="M5 9h11v3.5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z" {...p} /><path d="M16 10h2.2a2 2 0 0 1 0 4H16" {...p} /><path d="M5 20h12" {...p} /></>,
    diary: <><path d="M12 7C10.4 5.8 8.4 5.3 6 5.5v12.8c2.4-.2 4.4.3 6 1.5 1.6-1.2 3.6-1.7 6-1.5V5.5c-2.4-.2-4.4.3-6 1.5z" {...p} /><path d="M12 7v12.8" {...p} /></>,
    shelf: <><rect x="4" y="4" width="16" height="16" rx="2.2" {...p} /><path d="M4 10h16M4 15h16" {...p} /></>,
    user: <><circle cx="12" cy="8.5" r="3.2" {...p} /><path d="M5.5 19.5a6.5 6.5 0 0 1 13 0" {...p} /></>,
    dripper: <><path d="M5 6.5h14l-6 8v3.5h-2v-3.5z" {...p} /></>,
    recipe: <><rect x="6" y="3.5" width="12" height="17" rx="2" {...p} /><path d="M9 8.5h6M9 12h6M9 15.5h4" {...p} /></>,
    check: <path d="M5 12.5l4.5 4.5L19 7" {...p} />,
    pencil: <><path d="M14.5 5.5l4 4M4 20l1-4 11-11 3 3-11 11z" {...p} /></>,
    refresh: <><path d="M20 11a8 8 0 1 0-.6 4" {...p} /><path d="M20 4v5h-5" {...p} /></>,
    trash: <><path d="M5 7h14M10 7V5h4v2M6 7l1 13h10l1-13" {...p} /></>,
    gear: <><circle cx="12" cy="12" r="3.2" {...p} /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" {...p} /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

// 数値入力（空欄OK・先頭ゼロなし・確定時に空なら0）
function NumberInput({ value, onChange, style, placeholder, ...rest }) {
  const [focused, setFocused] = useState(false);
  const [str, setStr] = useState("");
  const display = focused ? str : (value === "" || value === null || value === undefined ? "" : String(value));
  return (
    <input type="text" inputMode="decimal" placeholder={placeholder} style={style} value={display} {...rest}
      onFocus={e => { setFocused(true); setStr(value === 0 || value ? String(value) : ""); selectAllSoon(e.target); }}
      onChange={e => { let v = e.target.value.replace(/[^0-9.]/g, ""); v = v.replace(/^0+(?=\d)/, ""); setStr(v); if (v !== "" && !isNaN(Number(v))) onChange(Number(v)); }}
      onBlur={() => { setFocused(false); if (str === "" || isNaN(Number(str))) onChange(0); }} />
  );
}

// フォーカス直後に全選択（クリック時のmouseupで選択が外れるのを避けるため次フレームで）
const selectAllSoon = (el) => requestAnimationFrame(() => { if (document.activeElement === el) el.select(); });

// "45"→45秒 / "130"→1分30秒 / "1:30"→1分30秒 / "90"→1分30秒（数字だけで入力できるように）
const parseTime = (str) => {
  const t = String(str).trim();
  if (!t) return 0;
  if (t.includes(":")) { const [m, sec] = t.split(":"); return (Number(m) || 0) * 60 + (Number(sec) || 0); }
  const d = t.replace(/D/g, "");
  if (d.length <= 2) return Number(d) || 0;
  return Number(d.slice(0, -2)) * 60 + Number(d.slice(-2));
};
const fmtMSS = (s) => `${Math.floor((s || 0) / 60)}:${String((s || 0) % 60).padStart(2, "0")}`;

function TimeInput({ value, onChange, style, ...rest }) {
  const [focused, setFocused] = useState(false);
  const [str, setStr] = useState("");
  return (
    <input type="text" inputMode="numeric" placeholder="0:00" style={style} value={focused ? str : fmtMSS(value)} {...rest}
      onFocus={e => { setFocused(true); setStr(fmtMSS(value)); selectAllSoon(e.target); }}
      onChange={e => { const v = e.target.value.replace(/[^0-9:]/g, ""); setStr(v); onChange(parseTime(v)); }}
      onBlur={() => setFocused(false)} />
  );
}

// 三点リーダーメニュー
function CardMenu({ items }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
      <button onClick={() => setOpen(!open)} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}>⋯</button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
          <div className="cd-fade" style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 31, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 8px 24px rgba(44,30,21,.2)", overflow: "hidden", minWidth: 130 }}>
            {items.map((it, i) => (
              <button key={i} onClick={() => { setOpen(false); it.onClick(); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "11px 16px", border: "none", borderTop: i ? "1px solid var(--line)" : "none", background: "none", cursor: "pointer", fontFamily: "'Zen Kaku Gothic New',sans-serif", fontSize: 13.5, fontWeight: 700, color: it.danger ? "var(--terra)" : "var(--bean)" }}>{it.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ====== アプリ本体 ======
export default function App() {
  const [screen, setScreen] = useState("home");
  const [beans, setBeans] = useState([]);
  const [grinders, setGrinders] = useState([]);
  const [drippers, setDrippers] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [logs, setLogs] = useState([]);
  const [proposed, setProposed] = useState(null);
  const [suggestions, setSuggestions] = useState([]); // 次に試したい豆の提案（新しい順）
  const [draft, setDraft] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [detailFrom, setDetailFrom] = useState("home");
  const [profile, setProfile] = useState(null);
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadTry, setLoadTry] = useState(0); // 再試行用

  // セッション監視（ログイン/ログアウト）
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      _uid = data.session?.user?.id || null;
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      _uid = s?.user?.id || null;
      setSession(s);
      // トークン自動更新（TOKEN_REFRESHED）などでは画面を動かさない
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") setScreen("home");
      if (!s) {
        _ready = false;
        setLoaded(false); setLoadError(false);
        setBeans([]); setGrinders([]); setDrippers([]); setFavorites([]); setLogs([]); setProposed(null); setProfile(null); setSuggestions([]);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // ログイン後にこのユーザーのデータを読み込む。
  // セッションのオブジェクトはトークン更新のたびに変わるので、ユーザーIDが変わったときだけ読み込む
  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      _ready = false;
      setLoaded(false); setLoadError(false);
      try {
        // ログインが有効かをサーバーに確認してから読む（無効なトークンだとRLSでエラーなしの「0件」が返り、新規ユーザーと誤認するため）
        const { data: u, error: ue } = await supabase.auth.getUser();
        if (ue || u?.user?.id !== userId) throw ue || new Error("auth mismatch");
        const keys = BACKUP_KEYS;
        const r = Object.fromEntries(await Promise.all(keys.map(async k => [k, await store.load(k)])));
        if (cancelled) return;
        // 初期データは「本当に初めてのユーザー」（どのデータも一度も保存されていない）にだけ入れる
        const isNewUser = keys.every(k => !r[k].exists);
        const seed = async (k, v) => { if (isNewUser && !r[k].exists) { await store.set(k, v, { force: true }); return v; } return r[k].value; };
        const b = await seed("cd_beans", [SEED_BEAN]);
        const g = await seed("cd_grinders", [SEED_GRINDER]);
        const d = await seed("cd_drippers", [SEED_DRIPPER]);
        let pf = r.cd_profile.value;
        if (!r.cd_profile.exists) { pf = { name: session.user.user_metadata?.display_name || (session.user.email || "user").split("@")[0], since: Date.now() }; await store.set("cd_profile", pf, { force: true }); }
        if (cancelled) return;
        setBeans(b || []); setGrinders(g || []); setDrippers(d || []);
        setFavorites(r.cd_favorites.value || []); setLogs(r.cd_logs.value || []); setProposed(r.cd_proposed.value ?? null); setProfile(pf);
        setSuggestions(r.cd_bean_suggestions.value || []);
        _ready = true;
        setLoaded(true);
      } catch (e) {
        // 読み込みに失敗：何も書き込まず、再試行を促す
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, loadTry]);

  const saveProfile = (p) => { setProfile(p); store.set("cd_profile", p); };
  const saveBeans = (b) => { setBeans(b); store.set("cd_beans", b); };
  const saveGrinders = (g) => { setGrinders(g); store.set("cd_grinders", g); };
  const saveDrippers = (d) => { setDrippers(d); store.set("cd_drippers", d); };
  const saveFavorites = (f) => { setFavorites(f); store.set("cd_favorites", f); };
  const saveLogs = (l) => { setLogs(l); store.set("cd_logs", l); };
  const saveProposed = (p) => { setProposed(p); store.set("cd_proposed", p); };
  const saveSuggestions = (x) => { setSuggestions(x); store.set("cd_bean_suggestions", x); };

  // バックアップ：今のデータを1つのオブジェクトに / ファイルの中身で全データを置き換え
  const makeBackup = () => ({
    app: "drip-diary", version: 1, exportedAt: new Date().toISOString(),
    data: { cd_beans: beans, cd_grinders: grinders, cd_drippers: drippers, cd_favorites: favorites, cd_logs: logs, cd_proposed: proposed, cd_profile: profile, cd_bean_suggestions: suggestions },
  });
  const restoreBackup = async (backup) => {
    const d = backup.data;
    const next = { cd_beans: d.cd_beans, cd_grinders: d.cd_grinders, cd_drippers: d.cd_drippers, cd_favorites: d.cd_favorites, cd_logs: d.cd_logs, cd_proposed: d.cd_proposed ?? null, cd_profile: d.cd_profile || profile, cd_bean_suggestions: d.cd_bean_suggestions || [] };
    const results = await Promise.all(BACKUP_KEYS.map(k => store.set(k, next[k])));
    setBeans(next.cd_beans); setGrinders(next.cd_grinders); setDrippers(next.cd_drippers); setFavorites(next.cd_favorites);
    setLogs(next.cd_logs); setProposed(next.cd_proposed); setProfile(next.cd_profile); setSuggestions(next.cd_bean_suggestions);
    return results.every(Boolean);
  };

  const [editingId, setEditingId] = useState(null);
  const [flowStep, setFlowStep] = useState("rec1");
  const [showResume, setShowResume] = useState(false);

  // 記録フロー内の現在ステップを覚えておく（復帰用）
  useEffect(() => {
    if (["rec1", "rec2", "rec3", "timer", "chat"].includes(screen)) setFlowStep(screen);
  }, [screen]);

  // 「淹れる」タブを押したとき：入力途中があれば確認、なければ新規開始
  const onBrew = () => { if (draft) setShowResume(true); else startRecord(); };

  const [pendingNav, setPendingNav] = useState(null);
  const [confirmDelId, setConfirmDelId] = useState(null);
  const [confirmDelAccount, setConfirmDelAccount] = useState(false);

  const deleteAccount = async () => {
    setConfirmDelAccount(false);
    try {
      const { data, error } = await supabase.functions.invoke("delete-account");
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await supabase.auth.signOut();
    } catch (e) { console.error("アカウント削除:", e); notify("アカウント削除に失敗しました。少し時間をおいて再度お試しください。"); }
  };
  // タブ切り替え時：編集中なら確認、それ以外は通常遷移
  const requestNav = (key) => {
    if (editingId && ["rec1", "rec2", "rec3", "timer", "chat"].includes(screen)) { setPendingNav(key); return; }
    if (key === "rec") onBrew(); else setScreen(key);
  };
  const confirmLeave = () => {
    const key = pendingNav; setPendingNav(null);
    setEditingId(null); setDraft(null);
    if (key === "rec") startRecord(); else setScreen(key);
  };

  const deleteLog = (id) => {
    saveLogs(logs.filter(l => l.id !== id));
    notify("日記から削除しました");
    setScreen(detailFrom || "history");
  };

  const startRecord = (preset, step = "rec1", editId = null) => {
    setEditingId(editId);
    setDraft({
      id: editId || uid(), beanId: preset?.beanId || (beans[0]?.id ?? null),
      grinderId: preset?.grinderId || (grinders[0]?.id ?? null),
      dripperId: preset?.dripperId || (drippers[0]?.id ?? null),
      beanName: preset?.beanName || "", grinderName: preset?.grinderName || "", dripperName: preset?.dripperName || "",
      grounds: preset?.grounds || 15, water: preset?.water || 240, temp: preset?.temp || 92,
      grind: preset?.grind || 20, flowRate: preset?.flowRate || 4, pourUnit: preset?.pourUnit || "g", rateMode: preset?.rateMode || "all", pours: preset?.pours || [{ label: "1投目", t: 0, ml: 60 }, { label: "2投目", t: 45, ml: 90 }, { label: "3投目", t: 90, ml: 90 }],
      taste: editId ? (preset?.taste || { 酸味: 3, 苦味: 3, 甘味: 3, コク: 3, 濃度感: 3, 雑味: 1 }) : { 酸味: 3, 苦味: 3, 甘味: 3, コク: 3, 濃度感: 3, 雑味: 1 },
      flavors: editId ? flavorsOf(preset) : [], flavorBig: editId ? (flavorBigOf(preset?.flavorSmall) || preset?.flavorBig || "") : "", flavorSmall: editId ? (preset?.flavorSmall || "") : "", flavorDetail: editId ? (preset?.flavorDetail || "") : "", memo: editId ? (preset?.memo || "") : "",
      satisfaction: editId ? (preset?.satisfaction || 3) : 3, createdAt: editId ? (preset?.createdAt || Date.now()) : Date.now(),
      chat: editId ? (preset?.chat || []) : [], nextRecipe: editId ? (preset?.nextRecipe || null) : null,
    });
    setScreen(step);
  };

  // 新規なら先頭に追加、編集（同じid）なら置き換え
  const saveDraftAsLog = (d0) => {
    const exists = logs.some(l => l.id === d0.id);
    // 新規記録は必ずその時点の日時にする（プリセット由来の日付を引き継がない）
    const d = exists ? d0 : { ...d0, createdAt: d0.createdAt || Date.now() };
    const newLogs = exists ? logs.map(l => (l.id === d.id ? d : l)) : [d, ...logs];
    saveLogs(newLogs);
    if (d.nextRecipe) {
      // 次の一杯は「レシピ情報」だけを保持する（日付・味・満足度などの結果は引き継がない）
      const r = d.nextRecipe;
      saveProposed({
        grounds: r.grounds, water: r.water, temp: r.temp, grind: r.grind, pourUnit: r.pourUnit || "g", rateMode: r.rateMode || "all", flowRate: r.flowRate || 4,
        pours: (r.pours || []).map(p => ({ ...p })), reason: r.reason || "",
        beanId: d.beanId, grinderId: d.grinderId, dripperId: d.dripperId,
        beanName: d.beanName, grinderName: d.grinderName, dripperName: d.dripperName,
      });
    }
    notify(exists ? "記録を更新しました" : "日記に保存しました");
    if (exists) { setDetailId(d.id); setScreen("logdetail"); } else { setScreen("home"); }
    setEditingId(null); setDraft(null);
  };

  const [toast, setToast] = useState(null);
  const notify = (msg) => setToast({ msg, id: Date.now() });
  useEffect(() => {
    if (!toast) return;
    const id = toast.id;
    const t = setTimeout(() => setToast(c => (c && c.id === id ? null : c)), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  if (!authReady) return <div style={{ minHeight: "100vh", background: "var(--cream)" }} />;

  if (!session) return <Auth />;

  if (loadError) return (
    <div style={{ minHeight: "100vh", background: "var(--cream)", display: "flex", alignItems: "center", justifyContent: "center", padding: 28 }}>
      <div style={{ background: "var(--paper)", borderRadius: 20, padding: 24, maxWidth: 340, width: "100%", textAlign: "center" }}>
        <div className="cd-serif" style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>データを読み込めませんでした</div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7, marginBottom: 18 }}>通信状態を確認して、もう一度お試しください。保存されているデータには影響ありません。</div>
        <Btn style={{ width: "100%" }} onClick={() => setLoadTry(n => n + 1)}>再試行</Btn>
      </div>
    </div>
  );

  if (!loaded) return <div style={{ minHeight: "100vh", background: "var(--cream)" }} />;

  return (
    <ToastCtx.Provider value={notify}>
    <div className="cd-sans" style={{ minHeight: "100vh", width: "100%", overflowX: "hidden", background: "var(--cream)", color: "var(--espresso)", maxWidth: 480, margin: "0 auto", position: "relative" }}>
      <style>{css}</style>
      <Header screen={screen} setScreen={setScreen} detailFrom={detailFrom} editing={!!editingId} />
      <div style={{ padding: "0 18px 110px" }}>
        {screen === "home" && <Home beans={beans} logs={logs} proposed={proposed} startRecord={startRecord} setScreen={setScreen} openLog={(id) => { setDetailId(id); setDetailFrom("home"); setScreen("logdetail"); }} />}
        {screen === "logdetail" && (() => { const l = logs.find(x => x.id === detailId); return l ? <LogDetail log={l} bean={beans.find(b => b.id === l.beanId)} grinder={grinders.find(g => g.id === l.grinderId)} dripper={drippers.find(d => d.id === l.dripperId)} startRecord={startRecord} onEdit={() => startRecord(l, "rec1", l.id)} onRequestDelete={() => setConfirmDelId(l.id)} /> : <div style={{ color: "var(--muted)" }}>記録が見つかりません。</div>; })()}
        {screen === "history" && <History logs={logs} beans={beans} grinders={grinders} drippers={drippers} startRecord={startRecord} openLog={(id) => { setDetailId(id); setDetailFrom("history"); setScreen("logdetail"); }} />}
        {screen === "karte" && <Karte beans={beans} saveBeans={saveBeans} logs={logs} grinders={grinders} saveGrinders={saveGrinders} drippers={drippers} saveDrippers={saveDrippers} favorites={favorites} saveFavorites={saveFavorites} startRecord={startRecord} />}
        {screen === "profile" && <Profile suggestions={suggestions} saveSuggestions={saveSuggestions} makeBackup={makeBackup} restoreBackup={restoreBackup} profile={profile} saveProfile={saveProfile} logs={logs} beans={beans} favorites={favorites} email={session.user.email} onLogout={() => supabase.auth.signOut()} onRequestDeleteAccount={() => setConfirmDelAccount(true)} />}
        {screen === "rec1" && <Rec1 draft={draft} setDraft={setDraft} beans={beans} saveBeans={saveBeans} setScreen={setScreen} editing={!!editingId} onSaveDirect={() => saveDraftAsLog({ ...draft })} />}
        {screen === "rec2" && <Rec2 editing={!!editingId} onSaveDirect={() => saveDraftAsLog({ ...draft })} draft={draft} setDraft={setDraft} beans={beans} grinders={grinders} saveGrinders={saveGrinders} drippers={drippers} saveDrippers={saveDrippers} favorites={favorites} saveFavorites={saveFavorites} setScreen={setScreen} />}
        {screen === "rec3" && <Rec3 draft={draft} setDraft={setDraft} setScreen={setScreen} editing={!!editingId} onSaveDirect={() => saveDraftAsLog({ ...draft })} />}        {screen === "chat" && <Chat draft={draft} setDraft={setDraft} beans={beans} grinders={grinders} drippers={drippers} favorites={favorites} saveFavorites={saveFavorites} logs={logs}
          onSave={(d) => saveDraftAsLog(d)} />}
      </div>
      <Nav screen={screen} onTab={requestNav} />
      {toast && (
        <div key={toast.id} style={{ position: "fixed", bottom: 92, left: "50%", transform: "translateX(-50%)", zIndex: 50, background: "var(--espresso)", color: "var(--cream)", padding: "11px 22px", borderRadius: 24, fontSize: 13.5, fontWeight: 700, boxShadow: "0 8px 28px rgba(44,30,21,.35)", animation: "cdtoast .3s ease both", whiteSpace: "nowrap" }}>{toast.msg}</div>
      )}
      {showResume && (
        <div onClick={() => setShowResume(false)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(44,30,21,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 28 }}>
          <div onClick={e => e.stopPropagation()} className="cd-fade" style={{ background: "var(--paper)", borderRadius: 20, padding: 24, maxWidth: 340, width: "100%", boxShadow: "0 16px 40px rgba(44,30,21,.3)" }}>
            <div className="cd-serif" style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>入力途中の記録があります</div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7, marginBottom: 18 }}>前回の続きから入力できます。最初からやり直すと、入力中の内容は破棄されます。</div>
            <Btn style={{ width: "100%", marginBottom: 10 }} onClick={() => { setShowResume(false); setScreen(flowStep || "rec1"); }}>続きから入力する</Btn>
            <Btn kind="ghost" style={{ width: "100%" }} onClick={() => { setShowResume(false); startRecord(); }}>最初から始める</Btn>
          </div>
        </div>
      )}
      {pendingNav && (
        <div onClick={() => setPendingNav(null)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(44,30,21,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 28 }}>
          <div onClick={e => e.stopPropagation()} className="cd-fade" style={{ background: "var(--paper)", borderRadius: 20, padding: 24, maxWidth: 340, width: "100%", boxShadow: "0 16px 40px rgba(44,30,21,.3)" }}>
            <div className="cd-serif" style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>編集を中断しますか？</div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7, marginBottom: 18 }}>このまま移動すると、編集中の内容は保存されずに失われます。</div>
            <Btn style={{ width: "100%", marginBottom: 10, background: "var(--danger)" }} onClick={confirmLeave}>破棄して移動する</Btn>
            <Btn kind="ghost" style={{ width: "100%" }} onClick={() => setPendingNav(null)}>編集を続ける</Btn>
          </div>
        </div>
      )}
      {confirmDelId && (
        <div onClick={() => setConfirmDelId(null)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(44,30,21,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 28 }}>
          <div onClick={e => e.stopPropagation()} className="cd-fade" style={{ background: "var(--paper)", borderRadius: 20, padding: 24, maxWidth: 340, width: "100%", boxShadow: "0 16px 40px rgba(44,30,21,.3)" }}>
            <div className="cd-serif" style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>この記録を削除しますか？</div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7, marginBottom: 18 }}>削除すると元に戻せません。</div>
            <Btn style={{ width: "100%", marginBottom: 10, background: "var(--danger)" }} onClick={() => { const id = confirmDelId; setConfirmDelId(null); deleteLog(id); }}>削除する</Btn>
            <Btn kind="ghost" style={{ width: "100%" }} onClick={() => setConfirmDelId(null)}>キャンセル</Btn>
          </div>
        </div>
      )}
      {confirmDelAccount && (
        <div onClick={() => setConfirmDelAccount(false)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(44,30,21,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 28 }}>
          <div onClick={e => e.stopPropagation()} className="cd-fade" style={{ background: "var(--paper)", borderRadius: 20, padding: 24, maxWidth: 340, width: "100%", boxShadow: "0 16px 40px rgba(44,30,21,.3)" }}>
            <div className="cd-serif" style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>アカウントを削除しますか？</div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7, marginBottom: 18 }}>アカウントと、これまでの記録・豆・レシピなどすべてのデータが削除されます。元に戻すことはできません。</div>
            <Btn style={{ width: "100%", marginBottom: 10, background: "var(--danger)" }} onClick={deleteAccount}>削除する</Btn>
            <Btn kind="ghost" style={{ width: "100%" }} onClick={() => setConfirmDelAccount(false)}>キャンセル</Btn>
          </div>
        </div>
      )}
      {screen === "timer" && draft && (
        <DripTimer draft={draft} grinders={grinders} drippers={drippers}
          onFinish={() => setScreen("rec3")} onExit={() => setScreen("rec2")} />
      )}
    </div>
    </ToastCtx.Provider>
  );
}

function Header({ screen, setScreen, detailFrom, editing }) {
  const back = { rec1: "home", rec2: "rec1", rec3: "rec2", chat: "rec3", karte: "home", history: "home", logdetail: detailFrom, profile: "home" };
  const inFlow = ["rec1", "rec2", "rec3", "timer", "chat"].includes(screen);
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 10, background: "rgba(241,232,219,.92)", backdropFilter: "blur(8px)", padding: "18px 18px 12px", display: "flex", alignItems: "center", gap: 10 }}>
      {back[screen] ? (
        <button onClick={() => setScreen(back[screen])} style={{ background: "none", border: "none", fontSize: 22, color: "var(--mocha)", cursor: "pointer", lineHeight: 1 }}>‹</button>
      ) : <span style={{ fontSize: 22 }}>☕</span>}
      <div className="cd-serif" style={{ fontSize: 19, fontWeight: 700, letterSpacing: ".02em" }}>
        {{ home: "Drip Diary", karte: "My棚", history: "日記", logdetail: detailFrom === "history" ? "日記" : "ホーム", profile: "プロフィール", rec1: "豆を選ぶ", rec2: "レシピ", rec3: "味わいメモ", chat: "AI診断" }[screen]}
      </div>
      {editing && inFlow && (
        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700, color: "var(--cream)", background: "var(--terra)", padding: "4px 11px", borderRadius: 20 }}>編集中</span>
      )}
    </div>
  );
}

// ====== ホーム ======
// ====== 継続の見える化（ストリーク・カレンダー・バッジ）======
const dayKey = (d) => new Date(d).toLocaleDateString("sv-SE"); // YYYY-MM-DD（ローカル）

function ProgressSection({ logs, beans, openLog }) {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });

  const byDay = {};
  logs.forEach(l => { const k = dayKey(l.createdAt); (byDay[k] ||= []).push(l); });

  const streak = (() => {
    const set = new Set(Object.keys(byDay));
    let s = 0; const c = new Date();
    if (!set.has(dayKey(Date.now()))) c.setDate(c.getDate() - 1);
    while (set.has(dayKey(c))) { s++; c.setDate(c.getDate() - 1); }
    return s;
  })();

  const monthLogs = logs.filter(l => { const d = new Date(l.createdAt); return d.getFullYear() === ym.y && d.getMonth() === ym.m; });
  const monthDays = new Set(monthLogs.map(l => dayKey(l.createdAt))).size;

  const first = new Date(ym.y, ym.m, 1);
  const startWd = first.getDay();
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWd; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const cupColor = (n) => n <= 0 ? "transparent" : n === 1 ? "rgba(179,85,47,.45)" : n === 2 ? "rgba(179,85,47,.72)" : "var(--terra)";
  const todayK = dayKey(Date.now());
  const monthLabel = `${ym.y}年${ym.m + 1}月`;
  const shiftMonth = (delta) => { const d = new Date(ym.y, ym.m + delta, 1); setYm({ y: d.getFullYear(), m: d.getMonth() }); };
  const isCurMonth = ym.y === now.getFullYear() && ym.m === now.getMonth();

  const wd = ["日", "月", "火", "水", "木", "金", "土"];

  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 18, padding: 18, marginBottom: 22 }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, textAlign: "center" }}>
          <div className="cd-serif" style={{ fontSize: 24, fontWeight: 700, color: "var(--terra)" }}>{streak}<span style={{ fontSize: 12, marginLeft: 2 }}>日</span></div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>連続記録{streak >= 2 ? " 🔥" : ""}</div>
        </div>
        <div style={{ width: 1, background: "var(--line)" }} />
        <div style={{ flex: 1, textAlign: "center" }}>
          <div className="cd-serif" style={{ fontSize: 24, fontWeight: 700, color: "var(--bean)" }}>{monthDays}<span style={{ fontSize: 12, marginLeft: 2 }}>日</span></div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>今月の記録日</div>
        </div>
        <div style={{ width: 1, background: "var(--line)" }} />
        <div style={{ flex: 1, textAlign: "center" }}>
          <div className="cd-serif" style={{ fontSize: 24, fontWeight: 700, color: "var(--bean)" }}>{monthLogs.length}<span style={{ fontSize: 12, marginLeft: 2 }}>杯</span></div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>今月の杯数</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <button onClick={() => shiftMonth(-1)} style={{ background: "none", border: "none", color: "var(--mocha)", fontSize: 18, cursor: "pointer", padding: "2px 8px" }}>‹</button>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--bean)" }}>{monthLabel}</div>
        <button onClick={() => shiftMonth(1)} disabled={isCurMonth} style={{ background: "none", border: "none", color: isCurMonth ? "var(--line)" : "var(--mocha)", fontSize: 18, cursor: isCurMonth ? "default" : "pointer", padding: "2px 8px" }}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
        {wd.map((w, i) => <div key={w} style={{ textAlign: "center", fontSize: 10, color: i === 0 ? "#c0392b" : i === 6 ? "#5b9bd5" : "var(--muted)", paddingBottom: 2 }}>{w}</div>)}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const k = dayKey(new Date(ym.y, ym.m, d));
          const cups = byDay[k]?.length || 0;
          const isToday = k === todayK;
          return (
            <div key={i} onClick={() => cups && openLog(byDay[k][0].id)} style={{ aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", cursor: cups ? "pointer" : "default" }}>
              <div style={{ width: "74%", aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%", fontSize: 11, background: cupColor(cups), color: cups >= 3 ? "#fff" : cups >= 1 ? "var(--espresso)" : "var(--muted)", border: isToday ? "1.5px solid var(--bean)" : "1px solid transparent", fontWeight: cups ? 700 : 400 }}>{d}</div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 8, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5 }}>
        少<span style={{ width: 11, height: 11, borderRadius: "50%", background: "rgba(179,85,47,.45)" }} /><span style={{ width: 11, height: 11, borderRadius: "50%", background: "rgba(179,85,47,.72)" }} /><span style={{ width: 11, height: 11, borderRadius: "50%", background: "var(--terra)" }} />多
      </div>
    </div>
  );
}

// ====== ホーム ======
function Home({ beans, logs, proposed, startRecord, setScreen, openLog }) {
  const beanOf = (id) => beans.find(b => b.id === id);
  return (
    <div className="cd-fade">
      {proposed ? (
        <div style={{ background: "linear-gradient(155deg,var(--bean),var(--espresso))", borderRadius: 22, padding: 22, color: "var(--cream)", marginBottom: 22, boxShadow: "0 10px 30px rgba(44,30,21,.25)" }}>
          <div style={{ fontSize: 11.5, letterSpacing: ".12em", opacity: .7, fontWeight: 700 }}>次の一杯 ・ AIからのおすすめ</div>
          <div className="cd-serif" style={{ fontSize: 21, margin: "6px 0 4px" }}>{beanOf(proposed.beanId)?.name || proposed.beanName || "次に試すレシピ"}</div>
          <div style={{ fontSize: 13, opacity: .8, marginBottom: 14 }}>{proposed.reason}</div>
          <div style={{ display: "flex", gap: 14, fontSize: 13.5, flexWrap: "wrap", marginBottom: 16 }}>
            <span>粉 <b>{proposed.grounds}g</b></span><span>湯 <b>{proposed.water}ml</b></span>
            <span>温度 <b>{proposed.temp}℃</b></span><span>粒度 <b>{proposed.grind}</b></span>
          </div>
          <Btn onClick={() => startRecord(proposed, "rec2")} style={{ width: "100%", background: "var(--crema)", color: "var(--espresso)" }}>この一杯を淹れる</Btn>
        </div>
      ) : (
        <div style={{ background: "var(--paper)", borderRadius: 22, padding: "30px 22px", textAlign: "center", marginBottom: 22, border: "1.5px dashed var(--line)" }}>
          <div style={{ color: "var(--muted)", marginBottom: 10, display: "flex", justifyContent: "center" }}><Icon name="brew" size={38} /></div>
          <div className="cd-serif" style={{ fontSize: 18, marginBottom: 6 }}>まだ一杯目を淹れていません</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 18, lineHeight: 1.7 }}>淹れたコーヒーを記録すると、<br />AIが次の一杯を一緒に考えます</div>
          <Btn onClick={() => startRecord()}>淹れる</Btn>
        </div>
      )}
      {logs.length > 0 && <ProgressSection logs={logs} beans={beans} openLog={openLog} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div className="cd-serif" style={{ fontSize: 15, fontWeight: 700, color: "var(--bean)" }}>最近の一杯</div>
        {logs.length > 3 && <button onClick={() => setScreen("history")} style={{ background: "none", border: "none", color: "var(--terra)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>日記を見る ›</button>}
      </div>
      {logs.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>まだ記録がありません。</div>}
      {logs.slice(0, 3).map(l => <LogCard key={l.id} log={l} bean={beanOf(l.beanId)} onClick={() => openLog(l.id)} />)}
    </div>
  );
}

// ====== ログカード（共通）======
function LogCard({ log: l, bean, onClick, trialNo, showBeanNo }) {
  const name = bean?.name || l.beanName || "不明な豆";
  return (
    <div onClick={onClick} style={{ background: "var(--paper)", borderRadius: 16, padding: 16, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: onClick ? "pointer" : "default" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
        {trialNo != null && (
          <div title={showBeanNo ? `${name}の${trialNo}回目` : `${trialNo}回目`} style={{ flexShrink: 0, width: 28, height: 28, borderRadius: "50%", background: "var(--cream)", border: "1px solid var(--line)", color: "var(--mocha)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>{trialNo}</div>
        )}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{l.grounds}g / {l.water}ml / {l.temp}℃ · {new Date(l.createdAt).toLocaleDateString("ja-JP")}</div>
        </div>
      </div>
      <div style={{ textAlign: "center", flexShrink: 0, marginLeft: 8 }}>
        <div style={{ color: "var(--crema)", fontSize: 15 }}>{"★".repeat(l.satisfaction)}<span style={{ color: "var(--line)" }}>{"★".repeat(5 - l.satisfaction)}</span></div>
        {flavorsOf(l).length > 0 && <div style={{ fontSize: 11, color: "var(--mocha)", marginTop: 2 }}>{flavorText(l)}</div>}
      </div>
    </div>
  );
}

// ====== 記録からの復元 ======
// 豆・ミル・ドリッパーのデータが失われても、記録には各IDとAI診断の履歴（味わいメモ）が残っている。
// 同じIDで作り直せば記録とのひもづけが元に戻り、名前などは味わいメモから読み取れる。
const PROCESS_HINT = /wash|ウォッシュ|水洗|natural|ナチュラル|honey|ハニー|パルプド|anaerob|アナエロ|嫌気|スマトラ|精製|発酵/i;
const parseBrewSheet = (text) => {
  const line = (label) => ((text || "").match(new RegExp(`^${label}: (.*)$`, "m")) || [])[1]?.trim();
  const out = {};
  const bl = line("豆");
  if (bl) {
    const m = bl.match(/^(.*?)（(.*)）$/);
    const name = (m ? m[1] : bl).trim();
    if (name && name !== "不明") {
      const parts = (m ? m[2] : "").split(" / ").map(s => s.trim()).filter(Boolean);
      const roastLevel = parts.find(p => ROAST_LEVELS.includes(p)) || "";
      const process = parts.find(p => p !== roastLevel && PROCESS_HINT.test(p)) || "";
      const origin = parts.filter(p => p !== roastLevel && p !== process).join(" / ");
      const rn = line("ロースター評");
      out.bean = { name, origin, process, roastLevel, roasterNote: rn && rn !== "なし" ? rn : "" };
    }
  }
  const gl = line("粒度");
  if (gl) { const m = gl.match(/^(.*) [\d.]+クリック$/); const n = (m ? m[1] : "").trim(); if (n && n !== "不明") out.grinder = { name: n }; }
  const dl = line("ドリッパー");
  if (dl) { const m = dl.match(/^(.*?)(?:（(.*)）)?$/); const n = (m?.[1] || "").trim(); if (n && n !== "不明") out.dripper = { name: n, type: m?.[2] || "" }; }
  return out;
};
// 記録から「見つからないID」を集め、復元候補を作る
function findRestorable(logs, beans, grinders, drippers) {
  const kinds = [
    { kind: "bean", idKey: "beanId", list: beans },
    { kind: "grinder", idKey: "grinderId", list: grinders },
    { kind: "dripper", idKey: "dripperId", list: drippers },
  ];
  const sorted = [...(logs || [])].sort((a, b) => b.createdAt - a.createdAt); // 新しい記録の情報を優先
  return kinds.map(({ kind, idKey, list }) => {
    const known = new Set((list || []).map(x => x.id));
    const found = {};
    sorted.forEach(l => {
      const id = l[idKey];
      if (!id || known.has(id)) return;
      const f = found[id] || (found[id] = { id, kind, cups: 0, first: l.createdAt, info: null });
      f.cups++; f.first = Math.min(f.first, l.createdAt);
      if (!f.info) {
        const sheet = (l.chat || []).find(m => m.role === "user" && /【今回の味わいメモ】/.test(m.content || ""));
        const parsed = sheet ? parseBrewSheet(sheet.content)[kind] : null;
        if (parsed) f.info = parsed;
      }
    });
    return Object.values(found);
  });
}
// 初期サンプル（読み込みの不具合で上書きされたもの）を見分ける
const isSampleItem = (kind, x) =>
  kind === "bean" ? x.name === SEED_BEAN.name && x.shop === SEED_BEAN.shop && x.roasterNote === SEED_BEAN.roasterNote
  : kind === "grinder" ? x.name === SEED_GRINDER.name && x.type === SEED_GRINDER.type && !x.note
  : x.name === SEED_DRIPPER.name && x.type === SEED_DRIPPER.type && !x.note;

function RestoreModal({ logs, beans, saveBeans, grinders, saveGrinders, drippers, saveDrippers, favorites, onClose }) {
  const notify = useContext(ToastCtx);
  const [bc, gc, dc] = findRestorable(logs, beans, grinders, drippers);
  const all = [...bc, ...gc, ...dc];
  const fallbackName = (c) => `名前不明の${c.kind === "bean" ? "豆" : c.kind === "grinder" ? "ミル" : "ドリッパー"}（${c.cups}杯・${new Date(c.first).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}〜）`;
  const [names, setNames] = useState(() => Object.fromEntries(all.map(c => [c.id, c.info?.name || ""])));
  // 記録・定番レシピで使われていない初期サンプルは、削除を選べるようにする
  const usedIds = new Set([...(logs || []), ...(favorites || [])].flatMap(x => [x.beanId, x.grinderId, x.dripperId]).filter(Boolean));
  // 上書きの形跡（見つからないID）がある種類だけを対象にする（本当に持っている同名の器具を消さないため）
  const samples = [["bean", beans, bc], ["grinder", grinders, gc], ["dripper", drippers, dc]].filter(([, , c]) => c.length).flatMap(([kind, list]) => (list || []).filter(x => isSampleItem(kind, x) && !usedIds.has(x.id)).map(x => ({ kind, item: x })));
  const [dropSample, setDropSample] = useState(() => Object.fromEntries(samples.map(s => [s.item.id, true])));

  const run = () => {
    const nameOf = (c) => (names[c.id] || "").trim() || fallbackName(c);
    const keep = (list) => (list || []).filter(x => !dropSample[x.id]);
    if (bc.length || samples.some(s => s.kind === "bean")) saveBeans([
      ...bc.map(c => ({ id: c.id, name: nameOf(c), origin: c.info?.origin || "", variety: "", process: c.info?.process || "", roastDate: "", roastLevel: c.info?.roastLevel || "中煎り", shop: "", roasterNote: c.info?.roasterNote || "", createdAt: c.first, restoredAt: Date.now() })),
      ...keep(beans),
    ]);
    if (gc.length || samples.some(s => s.kind === "grinder")) saveGrinders([...gc.map(c => ({ id: c.id, name: nameOf(c), type: "", note: "", createdAt: c.first, restoredAt: Date.now() })), ...keep(grinders)]);
    if (dc.length || samples.some(s => s.kind === "dripper")) saveDrippers([...dc.map(c => ({ id: c.id, name: nameOf(c), type: c.info?.type || "", note: "", createdAt: c.first, restoredAt: Date.now() })), ...keep(drippers)]);
    notify(`${all.length}件を復元しました`);
    onClose();
  };

  // 入力欄のフォーカスが外れないよう、コンポーネントではなく関数で描画する
  const section = (title, items) => items.length > 0 && (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--mocha)", marginBottom: 8 }}>{title}（{items.length}）</div>
      {items.map(c => (
        <div key={c.id} style={{ background: "var(--paper)", borderRadius: 12, padding: "10px 12px", marginBottom: 8 }}>
          <input style={{ ...inputStyle, padding: "8px 10px", fontSize: 14 }} value={names[c.id]} placeholder={fallbackName(c)}
            onChange={e => setNames(n => ({ ...n, [c.id]: e.target.value }))} />
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6, lineHeight: 1.6 }}>
            {c.kind === "bean" && c.info && [c.info.origin, c.info.process, c.info.roastLevel].filter(Boolean).join(" · ")}
            {c.kind === "dripper" && c.info?.type}
            {c.info ? "" : "AI診断の履歴がないため、名前を入力してください"}
            <span style={{ marginLeft: 6 }}>· 記録 {c.cups}杯</span>
          </div>
          {c.kind === "bean" && c.info?.roasterNote && <div style={{ fontSize: 11.5, color: "var(--mocha)", fontStyle: "italic", marginTop: 4 }}>“{c.info.roasterNote}”</div>}
        </div>
      ))}
    </div>
  );

  return (
    <ModalShell title="記録から復元" onClose={onClose}>
      <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.7, marginBottom: 14 }}>
        記録にひもづいているのに見つからない豆・器具を、同じIDで作り直します。名前などはAI診断の履歴から読み取りました。必要なら名前を直してから復元してください。
      </div>
      {section("豆", bc)}
      {section("ミル", gc)}
      {section("ドリッパー", dc)}
      {samples.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--mocha)", marginBottom: 8 }}>使われていない初期サンプル</div>
          {samples.map(s => (
            <label key={s.item.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 2px", cursor: "pointer" }}>
              <input type="checkbox" checked={!!dropSample[s.item.id]} onChange={e => setDropSample(d => ({ ...d, [s.item.id]: e.target.checked }))} />
              「{s.item.name}」を削除する
            </label>
          ))}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.7, marginBottom: 12 }}>アーカイブの状態や「また買いたい？」の回答は戻りません。復元後にカルテで編集できます。</div>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn kind="ghost" onClick={onClose} style={{ flex: 1 }}>キャンセル</Btn>
        <Btn onClick={run} disabled={!all.length} style={{ flex: 2 }}>{all.length}件を復元する</Btn>
      </div>
    </ModalShell>
  );
}

// ====== カルテ（豆 / ミル / ドリッパー / レシピ 切替）======
function Karte({ beans, saveBeans, logs, grinders, saveGrinders, drippers, saveDrippers, favorites, saveFavorites, startRecord }) {
  const [tab, setTab] = useState("bean");
  const [restoring, setRestoring] = useState(false);
  const missing = findRestorable(logs, beans, grinders, drippers).reduce((n, list) => n + list.length, 0);
  return (
    <div className="cd-fade">
      {missing > 0 && (
        <div style={{ background: "rgba(179,85,47,.08)", border: "1px solid rgba(179,85,47,.3)", borderRadius: 14, padding: "12px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, fontSize: 12.5, color: "var(--bean)", lineHeight: 1.6 }}>記録にひもづく豆・器具が <b>{missing}件</b> 見つかりません。記録から復元できます。</div>
          <Btn onClick={() => setRestoring(true)} style={{ padding: "8px 14px", fontSize: 13, flexShrink: 0 }}>復元する</Btn>
        </div>
      )}
      {restoring && <RestoreModal logs={logs} beans={beans} saveBeans={saveBeans} grinders={grinders} saveGrinders={saveGrinders} drippers={drippers} saveDrippers={saveDrippers} favorites={favorites} onClose={() => setRestoring(false)} />}
      <div style={{ display: "flex", gap: 5, marginBottom: 18, background: "var(--paper)", padding: 5, borderRadius: 14 }}>
        {[["bean", "豆"], ["grinder", "ミル"], ["dripper", "ドリッパー"], ["recipe", "レシピ"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "9px 2px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", background: tab === k ? "var(--bean)" : "transparent", color: tab === k ? "var(--cream)" : "var(--mocha)" }}>{l}</button>
        ))}
      </div>
      {tab === "bean" && <Beans beans={beans} saveBeans={saveBeans} logs={logs} />}
      {tab === "grinder" && <Equipment items={grinders} save={saveGrinders} kind="grinder" />}
      {tab === "dripper" && <Equipment items={drippers} save={saveDrippers} kind="dripper" />}
      {tab === "recipe" && <FavRecipes favorites={favorites} saveFavorites={saveFavorites} grinders={grinders} drippers={drippers} startRecord={startRecord} />}
    </div>
  );
}

// ====== お気に入りレシピ一覧 ======
function FavRecipes({ favorites, saveFavorites, grinders, drippers, startRecord }) {
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(null);
  const notify = useContext(ToastCtx);
  const newFav = () => setEditing({
    id: "", name: "", grounds: 15, water: 240, temp: 92,
    grinderId: grinders[0]?.id ?? null, dripperId: (drippers && drippers[0]?.id) ?? null, grind: 20,
    pours: [{ label: "1投目", t: 0, ml: 60 }, { label: "2投目", t: 45, ml: 90 }, { label: "3投目", t: 90, ml: 90 }],
  });

  if (editing) {
    const e = editing;
    return (
      <div className="cd-fade">
        <Field label="レシピ名 *"><input style={inputStyle} value={e.name} onChange={ev => setEditing({ ...e, name: ev.target.value })} placeholder="例：イルガ4:6" /></Field>
        <RecipeFields value={e} setValue={setEditing} grinders={grinders} drippers={drippers} />
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <Btn kind="ghost" onClick={() => setEditing(null)} style={{ flex: 1 }}>キャンセル</Btn>
          <Btn disabled={!e.name.trim()} style={{ flex: 2 }} onClick={() => {
            if (e.id) { saveFavorites(favorites.map(x => x.id === e.id ? e : x)); notify("変更を保存しました"); }
            else { saveFavorites([{ ...e, id: uid() }, ...favorites]); notify("My棚に追加しました"); }
            setEditing(null);
          }}>保存する</Btn>
        </div>
      </div>
    );
  }

  if (!favorites.length) {
    return (
      <div className="cd-fade">
        <Btn onClick={newFav} style={{ width: "100%", marginBottom: 18 }}>＋ 定番レシピを登録する</Btn>
        <div style={{ background: "var(--paper)", borderRadius: 18, padding: "30px 22px", textAlign: "center", border: "1.5px dashed var(--line)" }}>
          <div style={{ color: "var(--muted)", marginBottom: 10, display: "flex", justifyContent: "center" }}><Icon name="recipe" size={34} /></div>
          <div className="cd-serif" style={{ fontSize: 16, marginBottom: 6 }}>定番レシピがありません</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.7 }}>上のボタン、または淹れる画面の<br />「☆ 定番レシピに登録」から保存できます。</div>
        </div>
      </div>
    );
  }
  return (
    <div className="cd-fade">
      <Btn onClick={newFav} style={{ width: "100%", marginBottom: 18 }}>＋ 定番レシピを登録する</Btn>
      {favorites.map(f => {
        const g = grinders.find(x => x.id === f.grinderId);
        const d = (drippers || []).find(x => x.id === f.dripperId);
        const isOpen = open === f.id;
        let cum = 0;
        return (
          <div key={f.id} style={{ background: "var(--paper)", borderRadius: 16, padding: 16, marginBottom: 12, border: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div className="cd-serif" style={{ fontSize: 16.5, fontWeight: 700 }}>{f.name}</div>
              <CardMenu items={[{ label: "編集", onClick: () => setEditing({ ...f, pours: f.pours.map(p => ({ ...p })) }) }, { label: "削除", danger: true, onClick: () => { saveFavorites(favorites.filter(x => x.id !== f.id)); notify("My棚から削除しました"); } }]} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, margin: "6px 0 10px" }}>
              <div style={{ display: "flex", gap: 12, fontSize: 12.5, color: "var(--mocha)", flexWrap: "wrap" }}>
                <span>粉 <b>{f.grounds}g</b></span><span>湯 <b>{f.water}ml</b>（1:{(f.water / f.grounds).toFixed(1)}）</span><span>{f.temp}℃</span>
                <span>{g?.name || f.grinderName || "ミル"} {f.grind}</span>{(d?.name || f.dripperName) && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="dripper" size={14} />{d?.name || f.dripperName}</span>}
              </div>
              <button onClick={() => setOpen(isOpen ? null : f.id)} style={{ background: "none", border: "none", color: "var(--mocha)", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{isOpen ? "詳細 ▲" : "詳細 ▼"}</button>
            </div>
            {isOpen && (
              <div className="cd-fade" style={{ background: "var(--cream)", borderRadius: 10, padding: "8px 10px", marginBottom: 12 }}>
                {f.pours.map((p, i) => { cum += Number(p.ml) || 0; return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--bean)", padding: "2px 0" }}>
                    <span>{p.label}</span><span style={{ color: "var(--muted)" }}>{fmtTime(p.t)}</span><span>+{p.ml}g</span><span style={{ fontWeight: 700 }}>{cum}g</span>
                  </div>
                ); })}
              </div>
            )}
            <Btn onClick={() => startRecord(f)} style={{ width: "100%", padding: "10px" }}>このレシピで淹れる</Btn>
          </div>
        );
      })}
    </div>
  );
}

// ====== 好みプロフィール（集計ロジック）======
// 画面表示と、今後のAI提案（次に買う豆）の両方で使う。数えるのはここ、解釈はAIに任せる
const PROCESS_OPTIONS = ["ウォッシュド", "ナチュラル", "ハニー", "アナエロビック"];
// 表記ゆれをまとめる（washed / 水洗式 → ウォッシュド など）
const normalizeProcess = (s) => {
  const t = (s || "").trim();
  if (!t) return "";
  const x = t.toLowerCase();
  if (/honey|ハニー|パルプド/.test(x)) return "ハニー";
  if (/anaerob|アナエロ|嫌気/.test(x)) return "アナエロビック";
  if (/natural|ナチュラル|非水洗/.test(x)) return "ナチュラル";
  if (/wash|ウォッシュ|水洗/.test(x)) return "ウォッシュド";
  if (/スマトラ|wet.?hull/.test(x)) return "スマトラ式";
  return t;
};
const PROFILE_DIMS = [
  { key: "roast", label: "焙煎度", get: b => b.roastLevel || "", order: ROAST_LEVELS },
  // 産地は国名でまとめる（「ブラジル ミナスジェライス州 …」→「ブラジル」）
  { key: "origin", label: "産地", get: b => (b.origin || "").trim().split(/[\s　・,、/／(（]/)[0] },
  { key: "process", label: "精製", get: b => normalizeProcess(b.process) },
  { key: "variety", label: "品種", get: b => (b.variety || "").trim() },
];
function buildPreferenceProfile(logs, beans) {
  const logsOf = (id) => logs.filter(l => l.beanId === id);
  // 記録があるか「また買いたい？」に答えた豆だけを対象にする
  const used = (beans || []).filter(b => logsOf(b.id).length || b.rebuy);
  const avgSat = (ls) => (ls.length ? ls.reduce((s, l) => s + (l.satisfaction || 0), 0) / ls.length : null);
  const dims = {};
  PROFILE_DIMS.forEach(d => {
    const groups = {};
    let missing = 0;
    used.forEach(b => {
      const v = d.get(b);
      if (!v) { missing++; return; }
      const g = groups[v] || (groups[v] = { value: v, beans: [], cups: [], rebuy: { yes: 0, maybe: 0, no: 0 } });
      g.beans.push(b); g.cups.push(...logsOf(b.id));
      if (b.rebuy) g.rebuy[b.rebuy]++;
    });
    let list = Object.values(groups).map(g => ({
      value: g.value, beanCount: g.beans.length, cupCount: g.cups.length, avg: avgSat(g.cups),
      rebuy: g.rebuy, rebuyAnswered: g.rebuy.yes + g.rebuy.maybe + g.rebuy.no,
    }));
    list = d.order
      ? list.sort((a, b) => d.order.indexOf(a.value) - d.order.indexOf(b.value))
      : list.sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0) || b.cupCount - a.cupCount);
    dims[d.key] = { label: d.label, groups: list, missing };
  });
  const high = logs.filter(l => l.satisfaction >= 4), low = logs.filter(l => l.satisfaction <= 2);
  // フレーバーは「高評価で出た回数 − 低評価で出た回数」で好き/苦手を判定（同じ味が両方に出る矛盾を防ぐ）
  const flav = {};
  // 1杯で複数の香りを選んだ場合は、それぞれ1回ずつ数える（集計は中分類で）
  high.forEach(l => flavorsOf(l).forEach(f => { (flav[f.small] = flav[f.small] || { hi: 0, lo: 0 }).hi++; }));
  low.forEach(l => flavorsOf(l).forEach(f => { (flav[f.small] = flav[f.small] || { hi: 0, lo: 0 }).lo++; }));
  const flavList = Object.entries(flav).map(([flavor, c]) => ({ flavor, hi: c.hi, lo: c.lo, net: c.hi - c.lo }));
  const liked = flavList.filter(f => f.net > 0).sort((a, b) => b.net - a.net || b.hi - a.hi).slice(0, 3);
  const disliked = flavList.filter(f => f.net < 0).sort((a, b) => a.net - b.net || b.lo - a.lo).slice(0, 3);
  const AX = ["酸味", "苦味", "甘味", "コク", "濃度感"];
  const avgAx = (ls, ax) => (ls.length ? ls.reduce((s, l) => s + (l.taste?.[ax] ?? 0), 0) / ls.length : 0);
  const taste = high.length ? AX.map(ax => ({ ax, d: avgAx(high, ax) - avgAx(logs, ax) })).filter(x => Math.abs(x.d) >= 0.4).sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 2) : [];
  return {
    cupCount: logs.length, beanCount: used.length, dims,
    likedFlavors: liked, dislikedFlavors: disliked, taste,
    rebuyYes: used.filter(b => b.rebuy === "yes").map(b => b.name),
    rebuyNo: used.filter(b => b.rebuy === "no").map(b => b.name),
  };
}

// 好みカードの1行：ラベル＋チップ
function PrefRow({ label, items, muted }) {
  return (
    <>
      <span style={{ fontSize: 11.5, color: "var(--muted)", whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {items.map(t => (
          <span key={t} style={{ fontSize: 12.5, fontWeight: 700, padding: "3px 10px", borderRadius: 20, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            background: muted ? "transparent" : "var(--paper)", color: muted ? "var(--muted)" : "var(--terra)", border: `1px solid ${muted ? "var(--line)" : "rgba(179,85,47,.3)"}` }}>{t}</span>
        ))}
      </span>
    </>
  );
}

// ====== 味覚プロフィール（全記録横断・好みの傾向）======
function TasteProfile({ logs, beans }) {
  const [dimKey, setDimKey] = useState("roast");
  const AXES = ["酸味", "苦味", "甘味", "コク", "濃度感"];
  const avgOf = (arr, ax) => arr.length ? arr.reduce((s, l) => s + (l.taste?.[ax] ?? 0), 0) / arr.length : 0;

  if (logs.length < 3) {
    return (
      <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, padding: "18px 16px", marginBottom: 24, textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.8 }}>記録を重ねると、ここに<br />あなたの味の好みの傾向が表示されます。</div>
      </div>
    );
  }

  const high = logs.filter(l => l.satisfaction >= 4);
  const radarData = AXES.map(ax => ({
    subject: ax,
    平均: Number(avgOf(logs, ax).toFixed(1)),
    ...(high.length ? { 好み: Number(avgOf(high, ax).toFixed(1)) } : {}),
  }));

  const prof = buildPreferenceProfile(logs, beans);
  const dimsWithData = PROFILE_DIMS.filter(d => prof.dims[d.key].groups.length);
  const dim = prof.dims[dimKey]?.groups.length ? prof.dims[dimKey] : prof.dims[dimsWithData[0]?.key];
  // 各軸で、2杯以上ある中で満足度が最も高いもの（比較対象が2つ以上あるときだけ）
  const favs = dimsWithData.map(d => {
    const g = [...prof.dims[d.key].groups].filter(x => x.cupCount >= 2 && x.avg != null).sort((a, b) => b.avg - a.avg)[0];
    return g && prof.dims[d.key].groups.length >= 2 ? { label: d.label, value: g.value } : null;
  }).filter(Boolean);
  const sub = { fontSize: 12.5, fontWeight: 700, color: "var(--mocha)", margin: "18px 0 10px" };

  return (
    <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, padding: 16, marginBottom: 24 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--mocha)", marginBottom: 4 }}>あなたの味の好み</div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 10 }}>{prof.cupCount}杯・{prof.beanCount}袋の記録から</div>

      {/* ひと目で分かる好みカード（結論を先に） */}
      {(favs.length > 0 || prof.taste.length > 0 || prof.likedFlavors.length > 0 || prof.dislikedFlavors.length > 0 || prof.rebuyYes.length > 0) ? (
        <div style={{ background: "var(--cream)", borderRadius: 12, padding: "12px 14px", display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 14, rowGap: 8, alignItems: "center" }}>
          {favs.map(f => <PrefRow key={f.label} label={f.label} items={[f.value]} />)}
          {prof.taste.length > 0 && <PrefRow label="味" items={prof.taste.map(t => `${t.ax}${t.d > 0 ? "高め" : "控えめ"}`)} />}
          {(favs.length > 0 || prof.taste.length > 0) && (prof.likedFlavors.length > 0 || prof.dislikedFlavors.length > 0 || prof.rebuyYes.length > 0) && <div style={{ gridColumn: "1 / -1", borderTop: "1px dashed var(--line)" }} />}
          {prof.likedFlavors.length > 0 && <PrefRow label="好きな香り" items={prof.likedFlavors.map(f => f.flavor)} />}
          {prof.dislikedFlavors.length > 0 && <PrefRow label="苦手な香り" items={prof.dislikedFlavors.map(f => f.flavor)} muted />}
          {prof.rebuyYes.length > 0 && <PrefRow label="また買いたい" items={prof.rebuyYes} />}
        </div>
      ) : (
        <div style={{ background: "var(--cream)", borderRadius: 12, padding: "12px 14px", fontSize: 12, color: "var(--muted)" }}>いろいろな豆を記録すると、ここに好みがまとまります。</div>
      )}

      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--mocha)", margin: "18px 0 4px" }}>味の形</div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 6 }}>テラコッタが高評価（4-5★）だった味の形。</div>
      <ResponsiveContainer width="100%" height={240}>
        <RadarChart data={radarData}>
          <PolarGrid stroke="#e3d8c8" />
          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: "#6b4e3a" }} />
          <Radar name="全体平均" dataKey="平均" stroke="#9b8775" fill="#9b8775" fillOpacity={0.08} strokeWidth={1.5} strokeDasharray="4 3" />
          {high.length > 0 && <Radar name="好み(4-5★)" dataKey="好み" stroke="#b3552f" fill="#b3552f" fillOpacity={0.16} strokeWidth={2.5} />}
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e3d8c8" }} />
        </RadarChart>
      </ResponsiveContainer>

      {/* 豆の特徴ごとの満足度 */}
      {dim && (
        <>
          <div style={sub}>豆の特徴ごとの満足度</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {dimsWithData.map(d => <Chip key={d.key} small active={dim === prof.dims[d.key]} onClick={() => setDimKey(d.key)}>{d.label}</Chip>)}
          </div>
          {dim.groups.map(g => (
            <div key={g.value} style={{ marginBottom: 9, opacity: g.cupCount >= 3 ? 1 : 0.6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12, marginBottom: 3, gap: 8 }}>
                <span style={{ minWidth: 0 }}>
                  <b>{g.value}</b>
                  <span style={{ color: "var(--muted)", marginLeft: 6 }}>{g.beanCount}袋 · {g.cupCount}杯</span>
                  {g.rebuyAnswered > 0 && <span style={{ marginLeft: 6, fontSize: 11, color: g.rebuy.yes ? "var(--terra)" : "var(--muted)", fontWeight: 700 }}>また買いたい {g.rebuy.yes}/{g.rebuyAnswered}</span>}
                </span>
                <span style={{ color: "var(--terra)", fontWeight: 700, flexShrink: 0 }}>{g.avg != null ? `${g.avg.toFixed(1)}★` : "—"}</span>
              </div>
              <div style={{ height: 6, background: "var(--cream)", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${((g.avg || 0) / 5) * 100}%`, height: "100%", background: "var(--crema)" }} />
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.7, marginTop: 6 }}>
            薄い行は3杯未満で、参考程度です。
            {dim.missing > 0 && <>「{dim.label}」が未入力の豆が {dim.missing} 袋あります。カルテで追記すると精度が上がります。</>}
          </div>
        </>
      )}

    </div>
  );
}

// ====== 次に試したい豆（段階2：好みプロフィールからAIが豆のタイプを提案）======
// AIには集計済みのプロフィールだけを渡す（生の記録は渡さない）。数えるのはアプリ、解釈と提案はAI
const profileToPrompt = (prof) => {
  const dimLine = (key) => {
    const d = prof.dims[key];
    if (!d.groups.length) return null;
    return `${d.label}: ` + d.groups.map(g => `${g.value}（${g.cupCount}杯${g.avg != null ? `・平均${g.avg.toFixed(1)}★` : ""}${g.rebuyAnswered ? `・また買いたい${g.rebuy.yes}/${g.rebuyAnswered}袋` : ""}）`).join("、");
  };
  return [
    `記録: ${prof.cupCount}杯・${prof.beanCount}袋`,
    ...["roast", "origin", "process", "variety"].map(dimLine),
    prof.taste.length ? `高評価のときの味: ${prof.taste.map(t => `${t.ax}${t.d > 0 ? "高め" : "控えめ"}`).join("・")}` : null,
    prof.likedFlavors.length ? `好きな香り: ${prof.likedFlavors.map(f => f.flavor).join("・")}` : null,
    prof.dislikedFlavors.length ? `苦手な香り: ${prof.dislikedFlavors.map(f => f.flavor).join("・")}` : null,
    prof.rebuyYes.length ? `また買いたい豆: ${prof.rebuyYes.join("、")}` : null,
    prof.rebuyNo.length ? `もう買わない豆: ${prof.rebuyNo.join("、")}` : null,
  ].filter(Boolean).join("\n");
};
// 提案の種類：match＝好みに近い / discover＝新しい発見（以前の保存データの「定番」「冒険」も同じ扱い）
const SUGGEST_TYPES = { match: "好みに近い", discover: "新しい発見", 定番: "好みに近い", 冒険: "新しい発見" };
// AIへの指示：風味の表（coffeeKnowledge.js）の中からだけ選ばせる。
// 香り・特徴はアプリが表から表示し、AIが書くのは「好みのどこに合うか」の理由だけ（もっともらしい誤りを防ぐ）
const buildSuggestSystem = () => {
  const origins = Object.entries(ORIGIN_KB).map(([k, o]) =>
    `- ${k}（主な精製: ${o.commonProcess.join("/")}）香り: ${o.flavors.join("・")}${o.flavorsByProcess ? `（${Object.entries(o.flavorsByProcess).map(([p, f]) => `${p}は${f.join("・")}`).join("、")}）` : ""}／酸味 ${o.acidity}・ボディ ${o.body}`).join("\n");
  const processes = Object.entries(PROCESS_KB).map(([k, x]) => `- ${k}: ${x.flavors.join("・")}。${x.note}`).join("\n");
  const roasts = Object.entries(ROAST_KB).map(([k, x]) => `- ${k}: ${x.flavors.join("・")}。${x.note}`).join("\n");
  return "あなたはスペシャルティコーヒー豆の買い付けと販売に詳しいバリスタです。利用者の好みの記録をもとに、次に買って試す豆の「タイプ」を2つ提案します。\n" +
    "・1つ目は「好みに近い」豆：今の好みの延長で、満足する可能性が高いもの。\n" +
    "・2つ目は「新しい発見」の豆：好みと共通する要素を1つ以上残しつつ、まだ試していない産地・精製・焙煎度のどれかに踏み出すもの。\n" +
    "・産地・精製・焙煎度は、必ず下の【風味の傾向の表】に書かれた名前からそのまま選ぶ。表にないものは使わない。\n" +
    "・精製は、なるべくその産地の「主な精製」から選ぶ（手に入りやすいため）。\n" +
    "・理由には、表に書かれた傾向と利用者の記録だけを使う。表にない香りや、地域・農園の話は書かない。\n" +
    "・苦手な香りや「もう買わない豆」の傾向は避ける。\n\n" +
    `【風味の傾向の表】\n■産地\n${origins}\n■精製\n${processes}\n■焙煎度\n${roasts}\n\n` +
    "前後の説明やマークダウンは付けず、次のJSONオブジェクトだけを返す:\n" +
    '{"items":[{"type":"match","origin":"表の産地名","process":"表の精製名","roastLevel":"表の焙煎度","reason":"好みのどこに合うか（50字以内）"},{"type":"discover", 同じ形 }]}';
};

async function requestBeanSuggestion(prof) {
  const { data, error } = await supabase.functions.invoke("ai", {
    body: { system: buildSuggestSystem(), messages: [{ role: "user", content: `【好みの記録】\n${profileToPrompt(prof)}\n\n次に試す豆のタイプを2つ、JSONで。` }], maxTokens: 900, json: true, temperature: 0.7 },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  let txt = (data?.text || "").replace(/```json|```/g, "").trim();
  const m = txt.match(/\{[\s\S]*\}/);
  if (m) txt = m[0];
  const r = JSON.parse(txt);
  // 表にある名前に合わせる（「エチオピア イルガチェフェ」→「エチオピア」など）。表にない産地の提案は捨てる
  const toOrigin = (v) => { const t = String(v || "").trim(); return ORIGIN_KB[t] ? t : Object.keys(ORIGIN_KB).find(k => t.includes(k)) || ""; };
  const items = (Array.isArray(r.items) ? r.items : []).slice(0, 2).map((x, i) => {
    const origin = toOrigin(x.origin);
    if (!origin) return null;
    const pr = normalizeProcess(x.process);
    const process = PROCESS_KB[pr] ? pr : ORIGIN_KB[origin].commonProcess[0];
    const roastLevel = ROAST_KB[x.roastLevel] ? x.roastLevel : "";
    return { type: i === 0 ? "match" : "discover", origin, process, roastLevel, flavors: expectedFlavors({ origin, process, roastLevel }), reason: String(x.reason || "").trim(), kb: true };
  }).filter(Boolean);
  if (!items.length) throw new Error("提案を読み取れませんでした");
  return { id: uid(), createdAt: Date.now(), items, basis: { cups: prof.cupCount, beans: prof.beanCount } };
}

function NextBeanCard({ logs, beans, suggestions, saveSuggestions }) {
  const notify = useContext(ToastCtx);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const prof = buildPreferenceProfile(logs, beans);
  // 提案の材料が少なすぎるときは控える（3杯・2袋が目安）
  const enough = prof.cupCount >= 3 && prof.beanCount >= 2;
  const latest = (suggestions || [])[0];
  const ask = async () => {
    setLoading(true); setErr("");
    try {
      const s = await requestBeanSuggestion(prof);
      saveSuggestions([s, ...(suggestions || [])].slice(0, 30)); // 提案は履歴として残す（あとで当たったかを確かめるため）
      notify("次に試したい豆を提案しました");
    } catch { setErr("提案を作れませんでした。時間をおいて、もう一度お試しください。"); }
    setLoading(false);
  };
  const card = { background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, padding: 16, marginBottom: 24 };
  return (
    <div style={card}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--mocha)" }}>次に試したい豆</div>
        {latest && <div style={{ fontSize: 11, color: "var(--muted)" }}>{new Date(latest.createdAt).toLocaleDateString("ja-JP")}の提案</div>}
      </div>
      {!latest && <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.7, marginBottom: 12 }}>あなたの好みから、次に買う豆のタイプ（産地・精製・焙煎度）をAIが提案します。</div>}
      {latest && (
        <>
          <div style={{ height: 8 }} />
          {latest.items.map((it, i) => (
            <div key={i} style={{ background: "var(--cream)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "#fff", background: SUGGEST_TYPES[it.type] === "好みに近い" ? "var(--terra)" : "var(--mocha)", borderRadius: 10, padding: "2px 9px", flexShrink: 0 }}>{SUGGEST_TYPES[it.type] || it.type}</span>
                <span className="cd-serif" style={{ fontSize: 14.5, fontWeight: 700, color: "var(--espresso)" }}>{[it.origin, it.process, it.roastLevel].filter(Boolean).join(" · ")}</span>
              </div>
              {/* 表からの事実（香り・酸味・ボディ）は短いタグで。文章はAIの「おすすめの理由」だけ */}
              {(it.flavors.length > 0 || (it.kb && ORIGIN_KB[it.origin])) && (
                <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                  {it.flavors.map(f => <span key={f} style={{ fontSize: 11.5, fontWeight: 700, color: "var(--terra)", background: "var(--paper)", border: "1px solid rgba(179,85,47,.3)", borderRadius: 20, padding: "1px 9px" }}>{f}</span>)}
                  {it.kb && ORIGIN_KB[it.origin] && <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 4 }}>酸味 {ORIGIN_KB[it.origin].acidity} · ボディ {ORIGIN_KB[it.origin].body}</span>}
                </div>
              )}
              {it.reason && (
                <>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 2 }}>おすすめの理由</div>
                  <div style={{ fontSize: 12.5, color: "var(--bean)", lineHeight: 1.7 }}>{it.reason}</div>
                </>
              )}
            </div>
          ))}
          <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.7, marginBottom: 12, whiteSpace: "pre-line" }}>{latest.items.some(x => x.kb)
            ? "香りや特徴は、コーヒーの専門家の解説などで一般的に言われる傾向です。\n実際の風味は、地域・農園・焙煎によって豆ごとに異なります。"
            : "香りや説明はAIによる一般的な傾向です。\n実際の風味は、地域・農園・焙煎によって豆ごとに異なります。"}</div>
        </>
      )}
      {err && <div style={{ fontSize: 12, color: "var(--terra)", marginBottom: 10, lineHeight: 1.7 }}>{err}</div>}
      {enough
        ? <Btn kind={latest ? "ghost" : "primary"} disabled={loading} onClick={ask} style={{ width: "100%", padding: "11px" }}>{loading ? "考え中…" : latest ? "もう一度提案してもらう" : "提案してもらう"}</Btn>
        : <div style={{ fontSize: 12, color: "var(--muted)", background: "var(--cream)", borderRadius: 10, padding: "10px 12px", lineHeight: 1.7 }}>2種類以上の豆で3杯以上記録すると、提案できるようになります（現在 {prof.beanCount}袋・{prof.cupCount}杯）。</div>}
    </div>
  );
}

// ====== 日記（全ログ一覧）======
// ====== 豆別サマリーパネル ======
const RADAR_COLORS = ["#b3552f", "#c98a4b", "#6b4e3a"];

function BeanSummary({ logs, openLog, tab, setTab }) {

  // 古い順に並べ直して試行番号を付ける
  const sorted = [...logs].sort((a, b) => a.createdAt - b.createdAt).map((l, i) => ({ ...l, _n: i + 1 }));

  if (sorted.length < 3) {
    return (
      <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 16, padding: "18px 16px", marginBottom: 18, textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.8 }}>記録を重ねると、ここにデータが表示されます。<br />あと <b style={{ color: "var(--terra)" }}>{3 - sorted.length} 杯</b> 記録してみましょう。</div>
      </div>
    );
  }

  // ---- ① 満足度推移 ----
  const satisfactionData = sorted.map(l => ({ name: `${l._n}回目`, 満足度: l.satisfaction, id: l.id, date: new Date(l.createdAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }) }));

  // ---- ② フレーバーマップ（満足度で色分け） ----
  const AXES = ["酸味", "苦味", "甘味", "コク", "濃度感"];
  const avgOf = (arr, ax) => arr.length ? arr.reduce((s, l) => s + (l.taste?.[ax] ?? 0), 0) / arr.length : null;
  const allLogs = sorted;
  const highLogs = sorted.filter(l => l.satisfaction >= 4); // 好みの形
  const lowLogs = sorted.filter(l => l.satisfaction <= 2);  // 好みでない形
  const radarData = AXES.map(ax => ({
    subject: ax,
    平均: Number((avgOf(allLogs, ax) ?? 0).toFixed(1)),
    ...(highLogs.length ? { 高満足: Number(avgOf(highLogs, ax).toFixed(1)) } : {}),
    ...(lowLogs.length ? { 低満足: Number(avgOf(lowLogs, ax).toFixed(1)) } : {}),
  }));

  const tabStyle = (k) => ({
    flex: 1, padding: "8px 4px", fontSize: 12, fontWeight: 700, background: "none",
    border: "none", borderBottom: tab === k ? "2.5px solid var(--terra)" : "2.5px solid transparent",
    color: tab === k ? "var(--terra)" : "var(--muted)", cursor: "pointer", fontFamily: "'Zen Kaku Gothic New',sans-serif",
  });

  const SatDot = ({ v }) => <span style={{ color: "var(--crema)" }}>{"★".repeat(v)}<span style={{ color: "var(--line)" }}>{"★".repeat(5 - v)}</span></span>;

  return (
    <div className="cd-fade" style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 16, marginBottom: 18, overflow: "hidden" }}>
      <div style={{ display: "flex", borderBottom: "1px solid var(--line)" }}>
        <button style={tabStyle("satisfaction")} onClick={() => setTab("satisfaction")}>満足度推移</button>
        <button style={tabStyle("flavor")} onClick={() => setTab("flavor")}>フレーバー</button>
      </div>

      <div style={{ padding: "16px 12px" }}>

        {tab === "satisfaction" && (
          <>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>試行回ごとの満足度（タップで詳細へ）</div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={satisfactionData} onClick={d => d?.activePayload && openLog(d.activePayload[0].payload.id)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e3d8c8" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9b8775" }} />
                <YAxis domain={[1, 5]} ticks={[1,2,3,4,5]} tick={{ fontSize: 11, fill: "#9b8775" }} width={20} />
                <Tooltip formatter={(v) => [`${v}★`, "満足度"]} labelFormatter={(l) => l} contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e3d8c8" }} />
                <Line type="monotone" dataKey="満足度" stroke="#b3552f" strokeWidth={2.5} dot={{ r: 5, fill: "#b3552f", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 7 }} />
              </LineChart>
            </ResponsiveContainer>
            <div style={{ marginTop: 12 }}>
              {(() => {
                const best = [...sorted].sort((a, b) => b.satisfaction - a.satisfaction)[0];
                return <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.8 }}>
                  最高満足度：<b style={{ color: "var(--terra)" }}>{best.satisfaction}★</b>（{best._n}回目 / 粒度{best.grind} / {best.temp}℃）
                  <button onClick={() => openLog(best.id)} style={{ marginLeft: 8, background: "none", border: "none", color: "var(--terra)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>詳細 →</button>
                </div>;
              })()}
            </div>
          </>
        )}

        {tab === "flavor" && (
          <>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>満足度別の味の傾向（この豆で高評価だった味の形）</div>
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e3d8c8" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: "#6b4e3a" }} />
                <Radar name="全体平均" dataKey="平均" stroke="#9b8775" fill="#9b8775" fillOpacity={0.08} strokeWidth={1.5} strokeDasharray="4 3" />
                {highLogs.length > 0 && <Radar name="満足度4-5★" dataKey="高満足" stroke="#b3552f" fill="#b3552f" fillOpacity={0.16} strokeWidth={2.5} />}
                {lowLogs.length > 0 && <Radar name="満足度1-2★" dataKey="低満足" stroke="#5b9bd5" fill="#5b9bd5" fillOpacity={0.1} strokeWidth={2} />}
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e3d8c8" }} />
              </RadarChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, lineHeight: 1.8 }}>
              {(() => {
                if (highLogs.length === 0) return "満足度4以上の記録が増えると、好みの味の形が見えてきます。";
                const diffs = AXES.map(ax => ({ ax, d: avgOf(highLogs, ax) - avgOf(allLogs, ax) })).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
                const top = diffs.filter(x => Math.abs(x.d) >= 0.4).slice(0, 2);
                if (!top.length) return "高評価の回は、平均的な味のバランスのときに多いようです。";
                return `高評価のとき、平均より ${top.map(t => `${t.ax}が${t.d > 0 ? "高め" : "低め"}`).join("・")} の傾向です。`;
              })()}
            </div>
          </>
        )}

      </div>
    </div>
  );
}


function History({ logs, beans, grinders, drippers, startRecord, openLog }) {
  const [monthF, setMonthF] = useState("all");
  const [beanF, setBeanF] = useState("all");
  const [roastF, setRoastF] = useState("all");
  const [sumTab, setSumTab] = useState("satisfaction"); // サマリーのタブ位置を保持

  const beanOf = (id) => beans.find(b => b.id === id);
  const monthKey = (l) => new Date(l.createdAt).toLocaleDateString("ja-JP", { year: "numeric", month: "long" });
  const beanLabel = (l) => beanOf(l.beanId)?.name || l.beanName || "不明な豆";
  const roastOf = (l) => beanOf(l.beanId)?.roastLevel;

  if (!logs.length) {
    return <div className="cd-fade" style={{ background: "var(--paper)", borderRadius: 18, padding: "30px 22px", textAlign: "center", border: "1.5px dashed var(--line)" }}>
      <div style={{ color: "var(--muted)", marginBottom: 10, display: "flex", justifyContent: "center" }}><Icon name="diary" size={36} /></div>
      <div className="cd-serif" style={{ fontSize: 16 }}>日記はまだ白紙です</div>
    </div>;
  }

  // 豆ごとに「古い順の試行番号」を割り当て（チャートと一致させる）
  const trialNo = {};
  const byBean = {};
  [...logs].sort((a, b) => a.createdAt - b.createdAt).forEach(l => {
    const key = beanLabel(l);
    (byBean[key] ||= 0); byBean[key] += 1; trialNo[l.id] = byBean[key];
  });

  // 最も淹れた回数の多い豆（サマリーの代理表示用）
  const topBean = (() => {
    const counts = {};
    logs.forEach(l => { const n = beanLabel(l); counts[n] = (counts[n] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  })();

  const months = [...new Set(logs.map(monthKey))];
  const usedBeans = [...new Set(logs.map(beanLabel))];
  const usedRoasts = ROAST_LEVELS.filter(r => logs.some(l => roastOf(l) === r));
  const active = monthF !== "all" || beanF !== "all" || roastF !== "all";

  // 一覧（新しい順）
  const filtered = logs
    .filter(l => (monthF === "all" || monthKey(l) === monthF) && (beanF === "all" || beanLabel(l) === beanF) && (roastF === "all" || roastOf(l) === roastF))
    .sort((a, b) => b.createdAt - a.createdAt);

  // サマリー対象：豆フィルターが選ばれていればその豆、なければ最多豆を代理表示
  const summaryBean = beanF !== "all" ? beanF : topBean;
  const beanLogs = summaryBean ? logs.filter(l => beanLabel(l) === summaryBean) : [];
  const showSummary = beanLogs.length >= 1;

  // 月グループ（新しい月が上）
  const groups = {};
  filtered.forEach(l => { (groups[monthKey(l)] ||= []).push(l); });

  const selStyle = { ...inputStyle, flex: "1 1 30%", minWidth: 100, fontSize: 13, padding: "9px 10px", appearance: "auto" };
  return (
    <div className="cd-fade">
      {/* 豆別サマリー：フィルター未選択でも最多豆で表示 */}
      {showSummary && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
            {beanF === "all" ? <>よく淹れる豆「<b style={{ color: "var(--mocha)" }}>{summaryBean}</b>」の傾向</> : <><b style={{ color: "var(--mocha)" }}>{summaryBean}</b> の抽出データ</>}
          </div>
          <BeanSummary logs={beanLogs} openLog={openLog} tab={sumTab} setTab={setSumTab} />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <select style={selStyle} value={monthF} onChange={e => setMonthF(e.target.value)}>
          <option value="all">すべての月</option>
          {months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select style={selStyle} value={beanF} onChange={e => setBeanF(e.target.value)}>
          <option value="all">すべての豆</option>
          {usedBeans.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <select style={selStyle} value={roastF} onChange={e => setRoastF(e.target.value)}>
          <option value="all">すべての焙煎度</option>
          {usedRoasts.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14 }}>
        {filtered.length} 杯{active && `（全${logs.length}杯中）`}
        {active && <button onClick={() => { setMonthF("all"); setBeanF("all"); setRoastF("all"); }} style={{ background: "none", border: "none", color: "var(--terra)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", marginLeft: 8 }}>クリア</button>}
      </div>
      {filtered.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: 20 }}>条件に合う記録がありません。</div>}
      {Object.entries(groups).map(([month, ls]) => (
        <div key={month} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--mocha)", marginBottom: 8 }}>{month}</div>
          {ls.map(l => <LogCard key={l.id} log={l} bean={beanOf(l.beanId)} trialNo={trialNo[l.id]} showBeanNo={beanF === "all"} onClick={() => openLog(l.id)} />)}
        </div>
      ))}
    </div>
  );
}

// ====== ログ詳細 ======
function LogDetail({ log: l, bean, grinder, dripper, startRecord, onEdit, onRequestDelete }) {
  let cum = 0;
  const chat = (l.chat || []).filter((_, i) => i !== 0);
  const beanName = bean?.name || l.beanName || "不明な豆";
  const grinderName = grinder?.name || l.grinderName || "ミル";
  const dripperName = dripper?.name || l.dripperName || "";
  return (
    <div className="cd-fade">
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
        <div className="cd-serif" style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.45, flex: 1 }}>{beanName}</div>
        <button onClick={onEdit} style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "1.5px solid var(--line)", color: "var(--mocha)", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "6px 12px", borderRadius: 20 }}><Icon name="pencil" size={14} />編集</button>
        <button onClick={onRequestDelete} title="削除" style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", background: "none", border: "1.5px solid var(--line)", color: "var(--muted)", cursor: "pointer", padding: 7, borderRadius: 20 }}><Icon name="trash" size={15} /></button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{new Date(l.createdAt).toLocaleString("ja-JP", { dateStyle: "long", timeStyle: "short" })}</span>
        <span style={{ color: "var(--crema)", fontSize: 15 }}>{"★".repeat(l.satisfaction)}<span style={{ color: "var(--line)" }}>{"★".repeat(5 - l.satisfaction)}</span></span>
      </div>

      <Section title="レシピ">
        <div style={{ display: "flex", gap: 14, fontSize: 13.5, flexWrap: "wrap", marginBottom: 10 }}>
          <span>粉 <b>{l.grounds}g</b></span><span>湯 <b>{l.water}ml</b></span><span>比率 <b>1:{(l.water / l.grounds).toFixed(1)}</b></span><span>{l.temp}℃</span><span>{grinderName} {l.grind}</span>{dripperName && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="dripper" size={14} />{dripperName}</span>}
        </div>
        <div style={{ background: "var(--cream)", borderRadius: 10, padding: "8px 12px" }}>
          {(l.pours || []).map((p, i) => { cum += Number(p.ml) || 0; return (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--bean)", padding: "3px 0" }}>
              <span style={{ flex: 1 }}>{p.label}</span><span style={{ color: "var(--muted)", flex: 1, textAlign: "center" }}>{fmtTime(p.t)}</span><span style={{ flex: 1, textAlign: "center" }}>+{p.ml}g</span><span style={{ fontWeight: 700, flex: 1, textAlign: "right" }}>{cum}g</span>
            </div>
          ); })}
        </div>
      </Section>

      <Section title="味わいメモ">
        {TASTE_AXES.map(ax => (
          <div key={ax} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
            <span style={{ fontSize: 12.5, width: 48, fontWeight: 700 }}>{ax}</span>
            <div style={{ flex: 1, height: 6, background: "var(--line)", borderRadius: 6, overflow: "hidden" }}>
              <div style={{ width: `${(l.taste[ax] / 5) * 100}%`, height: "100%", background: "var(--terra)" }} />
            </div>
            <span style={{ fontSize: 12, color: "var(--mocha)", width: 14 }}>{l.taste[ax]}</span>
          </div>
        ))}
        {flavorsOf(l).length > 0 && <div style={{ fontSize: 13, color: "var(--mocha)", marginTop: 10 }}>フレーバー：{flavorText(l)}</div>}
        {l.memo && <div style={{ fontSize: 13, color: "var(--bean)", marginTop: 8, fontStyle: "italic", background: "var(--cream)", padding: "8px 12px", borderRadius: 10 }}>“{l.memo}”</div>}
      </Section>

      {chat.length > 0 && (
        <Section title="AIとの相談">
          {chat.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 8 }}>
              <div style={{ maxWidth: "85%", padding: "9px 13px", borderRadius: 14, fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap", background: m.role === "user" ? "var(--terra)" : "var(--cream)", color: m.role === "user" ? "#fff" : "var(--espresso)" }}>{m.content}</div>
            </div>
          ))}
        </Section>
      )}

      {l.nextRecipe && (
        <Section title="この回から生まれた次の一杯">
          <div style={{ display: "flex", gap: 14, fontSize: 13.5, flexWrap: "wrap", marginBottom: 6 }}>
            <span>粉 <b>{l.nextRecipe.grounds}g</b></span><span>湯 <b>{l.nextRecipe.water}ml</b></span><span>{l.nextRecipe.temp}℃</span><span>粒度 <b>{l.nextRecipe.grind}</b></span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{l.nextRecipe.reason}</div>
        </Section>
      )}

      <Btn onClick={() => startRecord({ ...l, beanId: l.beanId }, "rec2")} style={{ width: "100%", marginTop: 6 }}>この一杯をもう一度淹れる</Btn>
    </div>
  );
}
function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--mocha)", marginBottom: 8, letterSpacing: ".04em" }}>{title}</div>
      <div style={{ background: "var(--paper)", borderRadius: 14, padding: 14, border: "1px solid var(--line)" }}>{children}</div>
    </div>
  );
}

// ====== 器具カルテ（ミル / ドリッパー 共通）======
function Equipment({ items, save, kind }) {
  const [editing, setEditing] = useState(null);
  const notify = useContext(ToastCtx);
  const cfg = kind === "grinder"
    ? { label: "ミル", namePh: "例：Comandante C40 / Niche Zero", typePh: "ハンドミル / 電動 など", notePh: "例：ペーパードリップは20〜24クリックが基準" }
    : { label: "ドリッパー", namePh: "例：Hario V60 02 / Origami / Kalita Wave", typePh: "円錐 / 台形 / 平底 など", notePh: "例：リブ深め・抜けが速い。中細挽き向き" };
  const blank = { id: "", name: "", type: "", note: "" };
  if (editing) {
    const e = editing;
    const set = (k, v) => setEditing({ ...e, [k]: v });
    return (
      <div className="cd-fade">
        <Field label="名前 *"><input style={inputStyle} value={e.name} onChange={ev => set("name", ev.target.value)} placeholder={cfg.namePh} /></Field>
        <Field label="タイプ"><input style={inputStyle} value={e.type} onChange={ev => set("type", ev.target.value)} placeholder={cfg.typePh} /></Field>
        <Field label="メモ"><textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={e.note} onChange={ev => set("note", ev.target.value)} placeholder={cfg.notePh} /></Field>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <Btn kind="ghost" onClick={() => setEditing(null)} style={{ flex: 1 }}>キャンセル</Btn>
          <Btn disabled={!e.name.trim()} style={{ flex: 2 }} onClick={() => {
            if (e.id) { save(items.map(g => g.id === e.id ? e : g)); notify("変更を保存しました"); }
            else { save([{ ...e, id: uid() }, ...items]); notify("My棚に追加しました"); }
            setEditing(null);
          }}>保存する</Btn>
        </div>
      </div>
    );
  }
  return (
    <div className="cd-fade">
      <Btn onClick={() => setEditing(blank)} style={{ width: "100%", marginBottom: 18 }}>＋ {cfg.label}を追加</Btn>
      {items.map(g => (
        <div key={g.id} onClick={() => setEditing(g)} style={{ background: "var(--paper)", borderRadius: 16, padding: 16, marginBottom: 10, cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div className="cd-serif" style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>{g.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {g.type && <div style={{ fontSize: 11, color: "#fff", background: "var(--mocha)", padding: "3px 9px", borderRadius: 20 }}>{g.type}</div>}
              <CardMenu items={[{ label: "編集", onClick: () => setEditing(g) }, { label: "削除", danger: true, onClick: () => { save(items.filter(x => x.id !== g.id)); notify("My棚から削除しました"); } }]} />
            </div>
          </div>
          {g.note && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6 }}>{g.note}</div>}
        </div>
      ))}
    </div>
  );
}

// ====== 豆カルテ ======
// 豆を飲み終えたとき（アーカイブ）の確認。「また買いたい？」は好みの分析・次の豆の提案に使う
const REBUY_OPTIONS = [["yes", "また買いたい"], ["maybe", "どちらでもない"], ["no", "もう買わない"]];
function ArchiveBeanModal({ bean, logs, onClose, onArchive }) {
  const [rebuy, setRebuy] = useState(bean.rebuy || "");
  const [note, setNote] = useState(bean.finishNote || "");
  const ls = (logs || []).filter(l => l.beanId === bean.id);
  const avg = ls.length ? ls.reduce((s, l) => s + (l.satisfaction || 0), 0) / ls.length : 0;
  const top = ls.length ? Math.max(...ls.map(l => l.satisfaction || 0)) : 0;
  return (
    <ModalShell title="この豆を飲み終えましたか？" onClose={onClose}>
      <div style={{ background: "var(--paper)", borderRadius: 14, padding: "12px 14px", marginBottom: 18 }}>
        <div className="cd-serif" style={{ fontSize: 15.5, fontWeight: 700 }}>{bean.name}</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>
          {ls.length ? <>{ls.length}杯 · 平均 <b style={{ color: "var(--terra)" }}>{avg.toFixed(1)}★</b> · 最高 {top}★</> : "記録はまだありません"}
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--mocha)", marginBottom: 8 }}>この豆、また買いたいですか？<span style={{ fontSize: 11, fontWeight: 400, color: "var(--muted)", marginLeft: 6 }}>任意</span></div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {REBUY_OPTIONS.map(([k, l]) => <Chip key={k} active={rebuy === k} onClick={() => setRebuy(rebuy === k ? "" : k)}>{l}</Chip>)}
      </div>
      <Field label="ひとことメモ（任意）">
        <textarea style={{ ...inputStyle, minHeight: 56, resize: "vertical" }} value={note} onChange={e => setNote(e.target.value)} placeholder="例：浅めの抽出がいちばんおいしかった" />
      </Field>
      <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.7, margin: "4px 0 14px" }}>アーカイブした豆は一覧の下にまとめられ、いつでも使用中に戻せます。記録は日記に残ります。</div>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn kind="ghost" onClick={onClose} style={{ flex: 1 }}>キャンセル</Btn>
        <Btn onClick={() => onArchive({ rebuy, finishNote: note.trim() })} style={{ flex: 2 }}>アーカイブする</Btn>
      </div>
    </ModalShell>
  );
}

function Beans({ beans, saveBeans, logs }) {
  const [archiving, setArchiving] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const notify = useContext(ToastCtx);
  const blank = { id: "", name: "", origin: "", variety: "", process: "", roastDate: "", roastLevel: "中煎り", shop: "", roasterNote: "" };
  if (editing) {
    const e = editing;
    const set = (k, v) => setEditing({ ...e, [k]: v });
    return (
      <div className="cd-fade">
        <Field label="名前 *"><input style={inputStyle} value={e.name} onChange={ev => set("name", ev.target.value)} placeholder="例：ケニア ニエリ AA" /></Field>
        <Field label="産地"><input style={inputStyle} value={e.origin} onChange={ev => set("origin", ev.target.value)} placeholder="国 / 地域" /></Field>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><Field label="品種"><input style={inputStyle} value={e.variety} onChange={ev => set("variety", ev.target.value)} /></Field></div>
          <div style={{ flex: 1 }}><Field label="精製"><input style={inputStyle} list="process-options" value={e.process} onChange={ev => set("process", ev.target.value)} placeholder="ウォッシュド等" /><datalist id="process-options">{PROCESS_OPTIONS.map(o => <option key={o} value={o} />)}</datalist></Field></div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><Field label="焙煎日"><input type="date" style={inputStyle} value={e.roastDate} onChange={ev => set("roastDate", ev.target.value)} /></Field></div>
          <div style={{ flex: 1 }}><Field label="焙煎度">
            <select style={inputStyle} value={e.roastLevel} onChange={ev => set("roastLevel", ev.target.value)}>{ROAST_LEVELS.map(r => <option key={r}>{r}</option>)}</select>
          </Field></div>
        </div>
        <Field label="購入店"><input style={inputStyle} value={e.shop} onChange={ev => set("shop", ev.target.value)} /></Field>
        <Field label="ロースターのフレーバーコメント"><textarea style={{ ...inputStyle, minHeight: 70, resize: "vertical" }} value={e.roasterNote} onChange={ev => set("roasterNote", ev.target.value)} /></Field>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <Btn kind="ghost" onClick={() => setEditing(null)} style={{ flex: 1 }}>キャンセル</Btn>
          <Btn disabled={!e.name.trim()} style={{ flex: 2 }} onClick={() => {
            if (e.id) { saveBeans(beans.map(b => b.id === e.id ? e : b)); notify("変更を保存しました"); }
            else { saveBeans([{ ...e, id: uid(), createdAt: Date.now() }, ...beans]); notify("My棚に追加しました"); }
            setEditing(null);
          }}>保存する</Btn>
        </div>
      </div>
    );
  }
  const fmtBeanDate = (b) => {
    if (b.roastDate) return `焙煎日 ${new Date(b.roastDate).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}`;
    if (b.createdAt) return `登録 ${new Date(b.createdAt).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}`;
    return "";
  };
  const activeBeans = beans.filter(b => !b.archived);
  const archivedBeans = beans.filter(b => b.archived);

  const BeanCard = ({ b, archived }) => (
    <div key={b.id} onClick={() => setEditing(b)} style={{ background: "var(--paper)", borderRadius: 16, padding: 16, marginBottom: 10, cursor: "pointer", opacity: archived ? 0.66 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div className="cd-serif" style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>{b.name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ fontSize: 11, color: "#fff", background: "var(--mocha)", padding: "3px 9px", borderRadius: 20 }}>{b.roastLevel}</div>
          <CardMenu items={[
            { label: "編集", onClick: () => setEditing(b) },
            archived
              ? { label: "使用中に戻す", onClick: () => { saveBeans(beans.map(x => x.id === b.id ? { ...x, archived: false } : x)); notify("使用中に戻しました"); } }
              : { label: "アーカイブ", onClick: () => setArchiving(b) },
            { label: "削除", danger: true, onClick: () => setConfirmDel(b) },
          ]} />
        </div>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>{[b.origin, b.process].filter(Boolean).join(" · ")}</div>
      {fmtBeanDate(b) && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{fmtBeanDate(b)}</div>}
      {b.roasterNote && <div style={{ fontSize: 12.5, color: "var(--mocha)", marginTop: 8, fontStyle: "italic" }}>“{b.roasterNote}”</div>}
      {archived && (b.rebuy || b.finishNote) && (
        <div style={{ fontSize: 12, color: "var(--bean)", marginTop: 8, display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
          {b.rebuy && <span style={{ fontWeight: 700, color: b.rebuy === "yes" ? "var(--terra)" : "var(--mocha)", border: "1px solid currentColor", borderRadius: 20, padding: "1px 8px", fontSize: 11 }}>{REBUY_OPTIONS.find(o => o[0] === b.rebuy)?.[1]}</span>}
          {b.finishNote && <span>{b.finishNote}</span>}
        </div>
      )}
    </div>
  );

  return (
    <div className="cd-fade">
      <Btn onClick={() => setEditing(blank)} style={{ width: "100%", marginBottom: 18 }}>＋ 豆を追加</Btn>
      {activeBeans.length === 0 && archivedBeans.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: 20 }}>まだ豆が登録されていません。</div>}
      {activeBeans.map(b => <BeanCard key={b.id} b={b} archived={false} />)}

      {archivedBeans.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button onClick={() => setShowArchived(v => !v)} style={{ width: "100%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 4px", cursor: "pointer", color: "var(--muted)", fontFamily: "'Zen Kaku Gothic New',sans-serif" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>アーカイブした豆（{archivedBeans.length}）</span>
            <span style={{ fontSize: 13, transform: showArchived ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▾</span>
          </button>
          {showArchived && <div className="cd-fade">{archivedBeans.map(b => <BeanCard key={b.id} b={b} archived={true} />)}</div>}
        </div>
      )}
      {archiving && (
        <ArchiveBeanModal bean={archiving} logs={logs} onClose={() => setArchiving(null)}
          onArchive={({ rebuy, finishNote }) => {
            saveBeans(beans.map(x => x.id === archiving.id ? { ...x, archived: true, archivedAt: Date.now(), rebuy, finishNote } : x));
            setArchiving(null); notify("アーカイブしました");
          }} />
      )}
      {confirmDel && (
        <div onClick={() => setConfirmDel(null)} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(44,30,21,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 28 }}>
          <div onClick={e => e.stopPropagation()} className="cd-fade" style={{ background: "var(--paper)", borderRadius: 20, padding: 24, maxWidth: 340, width: "100%", boxShadow: "0 16px 40px rgba(44,30,21,.3)" }}>
            <div className="cd-serif" style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>「{confirmDel.name}」を削除しますか？</div>
            <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.7, marginBottom: 18 }}>
              削除すると元に戻せません。日記の記録は残りますが、産地や焙煎度などの豆の情報は表示されなくなります。飲み終えた豆は「アーカイブ」がおすすめです。
            </div>
            <Btn style={{ width: "100%", marginBottom: 10, background: "var(--danger)" }} onClick={() => { const id = confirmDel.id; setConfirmDel(null); saveBeans(beans.filter(x => x.id !== id)); notify("My棚から削除しました"); }}>削除する</Btn>
            <Btn kind="ghost" style={{ width: "100%" }} onClick={() => setConfirmDel(null)}>キャンセル</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ====== STEP1 豆選択 ======
function Rec1({ draft, setDraft, beans, saveBeans, setScreen, editing, onSaveDirect }) {
  const [showArchived, setShowArchived] = useState(false);
  const [quickAdd, setQuickAdd] = useState(false);
  const notify = useContext(ToastCtx);
  const activeBeans = beans.filter(b => !b.archived || b.id === draft.beanId);
  const archivedBeans = beans.filter(b => b.archived && b.id !== draft.beanId);

  const BeanRow = (b) => {
    const sel = draft.beanId === b.id;
    return (
      <div key={b.id} onClick={() => setDraft({ ...draft, beanId: b.id, beanName: "" })}
        style={{ display: "flex", alignItems: "center", gap: 12, background: sel ? "var(--bean)" : "var(--paper)", color: sel ? "var(--cream)" : "var(--espresso)", borderRadius: 16, padding: 16, marginBottom: 10, cursor: "pointer", border: sel ? "1.5px solid var(--bean)" : "1.5px solid var(--line)", transition: "all .15s" }}>
        <div style={{ flex: 1 }}>
          <div className="cd-serif" style={{ fontSize: 16, fontWeight: 700 }}>{b.name}</div>
          <div style={{ fontSize: 12.5, opacity: .8, marginTop: 3 }}>{[b.origin, b.roastLevel].filter(Boolean).join(" · ")}</div>
        </div>
        <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: sel ? "var(--crema)" : "transparent", border: sel ? "none" : "2px solid var(--line)", color: "var(--espresso)" }}>
          {sel && <Icon name="check" size={15} />}
        </div>
      </div>
    );
  };

  return (
    <div className="cd-fade">
      <StepDots n={1} />
      {activeBeans.map(BeanRow)}

      {/* 新しい豆を登録 */}
      <button onClick={() => setQuickAdd(true)} style={{ width: "100%", background: "var(--paper)", border: "1.5px dashed var(--line)", borderRadius: 16, padding: 14, marginBottom: 10, cursor: "pointer", color: "var(--mocha)", fontSize: 13.5, fontWeight: 700, fontFamily: "'Zen Kaku Gothic New',sans-serif" }}>＋ 新しい豆を登録</button>

      {/* その他（登録せず今回だけ手入力） */}
      <div style={{ background: draft.beanName?.trim() ? "var(--bean)" : "var(--paper)", borderRadius: 16, padding: 14, marginBottom: 10, border: draft.beanName?.trim() ? "1.5px solid var(--bean)" : "1.5px dashed var(--line)", transition: "all .15s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: draft.beanName?.trim() ? "var(--cream)" : "var(--mocha)", marginBottom: 6 }}>その他（今回だけ）</div>
            <input value={draft.beanName || ""} onChange={e => setDraft({ ...draft, beanName: e.target.value, beanId: e.target.value ? null : draft.beanId })}
              placeholder="豆の名前を入力" style={{ ...inputStyle, background: "var(--paper)" }} />
          </div>
          <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: draft.beanName?.trim() ? "var(--crema)" : "transparent", border: draft.beanName?.trim() ? "none" : "2px solid var(--line)", color: "var(--espresso)" }}>
            {draft.beanName?.trim() && <Icon name="check" size={15} />}
          </div>
        </div>
      </div>

      {/* アーカイブから選ぶ */}
      {archivedBeans.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <button onClick={() => setShowArchived(v => !v)} style={{ width: "100%", background: "none", border: "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 4px", cursor: "pointer", color: "var(--muted)", fontFamily: "'Zen Kaku Gothic New',sans-serif" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700 }}>アーカイブから選ぶ（{archivedBeans.length}）</span>
            <span style={{ fontSize: 13, transform: showArchived ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▾</span>
          </button>
          {showArchived && <div className="cd-fade">{archivedBeans.map(BeanRow)}</div>}
        </div>
      )}

      {editing ? (
        // 日記の編集：「次へ」（メイン色）が上、「変更を保存」（枠線）が一番下。新規記録の流れと同じ見た目にそろえる
        <>
          <Btn disabled={!draft.beanId && !draft.beanName?.trim()} style={{ width: "100%", marginTop: 6 }} onClick={() => setScreen("rec2")}>次へ：レシピ</Btn>
          <Btn kind="ghost" disabled={!draft.beanId && !draft.beanName?.trim()} style={{ width: "100%", marginTop: 10 }} onClick={onSaveDirect}>変更を保存</Btn>
        </>
      ) : (
        <Btn disabled={!draft.beanId && !draft.beanName?.trim()} style={{ width: "100%", marginTop: 6 }} onClick={() => setScreen("rec2")}>次へ：レシピ</Btn>
      )}

      {quickAdd && <QuickAddBean onClose={() => setQuickAdd(false)} onSave={(bean) => {
        const nb = { ...bean, id: uid(), createdAt: Date.now() };
        saveBeans([nb, ...beans]);
        setDraft({ ...draft, beanId: nb.id, beanName: "" });
        setQuickAdd(false);
        notify("My棚に追加しました");
      }} />}
    </div>
  );
}

// 淹れる画面からの豆の簡易登録（名前・産地・焙煎度・精製）
function QuickAddBean({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [origin, setOrigin] = useState("");
  const [roastLevel, setRoastLevel] = useState("中煎り");
  const [process, setProcess] = useState("");
  return (
    <ModalShell title="新しい豆を登録" onClose={onClose}>
      <Field label="名前（必須）"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="例：エチオピア イルガチェフェ" /></Field>
      <Field label="産地"><input style={inputStyle} value={origin} onChange={e => setOrigin(e.target.value)} placeholder="例：エチオピア" /></Field>
      <Field label="焙煎度"><select style={inputStyle} value={roastLevel} onChange={e => setRoastLevel(e.target.value)}>{ROAST_LEVELS.map(r => <option key={r}>{r}</option>)}</select></Field>
      <Field label="精製方法（任意）">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PROCESS_OPTIONS.map(o => <Chip key={o} small active={process === o} onClick={() => setProcess(process === o ? "" : o)}>{o}</Chip>)}
        </div>
      </Field>
      <div style={{ fontSize: 11, color: "var(--muted)", margin: "6px 0 2px", lineHeight: 1.7 }}>品種・焙煎日・購入店などの詳細は、あとからMy棚で追記できます。</div>
      <Btn disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), origin: origin.trim(), roastLevel, variety: "", process, roastDate: "", shop: "", roasterNote: "" })} style={{ width: "100%", marginTop: 14 }}>登録して選択</Btn>
    </ModalShell>
  );
}

// ====== レシピ入力（共通部品）======
function RecipeFields({ value, setValue, grinders, saveGrinders, drippers, saveDrippers, favorites, saveFavorites }) {
  const notify = useContext(ToastCtx);
  const registerGrinder = () => {
    const nm = (value.grinderName || "").trim();
    if (!nm || !saveGrinders) return;
    const ng = { id: uid(), name: nm, createdAt: Date.now() };
    saveGrinders([ng, ...grinders]);
    setValue({ ...value, grinderId: ng.id, grinderName: "" });
    setGrindText(false);
    notify("My棚に追加しました");
  };
  const registerDripper = () => {
    const nm = (value.dripperName || "").trim();
    if (!nm || !saveDrippers) return;
    const nd = { id: uid(), name: nm, createdAt: Date.now() };
    saveDrippers([nd, ...drippers]);
    setValue({ ...value, dripperId: nd.id, dripperName: "" });
    setDripText(false);
    notify("My棚に追加しました");
  };
  const [showFav, setShowFav] = useState(false);
  const [favOpen, setFavOpen] = useState(null);
  const [confirmDelFav, setConfirmDelFav] = useState(null);
  const [naming, setNaming] = useState(false);
  const [favName, setFavName] = useState("");
  const [dripText, setDripText] = useState(!!value.dripperName);
  const [grindText, setGrindText] = useState(!!value.grinderName);
  const num = (k, label, unit) => (
    <div style={{ flex: 1 }}>
      <Field label={label}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <NumberInput value={value[k]} onChange={v => k === "water" ? setWater(v) : setValue({ ...value, [k]: v })} style={inputStyle} />
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{unit}</span>
        </div>
      </Field>
    </div>
  );
  const pours = value.pours || [];
  const ratio = value.grounds ? (value.water / value.grounds).toFixed(1) : "–";
  const isPct = value.pourUnit === "%";
  const defaultRate = Number(value.flowRate) || 4;
  const updatePour = (i, k, v) => { const p = [...pours]; p[i] = { ...p[i], [k]: Number(v) }; setValue({ ...value, pours: p }); };
  // %入力：比率を保持しつつ、g（ml）は総湯量から算出して常に持たせる（タイマー・日記・AIはmlを使う）
  const setPourPct = (i, v) => {
    const p = [...pours]; p[i] = { ...p[i], pct: Number(v), ml: pctToMl(v, value.water) }; setValue({ ...value, pours: p });
  };
  const setWater = (w) => {
    if (!isPct) return setValue({ ...value, water: w });
    setValue({ ...value, water: w, pours: pours.map(p => { const pct = pourPct(p, value.water); return { ...p, pct, ml: pctToMl(pct, w) }; }) });
  };
  const setUnit = (u) => {
    if (u === (isPct ? "%" : "g")) return;
    // g→% に切り替えた時点のgから比率を計算し直して記録する（g表示中に編集された分を反映）
    setValue({ ...value, pourUnit: u, pours: u === "%" ? pours.map(p => ({ ...p, pct: pourPct({ ml: p.ml }, value.water) })) : pours });
  };
  const pctSum = Math.round(pours.reduce((s, p) => s + pourPct(p, value.water), 0) * 10) / 10;
  // ％は小数1桁で丸めるため、合計が100.1%などになることがある（例：1/6=16.7%×6）。丸め誤差の範囲かgの合計が総湯量と一致していればOK
  const pctOk = Math.abs(pctSum - 100) <= 0.05 * pours.length + 1e-9 || pours.reduce((s, p) => s + (Number(p.ml) || 0), 0) === Number(value.water);
  // 注ぎの速さ：off＝管理しない / all＝全投一括 / each＝投ごと
  const rateMode = value.rateMode || "all";
  const showRateCol = rateMode === "each";
  const setRateMode = (m) => {
    if (m === rateMode) return;
    // 投ごとに切り替えたときは、未設定の投に一括の値を入れておく
    setValue({ ...value, rateMode: m, pours: m === "each" ? pours.map(p => ({ ...p, rate: p.rate ?? defaultRate })) : pours });
  };
  const seg = (opts, cur, onPick) => (
    <div style={{ display: "inline-flex", border: "1.5px solid var(--line)", borderRadius: 20, overflow: "hidden", flexShrink: 0 }}>
      {opts.map(([k, l]) => {
        const on = cur === k;
        return <button key={k} onClick={() => onPick(k)} style={{ background: on ? "var(--mocha)" : "transparent", color: on ? "var(--cream)" : "var(--mocha)", border: "none", padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>{l}</button>;
      })}
    </div>
  );
  const setPourTime = (i, t) => { const p = [...pours]; p[i] = { ...p[i], t }; setValue({ ...value, pours: p }); };
  // 表のセル移動（PC）：↑↓・Enterで上下、←→はカーソルが端にあるか全選択のときに左右
  const tableRef = useRef(null);
  const onCellKey = (e) => {
    if (e.nativeEvent.isComposing) return; // 日本語変換中の矢印・Enterは変換操作に使う
    const el = e.target, r = Number(el.dataset.row), c = Number(el.dataset.col);
    const all = el.selectionStart === 0 && el.selectionEnd === el.value.length;
    let dr = 0, dc = 0;
    if (e.key === "ArrowUp") dr = -1;
    else if (e.key === "ArrowDown" || e.key === "Enter") dr = e.shiftKey ? -1 : 1;
    else if (e.key === "ArrowLeft" && (all || el.selectionStart === 0)) dc = -1;
    else if (e.key === "ArrowRight" && (all || el.selectionEnd === el.value.length)) dc = 1;
    else return;
    const to = tableRef.current?.querySelector(`[data-row="${r + dr}"][data-col="${c + dc}"]`);
    if (to) { e.preventDefault(); to.focus(); }
  };
  const cell = (i, col) => ({ "data-row": i, "data-col": col, onKeyDown: onCellKey });
  const loadFav = (f) => {
    setValue({ ...value, grounds: f.grounds, water: f.water, temp: f.temp, grinderId: f.grinderId, dripperId: f.dripperId ?? value.dripperId, grinderName: f.grinderName || "", dripperName: f.dripperName || "", grind: f.grind, pourUnit: f.pourUnit || "g", rateMode: f.rateMode || "all", flowRate: f.flowRate || 4, pours: f.pours.map(p => ({ ...p })) });
    setDripText(!!f.dripperName); setGrindText(!!f.grinderName);
    setShowFav(false);
  };
  const registerFav = () => {
    if (!favName.trim()) return;
    saveFavorites([{ id: uid(), name: favName.trim(), grounds: value.grounds, water: value.water, temp: value.temp, grinderId: value.grinderId, dripperId: value.dripperId, grinderName: value.grinderName || "", dripperName: value.dripperName || "", grind: value.grind, pourUnit: value.pourUnit || "g", rateMode, flowRate: defaultRate, pours: pours.map(p => ({ ...p })) }, ...favorites]);
    setFavName(""); setNaming(false);
    notify("定番レシピに登録しました");
  };
  let cum = 0;
  return (
    <>
      {favorites && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn kind="soft" onClick={() => { setShowFav(!showFav); setNaming(false); }} style={{ flex: 1, padding: "10px", fontSize: 13.5 }}>★ 定番レシピから選ぶ</Btn>
            <Btn kind="soft" onClick={() => { setNaming(!naming); setShowFav(false); }} style={{ flex: 1, padding: "10px", fontSize: 13.5 }}>☆ 定番レシピに登録</Btn>
          </div>
          {showFav && (
            <div className="cd-fade" style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: 10, marginTop: 8 }}>
              {favorites.length === 0 && <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "6px 4px" }}>まだ定番レシピがありません。</div>}
              {favorites.map(f => {
                const g = grinders.find(x => x.id === f.grinderId);
                const d = (drippers || []).find(x => x.id === f.dripperId);
                const open = favOpen === f.id;
                let c = 0;
                return (
                  <div key={f.id} style={{ borderBottom: "1px dotted var(--line)", padding: "10px 4px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{f.name}</div>
                        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>粉{f.grounds}g / 湯{f.water}ml（1:{(f.water / f.grounds).toFixed(1)}）/ {f.temp}℃{(d?.name || f.dripperName) ? ` / ${d?.name || f.dripperName}` : ""}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => setFavOpen(open ? null : f.id)} style={{ background: "none", border: "none", color: "var(--mocha)", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{open ? "詳細 ▲" : "詳細 ▼"}</button>
                        <button onClick={() => setConfirmDelFav(confirmDelFav === f.id ? null : f.id)} title="削除" style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", display: "inline-flex", padding: 2 }}><Icon name="trash" size={15} /></button>
                      </div>
                    </div>
                    {confirmDelFav === f.id && (
                      <div className="cd-fade" style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginTop: 8, fontSize: 12.5 }}>
                        <span style={{ color: "var(--muted)", marginRight: "auto" }}>このレシピを削除しますか？</span>
                        <button onClick={() => setConfirmDelFav(null)} style={{ background: "none", border: "1px solid var(--line)", color: "var(--mocha)", fontWeight: 700, borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}>やめる</button>
                        <button onClick={() => { saveFavorites(favorites.filter(x => x.id !== f.id)); if (favOpen === f.id) setFavOpen(null); setConfirmDelFav(null); notify("定番レシピを削除しました"); }} style={{ background: "var(--danger)", border: "none", color: "#fff", fontWeight: 700, borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}>削除する</button>
                      </div>
                    )}
                    {open && (
                      <div className="cd-fade" style={{ background: "var(--cream)", borderRadius: 10, padding: "8px 10px", margin: "8px 0" }}>
                        <div style={{ fontSize: 11.5, color: "var(--mocha)", marginBottom: 4 }}>{g?.name || f.grinderName || "ミル"} {f.grind}クリック</div>
                        {f.pours.map((p, i) => { c += Number(p.ml) || 0; return (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--bean)", padding: "2px 0" }}>
                            <span>{p.label}</span><span style={{ color: "var(--muted)" }}>{fmtTime(p.t)}</span><span>+{p.ml}g</span><span style={{ fontWeight: 700 }}>{c}g</span>
                          </div>
                        ); })}
                      </div>
                    )}
                    <Btn onClick={() => loadFav(f)} style={{ width: "100%", padding: "8px", fontSize: 13, marginTop: open ? 0 : 8 }}>このレシピを使う</Btn>
                  </div>
                );
              })}
            </div>
          )}
          {naming && (
            <div className="cd-fade" style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input style={{ ...inputStyle, flex: 1 }} value={favName} onChange={e => setFavName(e.target.value)} placeholder="レシピ名（例：イルガ4:6）" onKeyDown={e => e.key === "Enter" && registerFav()} />
              <Btn onClick={registerFav} disabled={!favName.trim()} style={{ padding: "11px 16px" }}>保存</Btn>
            </div>
          )}
        </div>
      )}
      <div style={{ display: "flex", gap: 10 }}>{num("grounds", "粉量", "g")}{num("water", "総湯量", "ml")}</div>
      <div style={{ display: "flex", gap: 10 }}>{num("temp", "湯温", "℃")}</div>
      <Field label="ドリッパー">
        {!dripText ? (
          <select style={inputStyle} value={value.dripperId || ""} onChange={e => { if (e.target.value === "__text__") { setDripText(true); setValue({ ...value, dripperId: "" }); } else setValue({ ...value, dripperId: e.target.value, dripperName: "" }); }}>
            <option value="" disabled>選択</option>
            {(drippers || []).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            <option value="__text__">＋ その他</option>
          </select>
        ) : (
          <input style={inputStyle} value={value.dripperName || ""} onChange={e => setValue({ ...value, dripperName: e.target.value, dripperId: "" })} placeholder="ドリッパー名を入力" />
        )}
      </Field>
      {dripText && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: -4, marginBottom: 8 }}>
        {saveDrippers ? <button onClick={registerDripper} disabled={!value.dripperName?.trim()} style={{ background: "none", border: "none", color: value.dripperName?.trim() ? "var(--terra)" : "var(--muted)", fontSize: 12, fontWeight: 700, cursor: value.dripperName?.trim() ? "pointer" : "default", padding: 0 }}>＋ My棚に登録</button> : <span />}
        <button onClick={() => { setDripText(false); setValue({ ...value, dripperName: "" }); }} style={{ background: "none", border: "none", color: "var(--mocha)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>My棚から選ぶ</button>
      </div>}
      <Field label="グラインダー・粒度">
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!grindText ? (
            <select style={{ ...inputStyle, flex: 2 }} value={value.grinderId || ""} onChange={e => { if (e.target.value === "__text__") { setGrindText(true); setValue({ ...value, grinderId: "" }); } else setValue({ ...value, grinderId: e.target.value, grinderName: "" }); }}>
              <option value="" disabled>選択</option>
              {grinders.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              <option value="__text__">＋ その他</option>
            </select>
          ) : (
            <input style={{ ...inputStyle, flex: 2 }} value={value.grinderName || ""} onChange={e => setValue({ ...value, grinderName: e.target.value, grinderId: "" })} placeholder="ミル名を入力" />
          )}
          <NumberInput value={value.grind} onChange={v => setValue({ ...value, grind: v })} style={{ ...inputStyle, flex: 1 }} />
          <span style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>クリック</span>
        </div>
      </Field>
      {grindText && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: -4, marginBottom: 8 }}>
        {saveGrinders ? <button onClick={registerGrinder} disabled={!value.grinderName?.trim()} style={{ background: "none", border: "none", color: value.grinderName?.trim() ? "var(--terra)" : "var(--muted)", fontSize: 12, fontWeight: 700, cursor: value.grinderName?.trim() ? "pointer" : "default", padding: 0 }}>＋ My棚に登録</button> : <span />}
        <button onClick={() => { setGrindText(false); setValue({ ...value, grinderName: "" }); }} style={{ background: "none", border: "none", color: "var(--mocha)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>My棚から選ぶ</button>
      </div>}
      {(dripText || grindText) && <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>「My棚に登録」すると、次から選択できます。</div>}
      <div style={{ background: "var(--paper)", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "var(--mocha)", marginBottom: 18 }}>抽出比率 <b style={{ color: "var(--terra)" }}>1 : {ratio}</b></div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--mocha)" }}>注ぎ（レシピ）</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>注ぐ量の単位</span>
          {seg([["g", "g"], ["%", "%"]], isPct ? "%" : "g", setUnit)}
        </div>
      </div>
      <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: "9px 12px", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--mocha)" }}>注ぎの速さ</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {rateMode === "all" && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <NumberInput value={value.flowRate ?? 4} onChange={v => setValue({ ...value, flowRate: v })} style={{ ...cellInput, width: 48, padding: "5px 2px" }} />
                <span style={{ fontSize: 11, color: "var(--muted)" }}>ml/秒</span>
              </div>
            )}
            {seg([["off", "なし"], ["all", "一括"], ["each", "投ごと"]], rateMode, setRateMode)}
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4 }}>
          {rateMode === "off" ? `速さは管理しません（タイマーの注ぎ時間は ${defaultRate}ml/秒 の目安で表示）`
            : rateMode === "all" ? "全投を同じ速さで注ぎます。タイマーの「何秒かけて注ぐか」の目安になります"
            : "投ごとに速さを設定します（表の「速さ」列）"}
        </div>
      </div>
      <table ref={tableRef} style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", marginBottom: 10 }}>
        <colgroup>{(showRateCol ? [21, 20, 19, 15, 18, 7] : [25, 23, 22, 22, 8]).map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}</colgroup>
        <thead>
          <tr style={{ borderBottom: "1.5px solid var(--mocha)" }}>
            {["投数", "時間", <span key="a">注ぐ量<br /><span style={{ fontSize: 9, fontWeight: 400, color: "var(--muted)" }}>{isPct ? "総湯量比 %" : "g"}</span></span>, showRateCol && <span key="r">速さ<br /><span style={{ fontSize: 9, fontWeight: 400, color: "var(--muted)" }}>ml/秒</span></span>, <span key="t">総量<br /><span style={{ fontSize: 9, fontWeight: 400, color: "var(--muted)" }}>スケール表示</span></span>, ""].filter(h => h !== false).map((h, i, arr) => (
              <th key={i} style={{ fontSize: 11.5, fontWeight: 700, color: "var(--mocha)", padding: "0 0 7px", textAlign: i === arr.length - 1 ? "right" : "center", verticalAlign: "bottom" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pours.map((p, i) => {
            cum += Number(p.ml) || 0;
            return (
              <tr key={i} style={{ borderBottom: "1px dotted var(--line)" }}>
                <td style={{ padding: "7px 2px" }}>
                  <input style={cellInput} value={p.label} {...cell(i, 0)} onFocus={e => selectAllSoon(e.target)} onChange={e => { const pp = [...pours]; pp[i] = { ...pp[i], label: e.target.value }; setValue({ ...value, pours: pp }); }} />
                </td>
                <td style={{ padding: "7px 2px" }}>
                  <TimeInput value={p.t || 0} onChange={t => setPourTime(i, t)} style={cellInput} {...cell(i, 1)} />
                </td>
                <td style={{ padding: "7px 2px" }}>
                  {isPct
                    ? <NumberInput value={pourPct(p, value.water)} onChange={v => setPourPct(i, v)} style={cellInput} {...cell(i, 2)} />
                    : <NumberInput value={p.ml} onChange={v => updatePour(i, "ml", v)} style={cellInput} {...cell(i, 2)} />}
                </td>
                {showRateCol && <td style={{ padding: "7px 2px" }}>
                  <NumberInput value={p.rate ?? defaultRate} onChange={v => updatePour(i, "rate", v)} style={cellInput} {...cell(i, 3)} />
                </td>}
                <td style={{ padding: "7px 2px", textAlign: "center", fontWeight: 700, fontSize: 13.5, color: "var(--bean)", lineHeight: 1.2 }}>
                  {cum}g
                  {isPct && <div style={{ fontSize: 10, fontWeight: 400, color: "var(--muted)" }}>+{Number(p.ml) || 0}g</div>}
                </td>
                <td style={{ padding: "7px 0", textAlign: "right" }}>
                  <button onClick={() => setValue({ ...value, pours: pours.filter((_, j) => j !== i) })} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 18, cursor: "pointer", padding: 0 }}>×</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {isPct && pours.length > 0 && (
        <div style={{ fontSize: 12, marginBottom: 10, color: pctOk ? "var(--muted)" : "var(--terra)", fontWeight: pctOk ? 400 : 700 }}>
          {pctOk ? `合計 100%（総湯量 ${value.water}ml）` : `合計 ${pctSum}% — 100%になるよう調整してください（現在 ${cum}g / 総湯量 ${value.water}ml）`}
        </div>
      )}
      <button onClick={() => {
        const last = pours[pours.length - 1];
        const np = { label: `${pours.length + 1}投目`, t: pours.length === 0 ? 0 : (last.t || 0) + 45, ml: 60, rate: last?.rate ?? defaultRate };
        if (isPct) { np.pct = !pctOk && pctSum < 100 ? Math.round((100 - pctSum) * 10) / 10 : 20; np.ml = pctToMl(np.pct, value.water); }
        setValue({ ...value, pours: [...pours, np] });
      }}
        style={{ background: "var(--cream)", border: "1.5px dashed var(--line)", borderRadius: 12, padding: "9px", width: "100%", color: "var(--mocha)", cursor: "pointer", fontFamily: "inherit", fontSize: 13, marginBottom: 18 }}>＋ 投を追加</button>
    </>
  );
}

// ====== STEP2 レシピ ======
// ====== ドリップタイマー ======
function DripTimer({ draft, grinders, drippers, onFinish, onExit }) {
  const flowRate = Number(draft.flowRate) || 4; // ml/s（投ごとの速さが無い古いデータ用）
  const pours = (draft.pours || []).map(p => ({ ...p, t: Number(p.t) || 0, ml: Number(p.ml) || 0, rate: (draft.rateMode === "each" && Number(p.rate)) || flowRate }));
  const [countdown, setCountdown] = useState(3);
  const [started, setStarted] = useState(false);
  const [elapsed, setElapsed] = useState(0); // 秒（小数）
  const startRef = useRef(null);
  const rafRef = useRef(null);
  const notifiedRef = useRef(new Set());

  // 3,2,1 カウントダウン
  useEffect(() => {
    if (started) return;
    if (countdown <= 0) { setStarted(true); startRef.current = performance.now(); return; }
    const t = setTimeout(() => setCountdown(c => c - 1), 900);
    return () => clearTimeout(t);
  }, [countdown, started]);

  // 経過時間の更新
  useEffect(() => {
    if (!started) return;
    const tick = () => {
      setElapsed((performance.now() - startRef.current) / 1000);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [started]);

  // 各投の注ぎ時間（秒）と終了時刻
  const withTiming = pours.map(p => {
    const dur = Math.max(3, Math.round(p.ml / p.rate)); // 注ぎにかかる目安秒数
    return { ...p, dur, end: p.t + dur };
  });
  const totalEnd = withTiming.length ? Math.max(...withTiming.map(p => p.end)) + 30 : 0; // 最後の投＋落ち切り30秒

  // 現在の状態を判定
  const curIdx = (() => {
    for (let i = withTiming.length - 1; i >= 0; i--) if (elapsed >= withTiming[i].t) return i;
    return -1;
  })();
  const cur = curIdx >= 0 ? withTiming[curIdx] : null;
  const next = withTiming[curIdx + 1] || null;
  const pouring = cur && elapsed < cur.end;

  // バイブ通知（各投の開始時）
  useEffect(() => {
    if (!started || curIdx < 0) return;
    if (notifiedRef.current.has(curIdx)) return;
    notifiedRef.current.add(curIdx);
    if (navigator.vibrate) navigator.vibrate(pouring ? [90, 60, 90] : 60);
  }, [curIdx, started, pouring]);

  const done = started && elapsed >= totalEnd;

  // 累計目標
  const cumTarget = withTiming.slice(0, curIdx + 1).reduce((s, p) => s + p.ml, 0);
  const prevCum = withTiming.slice(0, curIdx).reduce((s, p) => s + p.ml, 0);
  // 注ぎ中はリアルタイムに増える推定値
  const liveGrams = pouring && cur ? Math.min(cumTarget, prevCum + (elapsed - cur.t) * cur.rate) : cumTarget;

  // 円の進捗（注ぎ中＝注ぎの進捗 / 待機中＝次の投までの進捗）
  const ring = (() => {
    if (!started) return 0;
    if (pouring && cur) return (elapsed - cur.t) / cur.dur;
    if (next) { const from = cur ? cur.end : 0; return Math.min(1, (elapsed - from) / Math.max(0.001, next.t - from)); }
    return Math.min(1, (elapsed - (cur?.end || 0)) / 30); // 落ち切り
  })();

  const R = 108, C = 2 * Math.PI * R;
  const fmt = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;
  const remain = pouring && cur ? cur.end - elapsed : next ? next.t - elapsed : Math.max(0, totalEnd - elapsed);
  const totalWater = withTiming.reduce((s, p) => s + p.ml, 0);
  // 次の投で到達する累計
  const nextCumTarget = next ? withTiming.slice(0, curIdx + 2).reduce((s, p) => s + p.ml, 0) : totalWater;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 70, background: "var(--cream)", display: "flex", flexDirection: "column", maxWidth: 480, margin: "0 auto" }}>
      {/* ヘッダー */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px" }}>
        <button onClick={onExit} style={{ background: "none", border: "none", color: "var(--mocha)", fontSize: 13.5, fontWeight: 700, cursor: "pointer" }}>やめる</button>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>全体 <b className="cd-serif" style={{ fontSize: 15, color: "var(--bean)" }}>{fmt(elapsed)}</b></div>
      </div>

      {!started ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div key={countdown} className="cd-serif" style={{ fontSize: 96, fontWeight: 700, color: "var(--terra)", animation: "cdpop .9s ease both" }}>{countdown > 0 ? countdown : "☕"}</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>準備してください</div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 20px" }}>
          {/* 状態バナー（注ぐ / 待機をはっきり） */}
          {!done && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 18px", borderRadius: 30, marginBottom: 14,
              background: pouring ? "var(--terra)" : "transparent", border: pouring ? "none" : "1.5px solid var(--line)",
              color: pouring ? "#fff" : "var(--muted)", fontSize: 13, fontWeight: 700, letterSpacing: ".06em" }}>
              {pouring ? <><span className="cd-pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />注ぐ</> : next ? "待機 — 注がない" : "落ち切り待ち"}
            </div>
          )}

          {/* 円形タイマー */}
          <div style={{ position: "relative", width: 260, height: 260 }}>
            <svg width="260" height="260" viewBox="0 0 260 260">
              <g style={{ transform: "rotate(-90deg)", transformOrigin: "130px 130px" }}>
                <circle cx="130" cy="130" r={R} fill="none" stroke="var(--line)" strokeWidth="10" />
                <circle cx="130" cy="130" r={R} fill="none" stroke={pouring ? "var(--terra)" : "var(--crema)"} strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, Math.max(0, ring)))} style={{ transition: "stroke .3s" }} />
              </g>
            </svg>
            {/* 中心 */}
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
              {done ? (
                <>
                  <div className="cd-serif" style={{ fontSize: 26, fontWeight: 700, color: "var(--bean)" }}>完成</div>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 6 }}>お疲れさまでした</div>
                </>
              ) : pouring ? (
                <>
                  <div className="cd-serif" style={{ fontSize: 20, fontWeight: 700, color: "var(--bean)" }}>{cur.label}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 3, marginTop: 2 }}>
                    <span className="cd-serif" style={{ fontSize: 44, fontWeight: 700, color: "var(--terra)", lineHeight: 1 }}>{Math.round(liveGrams)}</span>
                    <span className="cd-serif" style={{ fontSize: 22, fontWeight: 700, color: "var(--muted)" }}>/{cumTarget}g</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>この投で +{cur.ml}g（約{cur.dur}秒）</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>全体 {Math.round(liveGrams)}/{totalWater}g</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700 }}>{next ? "次は" : "まもなく完成"}</div>
                  <div className="cd-serif" style={{ fontSize: 24, fontWeight: 700, marginTop: 2 }}>{next ? next.label : "—"}</div>
                  <div className="cd-serif" style={{ fontSize: 40, fontWeight: 700, color: "var(--bean)", marginTop: 4, lineHeight: 1 }}>{fmt(remain)}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
                    {next ? `${nextCumTarget}g まで注ぎます` : `落ち切りまで`}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>現在 {Math.round(liveGrams)}/{totalWater}g</div>
                </>
              )}
            </div>
          </div>

          {/* 投の一覧 */}
          <div style={{ width: "100%", marginTop: 22 }}>
            {withTiming.map((p, i) => {
              const state = elapsed >= p.end ? "done" : elapsed >= p.t ? "now" : "todo";
              let c = withTiming.slice(0, i + 1).reduce((s, x) => s + x.ml, 0);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10, marginBottom: 5, background: state === "now" ? "rgba(179,85,47,.1)" : "transparent", opacity: state === "done" ? 0.45 : 1 }}>
                  <div style={{ width: 18, color: state === "done" ? "var(--terra)" : "var(--line)" }}>{state === "done" ? <Icon name="check" size={16} /> : <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: state === "now" ? "var(--terra)" : "var(--line)" }} />}</div>
                  <div style={{ fontSize: 13, fontWeight: state === "now" ? 700 : 400, flex: 1 }}>{p.label}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{fmt(p.t)}</div>
                  <div style={{ fontSize: 12.5, width: 52, textAlign: "right" }}>+{p.ml}g</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", width: 44, textAlign: "right", fontWeight: 700 }}>{c}g</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* フッター */}
      <div style={{ padding: "14px 20px 26px" }}>
        {done
          ? <Btn onClick={onFinish} style={{ width: "100%" }}>味わいメモへ →</Btn>
          : <Btn kind="ghost" onClick={onFinish} style={{ width: "100%" }} disabled={!started}>淹れ終えた（記録へ）</Btn>}
      </div>
    </div>
  );
}

function Rec2({ editing, onSaveDirect, draft, setDraft, beans, grinders, saveGrinders, drippers, saveDrippers, favorites, saveFavorites, setScreen }) {
  const beanName = beans.find(b => b.id === draft.beanId)?.name || draft.beanName || "未選択";
  return (
    <div className="cd-fade">
      <StepDots n={2} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bean)", color: "var(--cream)", borderRadius: 14, padding: "12px 16px", marginBottom: 18 }}>
        <span style={{ fontSize: 11, opacity: .7, fontWeight: 700, letterSpacing: ".08em" }}>豆</span>
        <span className="cd-serif" style={{ fontSize: 15.5, fontWeight: 700, flex: 1 }}>{beanName}</span>
        <button onClick={() => setScreen("rec1")} style={{ background: "rgba(241,232,219,.18)", border: "none", color: "var(--cream)", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "5px 12px", borderRadius: 20 }}>変更</button>
      </div>
      <RecipeFields value={draft} setValue={setDraft} grinders={grinders} saveGrinders={saveGrinders} drippers={drippers} saveDrippers={saveDrippers} favorites={favorites} saveFavorites={saveFavorites} />

      {editing ? (
        <>
          <Btn style={{ width: "100%", marginBottom: 10 }} onClick={() => setScreen("rec3")}>次へ：味わいメモ</Btn>
          <Btn kind="ghost" style={{ width: "100%" }} onClick={onSaveDirect}>変更を保存</Btn>
        </>
      ) : (
        <>
          <Btn onClick={() => setScreen("timer")} style={{ width: "100%", marginBottom: 10, background: "var(--crema)", color: "var(--espresso)", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <Icon name="brew" size={18} />ドリップスタート
          </Btn>
          <Btn style={{ width: "100%" }} onClick={() => setScreen("rec3")}>次へ：味わいメモ</Btn>
        </>
      )}
    </div>
  );
}

// ====== STEP3 味の評価（問診票）======
function Rec3({ draft, setDraft, setScreen, editing, onSaveDirect }) {
  const setTaste = (k, v) => setDraft({ ...draft, taste: { ...draft.taste, [k]: Number(v) } });
  const req = <span style={{ color: "var(--terra)", fontSize: 11, marginLeft: 6 }}>必須</span>;
  const sel = flavorsOf(draft);
  // 大分類はタブのように見る分類を切り替えるだけ。細かい香りの欄は、最後に選んだ中分類について開く
  const [tab, setTab] = useState(() => flavorBigOf(sel[0]?.small) || "");
  const [focus, setFocus] = useState("");
  const [maxMsg, setMaxMsg] = useState(false);
  const setFlavors = (list) => setDraft({ ...draft, flavors: list, flavorBig: flavorBigOf(list[0]?.small) || "", flavorSmall: list[0]?.small || "", flavorDetail: list[0]?.detail || "" });
  const toggleSmall = (sm) => {
    setMaxMsg(false);
    if (sel.some(f => f.small === sm)) { setFlavors(sel.filter(f => f.small !== sm)); if (focus === sm) setFocus(""); return; }
    if (sel.length >= MAX_FLAVORS) { setMaxMsg(true); return; }
    setFlavors([...sel, { small: sm, detail: "" }]); setFocus(sm);
  };
  const toggleDetail = (sm, d) => setFlavors(sel.map(f => f.small === sm ? { ...f, detail: f.detail === d ? "" : d } : f));
  // datetime-local 用（ローカル時刻の YYYY-MM-DDTHH:mm）
  const dtValue = (() => {
    const d = new Date(draft.createdAt || Date.now());
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  })();
  return (
    <div className="cd-fade">
      <StepDots n={3} />
      {editing && (
        <Field label="淹れた日時">
          <input type="datetime-local" style={inputStyle} value={dtValue}
            onChange={e => { const t = new Date(e.target.value).getTime(); if (!Number.isNaN(t)) setDraft({ ...draft, createdAt: t }); }} />
        </Field>
      )}
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--mocha)", marginBottom: 12, marginTop: editing ? 14 : 0 }}>味わいのバランス（1〜5）{req}</div>
      {TASTE_AXES.map(ax => (
        <div key={ax} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 5 }}>
            <span style={{ fontWeight: 700 }}>{ax}</span><span style={{ color: "var(--terra)", fontWeight: 700 }}>{draft.taste[ax]}</span>
          </div>
          <input type="range" min={1} max={5} value={draft.taste[ax]} onChange={e => setTaste(ax, e.target.value)} style={{ width: "100%" }} />
        </div>
      ))}

      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--mocha)", margin: "20px 0 10px" }}>感じたフレーバー<span style={{ color: "var(--muted)", fontSize: 11, fontWeight: 400, marginLeft: 6 }}>任意</span></div>
      <div style={{ marginBottom: 10 }}>
        <ChipRowsWithPanel items={Object.keys(FLAVOR_TREE)} selected={tab}
          onPick={bg => { setTab(tab === bg ? "" : bg); setFocus(""); }}
          panel={
            <div className="cd-fade" style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px" }}>
              <ChipRowsWithPanel small items={FLAVOR_TREE[tab] || []} selected={focus}
                isActive={sm => sel.some(f => f.small === sm)}
                onPick={toggleSmall}
                panel={FLAVOR_DETAIL[focus] && sel.some(f => f.small === focus) && (
                  <div className="cd-fade" style={{ background: "var(--cream)", borderRadius: 10, padding: "8px 10px" }}>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>もっと詳しく（任意）</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {FLAVOR_DETAIL[focus].map(d => (
                        <Chip key={d} small active={sel.find(f => f.small === focus)?.detail === d} onClick={() => toggleDetail(focus, d)}>{d}</Chip>
                      ))}
                    </div>
                  </div>
                )} />
            </div>
          } />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6, minHeight: 30 }}>
        <span style={{ fontSize: 11.5, color: "var(--muted)" }}>選んだ香り（{MAX_FLAVORS}つまで）</span>
        {sel.map(f => (
          <button key={f.small} onClick={() => toggleSmall(f.small)} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 700, color: "var(--terra)", background: "var(--paper)", border: "1px solid rgba(179,85,47,.35)", borderRadius: 20, padding: "3px 6px 3px 10px", cursor: "pointer", fontFamily: "inherit" }}>
            {flavorLabel(f)}<span style={{ fontSize: 13, color: "var(--muted)" }}>×</span>
          </button>
        ))}
        {!sel.length && <span style={{ fontSize: 11.5, color: "var(--muted)" }}>— 感じたものがあれば選んでください</span>}
      </div>
      {maxMsg && <div style={{ fontSize: 11.5, color: "var(--terra)", marginBottom: 6 }}>香りは{MAX_FLAVORS}つまでです。外してから選んでください。</div>}

      <Field label="メモ（気づいたこと）"><textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical", marginTop: 8 }} value={draft.memo} onChange={e => setDraft({ ...draft, memo: e.target.value })} placeholder="例：後味に少し渋みが残った" /></Field>

      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--mocha)", margin: "8px 0 8px" }}>総合満足度</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
        {[1, 2, 3, 4, 5].map(s => (
          <button key={s} onClick={() => setDraft({ ...draft, satisfaction: s })} style={{ flex: 1, fontSize: 26, background: "none", border: "none", cursor: "pointer", color: s <= draft.satisfaction ? "var(--crema)" : "var(--line)" }}>★</button>
        ))}
      </div>
      {editing ? (
        <Btn style={{ width: "100%" }} onClick={onSaveDirect}>変更を保存</Btn>
      ) : (
        <>
          <Btn style={{ width: "100%" }} onClick={() => setScreen("chat")}>AIに相談する →</Btn>
          <Btn kind="ghost" style={{ width: "100%", marginTop: 10 }} onClick={onSaveDirect}>相談せずに記録する</Btn>
        </>
      )}
    </div>
  );
}

function Chip({ children, active, onClick, small }) {
  return <button onClick={onClick} style={{ padding: small ? "7px 13px" : "9px 15px", borderRadius: 20, border: "1.5px solid", borderColor: active ? "var(--terra)" : "var(--line)", background: active ? "var(--terra)" : "var(--paper)", color: active ? "#fff" : "var(--mocha)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{children}</button>;
}
// 選んだチップと「同じ行の直下」に次の段階（panel）を差し込んで表示するチップ列。
// 折り返し位置は画面幅で変わるので、描画後にチップの位置を測って差し込む場所を決める
function ChipRowsWithPanel({ items, selected, isActive, onPick, small, panel }) {
  const ref = useRef(null);
  const [after, setAfter] = useState(-1); // この番号のチップの後ろに差し込む
  const sel = items.indexOf(selected);
  useLayoutEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el || sel < 0) { setAfter(-1); return; }
      const chips = [...el.children].filter(c => c.dataset.chip !== undefined);
      const top = chips[sel]?.offsetTop;
      let last = sel;
      chips.forEach((c, i) => { if (c.offsetTop === top) last = Math.max(last, i); });
      setAfter(last);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [sel, items.length]);
  const at = sel < 0 || !panel ? -1 : after >= 0 ? after : items.length - 1;
  return (
    <div ref={ref} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {items.map((it, i) => (
        <React.Fragment key={it}>
          <span data-chip="" style={{ display: "inline-flex" }}><Chip small={small} active={isActive ? isActive(it) : selected === it} onClick={() => onPick(it)}>{it}</Chip></span>
          {i === at && <div style={{ flexBasis: "100%" }}>{panel}</div>}
        </React.Fragment>
      ))}
    </div>
  );
}
function StepDots({ n }) {
  return <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>{[1, 2, 3].map(i => <div key={i} style={{ height: 4, flex: 1, borderRadius: 4, background: i <= n ? "var(--terra)" : "var(--line)" }} />)}</div>;
}

// ====== AI診断チャット ======
function Chat({ draft, setDraft, beans, grinders, drippers, favorites, saveFavorites, logs, onSave }) {
  const [messages, setMessages] = useState(draft.chat || []);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [nextRecipe, setNextRecipe] = useState(draft.nextRecipe || null);
  const [genningRecipe, setGenningRecipe] = useState(false);
  const [expanded, setExpanded] = useState(!!draft.nextRecipe);
  const endRef = useRef(null);
  const bean = beans.find(b => b.id === draft.beanId);
  const grinder = grinders.find(g => g.id === draft.grinderId);
  const dripper = (drippers || []).find(d => d.id === draft.dripperId);

  const sheet = () => {
    const t = draft.taste;
    let c = 0;
    const pourStr = draft.pours.map(p => { c += Number(p.ml) || 0; return `${p.label}(${fmtTime(p.t)}/${p.ml}ml→累計${c}ml)`; }).join(", ");
    return `【今回の味わいメモ】
豆: ${bean?.name || draft.beanName || "不明"}（${[bean?.origin, bean?.process, bean?.roastLevel].filter(Boolean).join(" / ")}）
ロースター評: ${bean?.roasterNote || "なし"}
レシピ: 粉${draft.grounds}g / 湯${draft.water}ml(比率1:${(draft.water / draft.grounds).toFixed(1)}) / 湯温${draft.temp}℃
粒度: ${grinder?.name || draft.grinderName || "不明"} ${draft.grind}クリック
ドリッパー: ${dripper?.name || draft.dripperName || "不明"}${dripper?.type ? `（${dripper.type}）` : ""}
注ぎ: ${pourStr}
味の評価(1-5): ${TASTE_AXES.map(a => `${a}${t[a]}`).join(" ")}
フレーバー: ${flavorsOf(draft).map(f => f.detail ? `${f.small}（${f.detail}）` : f.small).join("・") || "未選択"}
総合満足度: ${draft.satisfaction}/5
メモ: ${draft.memo || "なし"}`;
  };

  const SYSTEM = `あなたはハンドドリップコーヒーの抽出専門家です。以下の抽出理論と知識ベースをもとに、ユーザーの「味わいメモ」を読んで対話しながら次回の改善策を一緒に見つけます。

【抽出理論の知識ベース】

■ 4:6メソッド（粕谷哲 / 2016年WBrC優勝）
- 総湯量を前半40%・後半60%に分けて考える。
- 前半（蒸らし＋1〜2投）：味の方向性を決める。前半の1投目を多くすると甘み・コクが増し、少なくすると酸味・明るさが出る。
- 後半（残り3投）：濃度を調整する。投数を増やすほど濃くなり、減らすと軽くなる。
- 各投は均等に、一定のペースで注ぐ。全体を5投に分けるのが基本形。
- 蒸らし不要。1投目から一定量を注いでいく設計。

■ 味と抽出変数の因果関係
・酸味が強い／薄い → 抽出不足のサイン。粒度を細かく・湯温を上げる・注ぎを遅くする・湯量を増やす。
・苦みが強い／渋い → 抽出過多のサイン。粒度を粗く・湯温を下げる・注ぎを速く・湯量を減らす。
・甘みが出ない → 湯温低めか粒度が粗すぎ。90〜93℃帯で試す。蒸らしをしっかり取る。
・コクが薄い → 粉量を増やす（比率を下げる）か、後半の投数を増やす（4:6後半）。
・雑味が出る → 過抽出または微粉が多い。粒度を粗く・湯温を下げる・抽出時間を短縮。
・全体にぼんやりしている → 湯温が低すぎるか粒度が粗すぎ。

■ ドリッパー別の傾向
・V60（HARIO）：流速が速い。注ぎのスピードと量で味が大きく変わる。技術依存度が高い。
・Kalita ウェーブ：底がフラット、安定して抽出しやすい。過抽出になりにくい。
・Chemex：厚いフィルターで微粉をカット。クリーンな味わい。やや抽出が遅い。
・オリガミ・その他円錐形：V60に近い傾向。リブの形状で流速が変わる。
・台形（メリタ等）：低速・安定。初心者向け。湯温の影響を受けやすい。

■ 焙煎度と湯温の目安
・浅煎り：88〜94℃（高温で酸味を丸く、甘みを引き出す）
・中煎り：87〜92℃（バランス重視）
・深煎り：83〜88℃（低温で苦みを抑え、甘みを出す）

■ 粒度の目安
・細かい→抽出が増える（苦み・コクが出やすい、詰まりやすい）
・粗い→抽出が減る（酸味・軽さが出やすい）
・クリックミル（Comandante等）なら、中煎りで20〜24クリック前後が基準帯。

■ 注ぎのタイミング（物理的な現実の制約）
・全体の抽出時間：150〜210秒（2分30秒〜3分30秒）が現実的な範囲。
・蒸らし：粉量の約2倍の湯で30〜45秒。
・各投の間隔：30〜45秒。60秒以上空けることは実際の抽出では起こらない。
・投数：3〜5投が一般的。

■ 注ぎ量・注ぎ方と味の関係（ここが特に重要）
・蒸らし量を増やす（粉×2.5〜3倍）→ 抽出が増える。甘み・コクが出やすい。鮮度の高い豆・深煎りに有効。
・蒸らし量を減らす（粉×1.5倍）→ 抽出が落ち着く。酸味が立つ。鮮度の落ちた豆・浅煎りに。
・蒸らし時間を長くする（45秒以上）→ より多く成分が溶け出す。甘みとコクが増す。
・蒸らし時間を短くする（20〜30秒）→ クリーンで明るい味わいに。過抽出を防ぐ。
・前半の1投目を多くする（4:6の前半比率を上げる）→ 甘み・コクが増す。
・前半の1投目を少なくする（4:6の前半比率を下げる）→ 酸味・明るさが際立つ。
・後半の投数を増やす（3投→4投）→ 濃度が上がる。コクが増す。
・後半の投数を減らす（3投→2投）→ 濃度が下がる。軽くすっきりした味わいに。
・注ぎを速くする（一気に注ぐ）→ 攪拌が増え、苦みや雑味が出やすい。抽出時間が短くなる。
・注ぎを遅くする（細く静かに注ぐ）→ 攪拌が少なく、クリーンで甘い味わいに。抽出時間が長くなる。
・断水時間（投と投の間）を長くする→ 濃度・コクが増す。過抽出に注意。
・断水時間を短くする→ クリーンで抽出が安定する。雑味が出にくい。

■ 注ぎの調整優先順位（改善の手順）
1. まず注ぎ量（蒸らし・前後半の配分）を試す→最も味の方向性に影響する。
2. 次に注ぎ速度・断水時間を試す→細かい質感の調整に効く。
3. それでも改善しない場合に粒度・湯温を変える。

■ 改善の原則
- 一度に変える変数は1〜2つまで。複数同時に変えると原因が特定できない。
- 変化は段階的に。粒度なら1〜2クリック、湯温なら1〜2℃から試す。
- 比率（湯:粉）の変化は最後の手段。まず抽出変数（粒度・湯温・注ぎ）で調整する。

【対話ルール】
- 親しみやすく簡潔に。1回の返信は3〜4文程度。
- 一度に質問するのは1つだけ。メモで分かることは聞き返さない。
- 上の知識ベースを根拠に、具体的な数値や仮説を提示する（「おそらく〜が原因で、〜を試してみてください」）。
- 2〜3往復したら改善の方向性を仮説として示す。断定はしない。
- 専門用語は噛み砕く。絵文字は使わない。
- 豆・ミル・ドリッパーの名前は、メモに書かれた表記をそのまま使う。`;

  const callAI = async (history) => {
    const { data, error } = await supabase.functions.invoke("ai", {
      body: { system: SYSTEM, messages: history, maxTokens: 1024 },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    const text = (data?.text || "").trim();
    if (!text) throw new Error("空の応答が返りました");
    return text;
  };

  // 初回：問診票を渡してAIから口火を切る
  useEffect(() => {
    if (messages.length === 0) {
      (async () => {
        setLoading(true);
        try {
          const first = [{ role: "user", content: sheet() + "\n\nこの味わいメモを読んで、診断を始めてください。" }];
          const reply = await callAI(first);
          const m = [...first, { role: "assistant", content: reply }];
          setMessages(m); setDraft({ ...draft, chat: m });
        } catch (e) { console.error("AI(初回):", e); setMessages([{ role: "assistant", content: "うまく接続できませんでした。もう一度試してください。" }]); }
        setLoading(false);
      })();
    }
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading, genningRecipe]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const m = [...messages, { role: "user", content: input.trim() }];
    setMessages(m); setInput(""); setLoading(true);
    try { const reply = await callAI(m); const m2 = [...m, { role: "assistant", content: reply }]; setMessages(m2); setDraft({ ...draft, chat: m2 }); }
    catch (e) { console.error("AI(送信):", e); setMessages([...m, { role: "assistant", content: "接続エラーが起きました。" }]); }
    setLoading(false);
  };

  const genRecipe = async () => {
    setGenningRecipe(true);
    try {
      const prompt = messages.map(x => `${x.role === "user" ? "ユーザー" : "AI"}: ${x.content}`).join("\n");
      const curPours = draft.pours.map(p => `${p.label}(${fmtTime(p.t)}/${p.ml}ml)`).join(", ");
      const dripper = drippers.find(d => d.id === draft.dripperId)?.name || draft.dripperName || "";
      const bean = beans.find(b => b.id === draft.beanId);
      const beanInfo = `${bean?.name || draft.beanName || "豆"}${bean?.roast ? `(焙煎:${bean.roast})` : ""}`;
      const { data, error } = await supabase.functions.invoke("ai", {
        body: {
          system: "あなたはハンドドリップコーヒーの抽出専門家です。以下の抽出理論をもとに、これまでの対話と味わいメモの内容を踏まえ、次回試す現実的なレシピを1つ提案します。\n\n" +
            "【抽出理論の知識ベース（必ずこれに従う）】\n" +
            "■ 4:6メソッド（粕谷哲）: 総湯量の前半40%で味の方向性、後半60%で濃度を調整する。\n" +
            "■ 味と変数の因果: 酸味強い→抽出不足（粒度を細く/湯温を上げる/注ぎを遅く）。苦み強い→過抽出（粒度を粗く/湯温を下げる/注ぎを速く）。甘みが出ない→蒸らし量増やす・前半1投目を多く・湯温確認。\n" +
            "■ 焙煎度と湯温: 浅煎り88〜94℃ / 中煎り87〜92℃ / 深煎り83〜88℃\n" +
            "■ 注ぎ量・配分と味（最優先で調整する）:\n" +
            "  - 蒸らし量増やす（粉×2.5〜3倍）→甘み・コク増。蒸らし量減らす（粉×1.5倍）→酸味・軽さ。\n" +
            "  - 蒸らし時間長くする（45秒〜）→甘みとコク増。短くする（20〜30秒）→クリーンな味に。\n" +
            "  - 前半1投目を多くする→甘み・コク。少なくする→酸味・明るさ。\n" +
            "  - 後半の投数を増やす→濃度・コク増。減らす→軽くすっきり。\n" +
            "  - 注ぎを速く→苦み・雑味が出やすい。注ぎを遅く（細く）→甘くクリーンに。\n" +
            "  - 断水を長く→濃度・コク増。短く→クリーン・安定。\n" +
            "■ 注ぎの制約（絶対に守る）: 1投目はt=0。各投の間隔は30〜45秒。60秒以上空けてはいけない。投数3〜5回。全体150〜210秒。\n" +
            "■ 改善原則: 一度に変える変数は1〜2つ。注ぎの調整→粒度→湯温の順で試す。段階的に（粒度±1〜2クリック、湯温±1〜2℃）。\n\n" +
            "前後の説明やマークダウンは付けず、次のJSONオブジェクトだけを返す:\n" +
            "{\"grounds\":数値,\"water\":数値,\"temp\":数値,\"grind\":数値,\"pours\":[{\"label\":\"1投目\",\"t\":0,\"ml\":数値}],\"reason\":\"変更点と理論的な根拠を40字以内で\"}\n" +
            "例（4:6・5投）: {\"grounds\":15,\"water\":240,\"temp\":92,\"grind\":20,\"pours\":[{\"label\":\"1投目\",\"t\":0,\"ml\":50},{\"label\":\"2投目\",\"t\":40,\"ml\":46},{\"label\":\"3投目\",\"t\":80,\"ml\":48},{\"label\":\"4投目\",\"t\":120,\"ml\":48},{\"label\":\"5投目\",\"t\":160,\"ml\":48}],\"reason\":\"前半均等で甘み安定、後半3投でコクを調整\"}",
          messages: [{ role: "user", content: `豆: ${beanInfo}\nドリッパー: ${dripper}\n現在のレシピ: 粉${draft.grounds}g 湯${draft.water}ml 湯温${draft.temp}℃ 粒度${draft.grind}\n現在の注ぎ: ${curPours}\n\n対話:\n${prompt}\n\n上の常識を守って、次回レシピをJSONで。` }],
          maxTokens: 900,
          json: true,
          temperature: 0.3,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      let txt = (data?.text || "").replace(/```json|```/g, "").trim();
      const m = txt.match(/\{[\s\S]*\}/);          // 文章が混じっても{...}だけ抜き出す
      if (m) txt = m[0];
      const r = JSON.parse(txt);
      if (!Array.isArray(r.pours) || r.pours.length === 0) r.pours = draft.pours;
      r.pours = sanitizePours(r.pours, r.water || draft.water);   // 非現実的なタイミングを補正
      r.grinderId = draft.grinderId; r.dripperId = draft.dripperId;
      r.grinderName = draft.grinderName; r.dripperName = draft.dripperName;
      setNextRecipe(r); setDraft({ ...draft, nextRecipe: r }); setExpanded(true);
    } catch { setNextRecipe({ grounds: draft.grounds, water: draft.water, temp: draft.temp, grind: draft.grind, grinderId: draft.grinderId, dripperId: draft.dripperId, pours: draft.pours, reason: "（自動生成に失敗。手動で調整してください）" }); setExpanded(true); }
    setGenningRecipe(false);
  };
  const updateNext = (r) => { setNextRecipe(r); setDraft({ ...draft, nextRecipe: r }); };

  // 直近のAI返信を作り直す
  const regenerate = async () => {
    if (loading) return;
    let base = [...messages];
    while (base.length && base[base.length - 1].role === "assistant") base.pop();
    if (base.length === 0) base = [{ role: "user", content: sheet() + "\n\nこの味わいメモを読んで、診断を始めてください。" }];
    setLoading(true);
    try {
      const reply = await callAI(base);
      const m = [...base, { role: "assistant", content: reply }];
      setMessages(m); setDraft({ ...draft, chat: m });
    } catch (e) { console.error("AI(再生成):", e); }
    setLoading(false);
  };

  const assistantCount = messages.filter(m => m.role === "assistant").length;
  const recipeReady = assistantCount >= 2; // 何度かやり取りしたら強調
  const dispMessages = messages.filter((_, i) => i !== 0);
  const lastAssistantIdx = dispMessages.map(m => m.role).lastIndexOf("assistant");

  return (
    <div className="cd-fade">
      <div style={{ background: "var(--paper)", borderRadius: 14, padding: "12px 14px", fontSize: 12, color: "var(--muted)", marginBottom: 16, whiteSpace: "pre-wrap", lineHeight: 1.6, border: "1px solid var(--line)" }}>
        <b style={{ color: "var(--mocha)" }}>📋 提出した味わいメモ</b>{"\n"}{bean?.name || draft.beanName || "不明な豆"} · 粉{draft.grounds}g/湯{draft.water}ml/{draft.temp}℃ · 満足度{draft.satisfaction}★
      </div>
      {dispMessages.map((m, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 12 }}>
          <div style={{ maxWidth: "82%", padding: "11px 15px", borderRadius: 16, fontSize: 14.5, lineHeight: 1.65,
            background: m.role === "user" ? "var(--terra)" : "var(--paper)", color: m.role === "user" ? "#fff" : "var(--espresso)",
            borderBottomRightRadius: m.role === "user" ? 4 : 16, borderBottomLeftRadius: m.role === "user" ? 16 : 4, whiteSpace: "pre-wrap" }}>{m.content}</div>
          {m.role === "assistant" && i === lastAssistantIdx && !nextRecipe && !loading && (
            <button onClick={regenerate} title="作り直す" style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--muted)", fontSize: 11.5, fontWeight: 700, cursor: "pointer", marginTop: 5, padding: "2px 4px" }}>
              <Icon name="refresh" size={13} />作り直す
            </button>
          )}
        </div>
      ))}
      {loading && <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--muted)", fontSize: 13, padding: "4px 8px" }}><div className="cd-spin" />考えています…</div>}

      {nextRecipe && (
        <div className="cd-fade" style={{ margin: "8px 0 14px" }}>
          <div onClick={() => setExpanded(!expanded)} style={{ background: "linear-gradient(155deg,var(--bean),var(--espresso))", borderRadius: expanded ? "18px 18px 0 0" : 18, padding: 18, color: "var(--cream)", cursor: "pointer" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 11, letterSpacing: ".12em", opacity: .7, fontWeight: 700 }}>次の一杯 ・ AIからのおすすめ</div>
              <span style={{ fontSize: 13, opacity: .7 }}>{expanded ? "閉じる ▲" : "全体を見る ▼"}</span>
            </div>
            <div style={{ display: "flex", gap: 14, fontSize: 14, flexWrap: "wrap", margin: "8px 0 6px" }}>
              <span>粉 <b>{nextRecipe.grounds}g</b></span><span>湯 <b>{nextRecipe.water}ml</b></span><span>{nextRecipe.temp}℃</span><span>粒度 <b>{nextRecipe.grind}</b></span>
            </div>
            <div style={{ fontSize: 13, opacity: .85 }}>{nextRecipe.reason}</div>
          </div>
          {expanded && (
            <div className="cd-fade" style={{ background: "var(--paper)", border: "1.5px solid var(--bean)", borderTop: "none", borderRadius: "0 0 18px 18px", padding: 18 }}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>内容を確認して、必要なら調整してください。</div>
              <RecipeFields value={nextRecipe} setValue={updateNext} grinders={grinders} drippers={drippers} favorites={favorites} saveFavorites={saveFavorites} />
            </div>
          )}
        </div>
      )}
      <div style={{ height: 8 }} />

      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 14, marginTop: 8 }}>
        {!nextRecipe ? (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "flex-end" }}>
              <textarea rows={1} style={{ ...inputStyle, flex: 1, resize: "none", minHeight: 44, maxHeight: 140, lineHeight: 1.5 }} value={input}
                onChange={e => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 140) + "px"; }}
                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
                placeholder="返信を入力…（Enterで改行 / ⌘+Enterで送信）" />
              <Btn onClick={send} disabled={loading || !input.trim()} style={{ padding: "11px 18px" }}>送信</Btn>
            </div>
            <Btn kind={recipeReady ? undefined : "soft"} onClick={genRecipe} disabled={genningRecipe || !recipeReady} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {genningRecipe && <div className="cd-spin" />}次回レシピを作成する
            </Btn>
          </>
        ) : (
          <Btn onClick={() => onSave({ ...draft, chat: messages, nextRecipe })} style={{ width: "100%" }}>この一杯を保存</Btn>
        )}
      </div>
      <div ref={endRef} />
    </div>
  );
}

// ====== ログイン / プロフィール作成 ======
function Auth() {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [sent, setSent] = useState(false); // 確認メール送信後

  const jaError = (m) => {
    const s = String(m || "");
    if (/Invalid login credentials/i.test(s)) return "メールアドレスまたはパスワードが正しくありません。";
    if (/already registered|already been registered/i.test(s)) return "このメールアドレスは既に登録されています。「ログイン」からお進みください。";
    if (/Email not confirmed/i.test(s)) return "メールの確認が完了していません。登録時のメールの確認リンクを開いてください。";
    if (/Password should be at least/i.test(s)) return "パスワードは6文字以上にしてください。";
    if (/invalid format|Unable to validate email/i.test(s)) return "メールアドレスの形式が正しくありません。";
    if (/only request this after|rate limit|too many/i.test(s)) return "試行が多すぎます。少し時間をおいて再度お試しください。";
    if (/network|fetch/i.test(s)) return "通信エラーが発生しました。接続を確認して再度お試しください。";
    return "うまくいきませんでした。入力内容を確認して、もう一度お試しください。";
  };

  const submit = async () => {
    if (mode === "signup" && !name.trim()) { setMsg("ユーザー名を入力してください。"); return; }
    if (!email.trim() || pw.length < 6) { setMsg("メールアドレスと6文字以上のパスワードを入力してください。"); return; }
    setBusy(true); setMsg("");
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password: pw,
          options: { data: { display_name: name.trim() } },
        });
        if (error) throw error;
        if (!data.session) setSent(true); // メール確認が必要な設定のとき
        // data.session がある場合は即ログイン（アプリ側が自動で切り替わる）
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
        if (error) throw error;
      }
    } catch (e) {
      setMsg(jaError(e?.message));
    }
    setBusy(false);
  };

  const wrap = (children) => (
    <div className="cd-sans" style={{ minHeight: "100vh", background: "var(--cream)", color: "var(--espresso)", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 28px" }}>
      <style>{css}</style>
      <div className="cd-fade" style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 44, marginBottom: 10 }}>☕</div>
        <div className="cd-serif" style={{ fontSize: 26, fontWeight: 700, letterSpacing: ".02em" }}>Drip Diary</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 8, lineHeight: 1.7 }}>淹れた一杯を記録して、<br />AIと一緒に次の一杯を育てる日記</div>
      </div>
      {children}
    </div>
  );

  // 確認メール送信後の案内
  if (sent) {
    return wrap(
      <div className="cd-fade" style={{ textAlign: "center" }}>
        <div style={{ color: "var(--terra)", display: "flex", justifyContent: "center", marginBottom: 14 }}><Icon name="check" size={44} /></div>
        <div className="cd-serif" style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>確認メールを送信しました</div>
        <div style={{ fontSize: 14, lineHeight: 1.9, marginBottom: 8 }}><b>{email}</b> 宛に確認メールをお送りしました。<br />メール内のリンクを開くと登録が完了します。</div>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.8, marginBottom: 22 }}>メールが届かない場合は、迷惑メールフォルダもご確認ください。</div>
        <Btn kind="ghost" style={{ width: "100%" }} onClick={() => { setSent(false); setMode("signin"); setPw(""); setMsg(""); }}>ログイン画面に戻る</Btn>
      </div>
    );
  }

  return wrap(
    <div className="cd-fade">
      {mode === "signup" && <Field label="ユーザー名（プロフィールに表示）"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="例：たろう" /></Field>}
      <Field label="メールアドレス"><input style={inputStyle} type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" /></Field>
      <Field label="パスワード（6文字以上）"><input style={inputStyle} type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === "Enter" && submit()} /></Field>
      <Btn disabled={busy} onClick={submit} style={{ width: "100%", marginTop: 4 }}>{busy ? "処理中…" : (mode === "signup" ? "アカウントを作成" : "ログイン")}</Btn>
      {msg && <div style={{ fontSize: 12, color: "var(--terra)", marginTop: 12, lineHeight: 1.7 }}>{msg}</div>}
      <button onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setMsg(""); }} style={{ display: "block", margin: "16px auto 0", background: "none", border: "none", color: "var(--mocha)", fontSize: 12.5, fontWeight: 700, cursor: "pointer", textDecoration: "underline" }}>
        {mode === "signup" ? "すでにアカウントがある → ログイン" : "はじめての方 → アカウントを作成"}
      </button>
      <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginTop: 14, lineHeight: 1.7 }}>記録はアカウントに紐づいて保存され、どの端末からでも見られます。</div>
    </div>
  );
}

// ====== プロフィール ======
function Profile({ suggestions, saveSuggestions, makeBackup, restoreBackup, profile, saveProfile, logs, beans, favorites, email, onLogout, onRequestDeleteAccount }) {
  const [editOpen, setEditOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const notify = useContext(ToastCtx);

  const cups = logs.length;
  const avg = cups ? (logs.reduce((s, l) => s + (l.satisfaction || 0), 0) / cups) : 0;
  const since = profile?.since ? new Date(profile.since).toLocaleDateString("ja-JP", { year: "numeric", month: "long" }) : "";
  const emoji = profile?.avatarEmoji || "";
  const color = profile?.avatarColor || "#4a3424";

  const stat = (label, value) => (
    <div style={{ flex: 1, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 10px", textAlign: "center" }}>
      <div className="cd-serif" style={{ fontSize: 22, fontWeight: 700, color: "var(--bean)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{label}</div>
    </div>
  );

  const Avatar = ({ size = 72 }) => (
    <div style={{ width: size, height: size, borderRadius: "50%", background: emoji ? color : `linear-gradient(155deg,var(--bean),var(--espresso))`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: emoji ? size * 0.5 : size * 0.4, fontWeight: 700, flexShrink: 0 }} className={emoji ? "" : "cd-serif"}>
      {emoji || (profile?.name || "?").slice(0, 1)}
    </div>
  );

  return (
    <div className="cd-fade">
      {/* ヘッダー（見せる部分） */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 22 }}>
        <Avatar size={80} />
        <div className="cd-serif" style={{ fontSize: 22, fontWeight: 700, marginTop: 12 }}>{profile?.name || "名称未設定"}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{since} から記録中</div>
        <button onClick={() => setEditOpen(true)} style={{ marginTop: 14, background: "none", border: "1.5px solid var(--line)", color: "var(--mocha)", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "8px 20px", borderRadius: 20, fontFamily: "'Zen Kaku Gothic New',sans-serif" }}>プロフィールを編集</button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        {stat("淹れた杯数", cups)}
        {stat("平均満足度", cups ? `${avg.toFixed(1)}★` : "—")}
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        {stat("登録した豆", beans.length)}
        {stat("定番レシピ", favorites.length)}
      </div>

      <TasteProfile logs={logs} beans={beans} />
      <NextBeanCard logs={logs} beans={beans} suggestions={suggestions} saveSuggestions={saveSuggestions} />

      {/* 設定への導線（控えめ） */}
      <button onClick={() => setSettingsOpen(true)} style={{ width: "100%", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, padding: "15px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontFamily: "'Zen Kaku Gothic New',sans-serif" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 700, color: "var(--espresso)" }}><Icon name="gear" size={18} />設定</span>
        <span style={{ color: "var(--muted)", fontSize: 18 }}>›</span>
      </button>

      <Btn kind="ghost" onClick={onLogout} style={{ width: "100%", marginTop: 14 }}>ログアウト</Btn>

      {editOpen && <ProfileEditModal profile={profile} saveProfile={saveProfile} onClose={() => setEditOpen(false)} notify={notify} />}
      {settingsOpen && <SettingsModal makeBackup={makeBackup} restoreBackup={restoreBackup} email={email} onClose={() => setSettingsOpen(false)} onRequestDeleteAccount={() => { setSettingsOpen(false); onRequestDeleteAccount(); }} />}
    </div>
  );
}

// プロフィール編集（名前・アイコン絵文字・背景色）
function ProfileEditModal({ profile, saveProfile, onClose, notify }) {
  const [name, setName] = useState(profile?.name || "");
  const [emoji, setEmoji] = useState(profile?.avatarEmoji || "");
  const [color, setColor] = useState(profile?.avatarColor || "#4a3424");

  const save = () => {
    saveProfile({ ...profile, name: name.trim() || "名称未設定", avatarEmoji: emoji, avatarColor: color });
    notify("プロフィールを更新しました");
    onClose();
  };

  return (
    <ModalShell title="プロフィールを編集" onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
        <div style={{ width: 84, height: 84, borderRadius: "50%", background: emoji ? color : "linear-gradient(155deg,var(--bean),var(--espresso))", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: emoji ? 42 : 34, fontWeight: 700 }} className={emoji ? "" : "cd-serif"}>{emoji || (name || "?").slice(0, 1)}</div>
      </div>

      <Field label="ユーザー名"><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="名前" maxLength={20} /></Field>

      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--mocha)", margin: "14px 0 8px" }}>アイコン</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
        <button onClick={() => setEmoji("")} title="イニシャル" style={{ width: 42, height: 42, borderRadius: "50%", border: emoji === "" ? "2.5px solid var(--terra)" : "1.5px solid var(--line)", background: "linear-gradient(155deg,var(--bean),var(--espresso))", color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 15 }} className="cd-serif">{(name || "?").slice(0, 1)}</button>
        {AVATAR_EMOJIS.map(em => (
          <button key={em} onClick={() => setEmoji(em)} style={{ width: 42, height: 42, borderRadius: "50%", border: emoji === em ? "2.5px solid var(--terra)" : "1.5px solid var(--line)", background: "var(--cream)", cursor: "pointer", fontSize: 21 }}>{em}</button>
        ))}
      </div>

      {emoji && <>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--mocha)", margin: "14px 0 8px" }}>背景色</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
          {AVATAR_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)} style={{ width: 38, height: 38, borderRadius: "50%", border: color === c ? "3px solid var(--terra)" : "2px solid var(--paper)", background: c, cursor: "pointer", boxShadow: "0 0 0 1px var(--line)" }} />
          ))}
        </div>
      </>}

      <Btn onClick={save} style={{ width: "100%", marginTop: 18 }}>保存する</Btn>
    </ModalShell>
  );
}

// 設定（アカウント・ログアウト・削除）
function SettingsModal({ makeBackup, restoreBackup, email, onClose, onRequestDeleteAccount }) {
  const [mode, setMode] = useState(null); // null | email | pw | history | restore
  const notify = useContext(ToastCtx);
  const [pending, setPending] = useState(null); // 戻す先の時点（確認待ち）
  const [changes, setChanges] = useState(null); // 変更履歴（新しい順）
  const openHistory = async () => {
    setMode("history"); setChanges(null); setRestoreMsg("");
    try { setChanges(await serverHistory.changes(makeBackup().data)); }
    catch { setChanges([]); setRestoreMsg("変更履歴を読み込めませんでした。サーバー側の設定が済んでいないか、通信に失敗しています。"); }
  };
  // 選んだ変更の「直後」の状態に戻す（一般的な版の履歴と同じ）。
  // i は changes（新しい順）の位置。i = changes.length は「一番古い変更より前の状態」
  // 変更 i の直後の状態 ＝ 1つ新しい変更 i-1 の直前の状態。取り消されるのは i より新しい変更
  const pickVersion = async (i) => {
    setBusy(true); setRestoreMsg("");
    try {
      const data = await serverHistory.stateBefore(changes[i - 1].at, makeBackup().data);
      setPending({ app: "drip-diary", version: 1, data, fromHistory: true, at: i < changes.length ? changes[i].at : null, undone: changes.slice(0, i) });
      setMode("restore");
    } catch { setRestoreMsg("この時点のデータを読み込めませんでした。"); }
    setBusy(false);
  };
  const [restoreMsg, setRestoreMsg] = useState("");
  // 前回の書き出し日時（この端末のみ・目安表示用）
  const [lastExport, setLastExport] = useState(() => { try { return localStorage.getItem("cd_last_export") || ""; } catch { return ""; } });
  const exportNow = () => {
    downloadJSON(makeBackup(), backupFileName());
    const now = new Date().toISOString();
    try { localStorage.setItem("cd_last_export", now); } catch { /* 保存できなくても書き出しは成功 */ }
    setLastExport(now);
    notify("データをダウンロードしました");
  };
  const doRestore = async () => {
    setBusy(true);
    const ok = await restoreBackup(pending); // 戻す前の状態も変更履歴に残るので、取り消せる
    setBusy(false);
    if (ok) { notify("元に戻しました"); setPending(null); setMode(null); }
    else setRestoreMsg("一部のデータを保存できませんでした。通信状態を確認して、もう一度お試しください。");
  };
  const fmtShort = (t) => new Date(t).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const [newEmail, setNewEmail] = useState("");
  const [newPw, setNewPw] = useState("");
  const [acctMsg, setAcctMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const acctErr = (m) => {
    const s = String(m || "");
    if (/should be at least/i.test(s)) return "パスワードは6文字以上にしてください。";
    if (/invalid format|valid email|Unable to validate/i.test(s)) return "メールアドレスの形式が正しくありません。";
    if (/already|registered|exists/i.test(s)) return "そのメールアドレスは使用できません。";
    if (/same|different from/i.test(s)) return "現在と同じ値です。別の内容を入力してください。";
    if (/rate|after|too many/i.test(s)) return "短時間に試行しすぎました。少し待って再度お試しください。";
    return "更新できませんでした。入力内容を確認してください。";
  };
  const changeEmail = async () => {
    if (!newEmail.trim()) return;
    setBusy(true); setAcctMsg("");
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) throw error;
      setAcctMsg("確認メールを送信しました。新しいメールアドレスに届いたリンクを開くと変更が完了します。");
      setNewEmail(""); setMode(null);
    } catch (e) { setAcctMsg(acctErr(e?.message)); }
    setBusy(false);
  };
  const changePw = async () => {
    if (newPw.length < 6) { setAcctMsg("パスワードは6文字以上にしてください。"); return; }
    setBusy(true); setAcctMsg("");
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      setAcctMsg("パスワードを変更しました。");
      setNewPw(""); setMode(null);
    } catch (e) { setAcctMsg(acctErr(e?.message)); }
    setBusy(false);
  };

  const row = (label, value, onClick) => (
    <button onClick={onClick} style={{ width: "100%", background: "none", border: "none", borderBottom: "1px solid var(--line)", padding: "14px 2px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontFamily: "'Zen Kaku Gothic New',sans-serif" }}>
      <span style={{ fontSize: 13.5, color: "var(--espresso)", fontWeight: 600 }}>{label}</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)" }}>{value}<span style={{ fontSize: 16 }}>›</span></span>
    </button>
  );

  return (
    <ModalShell title="設定" onClose={onClose}>
      {(mode === null || mode === "email" || mode === "pw") && <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", margin: "2px 0 4px", letterSpacing: ".04em" }}>アカウント</div>}

      {mode === null && (
        <>
          {row("メールアドレス", (email || "").length > 18 ? (email.slice(0, 16) + "…") : email, () => { setMode("email"); setAcctMsg(""); })}
          {row("パスワード", "変更", () => { setMode("pw"); setAcctMsg(""); })}
        </>
      )}

      {mode === "email" && (
        <div className="cd-fade">
          <Field label="新しいメールアドレス">
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>現在：{email}</div>
            <input style={inputStyle} type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="new@example.com" />
          </Field>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Btn kind="ghost" onClick={() => { setMode(null); setAcctMsg(""); }} style={{ flex: 1 }}>戻る</Btn>
            <Btn disabled={busy || !newEmail.trim()} onClick={changeEmail} style={{ flex: 1 }}>更新</Btn>
          </div>
        </div>
      )}

      {mode === "pw" && (
        <div className="cd-fade">
          <Field label="新しいパスワード（6文字以上）">
            <input style={inputStyle} type="password" autoComplete="new-password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="••••••••" />
          </Field>
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Btn kind="ghost" onClick={() => { setMode(null); setAcctMsg(""); }} style={{ flex: 1 }}>戻る</Btn>
            <Btn disabled={busy || newPw.length < 6} onClick={changePw} style={{ flex: 1 }}>更新</Btn>
          </div>
        </div>
      )}

      {acctMsg && <div style={{ fontSize: 12, color: "var(--terra)", marginTop: 12, lineHeight: 1.7 }}>{acctMsg}</div>}

      {mode === null && (
        <>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", margin: "22px 0 4px", letterSpacing: ".04em" }}>データとプライバシー</div>
          {row("変更履歴", "以前の状態に戻す", openHistory)}
          {row("データをダウンロード", lastExport ? `前回 ${new Date(lastExport).toLocaleDateString("ja-JP")}` : "ファイルで受け取る", exportNow)}
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, lineHeight: 1.7 }}>
            データは変更のたびに、サーバーへ自動でバックアップされます（直近7日はすべて、90日前までは1日1つ）。<br />
            「データをダウンロード」では、記録・豆・器具・定番レシピなど、すべてのデータを1つのファイルで受け取れます。
          </div>
        </>
      )}

      {mode === "history" && (
        <div className="cd-fade" style={{ marginTop: 18 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 4 }}>変更履歴</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 10, lineHeight: 1.7 }}>選んだ時点の状態に戻せます。</div>
          {changes === null && <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "10px 0" }}>読み込み中…</div>}
          {changes && changes.length === 0 && !restoreMsg && <div style={{ fontSize: 12.5, color: "var(--muted)", padding: "10px 0" }}>まだ変更履歴はありません。</div>}
          {changes && changes.slice(0, 60).map((g, i) => (
            <button key={g.at} disabled={busy || i === 0} onClick={() => pickVersion(i)} style={{ width: "100%", textAlign: "left", background: "var(--paper)", border: i === 0 ? "1.5px solid var(--terra)" : "none", borderRadius: 12, padding: "10px 14px", marginBottom: 6, cursor: busy || i === 0 ? "default" : "pointer", fontFamily: "inherit", display: "flex", gap: 12 }}>
              <span style={{ flexShrink: 0, width: 72, paddingTop: 1 }}>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{fmtShort(g.at)}</span>
                {i === 0 && <span style={{ display: "inline-block", marginTop: 4, fontSize: 10.5, fontWeight: 700, color: "#fff", background: "var(--terra)", borderRadius: 10, padding: "1px 8px" }}>現在</span>}
              </span>
              <ChangeLines items={g.items} />
            </button>
          ))}
          {changes && changes.length > 0 && changes.length <= 60 && (
            <button disabled={busy} onClick={() => pickVersion(changes.length)} style={{ width: "100%", textAlign: "left", background: "var(--paper)", border: "none", borderRadius: 12, padding: "10px 14px", marginBottom: 6, cursor: busy ? "default" : "pointer", fontFamily: "inherit", display: "flex", gap: 12 }}>
              <span style={{ fontSize: 12, color: "var(--muted)", flexShrink: 0, width: 72 }}>それ以前</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--espresso)" }}>最も古いバックアップ</span>
            </button>
          )}
          {restoreMsg && <div style={{ fontSize: 12, color: "var(--terra)", margin: "8px 0", lineHeight: 1.7 }}>{restoreMsg}</div>}
          <Btn kind="ghost" onClick={() => { setMode(null); setRestoreMsg(""); }} style={{ width: "100%", marginTop: 8 }}>戻る</Btn>
        </div>
      )}

      {mode === "restore" && pending && (
        <div className="cd-fade" style={{ marginTop: 18 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 10 }}>{pending.at ? `${fmtShort(pending.at)} の状態に戻しますか？` : "最も古いバックアップの状態に戻しますか？"}</div>
          <div style={{ fontSize: 12.5, color: "var(--mocha)", marginBottom: 6 }}>これより後の変更（{pending.undone.length}件）が取り消されます。</div>
          <div style={{ background: "var(--paper)", borderRadius: 12, padding: "6px 14px", marginBottom: 10 }}>
            {pending.undone.slice(0, 5).map(g => (
              <div key={g.at} style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: "1px dotted var(--line)" }}>
                <span style={{ fontSize: 12, color: "var(--muted)", flexShrink: 0, width: 72, paddingTop: 1 }}>{fmtShort(g.at)}</span>
                <ChangeLines items={g.items} />
              </div>
            ))}
            {pending.undone.length > 5 && <div style={{ fontSize: 12, color: "var(--muted)", padding: "6px 0" }}>ほか {pending.undone.length - 5}件</div>}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.7, marginBottom: 12 }}>元に戻したあとも、変更履歴から取り消せます。</div>
          {restoreMsg && <div style={{ fontSize: 12, color: "var(--terra)", marginBottom: 10, lineHeight: 1.7 }}>{restoreMsg}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <Btn kind="ghost" onClick={() => { setPending(null); setRestoreMsg(""); setMode("history"); }} style={{ flex: 1 }}>キャンセル</Btn>
            <Btn disabled={busy} onClick={doRestore} style={{ flex: 2 }}>{busy ? "処理中…" : "元に戻す"}</Btn>
          </div>
        </div>
      )}


      {mode === null && (
        <div style={{ marginTop: 18 }}>
          <button onClick={onRequestDeleteAccount} style={{ width: "100%", background: "none", border: "1.5px solid var(--danger)", color: "var(--danger)", fontWeight: 700, fontSize: 13.5, padding: "12px", borderRadius: 12, cursor: "pointer", fontFamily: "'Zen Kaku Gothic New',sans-serif" }}>アカウントを削除する</button>
          <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginTop: 10, lineHeight: 1.7 }}>アカウントとすべての記録が削除され、元に戻せません。</div>
        </div>
      )}
    </ModalShell>
  );
}

// 変更履歴の1件分（「記録を追加」＋対象の名前）
function ChangeLines({ items }) {
  return (
    <span style={{ flex: 1, minWidth: 0 }}>
      {items.map((c, i) => (
        <div key={i} style={{ marginBottom: i < items.length - 1 ? 4 : 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--espresso)" }}>{c.text}</div>
          {c.sub && <div style={{ fontSize: 11.5, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.sub}</div>}
        </div>
      ))}
    </span>
  );
}

// 下からせり上がるモーダルの外枠
function ModalShell({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(44,30,21,.45)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} className="cd-sheet" style={{ background: "var(--cream)", borderRadius: "22px 22px 0 0", padding: "10px 22px 32px", width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "6px 0 14px" }}><div style={{ width: 40, height: 4, borderRadius: 2, background: "var(--line)" }} /></div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div className="cd-serif" style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>閉じる</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Nav({ screen, onTab }) {
  const items = [["home", "home", "ホーム"], ["history", "diary", "日記"], ["rec", "brew", "淹れる"], ["karte", "shelf", "My棚"], ["profile", "user", "プロフィール"]];
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 480, margin: "0 auto", background: "var(--paper)", borderTop: "1px solid var(--line)", display: "flex", alignItems: "flex-end", padding: "8px 0 14px", zIndex: 20 }}>
      {items.map(([k, ic, label]) => {
        const active = (k === "home" && screen === "home") || (k === "karte" && screen === "karte") || (k === "history" && screen === "history") || (k === "profile" && screen === "profile") || (k === "rec" && screen.startsWith("rec"));
        if (k === "rec") {
          return (
            <button key={k} onClick={() => onTab("rec")} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: active ? "var(--bean)" : "var(--terra)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", marginTop: -22, boxShadow: active ? "0 0 0 4px rgba(179,85,47,.22), 0 6px 16px rgba(44,30,21,.35)" : "0 6px 16px rgba(179,85,47,.4)", border: "4px solid var(--paper)", transition: "all .15s" }}>
                <Icon name={ic} size={24} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'Zen Kaku Gothic New',sans-serif", color: active ? "var(--terra)" : "var(--mocha)" }}>{label}</span>
            </button>
          );
        }
        return (
          <button key={k} onClick={() => onTab(k)} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "5px 2px 3px", color: active ? "var(--terra)" : "var(--muted)" }}>
            <span style={{ height: 4, display: "flex", alignItems: "center" }}>{active && <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--terra)" }} />}</span>
            <Icon name={ic} /><span style={{ fontSize: 10, fontWeight: 700, fontFamily: "'Zen Kaku Gothic New',sans-serif" }}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
