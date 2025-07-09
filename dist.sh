#!/bin/bash

npm install

rm -rf docs/mermaid
cp -R node_modules/mermaid/dist docs/mermaid

rm -rf docs/mermaid-elk
cp -R node_modules/@mermaid-js/layout-elk/dist docs/mermaid-elk

rm -rf docs/monaco-editor
cp -R node_modules/monaco-editor docs/monaco-editor
rm -rf docs/monaco-editor/dev
rm -rf docs/monaco-editor/esm
rm -rf docs/monaco-editor/min-maps
