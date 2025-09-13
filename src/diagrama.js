import * as monaco from 'monaco-editor';
import mermaid from 'mermaid';
import elkLayouts from '@mermaid-js/layout-elk';

import './diagrama.css';

const defaultContent = `---
config:
  flowchart:
    curve: linear
---
flowchart TB
    step1[Learn the <a href="https://mermaid.js.org/intro/"
          target="_blank">Mermaid syntax</a>]
    step2[Click !!edit!! Edit<br/>to enter edit mode]
    step3[Modify the diagram code]
    step4[Press <kbd>Ctrl</kbd>+<kbd>Enter</kbd> to update the diagram]
    step5[Click !!visibility!! View<br/>to enter view mode]
    step6[Click !!share!! Share<br/>to get a link to the diagram]
    step7[Bookmark or save the link to edit again later]
    step8[Export the diagram as SVG or PNG]

    step1 --> step2
    step2 --> step3
    step3 --> step4
    step4 --> step5
    step5 --> step6
    step5 --> step8
    step6 --> step7`;
const defaultScale = 2; // Good results with reasonable file sizes.
const defaultData = {
    content: defaultContent.trim(),
    name: 'Welcome to Diagrama',
    pngScale: defaultScale,
    mode: 'view',
};
let data = null;

// Icons can be included with !!icon-name!!, and we translate them
// right before rendering.
const iconRegex = /!!([a-z0-9-_]+)!!/i;
const iconsStylesheet = "./material-symbols/font.css";
function hasIconDirectives(content) {
    return iconRegex.test(content);
}
function withIconElements(content) {
    return content.replace(
        new RegExp(iconRegex.source, 'gi'),
        (_, value) => `<span class="material-symbols-rounded">${value}</span>`);
}

let notificationOverlayTimeout;

