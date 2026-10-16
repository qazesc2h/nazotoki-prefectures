import { kataToHira } from '../shared/kana';

/* ---------- DATA (web-verified; code = JIS X 0401 order = 후생노동성 순서) ---------- */
export type Region = '北海道' | '東北' | '関東' | '中部' | '近畿' | '中国' | '四国' | '九州・沖縄';
export interface RawPref {
  code: number; kanji: string; kana: string; romaji: string; suffix: string;
  cap: string; capKana: string; capRomaji: string; region: Region;
}
/** 파생 필드까지 포함한 도도부현 레코드 */
export interface Pref extends RawPref {
  name: string;      /* 접미사(県/府/都) 뺀 이름 — 北海道은 그대로 */
  capName: string;   /* 市/区 뺀 현청 이름 */
  len: number;       /* かな 글자 수 */
  capLen: number;
  capNeq: boolean;   /* 현청 이름 ≠ 현 이름 */
}
/** 상단 토글: 도도부현 기준 / 현청소재지 기준 */
export type Mode = 'pref' | 'cap';
export type SortHow = 'jis' | 'gojuon' | 'len';

const RAW: RawPref[] = [
  {code:1,kanji:'北海道',kana:'ほっかいどう',romaji:'hokkaido',suffix:'道',cap:'札幌市',capKana:'さっぽろ',capRomaji:'sapporo',region:'北海道'},
  {code:2,kanji:'青森県',kana:'あおもり',romaji:'aomori',suffix:'県',cap:'青森市',capKana:'あおもり',capRomaji:'aomori',region:'東北'},
  {code:3,kanji:'岩手県',kana:'いわて',romaji:'iwate',suffix:'県',cap:'盛岡市',capKana:'もりおか',capRomaji:'morioka',region:'東北'},
  {code:4,kanji:'宮城県',kana:'みやぎ',romaji:'miyagi',suffix:'県',cap:'仙台市',capKana:'せんだい',capRomaji:'sendai',region:'東北'},
  {code:5,kanji:'秋田県',kana:'あきた',romaji:'akita',suffix:'県',cap:'秋田市',capKana:'あきた',capRomaji:'akita',region:'東北'},
  {code:6,kanji:'山形県',kana:'やまがた',romaji:'yamagata',suffix:'県',cap:'山形市',capKana:'やまがた',capRomaji:'yamagata',region:'東北'},
  {code:7,kanji:'福島県',kana:'ふくしま',romaji:'fukushima',suffix:'県',cap:'福島市',capKana:'ふくしま',capRomaji:'fukushima',region:'東北'},
  {code:8,kanji:'茨城県',kana:'いばらき',romaji:'ibaraki',suffix:'県',cap:'水戸市',capKana:'みと',capRomaji:'mito',region:'関東'},
  {code:9,kanji:'栃木県',kana:'とちぎ',romaji:'tochigi',suffix:'県',cap:'宇都宮市',capKana:'うつのみや',capRomaji:'utsunomiya',region:'関東'},
  {code:10,kanji:'群馬県',kana:'ぐんま',romaji:'gunma',suffix:'県',cap:'前橋市',capKana:'まえばし',capRomaji:'maebashi',region:'関東'},
  {code:11,kanji:'埼玉県',kana:'さいたま',romaji:'saitama',suffix:'県',cap:'さいたま市',capKana:'さいたま',capRomaji:'saitama',region:'関東'},
  {code:12,kanji:'千葉県',kana:'ちば',romaji:'chiba',suffix:'県',cap:'千葉市',capKana:'ちば',capRomaji:'chiba',region:'関東'},
  {code:13,kanji:'東京都',kana:'とうきょう',romaji:'tokyo',suffix:'都',cap:'新宿区',capKana:'しんじゅく',capRomaji:'shinjuku',region:'関東'},
  {code:14,kanji:'神奈川県',kana:'かながわ',romaji:'kanagawa',suffix:'県',cap:'横浜市',capKana:'よこはま',capRomaji:'yokohama',region:'関東'},
  {code:15,kanji:'新潟県',kana:'にいがた',romaji:'niigata',suffix:'県',cap:'新潟市',capKana:'にいがた',capRomaji:'niigata',region:'中部'},
  {code:16,kanji:'富山県',kana:'とやま',romaji:'toyama',suffix:'県',cap:'富山市',capKana:'とやま',capRomaji:'toyama',region:'中部'},
  {code:17,kanji:'石川県',kana:'いしかわ',romaji:'ishikawa',suffix:'県',cap:'金沢市',capKana:'かなざわ',capRomaji:'kanazawa',region:'中部'},
  {code:18,kanji:'福井県',kana:'ふくい',romaji:'fukui',suffix:'県',cap:'福井市',capKana:'ふくい',capRomaji:'fukui',region:'中部'},
  {code:19,kanji:'山梨県',kana:'やまなし',romaji:'yamanashi',suffix:'県',cap:'甲府市',capKana:'こうふ',capRomaji:'kofu',region:'中部'},
  {code:20,kanji:'長野県',kana:'ながの',romaji:'nagano',suffix:'県',cap:'長野市',capKana:'ながの',capRomaji:'nagano',region:'中部'},
  {code:21,kanji:'岐阜県',kana:'ぎふ',romaji:'gifu',suffix:'県',cap:'岐阜市',capKana:'ぎふ',capRomaji:'gifu',region:'中部'},
  {code:22,kanji:'静岡県',kana:'しずおか',romaji:'shizuoka',suffix:'県',cap:'静岡市',capKana:'しずおか',capRomaji:'shizuoka',region:'中部'},
  {code:23,kanji:'愛知県',kana:'あいち',romaji:'aichi',suffix:'県',cap:'名古屋市',capKana:'なごや',capRomaji:'nagoya',region:'中部'},
  {code:24,kanji:'三重県',kana:'みえ',romaji:'mie',suffix:'県',cap:'津市',capKana:'つ',capRomaji:'tsu',region:'近畿'},
  {code:25,kanji:'滋賀県',kana:'しが',romaji:'shiga',suffix:'県',cap:'大津市',capKana:'おおつ',capRomaji:'otsu',region:'近畿'},
  {code:26,kanji:'京都府',kana:'きょうと',romaji:'kyoto',suffix:'府',cap:'京都市',capKana:'きょうと',capRomaji:'kyoto',region:'近畿'},
  {code:27,kanji:'大阪府',kana:'おおさか',romaji:'osaka',suffix:'府',cap:'大阪市',capKana:'おおさか',capRomaji:'osaka',region:'近畿'},
  {code:28,kanji:'兵庫県',kana:'ひょうご',romaji:'hyogo',suffix:'県',cap:'神戸市',capKana:'こうべ',capRomaji:'kobe',region:'近畿'},
  {code:29,kanji:'奈良県',kana:'なら',romaji:'nara',suffix:'県',cap:'奈良市',capKana:'なら',capRomaji:'nara',region:'近畿'},
  {code:30,kanji:'和歌山県',kana:'わかやま',romaji:'wakayama',suffix:'県',cap:'和歌山市',capKana:'わかやま',capRomaji:'wakayama',region:'近畿'},
  {code:31,kanji:'鳥取県',kana:'とっとり',romaji:'tottori',suffix:'県',cap:'鳥取市',capKana:'とっとり',capRomaji:'tottori',region:'中国'},
  {code:32,kanji:'島根県',kana:'しまね',romaji:'shimane',suffix:'県',cap:'松江市',capKana:'まつえ',capRomaji:'matsue',region:'中国'},
  {code:33,kanji:'岡山県',kana:'おかやま',romaji:'okayama',suffix:'県',cap:'岡山市',capKana:'おかやま',capRomaji:'okayama',region:'中国'},
  {code:34,kanji:'広島県',kana:'ひろしま',romaji:'hiroshima',suffix:'県',cap:'広島市',capKana:'ひろしま',capRomaji:'hiroshima',region:'中国'},
  {code:35,kanji:'山口県',kana:'やまぐち',romaji:'yamaguchi',suffix:'県',cap:'山口市',capKana:'やまぐち',capRomaji:'yamaguchi',region:'中国'},
  {code:36,kanji:'徳島県',kana:'とくしま',romaji:'tokushima',suffix:'県',cap:'徳島市',capKana:'とくしま',capRomaji:'tokushima',region:'四国'},
  {code:37,kanji:'香川県',kana:'かがわ',romaji:'kagawa',suffix:'県',cap:'高松市',capKana:'たかまつ',capRomaji:'takamatsu',region:'四国'},
  {code:38,kanji:'愛媛県',kana:'えひめ',romaji:'ehime',suffix:'県',cap:'松山市',capKana:'まつやま',capRomaji:'matsuyama',region:'四国'},
  {code:39,kanji:'高知県',kana:'こうち',romaji:'kochi',suffix:'県',cap:'高知市',capKana:'こうち',capRomaji:'kochi',region:'四国'},
  {code:40,kanji:'福岡県',kana:'ふくおか',romaji:'fukuoka',suffix:'県',cap:'福岡市',capKana:'ふくおか',capRomaji:'fukuoka',region:'九州・沖縄'},
  {code:41,kanji:'佐賀県',kana:'さが',romaji:'saga',suffix:'県',cap:'佐賀市',capKana:'さが',capRomaji:'saga',region:'九州・沖縄'},
  {code:42,kanji:'長崎県',kana:'ながさき',romaji:'nagasaki',suffix:'県',cap:'長崎市',capKana:'ながさき',capRomaji:'nagasaki',region:'九州・沖縄'},
  {code:43,kanji:'熊本県',kana:'くまもと',romaji:'kumamoto',suffix:'県',cap:'熊本市',capKana:'くまもと',capRomaji:'kumamoto',region:'九州・沖縄'},
  {code:44,kanji:'大分県',kana:'おおいた',romaji:'oita',suffix:'県',cap:'大分市',capKana:'おおいた',capRomaji:'oita',region:'九州・沖縄'},
  {code:45,kanji:'宮崎県',kana:'みやざき',romaji:'miyazaki',suffix:'県',cap:'宮崎市',capKana:'みやざき',capRomaji:'miyazaki',region:'九州・沖縄'},
  {code:46,kanji:'鹿児島県',kana:'かごしま',romaji:'kagoshima',suffix:'県',cap:'鹿児島市',capKana:'かごしま',capRomaji:'kagoshima',region:'九州・沖縄'},
  {code:47,kanji:'沖縄県',kana:'おきなわ',romaji:'okinawa',suffix:'県',cap:'那覇市',capKana:'なは',capRomaji:'naha',region:'九州・沖縄'},
];

