# Understory — HTML edition

The site uses HTML, CSS, JavaScript modules and SVG. There is no React,
React Flow, Vite, npm dependency installation or network access during the build.

From the repository root:

```sh
./build.sh site/
python3 -m http.server 8000 --directory site
```

Open `http://localhost:8000`. Python 3.10+ is the only build requirement.
The output can be hosted at a domain root or under a subdirectory. Serve it
over HTTP; browser modules and data requests do not support opening `index.html`
directly with `file://`.

For development:

```sh
python3 src/scripts/dev.py
```

Open `http://127.0.0.1:5173`; refresh after edits to rebuild. Optional npm
shortcuts remain in this folder: `npm run dev`, `npm run build`, and
`npm run preview`. They run the same Python scripts and need no `npm install`.

## Source files

- `index.html`: the launch page and shared native dialogs.
- `src/app.js`: question matching, navigation, history and modal dialogs.
- `src/answer-view.js`: sentence selection, highlighting, tabs and evidence drawer.
- `src/render.js`: data-driven HTML for Q1, Q2, Q3 and source excerpts.
- `src/graph.js`: interactive SVG connections, HTML nodes and evidence badges.
- `src/charts.js`: optional, interactive study-count charts for all three questions.
- `src/graph-layout.js`: preserved Dagre layout and curve calculations.
- `src/styles.css`: the existing responsive design and animations.
- `src/terrain.js`: the original WebGL terrain animation, without React.
- `src/assets/field-work.html`: the original animated SVG illustration.
- `src/data/`: shared labels, explanations, question list and reviewed summaries.
- `vendor/`: Dagre 3.1.3 and license notices, including Phosphor's SVG artwork license.
- `scripts/build_site.py`: offline packager, data validation and no-JavaScript answers.

The answer JSON files in `../answers/` remain the source for findings,
directions, certainty, study counts and quotations. The graph preserves all
12 nodes, 29 evidence edges and its separate gap. The moderation connection
targets another relationship, as specified in the supplied graph data.

## Verification

With Node.js available for development:

```sh
node --test src/tests/*.test.js
```

Run that command from the repository root, or use `npm test` inside this
folder. Tests use Node's built-in test runner; they require no packages.
Node is not needed by the judges' build or by the published site.

Q1 loads its graph data, renderer and Dagre only when Graph is selected, then
caches them. A small node-label file generated from the supplied graph preserves
the initial table's layout. Q3 initially loads an overview with the original
findings and gaps; source excerpts are loaded and cached per finding when
Sources opens. The build derives these files without changing the original
answer JSON. Failed graph and excerpt requests can be retried independently.

The Chart view is loaded only when selected and uses no extra library. Q1 and
Q2 bars read `study_directions` and `studies` directly from the answer files;
Q2 reference comparisons and age-related findings stay separate. Q3 bars use
`studies`, with the default top ten taken from `summary.densest`. Filters select
existing findings without recomputing their grades or predicting outcomes.
Bar lengths represent study counts, not effect sizes, and papers may appear
in more than one finding. Every bar links to that finding's original evidence.

The build extracts the first author and author count for cited papers directly
from `graph/causal_graph.yaml` into a compact `paper-authors.json` file. Sources
loads this local metadata only on first opening and formats citations from it;
author names are not manually entered in the UI. The extraction uses only
Python's standard library and the supplied graph's metadata serialization.
