// Copies the USWDS fonts and images that the compiled stylesheet actually
// references out of node_modules and into _site.
//
// Why not just copy all of dist/fonts and dist/img? Because they are large:
// fonts is 144 files / ~5 MB and img is 2446 files / ~1 MB, and a letter site
// references a couple dozen of them. This reads the compiled CSS, collects
// every relative url(), and copies exactly those files. The build stays small
// and there is no stale-asset list to maintain by hand.
//
// USWDS is pinned in package.json rather than vendored into this repo. Pinning
// keeps provenance (package-lock.json records the integrity hash) and means
// `npm ci` reproduces the same bytes on Netlify. The archival copy of USWDS
// belongs in the fork, not here.

import { readFile, mkdir, copyFile } from "node:fs/promises";
import { dirname, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const uswdsDist = resolve(root, "node_modules/@uswds/uswds/dist");
const cssPath = resolve(root, "_site/assets/styles.css");

const css = await readFile(cssPath, "utf8");

// Match url(...) in the compiled CSS. Skips data: URIs and absolute URLs.
const refs = new Set();
for (const match of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
  const ref = match[1].trim();
  if (!ref || ref.startsWith("data:") || /^[a-z]+:\/\//i.test(ref)) continue;
  refs.add(ref);
}

// Each ref is relative to the compiled CSS (_site/assets/styles.css) and points
// into the site root, e.g. "../fonts/3.14.0/public-sans/Regular.woff2" becomes
// _site/fonts/3.14.0/public-sans/Regular.woff2.
//
// To find the source we strip the site root prefix and any font version
// directory, leaving dist/fonts/public-sans/Regular.woff2. The version segment
// only exists so font URLs change when the USWDS pin changes; it is not a
// directory in the package.
const copies = [];
const missing = [];

for (const ref of refs) {
  const sitePath = resolve(dirname(cssPath), ref);
  const inSite = relative(resolve(root, "_site"), sitePath);
  const withoutVersion = inSite.replace(/^fonts[/\\][^/\\]+[/\\]/, "fonts/");
  const sourcePath = resolve(uswdsDist, withoutVersion);

  copies.push({ sourcePath, sitePath });
}

let written = 0;
for (const { sourcePath, sitePath } of copies) {
  try {
    await mkdir(dirname(sitePath), { recursive: true });
    await copyFile(sourcePath, sitePath);
    written += 1;
  } catch (error) {
    if (error.code === "ENOENT") {
      missing.push(relative(root, sourcePath));
      continue;
    }
    throw error;
  }
}

const fonts = copies.filter((c) => c.sitePath.includes(`${sep}fonts${sep}`)).length;
const images = copies.length - fonts;

console.log(`uswds-assets: ${written} files (${fonts} fonts, ${images} images) -> _site`);

if (missing.length > 0) {
  console.warn(
    `uswds-assets: ${missing.length} referenced file(s) not found in the USWDS package:`,
  );
  for (const path of missing) console.warn(`  ${path}`);
  process.exitCode = 1;
}
