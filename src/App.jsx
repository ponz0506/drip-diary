import React, { useState, useEffect, useRef, useContext, createContext } from "react";
import { supabase } from "./supabaseClient";
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
.cd-spin{width:18px;height:18px;border:2px solid var(--line);border-top-color:var(--terra);border-radius:50%;animation:cdspin .7s linear infinite;}
@keyframes cdspin{to{transform:rotate(360deg);}}
@keyframes cdtoast{from{opacity:0;transform:translate(-50%,10px);}to{opacity:1;transform:translate(-50%,0);}}
::-webkit-scrollbar{width:8px;}::-webkit-scrollbar-thumb{background:var(--line);border-radius:8px;}
`;

const FLAVOR_TREE = {
  "フルーツ系": ["柑橘", "ベリー", "トロピカル", "完熟果実"],
  "ナッツ・チョコ系": ["ナッツ", "ミルクチョコ", "ダークチョコ", "キャラメル"],
  "花・ハーブ系": ["花", "紅茶", "ハーブ", "緑茶"],
  "スパイス・その他": ["スパイス", "黒糖", "土っぽい", "焦げ・燻製"],
};
const TASTE_AXES = ["酸味", "苦味", "甘味", "コク", "濃度感", "雑味"];
const ROAST_LEVELS = ["浅煎り", "中浅煎り", "中煎り", "中深煎り", "深煎り"];

const uid = () => Math.random().toString(36).slice(2, 9);

// ====== ストレージ（Supabase user_data テーブル） ======
// ログイン中のユーザーの行だけを読み書きする（RLSで保護）。
let _uid = null; // 現在のユーザーID（ログイン時にセット）
const store = {
  async get(k, fallback) {
    try {
      const { data, error } = await supabase.from("user_data").select("value").eq("key", k).maybeSingle();
      if (error || !data) return fallback;
      return data.value ?? fallback;
    } catch { return fallback; }
  },
  async set(k, v) {
    try {
      if (!_uid) return;
      await supabase.from("user_data").upsert({ user_id: _uid, key: k, value: v });
    } catch (e) { /* 通信エラー等 */ }
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

// AIが返した注ぎを現実的なタイミングに整える（間隔30〜45秒、近すぎ/離れすぎを補正）
const sanitizePours = (pours, water) => {
  let ps = Array.isArray(pours) ? pours.filter(p => p && (typeof p.ml === "number" || typeof p.ml === "string")) : [];
  if (!ps.length) return [{ label: "1投目", t: 0, ml: Number(water) || 240 }];
  ps = ps.map((p, i) => ({ label: p.label || `${i + 1}投目`, t: Number(p.t) || 0, ml: Math.max(0, Math.round(Number(p.ml) || 0)) }));
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
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

// 数値入力（空欄OK・先頭ゼロなし・確定時に空なら0）
function NumberInput({ value, onChange, style, placeholder }) {
  const [focused, setFocused] = useState(false);
  const [str, setStr] = useState("");
  const display = focused ? str : (value === "" || value === null || value === undefined ? "" : String(value));
  return (
    <input type="text" inputMode="decimal" placeholder={placeholder} style={style} value={display}
      onFocus={() => { setFocused(true); setStr(value === 0 || value ? String(value) : ""); }}
      onChange={e => { let v = e.target.value.replace(/[^0-9.]/g, ""); v = v.replace(/^0+(?=\d)/, ""); setStr(v); if (v !== "" && !isNaN(Number(v))) onChange(Number(v)); }}
      onBlur={() => { setFocused(false); if (str === "" || isNaN(Number(str))) onChange(0); }} />
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
  const [draft, setDraft] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [detailFrom, setDetailFrom] = useState("home");
  const [profile, setProfile] = useState(null);
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // セッション監視（ログイン/ログアウト）
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      _uid = data.session?.user?.id || null;
      setSession(data.session);
      setAuthReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      _uid = s?.user?.id || null;
      setSession(s);
      if (!s) {
        setLoaded(false);
        setBeans([]); setGrinders([]); setDrippers([]); setFavorites([]); setLogs([]); setProposed(null); setProfile(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // ログイン後にこのユーザーのデータを読み込む
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    (async () => {
      setLoaded(false);
      let b = await store.get("cd_beans", null);
      if (!b) { b = [SEED_BEAN]; await store.set("cd_beans", b); }
      let g = await store.get("cd_grinders", null);
      if (!g) { g = [SEED_GRINDER]; await store.set("cd_grinders", g); }
      let d = await store.get("cd_drippers", null);
      if (!d) { d = [SEED_DRIPPER]; await store.set("cd_drippers", d); }
      const fav = await store.get("cd_favorites", []);
      const lg = await store.get("cd_logs", []);
      const pr = await store.get("cd_proposed", null);
      let pf = await store.get("cd_profile", null);
      if (!pf) { pf = { name: session.user.user_metadata?.display_name || (session.user.email || "user").split("@")[0], since: Date.now() }; await store.set("cd_profile", pf); }
      if (cancelled) return;
      setBeans(b); setGrinders(g); setDrippers(d); setFavorites(fav); setLogs(lg); setProposed(pr); setProfile(pf);
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [session]);

  const saveProfile = (p) => { setProfile(p); store.set("cd_profile", p); };
  const saveBeans = (b) => { setBeans(b); store.set("cd_beans", b); };
  const saveGrinders = (g) => { setGrinders(g); store.set("cd_grinders", g); };
  const saveDrippers = (d) => { setDrippers(d); store.set("cd_drippers", d); };
  const saveFavorites = (f) => { setFavorites(f); store.set("cd_favorites", f); };
  const saveLogs = (l) => { setLogs(l); store.set("cd_logs", l); };
  const saveProposed = (p) => { setProposed(p); store.set("cd_proposed", p); };

  const [editingId, setEditingId] = useState(null);
  const [flowStep, setFlowStep] = useState("rec1");
  const [showResume, setShowResume] = useState(false);

  // 記録フロー内の現在ステップを覚えておく（復帰用）
  useEffect(() => {
    if (["rec1", "rec2", "rec3", "chat"].includes(screen)) setFlowStep(screen);
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
    if (editingId && ["rec1", "rec2", "rec3", "chat"].includes(screen)) { setPendingNav(key); return; }
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
      grind: preset?.grind || 20, pours: preset?.pours || [{ label: "1投目", t: 0, ml: 60 }, { label: "2投目", t: 45, ml: 90 }, { label: "3投目", t: 90, ml: 90 }],
      taste: preset?.taste || { 酸味: 3, 苦味: 3, 甘味: 3, コク: 3, 濃度感: 3, 雑味: 1 },
      flavorBig: preset?.flavorBig || "", flavorSmall: preset?.flavorSmall || "", memo: preset?.memo || "",
      satisfaction: preset?.satisfaction || 3, createdAt: preset?.createdAt || Date.now(),
      chat: editId ? (preset?.chat || []) : [], nextRecipe: editId ? (preset?.nextRecipe || null) : null,
    });
    setScreen(step);
  };

  // 新規なら先頭に追加、編集（同じid）なら置き換え
  const saveDraftAsLog = (d) => {
    const exists = logs.some(l => l.id === d.id);
    const newLogs = exists ? logs.map(l => (l.id === d.id ? d : l)) : [d, ...logs];
    saveLogs(newLogs);
    if (d.nextRecipe) saveProposed({ ...d.nextRecipe, beanId: d.beanId, grinderId: d.grinderId, dripperId: d.dripperId, beanName: d.beanName, grinderName: d.grinderName, dripperName: d.dripperName });
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
        {screen === "karte" && <Karte beans={beans} saveBeans={saveBeans} grinders={grinders} saveGrinders={saveGrinders} drippers={drippers} saveDrippers={saveDrippers} favorites={favorites} saveFavorites={saveFavorites} startRecord={startRecord} />}
        {screen === "profile" && <Profile profile={profile} saveProfile={saveProfile} logs={logs} beans={beans} favorites={favorites} email={session.user.email} onLogout={() => supabase.auth.signOut()} onRequestDeleteAccount={() => setConfirmDelAccount(true)} />}
        {screen === "rec1" && <Rec1 draft={draft} setDraft={setDraft} beans={beans} setScreen={setScreen} />}
        {screen === "rec2" && <Rec2 draft={draft} setDraft={setDraft} beans={beans} grinders={grinders} drippers={drippers} favorites={favorites} saveFavorites={saveFavorites} setScreen={setScreen} />}
        {screen === "rec3" && <Rec3 draft={draft} setDraft={setDraft} setScreen={setScreen} editing={!!editingId} onSaveDirect={() => saveDraftAsLog({ ...draft })} />}
        {screen === "chat" && <Chat draft={draft} setDraft={setDraft} beans={beans} grinders={grinders} drippers={drippers} favorites={favorites} saveFavorites={saveFavorites} logs={logs}
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
    </div>
    </ToastCtx.Provider>
  );
}

function Header({ screen, setScreen, detailFrom, editing }) {
  const back = { rec1: "home", rec2: "rec1", rec3: "rec2", chat: "rec3", karte: "home", history: "home", logdetail: detailFrom, profile: "home" };
  const inFlow = ["rec1", "rec2", "rec3", "chat"].includes(screen);
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
function LogCard({ log: l, bean, onClick }) {
  return (
    <div onClick={onClick} style={{ background: "var(--paper)", borderRadius: 16, padding: 16, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: onClick ? "pointer" : "default" }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14.5 }}>{bean?.name || l.beanName || "不明な豆"}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>{l.grounds}g / {l.water}ml / {l.temp}℃ · {new Date(l.createdAt).toLocaleDateString("ja-JP")}</div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ color: "var(--crema)", fontSize: 15 }}>{"★".repeat(l.satisfaction)}<span style={{ color: "var(--line)" }}>{"★".repeat(5 - l.satisfaction)}</span></div>
        {l.flavorSmall && <div style={{ fontSize: 11, color: "var(--mocha)", marginTop: 2 }}>{l.flavorSmall}</div>}
      </div>
    </div>
  );
}

// ====== カルテ（豆 / ミル / ドリッパー / レシピ 切替）======
function Karte({ beans, saveBeans, grinders, saveGrinders, drippers, saveDrippers, favorites, saveFavorites, startRecord }) {
  const [tab, setTab] = useState("bean");
  return (
    <div className="cd-fade">
      <div style={{ display: "flex", gap: 5, marginBottom: 18, background: "var(--paper)", padding: 5, borderRadius: 14 }}>
        {[["bean", "豆"], ["grinder", "ミル"], ["dripper", "ドリッパー"], ["recipe", "レシピ"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "9px 2px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap", background: tab === k ? "var(--bean)" : "transparent", color: tab === k ? "var(--cream)" : "var(--mocha)" }}>{l}</button>
        ))}
      </div>
      {tab === "bean" && <Beans beans={beans} saveBeans={saveBeans} />}
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

// ====== 日記（全ログ一覧）======
// ====== 豆別サマリーパネル ======
const RADAR_COLORS = ["#b3552f", "#c98a4b", "#6b4e3a"];

function BeanSummary({ logs, openLog }) {
  const [tab, setTab] = useState("satisfaction"); // satisfaction | flavor | trail

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

  // ---- ② フレーバー変化マップ（最新3件） ----
  const AXES = ["酸味", "苦味", "甘味", "コク", "濃度感"];
  const recent3 = sorted.slice(-3);
  const radarData = AXES.map(ax => {
    const row = { subject: ax };
    recent3.forEach((l, i) => { row[`${l._n}回目`] = l.taste?.[ax] ?? 0; });
    return row;
  });

  // ---- ③ 改善の軌跡 ----
  const trailData = sorted.map((l, i) => {
    const prev = sorted[i - 1];
    const diff = (key, val) => {
      if (!prev) return null;
      const pv = prev[key];
      if (pv == null || val == null || pv === val) return null;
      return val > pv ? "up" : "down";
    };
    return {
      n: l._n, date: new Date(l.createdAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }),
      grind: l.grind, grindDir: diff("grind", l.grind),
      temp: l.temp, tempDir: diff("temp", l.temp),
      satisfaction: l.satisfaction, satDir: diff("satisfaction", l.satisfaction),
      id: l.id,
    };
  });

  const tabStyle = (k) => ({
    flex: 1, padding: "8px 4px", fontSize: 12, fontWeight: 700, background: "none",
    border: "none", borderBottom: tab === k ? "2.5px solid var(--terra)" : "2.5px solid transparent",
    color: tab === k ? "var(--terra)" : "var(--muted)", cursor: "pointer", fontFamily: "'Zen Kaku Gothic New',sans-serif",
  });

  const DirBadge = ({ dir }) => {
    if (!dir) return null;
    return <span style={{ marginLeft: 4, fontSize: 10, color: dir === "up" ? "#e07b39" : "#5b9bd5" }}>{dir === "up" ? "▲" : "▼"}</span>;
  };

  const SatDot = ({ v }) => <span style={{ color: "var(--crema)" }}>{"★".repeat(v)}<span style={{ color: "var(--line)" }}>{"★".repeat(5 - v)}</span></span>;

  return (
    <div className="cd-fade" style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 16, marginBottom: 18, overflow: "hidden" }}>
      <div style={{ display: "flex", borderBottom: "1px solid var(--line)" }}>
        <button style={tabStyle("satisfaction")} onClick={() => setTab("satisfaction")}>満足度推移</button>
        <button style={tabStyle("flavor")} onClick={() => setTab("flavor")}>フレーバー</button>
        <button style={tabStyle("trail")} onClick={() => setTab("trail")}>改善の軌跡</button>
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
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>最新{recent3.length}回のフレーバーバランス比較</div>
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e3d8c8" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: "#6b4e3a" }} />
                {recent3.map((l, i) => (
                  <Radar key={l.id} name={`${l._n}回目`} dataKey={`${l._n}回目`}
                    stroke={RADAR_COLORS[i]} fill={RADAR_COLORS[i]} fillOpacity={0.12} strokeWidth={2} />
                ))}
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e3d8c8" }} />
              </RadarChart>
            </ResponsiveContainer>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, lineHeight: 1.8 }}>
              {(() => {
                const changes = AXES.map(ax => {
                  const vals = recent3.map(l => l.taste?.[ax] ?? 0);
                  const diff = vals[vals.length - 1] - vals[0];
                  return { ax, diff };
                }).filter(x => Math.abs(x.diff) >= 1).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
                if (!changes.length) return "直近3回のフレーバーに大きな変化はありません。";
                return `変化が大きい軸：${changes.map(c => `${c.ax}（${c.diff > 0 ? "+" : ""}${c.diff}）`).join("、")}`;
              })()}
            </div>
          </>
        )}

        {tab === "trail" && (
          <>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>▲▼は前回からの変化。テラコッタ色は改善。</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: "1.5px solid var(--line)" }}>
                    {["回", "日付", "粒度", "湯温", "満足度"].map(h => (
                      <th key={h} style={{ padding: "6px 8px", textAlign: "center", color: "var(--muted)", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {trailData.map((r, i) => (
                    <tr key={r.id} onClick={() => openLog(r.id)} style={{ borderBottom: "1px solid var(--line)", cursor: "pointer", background: i % 2 === 0 ? "transparent" : "rgba(227,216,200,.2)" }}>
                      <td style={{ padding: "8px", textAlign: "center", color: "var(--muted)" }}>{r.n}</td>
                      <td style={{ padding: "8px", textAlign: "center", color: "var(--muted)", whiteSpace: "nowrap" }}>{r.date}</td>
                      <td style={{ padding: "8px", textAlign: "center", fontWeight: r.grindDir ? 700 : 400, color: r.grindDir ? "var(--terra)" : "var(--espresso)" }}>
                        {r.grind}<DirBadge dir={r.grindDir} />
                      </td>
                      <td style={{ padding: "8px", textAlign: "center", fontWeight: r.tempDir ? 700 : 400, color: r.tempDir ? "var(--terra)" : "var(--espresso)" }}>
                        {r.temp}℃<DirBadge dir={r.tempDir} />
                      </td>
                      <td style={{ padding: "8px", textAlign: "center", fontWeight: r.satDir ? 700 : 400, color: r.satDir ? "var(--terra)" : "var(--espresso)" }}>
                        <SatDot v={r.satisfaction} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

  const months = [...new Set(logs.map(monthKey))];
  const usedBeans = [...new Set(logs.map(beanLabel))];
  const usedRoasts = ROAST_LEVELS.filter(r => logs.some(l => roastOf(l) === r));
  const active = monthF !== "all" || beanF !== "all" || roastF !== "all";

  const filtered = logs.filter(l => (monthF === "all" || monthKey(l) === monthF) && (beanF === "all" || beanLabel(l) === beanF) && (roastF === "all" || roastOf(l) === roastF));
  const beanLogs = beanF !== "all" ? logs.filter(l => beanLabel(l) === beanF) : [];
  const groups = {};
  filtered.forEach(l => { (groups[monthKey(l)] ||= []).push(l); });

  const selStyle = { ...inputStyle, flex: "1 1 30%", minWidth: 100, fontSize: 13, padding: "9px 10px", appearance: "auto" };
  return (
    <div className="cd-fade">
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
      {beanF !== "all" && <BeanSummary logs={beanLogs} openLog={openLog} />}
      {filtered.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)", textAlign: "center", padding: 20 }}>条件に合う記録がありません。</div>}
      {Object.entries(groups).map(([month, ls]) => (
        <div key={month} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--mocha)", marginBottom: 8 }}>{month}</div>
          {ls.map(l => <LogCard key={l.id} log={l} bean={beanOf(l.beanId)} onClick={() => openLog(l.id)} />)}
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
        {(l.flavorBig || l.flavorSmall) && <div style={{ fontSize: 13, color: "var(--mocha)", marginTop: 10 }}>フレーバー：{[l.flavorBig, l.flavorSmall].filter(Boolean).join(" → ")}</div>}
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
function Beans({ beans, saveBeans }) {
  const [editing, setEditing] = useState(null);
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
          <div style={{ flex: 1 }}><Field label="精製"><input style={inputStyle} value={e.process} onChange={ev => set("process", ev.target.value)} placeholder="ウォッシュド等" /></Field></div>
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
            else { saveBeans([{ ...e, id: uid() }, ...beans]); notify("My棚に追加しました"); }
            setEditing(null);
          }}>保存する</Btn>
        </div>
      </div>
    );
  }
  return (
    <div className="cd-fade">
      <Btn onClick={() => setEditing(blank)} style={{ width: "100%", marginBottom: 18 }}>＋ 豆を追加</Btn>
      {beans.map(b => (
        <div key={b.id} onClick={() => setEditing(b)} style={{ background: "var(--paper)", borderRadius: 16, padding: 16, marginBottom: 10, cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div className="cd-serif" style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>{b.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ fontSize: 11, color: "#fff", background: "var(--mocha)", padding: "3px 9px", borderRadius: 20 }}>{b.roastLevel}</div>
              <CardMenu items={[{ label: "編集", onClick: () => setEditing(b) }, { label: "削除", danger: true, onClick: () => { saveBeans(beans.filter(x => x.id !== b.id)); notify("My棚から削除しました"); } }]} />
            </div>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>{[b.origin, b.process].filter(Boolean).join(" · ")}</div>
          {b.roasterNote && <div style={{ fontSize: 12.5, color: "var(--mocha)", marginTop: 8, fontStyle: "italic" }}>“{b.roasterNote}”</div>}
        </div>
      ))}
    </div>
  );
}

// ====== STEP1 豆選択 ======
function Rec1({ draft, setDraft, beans, setScreen }) {
  return (
    <div className="cd-fade">
      <StepDots n={1} />
      {beans.map(b => {
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
      })}
      <div style={{ background: draft.beanName?.trim() ? "var(--bean)" : "var(--paper)", borderRadius: 16, padding: 14, marginBottom: 10, border: draft.beanName?.trim() ? "1.5px solid var(--bean)" : "1.5px dashed var(--line)", transition: "all .15s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: draft.beanName?.trim() ? "var(--cream)" : "var(--mocha)", marginBottom: 6 }}>その他</div>
            <input value={draft.beanName || ""} onChange={e => setDraft({ ...draft, beanName: e.target.value, beanId: e.target.value ? null : draft.beanId })}
              placeholder="豆の名前を入力" style={{ ...inputStyle, background: "var(--paper)" }} />
            <div style={{ fontSize: 11, color: draft.beanName?.trim() ? "rgba(241,232,219,.75)" : "var(--muted)", marginTop: 6 }}>My棚に登録すると、次から選択できます。</div>
          </div>
          <div style={{ width: 24, height: 24, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: draft.beanName?.trim() ? "var(--crema)" : "transparent", border: draft.beanName?.trim() ? "none" : "2px solid var(--line)", color: "var(--espresso)" }}>
            {draft.beanName?.trim() && <Icon name="check" size={15} />}
          </div>
        </div>
      </div>
      <Btn disabled={!draft.beanId && !draft.beanName?.trim()} style={{ width: "100%", marginTop: 6 }} onClick={() => setScreen("rec2")}>次へ：レシピ</Btn>
    </div>
  );
}

// ====== レシピ入力（共通部品）======
function RecipeFields({ value, setValue, grinders, drippers, favorites, saveFavorites }) {
  const [showFav, setShowFav] = useState(false);
  const [favOpen, setFavOpen] = useState(null);
  const [naming, setNaming] = useState(false);
  const [favName, setFavName] = useState("");
  const [dripText, setDripText] = useState(!!value.dripperName);
  const [grindText, setGrindText] = useState(!!value.grinderName);
  const num = (k, label, unit) => (
    <div style={{ flex: 1 }}>
      <Field label={label}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <NumberInput value={value[k]} onChange={v => setValue({ ...value, [k]: v })} style={inputStyle} />
          <span style={{ fontSize: 13, color: "var(--muted)" }}>{unit}</span>
        </div>
      </Field>
    </div>
  );
  const pours = value.pours || [];
  const ratio = value.grounds ? (value.water / value.grounds).toFixed(1) : "–";
  const updatePour = (i, k, v) => { const p = [...pours]; p[i] = { ...p[i], [k]: Number(v) }; setValue({ ...value, pours: p }); };
  const setPourTime = (i, part, v) => {
    const p = [...pours]; const cur = p[i].t || 0;
    const min = part === "m" ? Number(v) : Math.floor(cur / 60);
    const sec = part === "s" ? Number(v) : cur % 60;
    p[i] = { ...p[i], t: min * 60 + sec }; setValue({ ...value, pours: p });
  };
  const loadFav = (f) => {
    setValue({ ...value, grounds: f.grounds, water: f.water, temp: f.temp, grinderId: f.grinderId, dripperId: f.dripperId ?? value.dripperId, grinderName: f.grinderName || "", dripperName: f.dripperName || "", grind: f.grind, pours: f.pours.map(p => ({ ...p })) });
    setDripText(!!f.dripperName); setGrindText(!!f.grinderName);
    setShowFav(false);
  };
  const registerFav = () => {
    if (!favName.trim()) return;
    saveFavorites([{ id: uid(), name: favName.trim(), grounds: value.grounds, water: value.water, temp: value.temp, grinderId: value.grinderId, dripperId: value.dripperId, grinderName: value.grinderName || "", dripperName: value.dripperName || "", grind: value.grind, pours: pours.map(p => ({ ...p })) }, ...favorites]);
    setFavName(""); setNaming(false);
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
                      <button onClick={() => setFavOpen(open ? null : f.id)} style={{ background: "none", border: "none", color: "var(--mocha)", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>{open ? "詳細 ▲" : "詳細 ▼"}</button>
                    </div>
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
              <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", paddingTop: 8, display: favorites.length ? "block" : "none" }}>削除はMy棚の「レシピ」から行えます</div>
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
      {dripText && <div style={{ textAlign: "right", marginTop: -8, marginBottom: 8 }}><button onClick={() => { setDripText(false); setValue({ ...value, dripperName: "" }); }} style={{ background: "none", border: "none", color: "var(--mocha)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>My棚から選ぶ</button></div>}
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
      {grindText && <div style={{ textAlign: "right", marginTop: -8, marginBottom: 8 }}><button onClick={() => { setGrindText(false); setValue({ ...value, grinderName: "" }); }} style={{ background: "none", border: "none", color: "var(--mocha)", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>My棚から選ぶ</button></div>}
      {(dripText || grindText) && <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>My棚に登録すると、次から選択できます。</div>}
      <div style={{ background: "var(--paper)", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "var(--mocha)", marginBottom: 18 }}>抽出比率 <b style={{ color: "var(--terra)" }}>1 : {ratio}</b></div>

      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--mocha)", marginBottom: 8 }}>注ぎ（レシピ）</div>
      <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", marginBottom: 10 }}>
        <colgroup><col style={{ width: "27%" }} /><col style={{ width: "30%" }} /><col style={{ width: "20%" }} /><col style={{ width: "15%" }} /><col style={{ width: "8%" }} /></colgroup>
        <thead>
          <tr style={{ borderBottom: "1.5px solid var(--mocha)" }}>
            {["投数", "時間", "注ぐ量", <span key="t">総量<br /><span style={{ fontSize: 9, fontWeight: 400, color: "var(--muted)" }}>スケール表示</span></span>, ""].map((h, i) => (
              <th key={i} style={{ fontSize: 11.5, fontWeight: 700, color: "var(--mocha)", padding: "0 0 7px", textAlign: i === 4 ? "right" : "center" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pours.map((p, i) => {
            cum += Number(p.ml) || 0;
            const min = Math.floor((p.t || 0) / 60), sec = (p.t || 0) % 60;
            return (
              <tr key={i} style={{ borderBottom: "1px dotted var(--line)" }}>
                <td style={{ padding: "7px 3px" }}>
                  <input style={cellInput} value={p.label} onChange={e => { const pp = [...pours]; pp[i] = { ...pp[i], label: e.target.value }; setValue({ ...value, pours: pp }); }} />
                </td>
                <td style={{ padding: "7px 3px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>
                    <NumberInput value={min} onChange={v => setPourTime(i, "m", v)} style={{ ...cellInput, padding: "8px 2px" }} />
                    <span style={{ color: "var(--muted)", fontWeight: 700 }}>:</span>
                    <NumberInput value={sec} onChange={v => setPourTime(i, "s", v)} style={{ ...cellInput, padding: "8px 2px" }} />
                  </div>
                </td>
                <td style={{ padding: "7px 3px" }}>
                  <NumberInput value={p.ml} onChange={v => updatePour(i, "ml", v)} style={cellInput} />
                </td>
                <td style={{ padding: "7px 3px", textAlign: "center", fontWeight: 700, fontSize: 13.5, color: "var(--bean)" }}>{cum}g</td>
                <td style={{ padding: "7px 0", textAlign: "right" }}>
                  <button onClick={() => setValue({ ...value, pours: pours.filter((_, j) => j !== i) })} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: 18, cursor: "pointer" }}>×</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button onClick={() => setValue({ ...value, pours: [...pours, { label: `${pours.length + 1}投目`, t: pours.length === 0 ? 0 : (pours[pours.length - 1].t || 0) + 45, ml: 60 }] })}
        style={{ background: "var(--cream)", border: "1.5px dashed var(--line)", borderRadius: 12, padding: "9px", width: "100%", color: "var(--mocha)", cursor: "pointer", fontFamily: "inherit", fontSize: 13, marginBottom: 18 }}>＋ 投を追加</button>
    </>
  );
}

// ====== STEP2 レシピ ======
function Rec2({ draft, setDraft, beans, grinders, drippers, favorites, saveFavorites, setScreen }) {
  const beanName = beans.find(b => b.id === draft.beanId)?.name || draft.beanName || "未選択";
  return (
    <div className="cd-fade">
      <StepDots n={2} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--bean)", color: "var(--cream)", borderRadius: 14, padding: "12px 16px", marginBottom: 18 }}>
        <span style={{ fontSize: 11, opacity: .7, fontWeight: 700, letterSpacing: ".08em" }}>豆</span>
        <span className="cd-serif" style={{ fontSize: 15.5, fontWeight: 700, flex: 1 }}>{beanName}</span>
        <button onClick={() => setScreen("rec1")} style={{ background: "rgba(241,232,219,.18)", border: "none", color: "var(--cream)", fontSize: 12, fontWeight: 700, cursor: "pointer", padding: "5px 12px", borderRadius: 20 }}>変更</button>
      </div>
      <RecipeFields value={draft} setValue={setDraft} grinders={grinders} drippers={drippers} favorites={favorites} saveFavorites={saveFavorites} />
      <Btn style={{ width: "100%" }} onClick={() => setScreen("rec3")}>次へ：味わいメモ</Btn>
    </div>
  );
}

// ====== STEP3 味の評価（問診票）======
function Rec3({ draft, setDraft, setScreen, editing, onSaveDirect }) {
  const setTaste = (k, v) => setDraft({ ...draft, taste: { ...draft.taste, [k]: Number(v) } });
  const req = <span style={{ color: "var(--terra)", fontSize: 11, marginLeft: 6 }}>必須</span>;
  const valid = !!draft.flavorBig && !!draft.flavorSmall;
  return (
    <div className="cd-fade">
      <StepDots n={3} />
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--mocha)", marginBottom: 12 }}>味わいのバランス（1〜5）{req}</div>
      {TASTE_AXES.map(ax => (
        <div key={ax} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 5 }}>
            <span style={{ fontWeight: 700 }}>{ax}</span><span style={{ color: "var(--terra)", fontWeight: 700 }}>{draft.taste[ax]}</span>
          </div>
          <input type="range" min={1} max={5} value={draft.taste[ax]} onChange={e => setTaste(ax, e.target.value)} style={{ width: "100%" }} />
        </div>
      ))}

      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--mocha)", margin: "20px 0 10px" }}>感じたフレーバー{req}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
        {Object.keys(FLAVOR_TREE).map(b => (
          <Chip key={b} active={draft.flavorBig === b} onClick={() => setDraft({ ...draft, flavorBig: b, flavorSmall: "" })}>{b}</Chip>
        ))}
      </div>
      {draft.flavorBig && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }} className="cd-fade">
          {FLAVOR_TREE[draft.flavorBig].map(s => (
            <Chip key={s} small active={draft.flavorSmall === s} onClick={() => setDraft({ ...draft, flavorSmall: s })}>{s}</Chip>
          ))}
        </div>
      )}
      {draft.flavorBig && !draft.flavorSmall && <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6 }}>もう一段、近いものを選んでください</div>}

      <Field label="メモ（気づいたこと）"><textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical", marginTop: 8 }} value={draft.memo} onChange={e => setDraft({ ...draft, memo: e.target.value })} placeholder="例：後味に少し渋みが残った" /></Field>

      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--mocha)", margin: "8px 0 8px" }}>総合満足度</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
        {[1, 2, 3, 4, 5].map(s => (
          <button key={s} onClick={() => setDraft({ ...draft, satisfaction: s })} style={{ flex: 1, fontSize: 26, background: "none", border: "none", cursor: "pointer", color: s <= draft.satisfaction ? "var(--crema)" : "var(--line)" }}>★</button>
        ))}
      </div>
      {!valid && <div style={{ fontSize: 12, color: "var(--terra)", textAlign: "center", marginBottom: 10 }}>「感じたフレーバー」を選ぶと進めます</div>}
      <Btn disabled={!valid} style={{ width: "100%" }} onClick={() => setScreen("chat")}>AIに相談する →</Btn>
      <Btn kind="ghost" disabled={!valid} style={{ width: "100%", marginTop: 10 }} onClick={onSaveDirect}>{editing ? "変更を保存" : "相談せずに記録する"}</Btn>
    </div>
  );
}

function Chip({ children, active, onClick, small }) {
  return <button onClick={onClick} style={{ padding: small ? "7px 13px" : "9px 15px", borderRadius: 20, border: "1.5px solid", borderColor: active ? "var(--terra)" : "var(--line)", background: active ? "var(--terra)" : "var(--paper)", color: active ? "#fff" : "var(--mocha)", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{children}</button>;
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
フレーバー: ${[draft.flavorBig, draft.flavorSmall].filter(Boolean).join("→") || "未選択"}
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
function Profile({ profile, saveProfile, logs, beans, favorites, email, onLogout, onRequestDeleteAccount }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.name || "");
  const [newEmail, setNewEmail] = useState("");
  const [newPw, setNewPw] = useState("");
  const [acctMsg, setAcctMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const notify = useContext(ToastCtx);

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
      setNewEmail("");
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
      setNewPw("");
    } catch (e) { setAcctMsg(acctErr(e?.message)); }
    setBusy(false);
  };

  const cups = logs.length;
  const avg = cups ? (logs.reduce((s, l) => s + (l.satisfaction || 0), 0) / cups) : 0;
  // 一番よく淹れた豆
  const counts = {};
  logs.forEach(l => { const n = beans.find(b => b.id === l.beanId)?.name || l.beanName; if (n) counts[n] = (counts[n] || 0) + 1; });
  const topBean = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "—";
  const since = profile?.since ? new Date(profile.since).toLocaleDateString("ja-JP", { year: "numeric", month: "long" }) : "";

  const stat = (label, value) => (
    <div style={{ flex: 1, background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, padding: "14px 10px", textAlign: "center" }}>
      <div className="cd-serif" style={{ fontSize: 22, fontWeight: 700, color: "var(--bean)" }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{label}</div>
    </div>
  );

  return (
    <div className="cd-fade">
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 22 }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(155deg,var(--bean),var(--espresso))", color: "var(--cream)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700, flexShrink: 0 }} className="cd-serif">{(profile?.name || "?").slice(0, 1)}</div>
        <div style={{ flex: 1 }}>
          {editing ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input style={{ ...inputStyle, flex: 1, padding: "8px 11px" }} value={name} onChange={e => setName(e.target.value)} />
              <Btn disabled={!name.trim()} onClick={() => { saveProfile({ ...profile, name: name.trim() }); setEditing(false); notify("変更を保存しました"); }} style={{ padding: "9px 14px", fontSize: 13 }}>保存</Btn>
            </div>
          ) : (
            <>
              <div className="cd-serif" style={{ fontSize: 20, fontWeight: 700 }}>{profile?.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{since} から記録中</div>
            </>
          )}
        </div>
        {!editing && <button onClick={() => { setName(profile?.name || ""); setEditing(true); }} style={{ background: "none", border: "none", color: "var(--mocha)", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>編集</button>}
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
        {stat("淹れた杯数", cups)}
        {stat("平均満足度", cups ? `${avg.toFixed(1)}★` : "—")}
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        {stat("登録した豆", beans.length)}
        {stat("定番レシピ", favorites.length)}
      </div>

      <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, padding: 16, marginBottom: 24 }}>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>よく淹れる豆</div>
        <div className="cd-serif" style={{ fontSize: 16, fontWeight: 700 }}>{topBean}</div>
      </div>

      {/* アカウント設定 */}
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--mocha)", marginBottom: 10 }}>アカウント設定</div>
      <div style={{ background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 14, padding: 16, marginBottom: 14 }}>
        <Field label="メールアドレス">
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 6 }}>現在：{email}</div>
          <input style={inputStyle} type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="新しいメールアドレス" />
        </Field>
        <Btn kind="soft" disabled={busy || !newEmail.trim()} onClick={changeEmail} style={{ width: "100%", marginTop: 4, marginBottom: 18 }}>メールアドレスを更新</Btn>

        <Field label="パスワード（6文字以上）">
          <input style={inputStyle} type="password" autoComplete="new-password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="新しいパスワード" />
        </Field>
        <Btn kind="soft" disabled={busy || newPw.length < 6} onClick={changePw} style={{ width: "100%", marginTop: 4 }}>パスワードを更新</Btn>

        {acctMsg && <div style={{ fontSize: 12, color: "var(--terra)", marginTop: 12, lineHeight: 1.7 }}>{acctMsg}</div>}
      </div>

      <Btn kind="ghost" onClick={onLogout} style={{ width: "100%", marginBottom: 18 }}>ログアウト</Btn>
      <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginBottom: 24, lineHeight: 1.7 }}>ログアウトしても、記録はアカウントに保存されています。</div>

      {/* アカウント削除 */}
      <div style={{ borderTop: "1px solid var(--line)", paddingTop: 18 }}>
        <button onClick={onRequestDeleteAccount} style={{ width: "100%", background: "none", border: "1.5px solid var(--danger)", color: "var(--danger)", fontWeight: 700, fontSize: 13.5, padding: "12px", borderRadius: 12, cursor: "pointer", fontFamily: "'Zen Kaku Gothic New',sans-serif" }}>アカウントを削除する</button>
        <div style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", marginTop: 10, lineHeight: 1.7 }}>アカウントとすべての記録が削除され、元に戻せません。</div>
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
