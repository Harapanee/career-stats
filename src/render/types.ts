/** ビルド済みページ。ゲートと CLI はこの型だけを見る。 */
export interface BuiltPage {
  /** "/pref/tokyo/" のようなディレクトリ形式のパス、または "/404.html" */
  path: string;
  html: string;
  /** YYYY-MM-DD */
  lastmod: string;
  hasAffiliate: boolean;
  /** データページ(出典・派生値の検査対象)か */
  isDataPage: boolean;
}
