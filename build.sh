#!/bin/bash

set -e

if [ "$1" != "dev" ] && [ "$1" != "font" ] && [ "$1" != "dist" ]; then
  echo "Usage: $0 [dev|font|dist]"
  echo "  dev:  Runs a server for local development"
  echo "  font: Refreshes the vendored Material Symbols font"
  echo "  dist: Builds the dist folder with all static assets"
  exit 1
fi

# step prints the given message in bold.
step() {
    echo -e "\033[1m$1\033[0m"
}

step "Installing dependencies..."
npm install

vendor_material_symbols_font() {
    mkdir -p src/material-symbols
    cd src/material-symbols

    step "Downloading and embedding the Material Symbols font..."
    # Download Material Symbols stylesheet. The user-agent forces the woff2
    # font to be linked.
    curl -A "Firefox/999.0" -s "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz@20" -o input.css

    # Identify font URL, download it and convert it to base64 in a file.
    FONT_URL=$(grep -oP 'url\(\K[^)]+' input.css)
    curl -s "$FONT_URL" -o font.woff2
    BASE64_FONT=$(base64 -w 0 font.woff2)
    echo -n "data:font/woff2;base64," > font.woff2.b64
    base64 -w 0 font.woff2 >> font.woff2.b64

    # Replace font URL with a placeholder and then replace the placeholder with the
    # base64 file content.
    sed "s|$FONT_URL|__BASE64_FONT__|" input.css > placeholder.css
    awk '
    BEGIN {
        while ((getline line < "font.woff2.b64") > 0) {
        base64 = base64 line
        }
        close("font.woff2.b64")
    }
    {
        gsub("__BASE64_FONT__", base64)
        print
    }
    ' placeholder.css > output.css

    mv output.css font.css
    rm -rf font.woff2 font.woff2.b64 input.css placeholder.css

    step "Material Symbols font (re)downloaded in src folder."
}

build() {
    step "Rebuilding diagrama..."
    rm -rf dist; mkdir -p dist; cp -r src/* dist
    ./node_modules/esbuild/bin/esbuild dist/diagrama.js --bundle --minify --sourcemap --loader:.ttf=dataurl --outfile=dist/diagrama.js --allow-overwrite

    # If in dev mode, move all assets to the /diagrama subfolder.
    #
    # This application is meant to be hosted in GitHub Pages, and it hardcodes
    # the assumption that it is served from the `/diagrama` path. If you want
    # to host it some other way, you will need to change a few paths in
    # `manifest.json`, `sw.js` and here.
    if [ "$1" == "dev" ]; then
      step "Moving application under /diagrama..."
      mkdir -p dist/diagrama
      for item in dist/*; do
        [ "$item" = "dist/diagrama" ] && continue
        mv "$item" dist/diagrama/
      done
      echo "<html><head><meta http-equiv='refresh' content='0;url=/diagrama/'></head></html>" > dist/index.html
    fi

    step "Build completed."
}

if [ "$1" == "font" ]; then
  vendor_material_symbols_font
  exit 0
fi

if [ "$1" == "dist" ]; then
  step "Building distribution package..."
  build dist
  exit 0
fi

python3 -u -m http.server 8080 -d dist > /tmp/diagrama.log 2>&1 &
DEVSERVER_PID=$!
trap "kill $DEVSERVER_PID" EXIT

while true; do
  build dev
  step "Development server at http://localhost:8080, logs in /tmp/diagrama.log."
  step "[Press Enter to rebuild, or Ctrl+C to exit]"
  read -r
done
