// Fails the build if the built HTML uses a class that styles.css does not
// define.
//
// This check exists because a nonexistent class name is the quietest possible
// failure. The stylesheet still compiles, still returns 200, and the browser
// reports no error in the console — but the element gets no styling at all.
// That is exactly how this project rendered a full-window-width page with
// `usa-grid-row` doing nothing: those are the USWDS 2 class names, renamed to
// `grid-row` in USWDS 3, and nothing failed.
//
// Runs as `postbuild`, so it sees the HTML Eleventy just wrote. It reads only
// _site, never node_modules, because USWDS ships packages this project does not
// forward: a class from an unforwarded package is still undefined here, which is
// the point.
//
// Run directly for a report without failing the build:
//   node scripts/check-css-classes.mjs

import { readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import postcss from "postcss";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Collects every class name that has a rule in the stylesheet.
 *
 * Selectors are unescaped so `.tablet\:text-right` yields `tablet:text-right`
 * and can be compared against a plain class attribute.
 */
export function classesDefinedIn(css) {
  const defined = new Set();
  postcss.parse(css).walkRules((rule) => {
    for (const selector of rule.selectors) {
      for (const m of selector.matchAll(/\.((?:[A-Za-z0-9_-]|\\.)+)/g)) {
        defined.add(m[1].replace(/\\(.)/g, "$1"));
      }
    }
  });
  return defined;
}

/**
 * Collects every class name used in class attributes across the given HTML.
 * @returns Map<string, Set<string>> class name -> files using it
 */
export function classesUsedIn(html) {
  const used = new Map();
  for (const m of html.matchAll(/class="([^"]+)"/g)) {
    for (const cls of m[1].split(/\s+/).filter(Boolean)) {
      if (!used.has(cls)) used.set(cls, new Set());
    }
  }
  return used;
}

/**
 * Returns class names used in the pages that have no rule in the stylesheet.
 */
export function undefinedClasses({ css, pages }) {
  const defined = classesDefinedIn(css);

  const used = new Map();
  for (const { file, html } of pages) {
    for (const cls of classesUsedIn(html).keys()) {
      if (!used.has(cls)) used.set(cls, new Set());
      used.get(cls).add(file);
    }
  }

  return {
    totalUsed: used.size,
    missing: [...used.entries()]
      .filter(([cls]) => !defined.has(cls))
      .map(([className, files]) => ({ className, files: [...files] })),
  };
}

/** Recursively lists .html files under a directory. */
async function htmlFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const p = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await htmlFiles(p)));
    else if (p.endsWith(".html")) files.push(p);
  }
  return files;
}

// Only run the check when invoked directly, so the test suite can import the
// functions above without needing a build output to exist.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pagesDir = resolve(root, "_site");
  const cssPath = resolve(pagesDir, "assets/styles.css");

  let css;
  try {
    css = await readFile(cssPath, "utf8");
  } catch {
    console.error(`css-classes: ${relative(root, cssPath)} not found. Run the build first.`);
    process.exit(1);
  }

  const pages = [];
  for (const file of await htmlFiles(pagesDir)) {
    pages.push({ file: relative(pagesDir, file), html: await readFile(file, "utf8") });
  }

  const { totalUsed, missing } = undefinedClasses({ css, pages });

  if (missing.length > 0) {
    console.error(
      `css-classes: ${missing.length} of ${totalUsed} classes used in the built HTML have ` +
        "no rule in styles.css, so they render unstyled. Check for a typo, a USWDS 2 " +
        "class name, or a package not forwarded in src/assets/styles.scss:\n",
    );
    for (const { className, files } of missing) {
      console.error(`  .${className}`);
      for (const file of files) console.error(`      ${file}`);
    }
    process.exit(1);
  }

  console.log(`css-classes: all ${totalUsed} classes used in the built pages are styled`);
}