/* Tokyo special note */
export const NOTES: Record<number, string> = { 13: '東京都청은 신주쿠구(新宿区)에 위치 — 통상 「東京」으로도 표기' };

export const REGIONS: Region[] = ['北海道','東北','関東','中部','近畿','中国','四国','九州・沖縄'];
export const REGION_COLORS: Record<Region, { fill: string; soft: string; text: string }> = {
  '北海道':   {fill:'#9b6dc4', soft:'#ece2f6', text:'#6a3fa0'},
  '東北':     {fill:'#4a90d9', soft:'#e1edf9', text:'#2f6bb0'},
  '関東':     {fill:'#5cb85c', soft:'#e2f3e2', text:'#357a35'},
  '中部':     {fill:'#9ccc4f', soft:'#eef6dd', text:'#5f7d23'},
  '近畿':     {fill:'#f0ad4e', soft:'#fcefd9', text:'#a96b12'},
  '中国':     {fill:'#ed8b3a', soft:'#fbe6d4', text:'#a85715'},
  '四国':     {fill:'#e8693f', soft:'#fbe0d6', text:'#a8401c'},
  '九州・沖縄':{fill:'#e0607e', soft:'#fbe1e8', text:'#a83356'},
};

/* derive helper fields */
function bareName(d: RawPref): string { return d.suffix === '道' ? d.kanji : d.kanji.slice(0, -1); }
function bareCap(d: RawPref): string { return d.cap.replace(/[市区町村]$/, ''); }
export const DATA: Pref[] = RAW.map(d => {
  const name = bareName(d);
  const capName = bareCap(d);
  return Object.assign({}, d, {
    name, capName,
    len: d.kana.length,
    capLen: d.capKana.length,
    capNeq: name !== capName,
  });
});
export const BY_CODE: Record<number, Pref> = {}; DATA.forEach(d => { BY_CODE[d.code] = d; });

