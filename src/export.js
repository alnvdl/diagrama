import {hasIconDirectives, iconsStylesheet} from './icons.js';
import {toB64} from './b64.js';

export async function pngExport(data, svgElem, fileName, clipboard, done) {
    const clone = svgElem.cloneNode(true);
    await injectStylesheet(clone);
    clone.removeAttribute("width");
    clone.removeAttribute("height");
    const bbox = svgElem.getBBox();
    // A bit of margin to prevent the diagram from touching the limits
    // of the image.
    const margin = 2;
    const viewBoxX = Math.floor(bbox.x - margin);
    const viewBoxY = Math.floor(bbox.y - margin);
    const viewBoxWidth = Math.ceil(bbox.width + 2 * margin);
    const viewBoxHeight = Math.ceil(bbox.height + 2 * margin);

    clone.setAttribute("viewBox", `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`);
    clone.setAttribute("width", viewBoxWidth);
    clone.setAttribute("height", viewBoxHeight);

    // Serializing to base64 avoids tainting the canvas if there are
    // links or images embedded in the diagram.
    let svgString = new XMLSerializer().serializeToString(clone);
    svgString = `<?xml version="1.0" encoding="UTF-8"?>` + svgString;

    let notifyDone = function(fn) {
        return async function(...args) {
            try {
                await fn(...args);
                done();
            } catch (e) {
                console.error(e);
                done(e);
            }
        }
    }

    const img = new window.Image();
    img.onload = notifyDone(async function() {
        const canvas = document.createElement("canvas");
        canvas.width = viewBoxWidth * data.pngScale;
        canvas.height = viewBoxHeight * data.pngScale;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(data.pngScale, 0, 0, data.pngScale, 0, 0);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(notifyDone(async function(blob) {
            if (clipboard) {
                await navigator.clipboard.write([
                    new ClipboardItem({"image/png": blob})
                ]);
            } else {
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(a.href);
                }, 100);
            }
        }));
    });
    img.src = "data:image/svg+xml;base64," + toB64(svgString);
}

export async function svgExport(data, svgElem, fileName, clipboard, done) {
    // Copying the SVG to the clipboard is not supported/mostly useless.
    if (clipboard) {
        console.error("Copying SVG to the clipboard is not supported");
        return;
    }

    // Clone SVG to avoid touching the DOM.
    const clone = svgElem.cloneNode(true);
    await injectStylesheet(clone, hasIconDirectives(data.content));

    const svgData = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgData], {type: "image/svg+xml;charset=utf-8"});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        done();
    }, 100);
}

// injectStylesheet inserts an ad-hoc stylesheet to better render the diagram
// when exporting it.
async function injectStylesheet(svg, hasIcons) {
    let cssText = ["#diagram-svg a { color: inherit; text-decoration: underline; }"];

    if (hasIcons) {
        cssText.push("#diagram-svg .material-symbols-rounded { vertical-align: text-bottom; }");
        cssText.push(await fetch(iconsStylesheet).then(res => res.text()));
    }

    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = cssText.join("\n");
    svg.insertBefore(style, svg.firstChild);
}

