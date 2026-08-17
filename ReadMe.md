## Activate Environment

(local; for myself) `source /Users/neerajaabhyankar/Library/Caches/pypoetry/virtualenvs/ml-playground-U3_zo12P-py3.11/bin/activate.fish`

(general; for new installs) `pip install -r requirements.txt`

## Goal

I'd like to make a "smart" knot and link editor. Capabilities included, but not limited to:
- Draw a knot or link that I have in mind
- Easily edit it (i.e. cut/tie/untie ends)
- Execute Reidmeister moves
- Be able to ask questions:
    - "Is this an unknot?" --> Classify knots
    - "Is this chiral?"
    - "Is this link splittable?" --> Classify links
- Be able to rotate the view in 3D ambient space
- [Stretch goal] Given a real-life photo of a knot/link, infer its skeleton
- [Stretch goal] Given a knot/link projection diagram, generate a natural-looking image in a specific style
- And more...

Basically, the user should feel like they have actual gravity-free strings in their hands.

## Deployment

Lives at **https://www.withoutlossofgenerality.com/knot-and-link-editor/**

Push to `main`, and a GitHub Action builds the editor, runs the whole test suite
against the built artifact, and commits it into `wlog-the-blog`, which is what
GitHub Pages serves. **You touch one repo.** The blog's own publishing path is
untouched and unaware of this.

`.github/workflows/deploy.yml` fires only when something under `editor/` changes,
or by hand from the Actions tab.

### One-time setup

A deploy key, because this repo has to write to a different repo. Repo-scoped
and non-expiring, unlike a personal access token.

```sh
# 1. a keypair that exists only for this
ssh-keygen -t ed25519 -N "" -C "knot-a-problem deploy" -f /tmp/wlog-deploy

# 2. the public half goes on the blog repo, with write access
gh repo deploy-key add /tmp/wlog-deploy.pub \
  --repo neerajaabhyankar/wlog-the-blog --title "knot-a-problem deploy" --allow-write

# 3. the private half goes in this repo's secrets
gh secret set WLOG_DEPLOY_KEY --repo neerajaabhyankar/knot-a-problem < /tmp/wlog-deploy

# 4. don't leave it lying around
rm /tmp/wlog-deploy /tmp/wlog-deploy.pub
```

Then `gh workflow run "deploy editor"` to try it without pushing anything.

### Things worth knowing

- **The editor lives only in the actual website repo**, https://github.com/neerajaabhyankar/wlog-the-blog, never in the
  private Jekyll source. The `cp -r _site/ ../wlog-the-blog/` from the Jekyll source merges rather than deletes, so publishing the blog leaves the editor alone. If you ever switch that to `rsync --delete`, it
  would wipe the editor — add `--exclude knot-and-link-editor`.
- **No Jekyll layout.** The editor is full-viewport and sets `overflow: hidden`
  on `body`; the site's `layout: default` would fight it. So the page carries no
  site nav, deliberately.
- **CI tests the built artifact**, served by `vite preview`, in Firefox and
  WebKit. A broken build cannot reach the live site.

### Manual fallback

`./publish.sh` builds into `minimal-mistakes-wlog/knot-and-link-editor/`, so the
editor rides your normal `jekyll build` + `cp -r _site/` flow. Useful if the
Action is down or you want to eyeball the output first.

**Don't use both.** They write to the same path in `wlog-the-blog`, so a Jekyll
publish would overwrite whatever the Action last deployed with whatever was last
built locally.
