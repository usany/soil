import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ─── Pipeline steps ────────────────────────────────────────────────────── */
export interface PipelineStep {
  id: string;
  label: string;
  /** Script to run via tsx, relative to the scripts directory. */
  script: string;
  args?: string[];
}

export const PIPELINE_STEPS: PipelineStep[] = [
  { id: "get-notion-links", label: "Get notion links", script: "get-notion-links.ts" },
  { id: "scrapingnotion",   label: "Scrape notion",    script: "scrapingnotion.ts",   args: ["--all"] },
  { id: "geocoding",        label: "Geocoding",        script: "geocoding.ts" },
  { id: "nearest-airport",  label: "Nearest airport",  script: "nearest-airport.ts" },
];

/* ─── Engine ─────────────────────────────────────────────────────────────── */

function stepIndex(id: string): number {
  const i = PIPELINE_STEPS.findIndex((s) => s.id === id);
  if (i < 0) throw new Error(`Unknown step "${id}". Available: ${PIPELINE_STEPS.map((s) => s.id).join(", ")}`);
  return i;
}

function run(step: PipelineStep, extraArgs: string[]): Promise<{ ok: boolean; exitCode: number }> {
  const started = Date.now();
  const scriptPath = path.join(__dirname, step.script);
  const args = [...(step.args ?? []), ...extraArgs];

  return new Promise((resolve) => {
    console.log(`\n${"=".repeat(72)}\n▶ [${step.id}] ${step.label}\n  ${step.script} [${args.join(", ")}]\n${"=".repeat(72)}`);

    const child = spawn("npx", ["tsx", scriptPath, ...args], { stdio: "inherit", shell: process.platform === "win32" });

    child.on("error", (err) => {
      console.error(`✖ [${step.id}] spawn failed: ${err.message}`);
      resolve({ ok: false, exitCode: 1 });
    });

    child.on("close", (code) => {
      const s = (Date.now() - started) / 1000;
      const ok = code === 0;
      console.log(`\n${ok ? "✔" : "✖"} [${step.id}] ${ok ? "ok" : "FAILED"} (exit ${code}, ${s.toFixed(1)}s)`);
      resolve({ ok, exitCode: code ?? 1 });
    });
  });
}

/* ─── CLI / runner ───────────────────────────────────────────────────────── */

function help(): never {
  console.log([
    "Usage: tsx scripts/run-pipeline.ts [options]",
    "",
    "Options:",
    "  --only <step>    Run only the given step.",
    "  --from <step>    Start from the given step (inclusive).",
    "  --until <step>   Stop after the given step (inclusive).",
    "  --no-fail-fast   Continue after a step fails.",
    "",
    "Steps:",
    ...PIPELINE_STEPS.map((s) => `  - ${s.id}  (${s.label})`),
    "",
    "Other args are forwarded to the active step's script.",
  ].join("\n"));
  process.exit(0);
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const take = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    if (i < 0) return undefined;
    return args.splice(i, 2)[1];
  };
  const has = (flag: string): boolean => {
    const i = args.indexOf(flag);
    if (i < 0) return false;
    args.splice(i, 1);
    return true;
  };

  if (args.includes("--help") || args.includes("-h")) help();

  const only = take("--only");
  const from = take("--from");
  const until = take("--until");
  const failFast = !has("--no-fail-fast");

  let start = 0;
  let end = PIPELINE_STEPS.length - 1;
  if (only) { start = end = stepIndex(only); }
  else {
    if (from) start = stepIndex(from);
    if (until) end = stepIndex(until);
  }
  if (start > end) { console.error("Invalid range: --from is after --until."); process.exit(1); }

  return { steps: PIPELINE_STEPS.slice(start, end + 1), failFast, extraArgs: args };
}

/* ─── Main ───────────────────────────────────────────────────────────────── */

async function main() {
  const { steps, failFast, extraArgs } = parseArgs(process.argv);

  console.log(`Pipeline: ${steps.map((s) => s.id).join(" → ")}`);

  let failed = 0;
  for (const step of steps) {
    const { ok } = await run(step, extraArgs);
    if (!ok) {
      failed++;
      if (failFast) { console.error(`\nAborted after "${step.id}" (fail-fast).`); break; }
    }
  }

  console.log(`\n${"=".repeat(72)}\nDone — ${failed} step(s) failed.\n${"=".repeat(72)}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();