/** 公開ゲートの共通ランナー。1 つでも FAIL なら ok=false(デプロイしない)。 */

export type GateStatus = "PASS" | "WARN" | "FAIL";

export interface GateResult {
  status: GateStatus;
  messages: string[];
}

export interface Gate {
  id: string;
  name: string;
  run: () => Promise<GateResult> | GateResult;
}

export interface GateOutcome extends GateResult {
  id: string;
  name: string;
}

export interface GateReport {
  ok: boolean;
  results: GateOutcome[];
  failures: string[];
  warnings: string[];
  toText: () => string;
}

export async function runGates(gates: Gate[]): Promise<GateReport> {
  const results: GateOutcome[] = [];
  for (const g of gates) {
    try {
      const r = await g.run();
      results.push({ id: g.id, name: g.name, ...r });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ id: g.id, name: g.name, status: "FAIL", messages: [`exception: ${msg}`] });
    }
  }
  const line = (r: GateOutcome) => `${r.id} ${r.name}: ${r.messages.join("; ")}`;
  const failures = results.filter((r) => r.status === "FAIL").map(line);
  const warnings = results.filter((r) => r.status === "WARN").map(line);
  const toText = () =>
    results
      .map((r) => `[${r.status}] ${r.id} ${r.name}` + (r.messages.length ? `\n  - ${r.messages.join("\n  - ")}` : ""))
      .join("\n");
  return { ok: failures.length === 0, results, failures, warnings, toText };
}
