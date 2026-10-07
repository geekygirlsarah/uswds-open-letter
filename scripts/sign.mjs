// Adds you to the letter and opens a pull request.
//
//     npm run sign -- --name "Your Name" --role "Your Role"
//
// Required:  --name
// Optional:  --role
// Flags:     --no-pr   append and stop, do not create a branch or push
//            --force   commit even if a remote branch already exists
//
// Why a script instead of telling people to edit the YAML: every signer who has
// to work out the branch/PR dance by hand is a signer who does not sign. This
// does the mechanical part and leaves a human-readable diff for review.

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { validate } from "./validate-signatories.mjs";

const run = promisify(execFile);

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const signatoriesPath = resolve(root, "src/_data/signatories.yml");

// ------------------------------------------------------------------
// Arguments
// ------------------------------------------------------------------
const OPTIONS = ["name", "role"];
const BOOLEAN_FLAGS = { "--no-pr": "noPr", "--force": "force" };

const args = process.argv.slice(2);
const given = {};

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];

  if (BOOLEAN_FLAGS[arg]) {
    given[BOOLEAN_FLAGS[arg]] = true;
    continue;
  }

  if (!arg.startsWith("--")) {
    fail(`Unexpected argument "${arg}". Options are --name, --role.`);
  }

  const key = arg.slice(2);
  if (!OPTIONS.includes(key)) {
    fail(`Unknown option "--${key}". Supported: ${OPTIONS.map((o) => `--${o}`).join(", ")}.`);
  }

  const value = args[i + 1];
  if (value === undefined || value.startsWith("--")) {
    fail(`"--${key}" needs a value. Quote values that contain spaces.`);
  }

  given[key] = value;
  i += 1;
}

if (!given.name) {
  fail(
    [
      "",
      "  --name is required.",
      "",
      "  Example:",
      '    npm run sign -- --name "Your Name" --role "Your Role"',
      "",
    ].join("\n"),
  );
}

const entry = {
  name: given.name.trim(),
  ...(given.role && { role: given.role.trim() }),
  date: new Date().toISOString().slice(0, 10),
};

// ------------------------------------------------------------------
// Write
// ------------------------------------------------------------------
const source = await readFile(signatoriesPath, "utf8");
const entries = parse(source);

const keyOf = (e) =>
  [e.name, e.role].map((v) => (v ?? "").trim().toLowerCase()).join(" ");

const incoming = keyOf(entry);
const existingIndex = entries.findIndex((e) => keyOf(e) === incoming);
const next = [...entries];

if (existingIndex !== -1) {
  next[existingIndex] = entry;
  console.log(
    "Replacing an existing entry with the same name and role.",
  );
} else {
  next.push(entry);
}

const errors = validate(next);
if (errors.length > 0) {
  fail(
    ["That entry would be invalid:", ...errors.map((e) => `  ${e.at}: ${e.message}`)].join("\n"),
  );
}

await writeFile(signatoriesPath, insertEntry(source, entry, existingIndex !== -1), "utf8");
console.log(`Added ${entry.name} to src/_data/signatories.yml`);

if (given.noPr) {
  console.log("--no-pr given, stopping before branch and push.");
  process.exit(0);
}

