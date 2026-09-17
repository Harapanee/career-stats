/** G6 出典更新遅延: 最新期の月末から今日までの経過日数で WARN/FAIL を判定する。 */
import type { MetricId, Store } from "../normalize/types.js";
import type { Gate, GateResult } from "./types.js";

export const DEFAULT_WARN_DAYS = 90;
export const DEFAULT_FAIL_DAYS = 180;

export interface StalenessOptions {
  warnDays?: number;
  failDays?: number;
}

/** "YYYY-MM" → その月の末日 "YYYY-MM-DD" */
export function monthEnd(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)); // 翌月 0 日 = 当月末
  return last.toISOString().slice(0, 10);
}

export function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.floor((Date.parse(toYmd + "T00:00:00Z") - Date.parse(fromYmd + "T00:00:00Z")) / 86_400_000);
}

export function stalenessGate(store: Store, today: string, opts: StalenessOptions = {}): Gate {
  const warnDays = opts.warnDays ?? DEFAULT_WARN_DAYS;
  const failDays = opts.failDays ?? DEFAULT_FAIL_DAYS;
  return {
    id: "G6",
    name: "出典更新遅延",
    run: (): GateResult => {
      const entries = Object.entries(store.datasets) as [MetricId, Store["datasets"][MetricId]][];
      if (entries.length === 0) return { status: "FAIL", messages: ["データセットが 1 つもない"] };
      let status: GateResult["status"] = "PASS";
      const messages: string[] = [];
      for (const [metric, ds] of entries) {
        const latest = ds?.observations.reduce((acc, o) => (o.period > acc ? o.period : acc), "");
        if (!latest) {
          status = "FAIL";
          messages.push(`${metric}: 観測値が 0 件`);
          continue;
        }
        const end = monthEnd(latest);
        const days = daysBetween(end, today);
        if (days > failDays) {
          status = "FAIL";
          messages.push(`${metric}: 最新 ${latest}(月末 ${end})から ${days} 日経過(上限 ${failDays} 日)`);
        } else if (days > warnDays) {
          if (status === "PASS") status = "WARN";
          messages.push(`${metric}: 最新 ${latest}(月末 ${end})から ${days} 日経過(注意 ${warnDays} 日)`);
        }
      }
      return { status, messages };
    },
  };
}
