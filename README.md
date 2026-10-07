# An Open Letter on the Future of the U.S. Web Design System

A public, append-only record of an open letter and the people who have signed it.

The letter itself lives in one file that signing never touches. Signatures live in
a separate data file that anyone can add themselves to. The site builds both into
a web page, a plain-text copy, and a JSON feed, so the content keeps existing even
if the site goes away.

## Signing the letter

```sh
npm run sign -- --name "Your Name" --role "Product designer, former 18F"
```

Only `--name` is required. The script inserts your entry in alphabetical order,
leaves the rest of the file untouched, and opens a pull request. Re-running it
with the same name and role updates your existing entry instead of
adding a duplicate.

Adding a signature line by hand works too; the file is plain YAML and CI will
tell you if the entry is malformed.

## What is here

| Path | Purpose |
| --- | --- |
| `src/letter.md` | The letter. Review-only; CI rejects changes unless a maintainer applies the `letter-change` label. |
| `src/_data/signatories.yml` | Everyone who has signed, one entry each. |
| `src/index.njk` | The letter and signatory list. |
| `src/about.njk` | What the letter is and how signing works. |
| `src/sign.njk` | How to sign, for the command line and the browser. |
| `src/contact.njk` | How to reach a maintainer or correct a signature. |
| `src/letter.txt.njk` | Plain-text version, for copying into email. |
| `src/archive.json.njk` | Machine-readable feed of the letter and signers. |
| `scripts/sign.mjs` | Adds your entry and opens a pull request. |
| `scripts/validate-signatories.mjs` | Checks the signatory file. Runs in CI. |
| `scripts/check-css-classes.mjs` | Fails the build on a class with no CSS rule. Runs as `postbuild`. |
| `src/assets/` | USWDS Sass source and project styles. |

Styling comes from the US Web Design System, pinned to an exact version in
`package.json`. Sass is compiled and USWDS fonts and images are copied into the
build by `scripts/`, so the site needs no JavaScript at runtime.

## Requirements

Node.js 20 or newer.

## Local development

```sh
npm install
npm start
```

`npm start` compiles the styles, builds the site, and serves it at
http://localhost:8080. For rebuild-on-change while editing, use `npm run dev`
after the first build.

Other commands:

```sh
npm run build                # compile styles, copy assets, build to _site/
npm test                     # unit tests
npm run lint:signatories     # validate src/_data/signatories.yml
npm run check:css-classes    # report classes used in HTML but missing from the CSS
```

## Styling notes

USWDS is forwarded package by package in `src/assets/styles.scss` rather than
wholesale, to keep the stylesheet small. Two things about USWDS 3 that are easy
to get wrong:

- **The layout grid classes are not `usa-`-prefixed.** They are `.grid-container`,
  `.grid-row`, `.grid-col-*`. The USWDS 2 names (`.usa-layout-container`,
  `.usa-grid-row`) do not exist in this version.
- **`usa-heading` does not exist.** Heading size comes from `usa-prose` on the
  container, or from the type utilities.

A class name that does not exist fails silently: the stylesheet still builds,
still returns 200, and the console stays clean, but the element is unstyled. So
`scripts/check-css-classes.mjs` compares every class in the built HTML against
every selector in the compiled CSS and fails the build on a mismatch. It is wired
in as `postbuild`, so `npm run build` and CI both run it.

## Before launch

Placeholder values that need replacing:

- The canonical URL, repository URL, and date in `src/_data/site.json`
- The contact address in `src/_data/site.json` (`contactEmail`), which the
  contact page renders as a `mailto:` link
- `netlify.toml`, if the site is not deployed to a Netlify subdomain

## Deploying

Netlify builds from the repository. The build command is `npm run build` and the
publish directory is `_site`; both are set in `netlify.toml`.

## Data formats

`src/_data/signatories.yml` is a YAML list. Each entry requires `name` and `date`
(`YYYY-MM-DD`); `role` is optional and freeform (your role, your tie to this
work, or both), and no two entries may share the same name + role combination.

`/archive.json` contains the letter as rendered HTML plus the signatory list. It
is generated at build time, not maintained by hand.
