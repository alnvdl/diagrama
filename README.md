# alnvdl/diagrama

A minimalistic web-based diagram editor based on the Monaco Editor and Mermaid.

To use the hosted version, go to: https://alnvdl.github.io/diagrama/

To run it locally, just open the `static/index.html` file in your browser.

To run it in development mode, you can use the following commands:
```bash
$ node run dist   # Updates the Monaco Editor and Mermaid dependencies.
$ node run server # Runs a local server to serve the static files.
```

## Philosophy
- No bundling/packing for building.
- No server-side code is required to run the editor.
- Quick and dirty code that can be easily maintained.
