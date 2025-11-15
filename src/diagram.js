import mermaid from 'mermaid';
import elkLayouts from '@mermaid-js/layout-elk';

mermaid.initialize({
    fontFamily: "system-ui",
    theme: 'neutral'
});
mermaid.registerLayoutLoaders(elkLayouts);

export async function renderDiagram(code, element) {
    try {
        const {svg} = await mermaid.render('diagram-svg', code)
        element.innerHTML = svg;
        const svgElement = element.querySelector('#diagram-svg');
        if (svgElement) {
            // Make SVG fill its parent without scrollbars.
            svgElement.style.width = '100%';
            svgElement.style.height = '100%';
            svgElement.style.maxWidth = '100%';
            svgElement.style.maxHeight = '100%';
            svgElement.style.display = 'block';
            svgElement.style.overflow = 'hidden';
            enablePanZoom(svgElement);
        }
    } catch (e) {
        // Clear the element and add error message.
        while (element.firstChild) {
            element.removeChild(element.firstChild);
        }
        const errorPre = document.createElement('pre');
        errorPre.id = 'diagram-error';
        errorPre.textContent = String(e);
        element.appendChild(errorPre);
    }
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
