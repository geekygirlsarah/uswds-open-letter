// Tests for lib/is-external-link.mjs.
//
//   node --test lib/is-external-link.test.mjs
//
// Runs in CI. The external-link decision affects every link in the letter, and
// a regression here is invisible in the built HTML: the site still renders, it
// just marks same-site links as external, or misses genuine ones.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createIsExternalLink } from "./is-external-link.mjs";

const SITE = "https://example.org";

// [href, expectedIsExternal]
const CASES = [
  // Genuinely elsewhere
  ["https://designsystem.digital.gov/", true],
  ["http://news.example.net/story", true],
  ["https://notexample.org/a", true], // suffix but not a subdomain
  ["https://example.org.evil.com/a", true], // prefix but not a subdomain
  ["https://evil.com/?next=https://example.org", true],

  // Ours
  ["https://example.org/letter.txt", false],
  ["https://example.org/", false],
  ["https://www.example.org/a", false],
  ["https://sub.example.org/a", false],
  ["http://example.org/a", false], // still ours, http included
  ["/letter.txt", false],
  ["#main-content", false],
  ["", false],

  // Not web links at all
  ["mailto:someone@example.org", false],
  ["tel:+15551234567", false],
  ["javascript:void(0)", false],
];

test("classifies links against the site hostname", async () => {
  const isExternal = await createIsExternalLink(SITE);

  for (const [href, expected] of CASES) {
    assert.equal(isExternal(href), expected, `${href} should be ${expected ? "external" : "internal"}`);
  }
});

test("accepts a bare hostname as well as a full URL", async () => {
  const fromUrl = await createIsExternalLink("https://example.org");
  const fromHost = await createIsExternalLink("example.org");

  for (const [href, expected] of CASES) {
    assert.equal(fromHost(href), expected, `${href} via bare hostname`);
    assert.equal(fromHost(href), fromUrl(href));
  }
});

test("handles a site served from a subdomain", async () => {
  const isExternal = await createIsExternalLink("https://letters.example.org");

  assert.equal(isExternal("https://letters.example.org/letter.txt"), false);
  assert.equal(isExternal("https://www.letters.example.org/a"), false);
  assert.equal(isExternal("https://example.org/a"), true);
  assert.equal(isExternal("https://other.gov/a"), true);
});

test("reads the hostname from SITE_URL when no argument is given", async () => {
  const original = process.env.SITE_URL;
  process.env.SITE_URL = "https://from-env.example";

  try {
    const isExternal = await createIsExternalLink();
    assert.equal(isExternal("https://from-env.example/a"), false);
    assert.equal(isExternal("https://elsewhere.example/a"), true);
  } finally {
    if (original === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = original;
  }
});

test("rejects a value that is neither a URL nor a hostname", async () => {
  await assert.rejects(() => createIsExternalLink("not a host"), /hostname/);
});
