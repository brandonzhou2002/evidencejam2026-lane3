# Local browser libraries

- **Dagre 3.1.3**: https://github.com/dagrejs/dagre
  Self-contained ESM browser distribution, including graphlib. Used for the
  directed graph layout; SVG and HTML rendering are handled by the site.
  File: `dagre-3.1.3.js`
  SHA-256: `cf85ac740ad206f01209bf030b903df8bebac87b965042de02b54d7e6a1e4055`
  Only its source-map URL was removed. License notices are included locally.
- **Phosphor Icons**: https://github.com/phosphor-icons/core
  The existing project's icons are preserved as inline SVG paths in
  `src/icons.js`. The MIT license is in `PHOSPHOR-LICENSE.txt`.

These assets are committed with the source. No CDN, package manager or network
request is needed to build or render the site.