// ------------------------------------------------------------------
// Pull request
// ------------------------------------------------------------------
const slug =
  `add-${entry.name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "add-signatory";

try {
  await run("git", ["rev-parse", "--git-dir"], { cwd: root });

  await run("git", ["checkout", "-b", slug], { cwd: root });
  await run("git", ["add", "src/_data/signatories.yml"], { cwd: root });
  await run("git", ["commit", "-m", `Sign the letter: ${entry.name}`], { cwd: root });

  if (given.force) {
    await run("git", ["push", "--force", "--set-upstream", "origin", slug], { cwd: root });
  } else {
    await run("git", ["push", "--set-upstream", "origin", slug], { cwd: root });
  }

  const branch = (await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root })).stdout.trim();

  console.log(`\nPushed branch ${branch}. Open a pull request at:`);
  console.log(`  ${await prUrl(branch)}`);
  console.log("\nRead the diff before you open it. You should see one entry added.");
} catch (error) {
  const detail = (error.stderr || error.stdout || error.message || "").trim();
  console.log("\nYour entry is saved but the branch/push did not finish:");
  console.log(detail);
  console.log("\nFinish it by hand:");
  console.log("  git switch -c <your-branch>   # if you are not already on one");
  console.log("  git add src/_data/signatories.yml && git commit -m 'Sign the letter'");
  console.log("  git push --set-upstream origin <your-branch>");
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function fail(message) {
  console.error(message);
  process.exit(1);
}

/**
 * Writes the new entry into the YAML as text, leaving every existing line
 * byte-for-byte untouched.
 *
 * Re-serializing the whole file was the obvious approach and the wrong one: it
 * drops the file's comment header (so the contribution instructions vanish
 * after the first sign-on), strips the quoting style, and reformats unrelated
 * entries, which turns every sign-on into a large diff that reviewers then have
 * to read through to find the one line that changed.
 *
 * The file is written with quoted scalars and one blank line between entries, so
 * a text insert is enough to keep the file consistent. entriesText is the
 * serialized form of a single entry, reused when a matching entry is replaced.
 */
function insertEntry(original, newEntry, isReplacement) {
  // Work in LF internally so every regex and comparison below sees plain text,
  // then restore the file's own line ending on the way out. Mixing endings is
  // what makes a diff on this file unreadable.
  const eol = original.includes("\r\n") ? "\r\n" : "\n";
  const block = stringify([newEntry], { lineWidth: 0 }).trimEnd().split("\n");

  // A top-level list item starts at column 0: `- name: ...`. Requiring column 0
  // is what separates a real entry from the indented examples inside the
  // comment header, which must not be mistaken for entries.
  const isEntryStart = (line) => /^-\s/.test(line);

  const lines = original.replace(/\r\n/g, "\n").split("\n");
  let firstEntry = lines.findIndex(isEntryStart);
  if (firstEntry === -1) firstEntry = lines.length;

  // Everything before the first entry is the comment header, preserved as is.
  // Trailing whitespace is dropped so the blank line before the first entry is
  // generated below rather than inherited and doubled up.
  const header = lines.slice(0, firstEntry).join("\n").replace(/\s+$/, "");

  // One blank line between entries, matching the file's existing style. This
  // also normalizes a file someone hand-edited, so output stays consistent.
  const body = [];
  for (const line of lines.slice(firstEntry)) {
    if (line.trim() === "") continue;
    if (isEntryStart(line) && body.length > 0) body.push("");
    body.push(line);
  }

  // The first field of an entry block is always `name`, so the entry's display
  // name can be read from the line that starts the block. The trailing quote is
  // stripped rather than assumed absent, since existing entries are quoted.
  const nameAt = (lineIndex) => {
    const raw = body[lineIndex].match(/^-\s*name:\s*(.*)$/)?.[1].trim() ?? "";
    return raw.replace(/^["'](.*)["']$/, "$1");
  };

  if (isReplacement) {
    // Replace the matching entry's block, up to the next entry or the end.
    let start = -1;
    for (let i = 0; i < body.length; i += 1) {
      if (isEntryStart(body[i]) && keyOf(parseEntryAt(body, i)) === keyOf(newEntry)) {
        start = i;
        break;
      }
    }
    if (start === -1) {
      fail("Could not find the existing entry to replace. Re-run without a matching entry.");
    }

    let end = body.length;
    for (let i = start + 1; i < body.length; i += 1) {
      if (isEntryStart(body[i])) {
        end = i;
        break;
      }
    }
    body.splice(start, end - start, ...block);
  } else {
    // Insert before the first entry that sorts after the new one, so the list
    // stays alphabetical and the diff stays small.
    let target = -1;
    for (let i = 0; i < body.length; i += 1) {
      if (!isEntryStart(body[i])) continue;
      if (nameAt(i).localeCompare(newEntry.name, "en", { sensitivity: "base" }) > 0) {
        target = i;
        break;
      }
    }
    if (target === -1) body.push("", ...block);
    else body.splice(target, 0, ...block, "");
  }

  const out = `${header}\n\n${body.join("\n")}\n`;
  return eol === "\n" ? out : out.replace(/\n/g, eol);
}

/**
 * Parses the entry whose block starts at `start` out of the line array, so a
 * replacement can be matched on the same key the caller used.
 */
function parseEntryAt(body, start) {
  const lines = [];
  for (let i = start; i < body.length; i += 1) {
    if (i > start && isEntryLineStart(body[i])) break;
    lines.push(body[i]);
  }
  return parse(lines.join("\n"))[0] ?? {};
}

function isEntryLineStart(line) {
  return /^-\s/.test(line);
}

async function prUrl(branch) {
  const remote = (await run("git", ["remote", "get-url", "origin"], { cwd: root })).stdout.trim();
  const match = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/);
  if (!match) return "<your GitHub remote>";
  return `https://github.com/${match[1]}/${match[2]}/compare/main...${branch}?expand=1`;
}
