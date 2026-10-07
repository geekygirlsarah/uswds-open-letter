// Compiles src/assets/styles.scss to _site/assets/styles.css.
//
// This project compiles Sass directly rather than through an Eleventy Sass
// plugin: the only maintained Sass plugin is pinned to Eleventy 0.x, and
// USWDS needs load paths, autoprefixing, and a specific browserslist that are
// easier to set explicitly than to configure through a plugin.
//
// Run via `npm run build` (prebuild) or `npm start`.

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import * as sass from "sass-embedded";
import postcss from "postcss";
import autoprefixer from "autoprefixer";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = resolve(root, "src/assets/styles.scss");
const output = resolve(root, "_site/assets/styles.css");

// USWDS 3 uses the Sass module system and resolves its own packages through
// this load path.
const loadPaths = [resolve(root, "node_modules/@uswds/uswds/packages")];

// The font path in _theme.scss embeds the USWDS version so font URLs change when
// the pin changes, which is what makes the immutable cache headers in
// netlify.toml safe. The version is written by hand there, so check it here
// rather than letting a stale pin silently serve year-old fonts from a cache.
const installed = JSON.parse(
  await readFile(resolve(root, "node_modules/@uswds/uswds/package.json"), "utf8"),
).version;

const theme = await readFile(resolve(root, "src/assets/_theme.scss"), "utf8");
const declared = theme.match(/\$font-path:\s*"\.\.\/fonts\/([^"]+)"/)?.[1];

if (!declared) {
  console.error("sass: could not find $font-path in src/assets/_theme.scss");
  process.exit(1);
}

if (declared !== installed) {
  console.error(
    `sass: src/assets/_theme.scss declares font path version ${declared}, ` +
      `but @uswds/uswds ${installed} is installed.\n` +
      `      Update $font-path, or reinstall the pinned version.`,
  );
  process.exit(1);
}

const { css } = sass.compile(input, {
  loadPaths,
  style: "expanded",
  // USWDS still calls some deprecated Sass functions internally. Those are
  // upstream's to fix, and we do not want them failing our build.
  silenceDeprecations: ["import", "global-builtin", "slash-div", "color-functions"],
  quietDeps: true,
});

// USWDS requires autoprefixing against its own browserslist, in .browserslistrc.
const prefixed = await postcss([autoprefixer]).process(css, {
  from: undefined,
  to: output,
});

await mkdir(dirname(output), { recursive: true });
await writeFile(output, prefixed.css, "utf8");

const kb = (Buffer.byteLength(prefixed.css) / 1024).toFixed(1);
console.log(`sass: _site/assets/styles.css (${kb} KB)`);
