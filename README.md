# alnvdl/diagrama

A minimalistic web-based diagram editor based on the Monaco Editor and Mermaid.

To use the hosted version, go to: https://alnvdl.github.io/diagrama/

To run it in development mode, you can use the following commands:
```bash
$ node run dist   # Updates the Monaco Editor and Mermaid dependencies.
$ node run server # Runs a local server to serve the static files.
```

## Why?
The [Mermaid Live Editor](https://mermaid.live/) works great, but I wanted a
few extra features/non-features:
- Support for naming diagrams.
- Support for printing directly from the browser.
- Using more of the screen area for the code and diagram.
- Enabling a view-only mode that can easily turn into edit mode.
- Pre-configuring the Monaco editor in the way I like.
- Simpler/less-colorful syntax highlighting for Mermaid code.
- Storing all of the diagram data and state in the URL, not just the content.
- No linking/exporting to external services, and no ads.

When building Diagrama, I also wanted to avoid the insane churn of the
Javascript ecosystem by having a minimal setup that is easy to maintain in the
long term:
- Just two dependencies: Monaco and Mermaid.
- No bundling/packing required for building.
- No server-side code required to run the editor.
- Quick and dirty vanilla JS and CSS code that can be easily maintained.

The `docs` folder is used to serve static files because that is easier to host
with GitHub Pages.
