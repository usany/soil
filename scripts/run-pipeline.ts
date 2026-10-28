import { runPipeline, PIPELINE_STEPS } from "./pipeline";

/**
 * Pipeline entry point.
 *
 *   tsx scripts/run-pipeline.ts                  # run all steps
 *   tsx scripts/run-pipeline.ts --only geocoding # run one step
 *   tsx scripts/run-pipeline.ts --from geocoding # run from a step onward
 *   tsx scripts/run-pipeline.ts --until scrapingnotion
 *   tsx scripts/run-pipeline.ts --no-fail-fast   # keep going on failure
 *
 * Any argument not recognized below is forwarded to the active step's script.
 */
function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const options: Parameters<typeof runPipeline>[0] = {};

  const take = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    if (i === -1) return undefined;
    const val = args[i + 1];
    args.splice(i, 2);
    return val;
  };

  const has = (flag: string): boolean => {
    const i = args.indexOf(flag);
    if (i === -1) return false;
    args.splice(i, 1);
    return true;
  };

  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      [
        "Usage: tsx scripts/run-pipeline.ts [options]",
        "",
        "Options:",
        "  --only <step>     Run only the given step.",
        "  --from <step>     Start from the given step (inclusive).",
        "  --until <step>    Stop after the given step (inclusive).",
        "  --no-fail-fast    Continue to the next step on failure.",
        "",
        "Available steps:",
        ...PIPELINE_STEPS.map((s) => `  - ${s.id}  (${s.label})`),
        "",
        "Any other argument is forwarded to the active step's script.",
      ].join("\n"),
    );
    process.exit(0);
  }

  const only = take("--only");
  const from = take("--from");
  const until = take("--until");
  options.failFast = !has("--no-fail-fast");

  if (only) options.only = only;
  else {
    if (from) options.from = from;
    if (until) options.until = until;
  }
  options.extraArgs = args;

  return options;
}

runPipeline(parseArgs(process.argv))
  .then((code) => {
    process.exit(code);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
