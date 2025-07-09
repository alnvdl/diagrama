#!/bin/bash

npm install

rm -rf static/mermaid
cp -R node_modules/mermaid/dist static/mermaid

rm -rf static/mermaid-elk
cp -R node_modules/@mermaid-js/layout-elk/dist static/mermaid-elk

rm -rf static/monaco-editor
cp -R node_modules/monaco-editor static/monaco-editor
rm -rf static/monaco-editor/dev
rm -rf static/monaco-editor/esm
rm -rf static/monaco-editor/min-maps
