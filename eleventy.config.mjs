// Eleventy configuration.
//
// The USWDS-specific parts of this config are adapted from Casey Watts' gist
// "Using Eleventy for USWDS projects":
// https://gist.github.com/caseywatts/3dd175c1dfe217116aba7b4571dba6ae
//
// Changes from the gist:
//   - bullets *and* ordered lists get usa-list
//   - an existing class attribute is appended to, not overwritten
//   - external links get the usa-link--external indicator but do NOT get
//     target="_blank" by default (see note below)
//   - the site's own hostname comes from site data / SITE_URL rather than a
//     hardcoded "example.com"
//
// Styles come from the USWDS Sass in src/assets. See scripts/compile-sass.mjs.

import { createIsExternalLink } from "./lib/is-external-link.mjs";
import { parse as parseYaml } from "yaml";

/**
 * Whether external links open in a new tab.
 *
 * The gist sets target="_blank". This is off by default, because switching
 * context without warning is a WCAG 3.2.5 (On Input) problem, and a screen
 * reader user who activates a link and lands in an unlabelled new window has
 * lost their place. The usa-link--external icon still communicates "this goes
 * somewhere else". Turn this on if you want the gist's behavior.
 */
const OPEN_EXTERNAL_LINKS_IN_NEW_TAB = false;