// loadData tries to load diagram data in the following order until one
// attempt succeeds: base64-encoded JSON in URL hash, JSON in local
// storage, default template. It always returns a valid data object
// ready to be used with updateData.
function loadData() {
    try {
        const hash = window.location.hash.replace(/^#/, '');
        if (!hash) throw new Error("no data in hash");
        const json = decodeURIComponent(escape(atob(hash)));
        return Object.assign({}, defaultData, JSON.parse(json));
    } catch (e) {
        try {
            const dataStr = localStorage.getItem("data");
            if (!dataStr) throw new Error("no data in local storage");
            return Object.assign({}, defaultData, JSON.parse(dataStr));
        } catch (e) {
            return defaultData;
        }
    }
}

// setData patches the in-memory data object, updates the UI
// accordingly and saves it. It is an async function because it may
// need to trigger a re-render of the diagram.
async function setData(patch, forceRender) {
    let oldData = data;
    data = Object.assign({}, data, patch);

    if (!oldData || oldData.name !== data.name) {
        setName(data.name);
    }

    // If the content has changed, re-render the diagram and update the
    // editor.
    if (forceRender || !oldData || oldData.content != data.content) {
        await renderDiagram(withIconElements(data.content));

        if (monacoEditor && monacoEditor.getValue() !== data.content) {
            const pos = monacoEditor.getPosition();
            monacoEditor.setValue(data.content);
            if (pos) monacoEditor.setPosition(pos);
        }
    }

    if (!oldData || oldData.mode != data.mode) {
        setMode(data.mode);
    }

    saveData(data);
}

// loadAndSetData loads saved data and sets it. Useful when
// initializing the page or in callbacks for external data changes
// (e.g., hash, local storage).
function loadAndSetData() {
    setData(loadData());
}

function saveData(data) {
    // Remove the hashchange listener to avoid triggering another
    // update based on the change we are making here.
    window.removeEventListener('hashchange', loadAndSetData);
    try {
        const json = JSON.stringify(data);
        localStorage.setItem("data", json);
        const b64 = btoa(unescape(encodeURIComponent(json)));
        window.location.hash = b64;
    } catch (e) {
        // Ignore encoding errors.
    } finally {
        // Only setup the hashchange listener after a timeout, to avoid
        // triggering another update immediately.
        setTimeout(() => {
            window.addEventListener('hashchange', loadAndSetData);
        }, 0);
    }
}

function setMode(mode) {
    const appGrid = document.getElementById('app-grid');
    const editor = document.getElementById('editor');
    const diagram = document.getElementById('diagram');
    const diagramNameElem = document.getElementById('diagram-name');
    if (mode === 'edit') {
        appGrid.classList.replace('view-mode', 'edit-mode');
        editor.classList.remove('hidden');
        if (diagramNameElem) {
            diagramNameElem.readOnly = false;
            diagramNameElem.classList.remove('no-caret');
        }
        if (monacoEditor && document.activeElement != diagramNameElem) {
            monacoEditor.focus()
        };
    } else if (mode === 'view') {
        appGrid.classList.replace('edit-mode', 'view-mode');
        editor.classList.add('hidden');
        if (diagramNameElem) {
            diagramNameElem.readOnly = true;
            diagramNameElem.classList.add('no-caret');
        }
    }

    // Hide the view/edit buttons based on the mode.
    const editButton = document.getElementById('set-mode-edit');
    const viewButton = document.getElementById('set-mode-view');
    if (editButton && viewButton) {
        if (mode === 'edit') {
            editButton.classList.add('hidden');
            viewButton.classList.remove('hidden');
        } else {
            editButton.classList.remove('hidden');
            viewButton.classList.add('hidden');
        }
    }
}

function setName(name) {
    const nameInput = document.getElementById('diagram-name');
    if (nameInput) {
        nameInput.value = name;
    }
    // Update the document title based on the diagram name.
    // Chrome already includes the app name in in standalone mode, so
    // we only include it if not running in that mode.
    let prefix = "";
    if (!window.matchMedia('(display-mode: standalone)').matches) {
        prefix = "Diagrama - ";
    }
    if (!name) {
        name = "Untitled diagram";
    }
    document.title = prefix + name.trim();
}

// Initialize Mermaid.
mermaid.initialize({
    fontFamily: "system-ui",
    theme: 'neutral'
});
mermaid.registerLayoutLoaders(elkLayouts);
window.mermaid = mermaid; // Expose for other scripts.

// Initialize Monaco.
let monacoEditor;
initLang(monaco);
initTheme(monaco);

monacoEditor = monaco.editor.create(document.getElementById('editor'), {
    guides: {highlightActiveIndentation: false, indentation: false},
    language: 'mermaid',
    fontFamily: 'monospace',
    minimap: {enabled: false},
    multiCursorModifier: "ctrlCmd",
    overviewRulerLanes: 0,
    renderWhitespace: "none",
    scrollBeyondLastLine: false,
    theme: "diagrama-dark",
    value: data?.content || "",
    automaticLayout: true,
    lineNumbersMinChars: 3,
});
setEditorFontSize(localStorage.getItem("fontSizeOverride"));

// Editor-specific keyboard shortcuts.
monaco.editor.addKeybindingRules([{
    keybinding: monaco.KeyCode.F2,
    command: 'editor.action.selectHighlights',
    when: null,
}, {
    keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyK,
    command: 'editor.action.addSelectionToNextFindMatch',
    when: null,
}, {
    keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP,
    command: 'editor.action.quickCommand',
    when: null,
}, {
    keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD,
    command: 'editor.action.deleteLines',
    when: null,
}, {
    keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyM,
    command: 'editor.action.jumpToBracket',
    when: null,
}, {
    keybinding: monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.UpArrow,
    command: 'editor.action.insertCursorAbove',
    when: null,
}, {
    keybinding: monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.DownArrow,
    command: 'editor.action.insertCursorBelow',
    when: null,
}]);

// Update data on Ctrl+Enter.
monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, function() {
    setData({content: monacoEditor.getValue()}, true);
});
// Go back to auto-font-size on Ctrl+Shift+0.
monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Digit0, function() {
    localStorage.removeItem("fontSizeOverride");
    setEditorFontSize();
});

// Set font size on Ctrl+scroll.
monacoEditor.getDomNode().addEventListener('wheel', function(e) {
    if (monacoEditor && e.ctrlKey) {
        e.preventDefault();
        let fontSize = monacoEditor.getOption(monaco.editor.EditorOption.fontSize);
        fontSize += e.deltaY < 0 ? 1 : -1;
        localStorage.setItem("fontSizeOverride", fontSize);
        setEditorFontSize(fontSize);
    }
}, {passive: false});

// Handle diagram name changes.
document.getElementById('diagram-name').addEventListener('input', function(e) {
    setData({name: e.target.value});
});

