import mermaid from "mermaid";

mermaid.initialize({
    fontFamily: "system-ui",
    theme: "neutral",
    look: "classic",
    // Errors are reported by the app. Without this, Mermaid would leave its
    // own error diagram behind in the DOM when a render fails.
    suppressErrorRendering: true,
});

// svgID is the ID of the SVG element of the diagram being displayed.
const svgID = "diagram-svg";

// nextSvgID is the temporary ID used while Mermaid renders a new version of
// the diagram in the staging element. Using a different ID ensures the
// diagram on display is never touched (or restyled) by an ongoing render.
const nextSvgID = "diagram-svg-next";

// errorMessage extracts a displayable message from an error thrown by Mermaid.
function errorMessage(e) {
    return String(e?.message ?? e);
}

// checkDiagram parses the given Mermaid code without rendering it. It returns
// null if the code is valid, or an error message otherwise. Parsing is much
// cheaper than rendering, which makes this suitable for instant feedback.
export async function checkDiagram(code) {
    try {
        await mermaid.parse(code);
        return null;
    } catch (e) {
        return errorMessage(e);
    }
}

// renderDiagram renders the given Mermaid code into the given HTML element.
// The diagram is rendered in stagingElement, which must be laid out but not
// visible, and is only swapped into element once it is complete, so there is
// no flash while updating.
//
// The pan/zoom state is always reset, so the new diagram is displayed centered
// and fitted to the element.
//
// If incremental is true, the new diagram is considered an update of the one
// being displayed: in case of an error, the last successful render is left
// untouched. Otherwise, the element is cleared in case of an error.
//
// It returns {ok: true} if the diagram was rendered successfully, or
// {ok: false, error} with the error message otherwise.
export async function renderDiagram(code, element, stagingElement, incremental) {
    // Mermaid cleans up after itself in the staging element, both on success
    // and on failure (see suppressErrorRendering). We must not touch it after
    // rendering, as Mermaid may have already started the next queued render.
    let svg;
    try {
        ({svg} = await mermaid.render(nextSvgID, code, stagingElement));
    } catch (e) {
        if (!incremental) {
            element.replaceChildren();
        }
        return {ok: false, error: errorMessage(e)};
    }

    // Swapping everything in a single synchronous step prevents any flash.
    element.innerHTML = svg.replaceAll(nextSvgID, svgID);
    const svgElement = element.querySelector("#" + svgID);
    if (svgElement) {
        // Remove Gantt "today" marker lines that can extend far off-screen.
        if (svgElement.getAttribute("aria-roledescription") === "gantt") {
            svgElement.querySelectorAll(".today").forEach(el => el.remove());
        }
        // Make SVG fill its parent without scrollbars.
        svgElement.style.width = "100%";
        svgElement.style.height = "100%";
        svgElement.style.maxWidth = "100%";
        svgElement.style.maxHeight = "100%";
        svgElement.style.display = "block";
        svgElement.style.overflow = "hidden";
        enablePanZoom(svgElement);
    }
    return {ok: true};
}

function enablePanZoom(svg) {
    if (!svg) return;
    let isPanning = false;
    let start = {x: 0, y: 0};
    let viewBox = svg.viewBox.baseVal;
    let last = {x: viewBox.x, y: viewBox.y, w: viewBox.width, h: viewBox.height};
    svg.style.cursor = 'grab';

    function onMouseMove(e) {
        if (!isPanning) return;
        const rect = svg.getBoundingClientRect();
        // Calculate the actual rendered SVG area, accounting for
        // preserveAspectRatio.
        let vbAspect = viewBox.width / viewBox.height;
        let rectAspect = rect.width / rect.height;
        let renderWidth = rect.width;
        let renderHeight = rect.height;
        if (rectAspect > vbAspect) {
            renderWidth = rect.height * vbAspect;
        } else if (rectAspect < vbAspect) {
            renderHeight = rect.width / vbAspect;
        }
        let dx = (e.clientX - start.x) * viewBox.width / renderWidth;
        let dy = (e.clientY - start.y) * viewBox.height / renderHeight;
        viewBox.x = last.x - dx;
        viewBox.y = last.y - dy;
    }
    function onMouseUp() {
        isPanning = false;
        svg.style.cursor = 'grab';
        svg.style.userSelect = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
    }
    svg.addEventListener('mousedown', function(e) {
        e.preventDefault(); // Prevent text selection and drag.
        isPanning = true;
        start.x = e.clientX;
        start.y = e.clientY;
        last.x = viewBox.x;
        last.y = viewBox.y;
        svg.style.cursor = 'grabbing';
        svg.style.userSelect = 'none';
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });
    svg.addEventListener('mouseleave', function() {
        isPanning = false;
        svg.style.cursor = 'grab';
        svg.style.userSelect = '';
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
    });
    svg.addEventListener('wheel', function(e) {
        e.preventDefault();
        const rect = svg.getBoundingClientRect();
        let scale = e.deltaY < 0 ? 0.9 : 1.1;
        let mx = e.offsetX * viewBox.width / rect.width + viewBox.x;
        let my = e.offsetY * viewBox.height / rect.height + viewBox.y;
        let newW = viewBox.width * scale;
        let newH = viewBox.height * scale;
        viewBox.x = mx - (mx - viewBox.x) * scale;
        viewBox.y = my - (my - viewBox.y) * scale;
        viewBox.width = newW;
        viewBox.height = newH;
    }, {passive: false});
}
