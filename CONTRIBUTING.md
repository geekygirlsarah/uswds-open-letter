# Add your name

## The short version

```bash
git clone https://github.com/example/open-letter
cd open-letter
npm install
npm run sign -- --name "Your Name" --role "Product designer"
```

`npm run sign` adds your entry to `src/_data/signatories.yml`, creates a
branch, commits, and pushes. It then prints a link to open the pull request.

The script fills in today's date for you. To include your role or your tie to
the group, pass it with the other flag:

```bash
npm run sign -- \
  --name "Your Name" \
  --role "Product designer, former 18F"
```

All flags:

| Flag | Required | Notes |
| --- | --- | --- |
| `--name` | yes | How you want to be listed. |
| `--role` | no | Freeform: your role, your tie to this work, or both. |
| `--no-pr` | no | Write the entry and stop. Useful if you prefer to open the PR by hand. |
| `--force` | no | Overwrite the remote branch if one already exists for your name. |

If you would rather not install anything, open
`src/_data/signatories.yml` on GitHub and use the edit button. Add an entry in the
same shape as the others. Keep the list in alphabetical order by name so the diff
stays small.

## Please sign as yourself

Adding your name does not mean your employer endorses this letter. Sign
personally. If it would be misleading to see your employer next to your name, say
so in your role line, for example `--role "Product designer, former 18F"`, which
appears under your name on the site.

## What happens next

A maintainer reviews the pull request and merges it. Netlify rebuilds the site
and the name appears within a minute or two.

The review checks that:

- the entry is well formed (`npm run lint:signatories`, run automatically in CI),
- the same name and role are not already on the list,
- the letter text in `src/letter.md` was not changed.

## Editing the letter

Almost nobody should need to. `src/letter.md` is the letter, and it is kept
separate from the signatory list precisely so that the text people are agreeing
to cannot be quietly edited by someone adding their name. Changes to the letter
text require a maintainer to label the pull request `letter-change`, and those
pull requests get a second review.

If you think the letter is wrong, open an issue and say why. That is a better
process than editing the text in a pull request that is nominally about your
signature.

## Running the site

```bash
npm install
npm start        # http://localhost:8080
npm run build    # writes _site/
```

Other commands:

```bash
npm run lint:signatories
```

## How this is built

Eleventy renders a single page. Styles come from the
[U.S. Web Design System](https://designsystem.digital.gov/), compiled from Sass
in `src/assets/`. USWDS is pinned to an exact version in `package.json`, so a
build always uses the same release. The site ships no JavaScript.