// App-wide keyboard shorcuts.
document.addEventListener('keydown', async function(e) {
    // Toggle editor visibility with Ctrl+E.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setData({mode: data.mode === 'view' ? 'edit' : 'view', content: monacoEditor.getValue()});
    }
    // Share the diagram with Ctrl+S.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        share();
    }
    // Copy the diagram to the clipboard with Ctrl+C.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (monacoEditor.hasTextFocus()) {
            return
        }
        e.preventDefault();
        await setData({content: monacoEditor.getValue()});
        export_('png', true);
    }
    // Reset the diagram with Ctrl+Alt+R.
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        closeHelp();
        setData(defaultData);
    }
    // Show help with ?.
    if (e.key === '?') {
        if (data.mode === "edit" &&
            (monacoEditor.hasTextFocus() ||
                document.activeElement == document.getElementById('diagram-name'))) {
            return
        };
        showHelp();
    }
    // Hide any modals when Escape is pressed.
    if (e.key === 'Escape') {
        e.preventDefault();
        closeHelp();
        closeExportCopy();
    }
});

// Mode buttons.
document.getElementById('set-mode-edit').addEventListener('click', function() {
    setData({mode: 'edit'});
});
document.getElementById('set-mode-view').addEventListener('click', function() {
    setData({mode: 'view', content: monacoEditor.getValue()});
});

// Help.
document.getElementById('open-help').addEventListener('click', showHelp);
document.getElementById('close-help').addEventListener('click', closeHelp);

function showHelp() {
    let modal = document.getElementById('help-modal');
    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
}

function closeHelp() {
    document.getElementById('help-modal').style.display = 'none';
}

// Export/copy.
['export', 'copy'].forEach(type => {
    document.getElementById(type).addEventListener('contextmenu', function(ev) {
        ev.preventDefault();
    });
    document.getElementById(type).addEventListener('mousedown', async function(ev) {
        if (ev.button !== 2) {
            await setData({content: monacoEditor.getValue()});
            export_('png', type === 'copy');
            return;
        }
        // Run asynchronously to prevent the overlay from intercepting the
        // context menu click.
        setTimeout(() => {
            const scaleInput = document.getElementById('png-export-scale');
            const scaleLabel = document.getElementById('png-export-scale-value');
            if (scaleInput) scaleInput.value = data.pngScale || 2;
            scaleLabel.textContent = scaleInput.value;

            showExportCopy(type);
        }, 0);
    });
});
document.getElementById('close-export-copy').addEventListener('click', closeExportCopy);

function showExportCopy(source) {
    let modal = document.getElementById('export-copy-modal');
    const title = modal.querySelector('h1');
    const scaleWarning = document.getElementById('scale-warning');

    if (source === 'copy') {
        title.textContent = 'Copy diagram';
        document.getElementById('export-svg').style.display = 'none';
        document.getElementById('export-png').style.display = 'none';
        document.getElementById('copy-png').style.display = 'inline-flex';
        scaleWarning.innerHTML = 'The PNG scale also influences the Export function.';
    } else {
        title.textContent = 'Export diagram';
        document.getElementById('export-svg').style.display = 'inline-flex';
        document.getElementById('export-png').style.display = 'inline-flex';
        document.getElementById('copy-png').style.display = 'none';
        scaleWarning.innerHTML = 'The PNG scale also influences the Copy function.';
    }

    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
}

function closeExportCopy() {
    document.getElementById('export-copy-modal').style.display = 'none';
}

// Update the PNG scale when the input changes.
document.getElementById('png-export-scale').addEventListener('input', async function(e) {
    let scale = parseInt(e.target.value);
    if (!scale || scale < 1 || scale > 100) scale = defaultScale;

    const scaleLabel = document.getElementById('png-export-scale-value');
    scaleLabel.textContent = scale;
    await setData({pngScale: scale});
});

// Export/copy buttons in the modal.
["export-png", "export-svg", "copy-png"].forEach(type => {
    document.getElementById(type).addEventListener("click", function(ev) {
        export_(type === 'export-svg' ? "svg" : "png", type === "copy-png");
        closeExportCopy();
    });
});

// export_ exports the diagram in the specified format (png or svg).
// If clipboard is true, it copies the diagram to the clipboard instead
// of triggering a download.
async function export_(formatID, clipboard) {
    console.log(formatID, clipboard);
    let formats = {
        "png": {ext: ".png", fn: pngDownload},
        "svg": {ext: ".svg", fn: svgDownload}
    }
    let format = formats[formatID];
    if (!format) {
        console.error(`Unknown export format: ${formatID}`);
        return;
    }

    await setData({content: monacoEditor.getValue()});
    const svgElem = document.querySelector('#diagram-svg');
    if (!svgElem) {
        alert('No diagram to export.');
        return;
    }

    let name = document.getElementById('diagram-name').value.trim() || 'Diagrama';
    if (!name.toLowerCase().endsWith(format.ext)) name += format.ext;
    format.fn(svgElem, name, clipboard);
}

