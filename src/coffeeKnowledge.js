// ============================================================
// コーヒー豆の風味の傾向（「次に試したい豆」の提案で使う知識の表）
//
// ・AIに風味を自由に書かせると、もっともらしい誤りが混ざるため、
//   風味の説明はこの表から表示し、AIには表の中から組み合わせを選ばせる。
// ・香りの言葉は、アプリのフレーバー選択（FLAVOR_TREE）と同じ語彙だけを使う。
//   柑橘 / ベリー / トロピカル / 完熟果実 / ナッツ / ミルクチョコ / ダークチョコ / キャラメル /
//   花 / 紅茶 / ハーブ / 緑茶 / スパイス / 黒糖 / 土っぽい / 焦げ・燻製
// ・ここに書くのは「一般的にそう言われることが多い傾向」。同じ産地でも地域・農園・品種・
//   焙煎で風味は大きく変わる。内容は出典を確認したうえで、人が見直して更新する。
//
// 出典（2026-10 確認）
//  [S1] Sweet Maria's Coffee Library  https://library.sweetmarias.com/
//  [S2] Coffee Review（Guatemala 地域別の記事など） https://www.coffeereview.com/beyond-antigua-the-other-guatemalas/
//  [S3] Cameron's Coffee「A Guide to the Flavors of Popular Coffee Origins」 https://cameronscoffee.com/blog/coffee-origins-and-their-characteristics
//  [S4] Breville「What can you expect from different specialty coffee origins?」 https://www.breville.com/ca/en/coffee-journey/inspiration/origins/beans-taste.html
//  [S5] Birch Coffee「Guide to Specialty Coffee Origins」 https://wholesale.birchcoffee.com/blog/guide-to-specialty-coffee-origins
//  [S6] 1Zpresso 精製方法ガイド（ウォッシュド/ナチュラル/ハニー/アナエロビック） https://1zpresso.coffee/the-guide-to-coffee-processing-methods/
//  [S7] Seattle Coffee Gear「Wet-Hulled (Giling Basah) Coffee Processing」 https://www.seattlecoffeegear.com/blogs/learning-center/wet-hulled-coffee-processing
//  [S8] Achilles Coffee Roasters「How Roast Profiles Influence Coffee Flavor」 https://achillescoffeeroasters.com/blogs/specialty-coffee-blog/how-roast-profiles-influence-coffee-flavor-light-vs-medium-vs-dark
//  [S9] SL28（ケニアの品種）の解説 https://mycoffeeexplorer.com/glossary/sl28
// ============================================================

// 産地：主な精製（その国で一般的なもの）・香り・酸味/ボディの傾向・ひとこと
// flavorsByProcess は精製によって傾向が大きく変わる産地だけに書く
export const ORIGIN_KB = {
  "エチオピア": {
    commonProcess: ["ウォッシュド", "ナチュラル"],
    flavors: ["花", "柑橘", "紅茶"],
    flavorsByProcess: { "ウォッシュド": ["柑橘", "花", "紅茶"], "ナチュラル": ["ベリー", "完熟果実", "花"] },
    acidity: "高め", body: "軽め〜中",
    note: "果実感と華やかな香り。ウォッシュドは柑橘や花、ナチュラルはベリー系になりやすい",
    sources: ["S3"],
  },
  "ケニア": {
    commonProcess: ["ウォッシュド"],
    flavors: ["ベリー", "柑橘", "完熟果実"],
    acidity: "高め", body: "中",
    note: "ジューシーで力強い酸。カシス（ブラックカラント）やグレープフルーツにたとえられることが多い",
    sources: ["S3", "S9"],
  },
  "ルワンダ": {
    commonProcess: ["ウォッシュド"],
    flavors: ["紅茶", "ベリー", "柑橘"],
    acidity: "中〜高め", body: "中",
    note: "紅茶のような印象と果実感、しっかりした甘さ",
    sources: ["S1"],
  },
  "ブルンジ": {
    commonProcess: ["ウォッシュド"],
    flavors: ["紅茶", "キャラメル", "柑橘"],
    acidity: "中〜高め", body: "中",
    note: "ルワンダに近い傾向。黒糖やキャラメルのような甘さと紅茶のような明るさ",
    sources: ["S1"],
  },
  "コロンビア": {
    commonProcess: ["ウォッシュド"],
    flavors: ["キャラメル", "柑橘", "ミルクチョコ"],
    acidity: "中", body: "中",
    note: "バランスがよく、果実感と甘さがそろう。産地が広く、地域による幅も大きい",
    sources: ["S3"],
  },
  "ブラジル": {
    commonProcess: ["ナチュラル"],
    flavors: ["ナッツ", "ミルクチョコ", "キャラメル"],
    acidity: "低め", body: "中",
    note: "甘くナッツやチョコレートのような穏やかな味。酸味は控えめ",
    sources: ["S3"],
  },
  "グアテマラ": {
    commonProcess: ["ウォッシュド"],
    flavors: ["ミルクチョコ", "柑橘", "花"],
    acidity: "中〜高め", body: "中",
    note: "チョコレートのような甘さと明るさ。地域差が大きく、評価も分かれる（アンティグアは花やスパイス、ウエウエテナンゴはチョコと柑橘、などと言われる）",
    sources: ["S2", "S3"],
  },
  "コスタリカ": {
    commonProcess: ["ウォッシュド", "ハニー"],
    flavors: ["柑橘", "キャラメル", "花"],
    acidity: "中", body: "軽め〜中",
    note: "クリーンで軽やか。ハニー精製の産地としても知られる",
    sources: ["S4"],
  },
  "ホンジュラス": {
    commonProcess: ["ウォッシュド"],
    flavors: ["完熟果実", "キャラメル", "ミルクチョコ"],
    acidity: "中", body: "中",
    note: "幅広い味わいがあり、果実感のある複雑なものも多い",
    sources: ["S4"],
  },
  "エルサルバドル": {
    commonProcess: ["ウォッシュド", "ハニー", "ナチュラル"],
    flavors: ["キャラメル", "ミルクチョコ", "完熟果実"],
    acidity: "中", body: "中",
    note: "甘くバランスがよい",
    sources: ["S4"],
  },
  "パナマ": {
    commonProcess: ["ウォッシュド", "ナチュラル"],
    flavors: ["花", "柑橘", "紅茶"],
    acidity: "中〜高め", body: "軽め",
    note: "ゲイシャ種で知られ、華やかな香りと柑橘、軽いボディ。高価なものが多い",
    sources: ["S4"],
  },
  "ペルー": {
    commonProcess: ["ウォッシュド"],
    flavors: ["ミルクチョコ", "ナッツ", "柑橘"],
    acidity: "中", body: "中",
    note: "中米のような明るさを持ちつつ、南米らしい穏やかな甘さ",
    sources: ["S1"],
  },
  "インドネシア": {
    commonProcess: ["スマトラ式"],
    flavors: ["土っぽい", "ハーブ", "ダークチョコ"],
    acidity: "低め", body: "重め",
    note: "スマトラ島のマンデリンなど。スマトラ式精製による土やハーブのような風味と重いボディ",
    sources: ["S3", "S7"],
  },
};

