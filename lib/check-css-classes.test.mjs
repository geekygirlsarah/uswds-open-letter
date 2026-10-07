import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classesDefinedIn,
  classesUsedIn,
  undefinedClasses,
} from "../scripts/check-css-classes.mjs";

test("classesDefinedIn finds class names in plain and escaped selectors", () => {
  const defined = classesDefinedIn(`
    .usa-link { color: red; }
    .tablet\\:text-right { text-align: right; }
    .letter__body, .page { margin: 0; }
  `);

  assert.ok(defined.has("usa-link"));
  assert.ok(defined.has("letter__body"));
  assert.ok(defined.has("page"));
  // The backslash escape must be stripped so this matches a class attribute.
  assert.ok(defined.has("tablet:text-right"));
  assert.ok(!defined.has("tablet\\:text-right"));
});

test("classesUsedIn splits class attributes on whitespace", () => {
  const used = classesUsedIn(`<div class="usa-prose  letter margin-top-6"></div>`);

  assert.deepEqual([...used.keys()].sort(), ["letter", "margin-top-6", "usa-prose"]);
});

test("undefinedClasses reports classes with no matching rule", () => {
  const { totalUsed, missing } = undefinedClasses({
    css: `.usa-link { color: red; } .letter { margin: 0; }`,
    pages: [
      {
        file: "index.html",
        html: `<div class="usa-link letter usa-grid-row"></div>`,
      },
    ],
  });

  assert.equal(totalUsed, 3);
  assert.equal(missing.length, 1);
  // This is the USWDS 2 name that caused the original bug.
  assert.equal(missing[0].className, "usa-grid-row");
  assert.deepEqual(missing[0].files, ["index.html"]);
});

test("undefinedClasses aggregates the same class across pages", () => {
  const { missing } = undefinedClasses({
    css: `.letter { margin: 0; }`,
    pages: [
      { file: "index.html", html: `<div class="letter nope"></div>` },
      { file: "about/index.html", html: `<div class="nope"></div>` },
    ],
  });

  assert.equal(missing.length, 1);
  assert.deepEqual(missing[0].files.sort(), ["about/index.html", "index.html"]);
});

test("undefinedClasses returns nothing when every class is styled", () => {
  const { missing } = undefinedClasses({
    css: `.usa-link { color: red; } .grid-row { display: flex; }`,
    pages: [{ file: "index.html", html: `<div class="usa-link grid-row"></div>` }],
  });

  assert.deepEqual(missing, []);
});
