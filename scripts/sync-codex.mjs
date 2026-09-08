import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const CODEX_REPOSITORY = "https://github.com/openai/codex.git";
const CODEX_COMMIT = "25a6e316c81fb7600d1d75f3e63ffe26be10b7c8";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vendorDirectory = resolve(root, "vendor", "codex");

function runGit(args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && !allowFailure) {
    const details = result.stderr.trim() || result.stdout.trim();
    throw new Error(`git ${args.join(" ")} failed${details ? `:\n${details}` : ""}`);
  }

  return result;
}

function gitInVendor(args, options) {
  return runGit(["-C", vendorDirectory, ...args], options);
}

try {
  if (!existsSync(vendorDirectory)) {
    mkdirSync(dirname(vendorDirectory), { recursive: true });
    runGit(["init", "--quiet", vendorDirectory]);
    gitInVendor(["remote", "add", "origin", CODEX_REPOSITORY]);
  } else {
    const repository = gitInVendor(["rev-parse", "--is-inside-work-tree"], { allowFailure: true });
    if (repository.status !== 0 || repository.stdout.trim() !== "true") {
      throw new Error("vendor/codex exists but is not a Git repository; move it aside and rerun the command");
    }
  }

  const changes = gitInVendor(["status", "--porcelain"]).stdout.trim();
  if (changes) {
    throw new Error("vendor/codex has local changes; commit, stash, or remove them before syncing");
  }

  const hasCommit = gitInVendor(["cat-file", "-e", `${CODEX_COMMIT}^{commit}`], { allowFailure: true });
  if (hasCommit.status !== 0) {
    console.log(`Fetching openai/codex at ${CODEX_COMMIT.slice(0, 7)}...`);
    gitInVendor(["fetch", "--depth", "1", CODEX_REPOSITORY, CODEX_COMMIT]);
  }

  gitInVendor(["checkout", "--quiet", "--detach", CODEX_COMMIT]);
  const currentCommit = gitInVendor(["rev-parse", "HEAD"]).stdout.trim();
  if (currentCommit !== CODEX_COMMIT) {
    throw new Error(`expected ${CODEX_COMMIT}, got ${currentCommit}`);
  }

  console.log(`Codex source is ready at vendor/codex (${CODEX_COMMIT.slice(0, 7)}).`);
} catch (error) {
  console.error(`sync-codex failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