// Share button.
document.getElementById('share').addEventListener('click', share);

async function share() {
    closeHelp();
    await setData({content: monacoEditor.getValue(), mode: "view"});
    let ok = true;
    try {
        await navigator.clipboard.writeText(window.location.href);
    } catch (err) {
        console.error(err);
        ok = false;
    }
    let msg = ok ?
        "Link copied to the clipboard" :
        "Error copying link to the clipboard, please click on the page and try again.";
    showNotification(msg, ok);
}

// Auto-adjust editor font on resize.
new ResizeObserver(() => {
    setEditorFontSize(localStorage.getItem("fontSizeOverride"))
}).observe(document.getElementById("editor"));

// Set font sizes on other open editors.
window.addEventListener("storage", ev => {
    if (ev.key == "fontSizeOverride") {
        setEditorFontSize(ev.newValue);
    }
});

loadAndSetData();

async function renderDiagram(code) {
    let element = document.querySelector('#diagram');
    try {
        const {svg} = await window.mermaid.render('diagram-svg', code)
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
        element.innerHTML = '<pre id="diagram-error">' + e + '</pre>';
    }
}

const minFontSize = 9;
// The line height proportion is the golden ratio, which happened
// to produce a result that the author likes.
const lineHeightRatio = 1.618;

// setEditorFontSize sets the font size and line height based on
// fontSize. Omit fontSize (or pass null) to enable automatic font
// sizes.
function setEditorFontSize(fontSize) {
    if (!monacoEditor) return;

    if (fontSize > 0) {
        fontSize = Math.max(fontSize, minFontSize);
        let lineHeight = Math.floor(fontSize * lineHeightRatio);
        monacoEditor.updateOptions({fontSize, lineHeight});
        return;
    }

    // If fontSize is not defined, set it automatically.
    const editor = document.getElementById("editor");
    // The number 55 was determined as being a decent match calculating
    // the font size based upon the preferences of the author.
    fontSize = Math.max(Math.floor(editor.offsetWidth / 55), 9);
    let lineHeight = Math.floor(fontSize * lineHeightRatio);
    monacoEditor.updateOptions({fontSize, lineHeight});
}

async function showNotification(msg, ok) {
    const overlay = document.getElementById('notification-overlay');
    overlay.innerHTML = msg;
    ok ? overlay.classList.remove('error') : overlay.classList.add('error');
    overlay.classList.add('show');

    clearTimeout(notificationOverlayTimeout);
    notificationOverlayTimeout = setTimeout(() => {
        overlay.classList.remove('show');
    }, 2000);
}

function initLang(monacoEditor) {
    monacoEditor.languages.register({id: 'mermaid'});

    monacoEditor.languages.setMonarchTokensProvider('mermaid', {
        defaultToken: '',
        tokenPostfix: '.mermaid',
        tokenizer: {
            root: [
                // Front matter at the very start of the document.
                [/^---\s*$/, {token: 'front-matter', next: '@frontMatter'}],

                // Comments.
                [/^\s*%%.*$/, 'comment'],

                // Keywords with optional -beta or -v<number> suffix.
                [
                    /\b(flowchart|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|quadrantChart|requirementDiagram|gitGraph|C4Context|mindmap|timeline|zenuml|sankey|xychart|block|packet|kanban|architecture|radar|treemap)(-beta|-v\d+)?\b/,
                    'keyword'
                ],
            ],

            // Front matter state: everything is 'front-matter' until closing ---
            frontMatter: [
                [/^---\s*$/, {token: 'front-matter', next: '@pop'}],
                [/.*$/, 'front-matter'],
            ],
        },
    });

    monacoEditor.languages.setLanguageConfiguration('mermaid', {
        comments: {
            lineComment: '%%',
        },
        brackets: [
            ['{', '}'],
            ['[', ']'],
            ['(', ')'],
        ],
        folding: {
            offSide: true
        }
    });
};