/** 모드별 표시 필드 */
export interface Fields { main: string; nameBare: string; kana: string; romaji: string; kanji: string; len: number; }
export function F(d: Pref, mode: Mode): Fields {
  return mode === 'cap'
    ? { main:d.cap, nameBare:d.capName, kana:d.capKana, romaji:d.capRomaji, kanji:d.cap, len:d.capLen }
    : { main:d.kanji, nameBare:d.name, kana:d.kana, romaji:d.romaji, kanji:d.kanji, len:d.len };
}

/* ---------- kana / sorting utils ---------- */
function gojuonKey(s: string): string { return kataToHira(s || ''); }
export function cmpGojuon(a: string, b: string): number {
  const ka = gojuonKey(a), kb = gojuonKey(b);
  try { return ka.localeCompare(kb, 'ja'); } catch(e){ return ka < kb ? -1 : ka > kb ? 1 : 0; }
}
export function sortList(list: Pref[], mode: Mode, how: SortHow | string): Pref[] {
  const arr = list.slice();
  if (how === 'jis') arr.sort((a,b)=>a.code-b.code);
  else if (how === 'gojuon') arr.sort((a,b)=>cmpGojuon(F(a,mode).kana, F(b,mode).kana) || a.code-b.code);
  else if (how === 'len') arr.sort((a,b)=>(F(a,mode).len-F(b,mode).len) || cmpGojuon(F(a,mode).kana,F(b,mode).kana) || a.code-b.code);
  return arr;
}

/* wildcard → regex. * = any run, ? = exactly one. no wildcard => contains.
   full-width ＊ / ？ are treated the same as half-width * / ?. */
export function buildMatcher(qRaw: string): RegExp | null {
  const q = (qRaw || '').trim().replace(/＊/g, '*').replace(/？/g, '?');
  if (!q) return null;
  const hasWild = /[*?]/.test(q);
  let esc = q.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  esc = esc.replace(/\*/g, '.*').replace(/\?/g, '.');
  try { return new RegExp(hasWild ? ('^' + esc + '$') : esc); }
  catch(e){ return null; }
}
