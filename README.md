# WatchDog
WatchDog: Physically Grounded Conformance Monitoring for Agentic Robotic Systems 

## Project website

This repository is the project page, served by GitHub Pages from the root of
`main` at <https://mohammadnsr1.github.io/WatchDog/>. It is a static site with
no build step. Every link in it is relative, because the site lives under the
`/WatchDog/` subpath.

```text
index.html                 the page (Bulma from a CDN, Nerfies section layout)
.nojekyll                  serve static/ as is
static/css/index.css
static/js/run_explorer.js  Run Explorer, media placeholders, BibTeX copy
static/images/             figures (placeholders until added)
static/videos/             teaser video (placeholder until added)
static/runs/manifest.json  list of runs shown in the Run Explorer
static/runs/<run_id>.json  trimmed event log for one run
static/runs/<run_id>.mp4   replay video, under 90 MB
static/runs/<run_id>_poster.jpg
```

The files in `static/runs/` are produced by the replay compositor in the code
repository (`paper_media/replay/cli.py web ... --site <this repo>`). Only the
exported videos, posters and trimmed run JSON belong here: no session logs,
registries, prompts or code.

Preview locally from this folder with `python3 -m http.server 8000` and open
<http://localhost:8000/>. Opening `index.html` directly from disk will not load
the Run Explorer data.

The page design is adapted from the [Nerfies project page](https://github.com/nerfies/nerfies.github.io),
licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