function initTheme(monaco) {
    monaco.editor.defineTheme("diagrama-dark", {
        base: "vs-dark",
        inherit: true,
        // These colors are based on the Monokai Dimmed theme:
        // https://github.com/microsoft/vscode/blob/e42d3b2c535d6a9ab9bd9c4d998f1d0fa96ceb98/extensions/theme-monokai-dimmed/themes/dimmed-monokai-color-theme.json
        "colors": {
            "editor.background": "#1e1e1e",
            "editor.foreground": "#c5c8c6",
            "editor.selectionBackground": "#676b7180",
            "editor.selectionHighlightBackground": "#575b6180",
            "editor.lineHighlightBackground": "#303030",
            "editorLineNumber.foreground": "#3f3f3f",
            "editorLineNumber.activeForeground": "#6f6f6f",
            "editor.wordHighlightBackground": "#4747a180",
            "editor.wordHighlightStrongBackground": "#6767ce80",
            "editorCursor.foreground": "#c07020",
            "editorWhitespace.foreground": "#505037",
            "editorIndentGuide.background1": "#505037",
            "editorIndentGuide.activeBackground1": "#707057",
        },
        rules: [{
            "token": "comment.mermaid",
            "fontStyle": "",
            "foreground": "#9A9B99"
        }, {
            "token": "keyword.mermaid",
            "fontStyle": "bold",
            "foreground": "#CE6700"
        }, {
            "token": "front-matter.mermaid",
            "fontStyle": "italic",
            "foreground": "#6089B4"
        }],
    });
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
        let offsetX = 0;
        let offsetY = 0;
        if (rectAspect > vbAspect) {
            renderWidth = rect.height * vbAspect;
            offsetX = (rect.width - renderWidth) / 2;
        } else if (rectAspect < vbAspect) {
            renderHeight = rect.width / vbAspect;
            offsetY = (rect.height - renderHeight) / 2;
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

async function pngDownload(svgElem, fileName, clipboard) {
    const clone = svgElem.cloneNode(true);
    await injectStylesheet(clone);
    clone.removeAttribute('width');
    clone.removeAttribute('height');
    const bbox = svgElem.getBBox();
    // A bit of margin to prevent the diagram from touching the limits
    // of the image.
    const margin = 2;
    const viewBoxX = Math.floor(bbox.x - margin);
    const viewBoxY = Math.floor(bbox.y - margin);
    const viewBoxWidth = Math.ceil(bbox.width + 2 * margin);
    const viewBoxHeight = Math.ceil(bbox.height + 2 * margin);

    clone.setAttribute('viewBox', `${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`);
    clone.setAttribute('width', viewBoxWidth);
    clone.setAttribute('height', viewBoxHeight);

    // Serializing to base64 avoids tainting the canvas if there are
    // links or images embedded in the diagram.
    let svgString = new XMLSerializer().serializeToString(clone);
    svgString = '<?xml version="1.0" encoding="UTF-8"?>' + svgString;
    const encodedData = btoa(unescape(encodeURIComponent(svgString)));

    const img = new window.Image();
    img.onload = function() {
        const canvas = document.createElement('canvas');
        canvas.width = viewBoxWidth * data.pngScale;
        canvas.height = viewBoxHeight * data.pngScale;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(data.pngScale, 0, 0, data.pngScale, 0, 0);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(async function(blob) {
            if (clipboard) {
                let ok = true;
                try {
                    await navigator.clipboard.write([
                        new ClipboardItem({'image/png': blob})
                    ]);
                } catch (e) {
                    console.error(err);
                    ok = false;
                }
                let msg = ok ?
                    "Diagram copied to the clipboard" :
                    "Error copying diagram to the clipboard, please click on the page and try again.";
                showNotification(msg, ok);
            } else {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(a.href);
                }, 100);
            }
        }, 'image/png');
    };

    img.onerror = function() {
        alert('Failed to render PNG.');
    };

    img.src = 'data:image/svg+xml;base64,' + encodedData;
}

async function svgDownload(svgElem, fileName, clipboard) {
    if (clipboard) {
        showNotification("Copying SVG to the clipboard is not supported", false);
        return;
    }
    // Clone SVG to avoid touching the DOM.
    const clone = svgElem.cloneNode(true);
    await injectStylesheet(clone);

    const svgData = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([svgData], {type: 'image/svg+xml;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    }, 100);
}

// injectStylesheet inserts an ad-hoc stylesheet to better render the
// diagram when exporting it.
async function injectStylesheet(svg) {
    let cssText = ["#diagram-svg a { color: inherit; text-decoration: underline; }"];

    if (hasIconDirectives(data.content)) {
        cssText.push("#diagram-svg .material-symbols-rounded { vertical-align: text-bottom; }");
        cssText.push(await fetch(iconsStylesheet).then(res => res.text()));
    }

    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = cssText.join("\n");
    svg.insertBefore(style, svg.firstChild);
}

