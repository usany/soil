import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Pipeline steps, in execution order. Each step maps to a self-contained
 * script under scripts/ and is run as its own `tsx` process so that failure or
 * process state never leaks between steps.
 *
 *   1. get-notion-links  -> scrapes the KHU OIA board for Notion links,
 *                           stores semester -> url in `semesters`.
 *   2. scrapingnotion    -> visits each Notion page, stores universities.
 *   3. geocoding         -> resolves lat/lon for each university.
 *   4. nearest-airport   -> finds the nearest scheduled-service airport.
 */
export interface PipelineStep {
  /** Stable identifier used for --from / --only selection. */
  id: string;
  /** Human-readable label for logging. */
  label: string;
  /** Script file (relative to the scripts directory). */
  script: string;
  /** Extra CLI arguments forwarded to the script. */
  args?: string[];
  /** Whether the step may be skipped when its output already exists. */
  skippable?: boolean;
}

export const PIPELINE_STEPS: PipelineStep[] = [
  {
    id: "get-notion-links",
    label: "Get notion links",
    script: "get-notion-links.ts",
  },
  {
    id: "scrapingnotion",
    label: "Scrape notion",
    script: "scrapingnotion.ts",
    args: ["--all"],
  },
  {
    id: "geocoding",
    label: "Geocoding",
    script: "geocoding.ts",
  },
  {
    id: "nearest-airport",
    label: "Nearest airport",
    script: "nearest-airport.ts",
  },
];

export interface PipelineOptions {
  /** Run only this step id. */
  only?: string;
  /** Start from this step id (inclusive) and run through the end. */
  from?: string;
  /** Stop after this step id (inclusive). */
  until?: string;
  /** Stop the whole run on the first failing step (default true). */
  failFast?: boolean;
  /** CLI args forwarded to the currently-executed script. */
  extraArgs?: string[];
}

export interface StepResult {
  step: PipelineStep;
  exitCode: number;
  durationMs: number;
  ok: boolean;
}

function runStep(step: PipelineStep, extraArgs: string[] = []): Promise<StepResult> {
  const scriptPath = path.join(__dirname, step.script);
  const args = [...(step.args ?? []), ...extraArgs];
  const started = Date.now();

  return new Promise((resolve) => {
    console.log(
      `\n${"=".repeat(72)}\n▶ STEP [${step.id}] — ${step.label}\n` +
        `  script: ${step.script}\n  args:   [${args.join(", ")}]\n` +
        `${"=".repeat(72)}`,
    );

    const child = spawn("npx", ["tsx", scriptPath, ...args], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.on("error", (err) => {
      console.error(`✖ STEP [${step.id}] failed to spawn: ${err.message}`);
      resolve({
        step,
        exitCode: 1,
        durationMs: Date.now() - started,
        ok: false,
      });
    });

    child.on("close", (code) => {
      const durationMs = Date.now() - started;
      const ok = code === 0;
      const symbol = ok ? "✔" : "✖";
      console.log(
        `\n${symbol} STEP [${step.id}] ${ok ? "succeeded" : "failed"}` +
          ` (exit ${code}, ${(durationMs / 1000).toFixed(1)}s)`,
      );
      resolve({ step, exitCode: code ?? 1, durationMs, ok });
    });
  });
}

function stepIndexById(id: string): number {
  const i = PIPELINE_STEPS.findIndex((s) => s.id === id);
  if (i < 0) {
    throw new Error(
      `Unknown step id "${id}". Available: ${PIPELINE_STEPS.map((s) => s.id).join(", ")}`,
    );
  }
  return i;
}

/**
 * Run the pipeline. By default runs every step sequentially and halts on the
 * first failure (unless `failFast` is false).
 *
 * Returns process exit code (0 = success, 1 = a step failed).
 */
export async function runPipeline(options: PipelineOptions = {}): Promise<number> {
  let start = 0;
  let end = PIPELINE_STEPS.length - 1;

  if (options.only) {
    start = end = stepIndexById(options.only);
  } else {
    if (options.from) start = stepIndexById(options.from);
    if (options.until) end = stepIndexById(options.until);
  }

  if (start > end) {
    console.error("Invalid range: --from step comes after --until step.");
    return 1;
  }

  const steps = PIPELINE_STEPS.slice(start, end + 1);
  console.log(
    `Pipeline: ${steps.map((s) => s.id).join(" → ")}\n` +
      `Running ${steps.length} step(s)`,
  );

  let failed = 0;
  for (const step of steps) {
    const result = await runStep(step, options.extraArgs);
    if (!result.ok) {
      failed++;
      if (options.failFast !== false) {
        console.error(
          `\nPipeline aborted after "${step.id}" failed (fail-fast).`,
        );
        break;
      }
    }
  }

  console.log(
    `\n${"=".repeat(72)}\nPipeline finished — ${failed} step(s) failed.` +
      `${"=".repeat(72)}`,
  );
  return failed > 0 ? 1 : 0;
}
