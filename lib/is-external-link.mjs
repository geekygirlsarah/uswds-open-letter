// Decides whether a link in the letter points somewhere outside this site.
//
// A link is external if it is http(s) and its host is not the site's own
// hostname or a subdomain of it. Anything else — in-page anchors, relative
// paths, mailto:, tel: — is internal, and is left alone.

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Prefer the SITE_URL environment variable (Netlify sets it per-deploy), and
// fall back to the url in src/_data/site.json.
async function getSiteHostname() {
  if (process.env.SITE_URL) {
    try {
      return new URL(process.env.SITE_URL).hostname;
    } catch {
      console.warn(`SITE_URL is set but not a valid URL: ${process.env.SITE_URL}`);
    }
  }

  const siteData = JSON.parse(await readFile(resolve(root, "src/_data/site.json"), "utf8"));
  try {
    return new URL(siteData.url).hostname;
  } catch {
    throw new Error(
      "Could not determine the site hostname. Set SITE_URL or fix url in src/_data/site.json.",
    );
  }
}

/**
 * Builds an isExternalLink(href) predicate.
 *
 * @param {string} [site] The site origin or hostname. Accepts either form, so
 *   a caller can pass SITE_URL or a bare host without thinking about it.
 *   Defaults to the SITE_URL environment variable, then to url in site.json.
 */
export async function createIsExternalLink(site) {
  const hostname = site === undefined ? await getSiteHostname() : toHostname(site);

  return function isExternalLink(href) {
    if (!href) return false;

    // A link with a scheme other than http(s) is not a web link, so it is never
    // "external" in this sense. mailto:, tel: and similar land here.
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      let protocol;
      try {
        protocol = new URL(href).protocol;
      } catch {
        return false;
      }
      if (protocol !== "http:" && protocol !== "https:") return false;
    }

    // Resolve against the site origin so relative paths and fragments inherit
    // the site's own hostname and are correctly seen as internal.
    let url;
    try {
      url = new URL(href, `https://${hostname}`);
    } catch {
      return false;
    }

    // Subdomains count as ours, but `notexample.org` must not match
    // `example.org`, hence the dot.
    const isOwnHost = url.hostname === hostname || url.hostname.endsWith(`.${hostname}`);

    return !isOwnHost;
  };
}

/** Accepts "example.org" or "https://example.org/path" and returns a hostname. */
function toHostname(value) {
  try {
    return new URL(value).hostname;
  } catch {
    // Already a bare hostname.
    if (/^[a-z0-9.-]+$/i.test(value)) return value.toLowerCase();
    throw new Error(`Could not read a hostname from "${value}".`);
  }
}
