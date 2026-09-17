export type ProgramStatus = "active" | "pending" | "retired";

export interface Program {
  id: string;
  name: string;
  advertiser: string;
  asp: string;
  aspProgramId: string;
  status: ProgramStatus;
  /** ASP 発行のリンク URL。改変禁止 */
  url: string;
  targetAudience: string;
  /** 空なら全地域 */
  targetRegions: string[];
  /** ページ文脈("new-graduate" | "pharmacist" など) */
  contexts: string[];
  cta: string;
  note?: string;
}

export interface Monetization {
  disclosure: string;
  programs: Program[];
  paidData: { status: string; stripePaymentLinkUrl: string };
}