export default async function (eleventyConfig) {
  const isExternalLink = await createIsExternalLink();

  // Eleventy 3 loads only .json, .js, .mjs and .cjs data files out of the box.
  // YAML data files are opt-in, and a `_data/*.yml` file that is not registered
  // is silently ignored — no warning, the variable is just undefined. Register
  // both extensions so `signatories.yaml` cannot quietly stop working if someone
  // renames the file.
  //
  // This uses the `yaml` package rather than Eleventy's bundled js-yaml, so the
  // build, the validator, and `npm run sign` all parse signatories.yml the same
  // way. Order matters: a later registration wins a filename collision.
  eleventyConfig.addDataExtension("yml", (contents) => parseYaml(contents));
  eleventyConfig.addDataExtension("yaml", (contents) => parseYaml(contents));

  // Hold a reference to the configured markdown-it instance so the asMarkdown
  // filter can reuse it. Without this you get two parsers with different
  // settings, which is the problem the gist's `mdLib` trick avoids.
  let md;

  eleventyConfig.amendLibrary("md", (lib) => {
    md = lib;

    md.set({
      html: true,
      typographer: true, // smart quotes, ellipses, dashes
      linkify: true,
    });

    md.renderer.rules.bullet_list_open = () => `<ul class="usa-list">`;
    md.renderer.rules.ordered_list_open = () => `<ol class="usa-list">`;

    md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const href = token.attrGet("href");

      if (isExternalLink(href)) {
        const classes = [token.attrGet("class"), "usa-link", "usa-link--external"]
          .filter(Boolean)
          .join(" ");
        token.attrSet("class", classes);

        if (OPEN_EXTERNAL_LINKS_IN_NEW_TAB) {
          token.attrSet("target", "_blank");
          token.attrSet("rel", "noopener noreferrer");
        }
      } else {
        const classes = [token.attrGet("class"), "usa-link"].filter(Boolean).join(" ");
        if (classes) token.attrSet("class", classes);
      }

      return self.renderToken(tokens, idx, options);
    };
  });

  // Render Markdown from inside a non-Markdown template (Nunjucks, etc.), using
  // the same parser instance as the .md templates so the rules above apply.
  eleventyConfig.addFilter("asMarkdown", (content, renderInline = false) => {
    if (!md) throw new Error("asMarkdown used before the md library was configured");
    return renderInline ? md.renderInline(content) : md.render(content);
  });

  // Format an ISO date (YYYY-MM-DD) for display. Avoids Luxon/date-fns as a
  // dependency for the one date on the site.
  eleventyConfig.addFilter("readableDate", (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const [year, month, day] = value.split("-").map(Number);
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month - 1, day)));
  });

  // Wrap raw text in a USWDS prose container. Note this does not escape HTML,
  // so only pass content you control.
  eleventyConfig.addFilter("asProse", (content) => `<div class="usa-prose">${content}</div>`);

  // Render Markdown as plain text, for /letter.txt.
  //
  // This exists because `collections.letter[].content` is *rendered HTML*: a
  // template that prints it produces a file with <h2> and <a href> in it, named
  // .txt, which is not a text file at all and is useless to anyone who wants to
  // copy the letter into an email. Walking the same token stream markdown-it
  // produced means the plain-text version cannot drift from the HTML version,
  // and it does not need a second Markdown parser.
  //
  // Front matter is stripped: Eleventy leaves it in `rawInput`, so a naive
  // render would print the "---" block and permalink into the download.
  eleventyConfig.addFilter("asPlainText", (content) => {
    if (!md) throw new Error("asPlainText used before the md library was configured");
    const text = String(content ?? "").replace(/\A---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
    const tokens = md.parse(text, {});

    const out = [];

    // A blank line collapses runs of whitespace at the end, so block elements
    // only need to request one.
    const blankLine = () => out.push("\n\n");
    const emit = (s) => out.push(s);

    // Inline children carry the actual words. Links become "text (href)" so the
    // destination survives in a plain-text file.
    const renderInline = (children) => {
      for (const child of children ?? []) {
        if (child.type === "link_open") emit(` (${child.attrGet("href") ?? ""}`);
        else if (child.type === "link_close") emit(")");
        else if (child.type === "image") emit(child.content || child.attrGet("alt") || "");
        else if (child.type === "softbreak") emit(" ");
        else if (child.type === "hardbreak") out.push("\n");
        else if (child.content) emit(child.content);
      }
    };

    for (let i = 0; i < tokens.length; i += 1) {
      const token = tokens[i];

      // A tight list hides its item's <p> wrappers. Those hidden paragraph
      // tokens are structural, not real blank lines: treating them as blocks
      // puts every bullet on its own line, separated from its own text.
      if (token.hidden && token.type !== "list_item_open") continue;

      switch (token.type) {
        case "inline":
          renderInline(token.children);
          break;

        case "heading_open":
          blankLine();
          break;
        case "heading_close":
          blankLine();
          break;

        case "paragraph_open":
          blankLine();
          break;
        case "paragraph_close":
          blankLine();
          break;

        // markdown-it puts an ordered item's number in `hidden`, so ordered
        // lists keep their real numbering instead of all reading "1.".
        case "list_item_open":
          emit(token.hidden ? `${token.hidden}. ` : "- ");
          break;
        case "list_item_close":
          out.push("\n");
          break;

        case "code_block":
          emit(token.content.replace(/\n$/, ""));
          blankLine();
          break;

        case "hr":
          emit("-".repeat(72));
          blankLine();
          break;

        default:
          break;
      }
    }

    return out
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  });


  // ------------------------------------------------------------------
  // Collections
  // ------------------------------------------------------------------
  // The letter is a single .md file so that the text people are signing is a
  // stable, reviewable artifact that is never edited by a sign-on PR. It has
  // `permalink: false` and is excluded from collections, so it is only ever
  // rendered where it is explicitly used.
  eleventyConfig.addCollection("letter", (api) =>
    api.getFilteredByGlob("src/letter.md"),
  );

  eleventyConfig.addPassthroughCopy({ "src/static": "." });

  // Serialize a value for inclusion in the generated JSON feed. Signatory names
  // come from a text file anyone can open a pull request against, so the output
  // is escaped: <, > and & become their < > & forms so a name can
  // never break out of the document, and U+2028 / U+2029 are escaped because they
  // are valid in JSON strings but not in JavaScript string literals.
  eleventyConfig.addFilter("json", (value) => {
    let text;
    try {
      text = JSON.stringify(value);
    } catch {
      throw new Error(`json: value is not serializable (${typeof value})`);
    }

    return text
      .replace(/</g, "\\u003c")
      .replace(/>/g, "\\u003e")
      .replace(/&/g, "\\u0026")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
  });

  eleventyConfig.setWatchThrottleWaitTime(200);

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