// 精製方法：味わいへの影響
export const PROCESS_KB = {
  "ウォッシュド": { flavors: ["柑橘", "紅茶", "花"], note: "クリーンで明るく、酸の輪郭がはっきりする", sources: ["S6"] },
  "ナチュラル": { flavors: ["ベリー", "完熟果実", "黒糖"], note: "果実の甘さとボディが出やすい", sources: ["S6", "S3"] },
  "ハニー": { flavors: ["キャラメル", "黒糖", "完熟果実"], note: "ウォッシュドの明るさとナチュラルの甘さの中間。シロップのような甘さ", sources: ["S6"] },
  "アナエロビック": { flavors: ["トロピカル", "完熟果実", "スパイス"], note: "発酵由来の強い果実感や個性的な香り。好みが分かれやすい", sources: ["S6"] },
  "スマトラ式": { flavors: ["土っぽい", "ハーブ", "スパイス"], note: "土やハーブのような風味、酸味は低くボディが重い", sources: ["S7"] },
};

// 焙煎度：味わいへの影響（焙煎が深いほど、産地の個性より焙煎由来の風味が前に出る）
export const ROAST_KB = {
  "浅煎り": { flavors: ["花", "柑橘", "ベリー"], note: "酸味が明るく、産地の個性がもっとも出る", sources: ["S8"] },
  "中浅煎り": { flavors: ["柑橘", "キャラメル", "紅茶"], note: "酸味と甘さのバランス", sources: ["S8"] },
  "中煎り": { flavors: ["キャラメル", "ミルクチョコ", "ナッツ"], note: "産地の個性と焙煎の甘さの両方が出る。酸味は穏やか", sources: ["S8"] },
  "中深煎り": { flavors: ["ダークチョコ", "キャラメル", "黒糖"], note: "苦味とコクが増え、酸味は控えめ", sources: ["S8"] },
  "深煎り": { flavors: ["ダークチョコ", "焦げ・燻製", "黒糖"], note: "焙煎由来の苦味と香ばしさが中心。ボディが重い", sources: ["S8"] },
};

// 提案の組み合わせから、期待できる香り（最大3つ）を表から作る。
// 焙煎が深いほど焙煎由来の香りを優先し、浅いほど産地・精製の香りを優先する
export const expectedFlavors = ({ origin, process, roastLevel }) => {
  const o = ORIGIN_KB[origin];
  const fromOrigin = o ? (o.flavorsByProcess?.[process] || o.flavors) : [];
  // その産地で一般的な精製なら、産地の香りにすでに精製の傾向が含まれているので重ねない
  // （例：ブラジルのナチュラルは一般的なナチュラルのベリー感ではなく、ナッツやチョコになりやすい）
  const typical = o && (o.commonProcess.includes(process) || o.flavorsByProcess?.[process]);
  const fromProcess = typical ? [] : (PROCESS_KB[process]?.flavors || []);
  const fromRoast = ROAST_KB[roastLevel]?.flavors || [];
  const deep = roastLevel === "中深煎り" || roastLevel === "深煎り";
  const order = deep ? [fromRoast, fromOrigin, fromProcess] : [fromOrigin, fromProcess, fromRoast];
  const out = [];
  // それぞれから1つずつ順に取り、重複を除いて3つまで
  for (let i = 0; out.length < 3 && i < 3; i++) order.forEach(list => { const f = list[i]; if (f && !out.includes(f) && out.length < 3) out.push(f); });
  return out;
};
