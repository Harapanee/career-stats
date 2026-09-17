/**
 * 正規化データの型。取得元(sources)はすべてこの形に変換してから
 * ゲート(gates)・描画(render)に渡す。
 */

/** 指標 ID。追加するときは config/sources.json と docs/data-sources.md も更新する */
export type MetricId =
  | "active_openings_ratio" // 有効求人倍率(季節調整値)
  | "new_openings_ratio" // 新規求人倍率(季節調整値)
  | "unemployment_rate" // 完全失業率(季節調整値)
  | "job_changers"; // 転職者数(万人)

/** 地域コード。"JP" = 全国、"01".."47" = 都道府県 JIS コード */
export type RegionCode = "JP" | `${number}${number}`;

export interface Observation {
  metric: MetricId;
  region: RegionCode;
  /** "YYYY-MM" */
  period: string;
  value: number;
}

export interface Dataset {
  metric: MetricId;
  unit: string;
  /** 取得元の表示名(出典表記に使う) */
  sourceName: string;
  /** 取得元 URL(出典表記と死活監視に使う) */
  sourceUrl: string;
  /** 利用規約 URL */
  termsUrl: string;
  /** ISO 8601 */
  fetchedAt: string;
  /** 取得ファイルの SHA-256 */
  rawSha256: string;
  observations: Observation[];
}

export const PREFECTURES: ReadonlyArray<{ code: RegionCode; name: string; slug: string }> = [
  { code: "01", name: "北海道", slug: "hokkaido" },
  { code: "02", name: "青森県", slug: "aomori" },
  { code: "03", name: "岩手県", slug: "iwate" },
  { code: "04", name: "宮城県", slug: "miyagi" },
  { code: "05", name: "秋田県", slug: "akita" },
  { code: "06", name: "山形県", slug: "yamagata" },
  { code: "07", name: "福島県", slug: "fukushima" },
  { code: "08", name: "茨城県", slug: "ibaraki" },
  { code: "09", name: "栃木県", slug: "tochigi" },
  { code: "10", name: "群馬県", slug: "gunma" },
  { code: "11", name: "埼玉県", slug: "saitama" },
  { code: "12", name: "千葉県", slug: "chiba" },
  { code: "13", name: "東京都", slug: "tokyo" },
  { code: "14", name: "神奈川県", slug: "kanagawa" },
  { code: "15", name: "新潟県", slug: "niigata" },
  { code: "16", name: "富山県", slug: "toyama" },
  { code: "17", name: "石川県", slug: "ishikawa" },
  { code: "18", name: "福井県", slug: "fukui" },
  { code: "19", name: "山梨県", slug: "yamanashi" },
  { code: "20", name: "長野県", slug: "nagano" },
  { code: "21", name: "岐阜県", slug: "gifu" },
  { code: "22", name: "静岡県", slug: "shizuoka" },
  { code: "23", name: "愛知県", slug: "aichi" },
  { code: "24", name: "三重県", slug: "mie" },
  { code: "25", name: "滋賀県", slug: "shiga" },
  { code: "26", name: "京都府", slug: "kyoto" },
  { code: "27", name: "大阪府", slug: "osaka" },
  { code: "28", name: "兵庫県", slug: "hyogo" },
  { code: "29", name: "奈良県", slug: "nara" },
  { code: "30", name: "和歌山県", slug: "wakayama" },
  { code: "31", name: "鳥取県", slug: "tottori" },
  { code: "32", name: "島根県", slug: "shimane" },
  { code: "33", name: "岡山県", slug: "okayama" },
  { code: "34", name: "広島県", slug: "hiroshima" },
  { code: "35", name: "山口県", slug: "yamaguchi" },
  { code: "36", name: "徳島県", slug: "tokushima" },
  { code: "37", name: "香川県", slug: "kagawa" },
  { code: "38", name: "愛媛県", slug: "ehime" },
  { code: "39", name: "高知県", slug: "kochi" },
  { code: "40", name: "福岡県", slug: "fukuoka" },
  { code: "41", name: "佐賀県", slug: "saga" },
  { code: "42", name: "長崎県", slug: "nagasaki" },
  { code: "43", name: "熊本県", slug: "kumamoto" },
  { code: "44", name: "大分県", slug: "oita" },
  { code: "45", name: "宮崎県", slug: "miyazaki" },
  { code: "46", name: "鹿児島県", slug: "kagoshima" },
  { code: "47", name: "沖縄県", slug: "okinawa" },
];

export function prefectureByName(name: string) {
  const n = name.replace(/\s/g, "");
  return PREFECTURES.find((p) => p.name === n || p.name.replace(/[都道府県]$/, "") === n.replace(/[都道府県]$/, ""));
}
