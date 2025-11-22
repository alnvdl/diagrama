import {fromB64, toB64} from './b64.js';
import {initEditor, setEditorFontSize} from './editor.js';
import {renderDiagram} from './diagram.js';
import {withIconElements} from './icons.js';
import {pngExport, svgExport} from './export.js';

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
const defaultDiagram = () => {
    return {
        content: defaultContent.trim(),
        name: 'Welcome to Diagrama',
        pngScale: defaultScale,
        mode: 'view',
        lastModified: new Date().toISOString()
    }
};

// diagrams holds the list of saved diagrams, indexed by name. It can be edited
// by other functions.
let diagrams = {};

// currentDiagramName holds the name of the currently selected diagram. It
// should only be written by updateCurrentDiagram.
let currentDiagramName = "";

// importedDiagram temporarily holds the data of a diagram that is being
// proposed for importing into the library. It should only be written by
// updateCurrentDiagram.
let importedDiagram;

// exporting is true when an export operation is in progress to prevent
// multiple exports at the same time.
let exporting = false;

// notificationOverlayTimeout holds the timeout ID for hiding the notification
// overlay.
let notificationOverlayTimeout;

// saveStateTimeout holds the timeout ID for debouncing saveState operations.
let saveStateTimeout;

// parseJSONObject tries to parse str as JSON and returns the resulting object.
// It always returns an object, even if parsing fails or the parsed value is
// not an object.
function parseJSONObject(str) {
    let obj = {};
    try {
        obj = JSON.parse(str);
        if (typeof obj !== 'object' || obj === null) {
            obj = {};
        }
    } catch (e) { }
    return obj;
}

// loadState loads the diagrams list and tries to identify the currently
// selected diagram data using the following strategies until one succeeds:
// base64-encoded JSON in URL hash, selected diagram in local storage, default
// template. It always returns a valid data object ready to be used with
// updateCurrentDiagram.
function loadState() {
    diagrams = parseJSONObject(localStorage.getItem("diagrams"));

    let fromHash = function() {
        const hash = window.location.hash.replace(/^#/, '');
        if (!hash) return;
        let hashData = Object.assign(defaultDiagram(), parseJSONObject(fromB64(hash)));
        // Propose to import it first if it's not in the library.
        if (!diagrams[hashData.name] ||
            hashData.content !== diagrams[hashData.name].content ||
            hashData.pngScale !== diagrams[hashData.name].pngScale) {
            hashData.mode = 'import';
        }
        return hashData;
    }

    let fromLocalStorage = function() {
        let lastDiagram = localStorage.getItem("lastDiagram") || ""
        if (diagrams[lastDiagram]) {
            return Object.assign(defaultDiagram(), diagrams[lastDiagram]);
        }
    }

    let fromDefault = function() {
        return defaultDiagram();
    }

    for (let strategy of [fromHash, fromLocalStorage, fromDefault]) {
        try {
            const result = strategy();
            if (result) return result;
        } catch (e) {
            console.error(e);
            // Ignore and try next.
        }
    }
}

function saveState() {
    // Remove the hashchange listener to avoid triggering another
    // update based on the change we are making here.
    window.removeEventListener('hashchange', init);
    try {
        // Filter out diagrams in import mode before saving.
        localStorage.setItem("diagrams", JSON.stringify(diagrams));
        localStorage.setItem("lastDiagram", currentDiagramName);

        // Also update the hash for URL sharing.
        const json = JSON.stringify(currentDiagram());
        const b64 = toB64(json);
        window.location.hash = b64;
    } catch (e) {
        console.error(e);
    } finally {
        // Deferring here helps prevent the hash update above from triggering a
        // call to init.
        setTimeout(() => {
            window.addEventListener('hashchange', init);
        }, 0);
    }
}

// init loads saved data and updates the current diagram. Useful when
// initializing the page or in callbacks for external data changes (e.g., hash,
// local storage).
function init() {
    updateCurrentDiagram(loadState());
}

function currentDiagram() {
    return importedDiagram || diagrams[currentDiagramName];
}

// updateCurrentDiagram patches the in-memory data objects representing the
// diagram, updates the UI accordingly and triggers a call to persiste the
// state. It is an async function because it may need to trigger a re-render
// of the diagram. forceRender can be used to force a re-render.
async function updateCurrentDiagram(patch, forceRender) {
    // The only way to switch out of an imported diagram is to go to view mode.
    if (importedDiagram && patch.mode !== "view") {
        return;
    }

    let prevDiagram, curDiagram;
    if (patch.mode === "import") {
        prevDiagram = null;
        importedDiagram = Object.assign(defaultDiagram(), patch);
        curDiagram = importedDiagram;
    } else {
        prevDiagram = importedDiagram || diagrams[currentDiagramName];
        importedDiagram = null;

        // If we are not dealing with an imported diagram, update the
        // currentDiagramName if the name changes.
        if (patch.name && patch.name !== currentDiagramName) {
            currentDiagramName = patch.name;
        }

        diagrams[currentDiagramName] = Object.assign(defaultDiagram(), diagrams[currentDiagramName], patch);
        curDiagram = diagrams[currentDiagramName];
    }


    // Side-effect 1: detect name change and update the UI.
    if (!prevDiagram || prevDiagram.name !== curDiagram.name) {
        setName(curDiagram.name);
        if (!!prevDiagram?.name) {
            showNotification(`Created "${curDiagram.name}"`, true);
        }
    }

    // Side-effect 2: detect content change without a name change and update
    // the last modified timestamp.
    if (patch.mode !== "import" && prevDiagram?.name === curDiagram?.name && prevDiagram?.content !== curDiagram?.content) {
        curDiagram.lastModified = new Date().toISOString();
    }

    // Side-effect 3: detect content change, re-render the diagram and update
    // the editor.
    if (forceRender || !prevDiagram || prevDiagram.content !== curDiagram.content) {
        await renderDiagram(withIconElements(curDiagram.content), document.querySelector('#diagram'));

        if (monacoEditor && monacoEditor.getValue() !== curDiagram.content) {
            const pos = monacoEditor.getPosition();
            monacoEditor.setValue(curDiagram.content);
            if (pos) monacoEditor.setPosition(pos);
        }
    }

    // Side-effect 4: update the mode if it has changed.
    if (!prevDiagram || prevDiagram.mode != curDiagram.mode) {
        setMode(curDiagram.mode);
    }

    // Side-effect 5: debounce and defer the save operation.
    clearTimeout(saveStateTimeout);
    saveStateTimeout = setTimeout(() => {
        saveState();
    }, 0);
}

function setMode(mode) {
    const appGrid = document.getElementById('app-grid');
    const editor = document.getElementById('editor');
    const diagramNameElem = document.getElementById('diagram-name');
    if (mode === 'edit') {
        appGrid.classList.replace('view-mode', 'edit-mode');
        appGrid.classList.replace('import-mode', 'edit-mode');
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
        appGrid.classList.replace('import-mode', 'view-mode');
        editor.classList.add('hidden');
        if (diagramNameElem) {
            diagramNameElem.blur();
            diagramNameElem.readOnly = true;
            diagramNameElem.classList.add('no-caret');
        }
    } else if (mode === 'import') {
        appGrid.classList.replace('edit-mode', 'import-mode');
        appGrid.classList.replace('view-mode', 'import-mode');
        editor.classList.add('hidden');
        if (diagramNameElem) {
            diagramNameElem.blur();
            diagramNameElem.readOnly = true;
            diagramNameElem.classList.add('no-caret');
        }
    }

    // Hide the view/edit buttons based on the mode.
    const editButton = document.getElementById('set-mode-edit');
    const viewButton = document.getElementById('set-mode-view');
    const importButton = document.getElementById('set-mode-import');
    if (editButton && viewButton && importButton) {
        if (mode === 'edit') {
            editButton.classList.add('hidden');
            viewButton.classList.remove('hidden');
            importButton.classList.add('hidden');
        } else if (mode === 'view') {
            editButton.classList.remove('hidden');
            viewButton.classList.add('hidden');
            importButton.classList.add('hidden');
        } else if (mode === 'import') {
            editButton.classList.add('hidden');
            viewButton.classList.add('hidden');
            importButton.classList.remove('hidden');
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

// Handle diagram name changes on blur.
document.getElementById('diagram-name').addEventListener('blur', async function(e) {
    if (e.target.value !== currentDiagramName) {
        let newDiagram = Object.assign(defaultDiagram(), currentDiagram(), {
            name: e.target.value,
            content: monacoEditor.getValue(),
            lastModified: new Date().toISOString()
        });
        await updateCurrentDiagram(newDiagram, true);
    }
});

// App-wide keyboard shorcuts.
document.addEventListener('keydown', async function(e) {
    let editing = currentDiagram().mode === "edit" &&
        (monacoEditor.hasTextFocus() ||
            document.activeElement == document.getElementById('diagram-name'));

    // Toggle editor visibility with Ctrl+E.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        closeModals();
        if (currentDiagram().mode === "import") {
            showImport();
            return;
        };
        updateCurrentDiagram({
            mode: currentDiagram().mode === 'view' ? 'edit' : 'view',
            name: document.getElementById('diagram-name').value,
            content: monacoEditor.getValue()
        });
    }
    // Share the diagram with Ctrl+S.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        closeModals();
        share();
    }
    // Copy the diagram to the clipboard with Ctrl+C.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        if (editing) {
            return
        }
        e.preventDefault();
        closeModals();
        await updateCurrentDiagram({
            name: document.getElementById('diagram-name').value,
            content: monacoEditor.getValue(),
        });
        export_('png', true);
    }
    // Reset the diagram with Ctrl+Alt+R.
    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'r') {
        e.preventDefault();
        closeModals();
        updateCurrentDiagram(defaultDiagram());
    }
    // Show help with ?.
    if (e.key === '?') {
        if (editing) {
            return
        };
        e.preventDefault();
        showHelp();
    }
    // Open library with Ctrl+Y.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        showLibrary();
    }

    // Open export with Ctrl+X.
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        if (editing) {
            return
        }
        e.preventDefault();
        showExport();
    }

    // Hide any modals when Escape is pressed.
    if (e.key === 'Escape') {
        e.preventDefault();
        closeModals();
    }
});

// Mode buttons.
document.getElementById('set-mode-edit').addEventListener('click', function() {
    updateCurrentDiagram({mode: 'edit'});
});
document.getElementById('set-mode-view').addEventListener('click', function() {
    updateCurrentDiagram({
        mode: 'view',
        name: document.getElementById('diagram-name').value,
        content: monacoEditor.getValue()
    });
});

function closeModals() {
    closeHelp();
    closeLibrary();
    closeExport();
    closeImport();
}

// Help.
document.getElementById('open-help').addEventListener('click', showHelp);
document.getElementById('close-help').addEventListener('click', closeHelp);

function showHelp() {
    closeModals();
    let modal = document.getElementById('help-modal');
    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
}

function closeHelp() {
    document.getElementById('help-modal').style.display = 'none';
}

// Library.
document.getElementById('open-library').addEventListener('click', showLibrary);
document.getElementById('close-library').addEventListener('click', closeLibrary);

async function showLibrary() {
    closeModals();
    await updateCurrentDiagram({
        name: document.getElementById('diagram-name').value,
        content: monacoEditor.getValue()
    });
    renderLibraryList();
    let modal = document.getElementById('library-modal');
    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
}

function closeLibrary() {
    document.getElementById('library-modal').style.display = 'none';
}

function formatTimestamp(ts) {
    const fmt = new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
    const parts = fmt.formatToParts(ts);
    const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return `${map.month} ${map.day} ${map.year}, ${map.hour}:${map.minute}:${map.second}`;
}

function renderLibraryList() {
    const listContainer = document.getElementById('library-list');
    // Clear the container by removing all children.
    while (listContainer.firstChild) {
        listContainer.removeChild(listContainer.firstChild);
    }

    // Current diagram.
    const currentLabel = document.createElement('p');
    currentLabel.textContent = currentDiagram().mode === 'import' ? 'Current diagram to import' : "Current diagram";
    currentLabel.classList.add('library-list-section-label');
    listContainer.appendChild(currentLabel);
    appendDiagramItem(listContainer, currentDiagram());

    const savedDiagrams = Object.values(diagrams)
        // If showing an imported diagram, list all. Otherwise, exclude the
        // currently selected diagram.
        .filter(d => currentDiagram().mode === 'import' || d.name !== currentDiagram().name)
        .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    if (savedDiagrams.length === 0) {
        return
    }

    // Separator.
    listContainer.appendChild(document.createElement('hr'));

    // Saved diagrams from most recently modified to least recently modified.
    const label = document.createElement('p');
    label.textContent = 'Saved diagrams';
    label.classList.add('library-list-section-label');
    listContainer.appendChild(label);
    for (let diagramData of savedDiagrams) {
        appendDiagramItem(listContainer, diagramData);
    }
}

function appendDiagramItem(container, diagramData) {
    const item = document.createElement('div');
    item.className = 'library-item';

    const infoDiv = document.createElement('div');
    infoDiv.className = 'library-item-info';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'library-item-name';
    nameSpan.textContent = diagramData.name;
    nameSpan.title = diagramData.name;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'library-item-timestamp';
    if (diagramData && diagramData.lastModified) {
        const lastModified = new Date(diagramData.lastModified);
        timeSpan.textContent = `Last modified ${formatTimestamp(lastModified)}`;
    } else {
        timeSpan.textContent = 'Unknown';
    }

    infoDiv.appendChild(nameSpan);
    infoDiv.appendChild(timeSpan);

    const buttonsGroup = document.createElement('div');
    buttonsGroup.className = 'dg-button-group';

    if (diagramData.mode === 'import') {
        // Show import button for diagrams in import mode.
        const importButton = document.createElement('button');
        importButton.className = 'dg-button';
        importButton.title = 'Import diagram';
        const importIcon = document.createElement('span');
        importIcon.className = 'material-symbols-rounded';
        importIcon.textContent = 'upload';
        importButton.appendChild(importIcon);
        importButton.addEventListener('click', () => {
            showImport();
            closeLibrary();
        });
        buttonsGroup.appendChild(importButton);
    } else {
        // Show open and delete buttons for saved diagrams.
        const deleteButton = document.createElement('button');
        deleteButton.className = 'dg-button';
        deleteButton.title = 'Delete diagram';
        const deleteIcon = document.createElement('span');
        deleteIcon.className = 'material-symbols-rounded';
        deleteIcon.textContent = 'delete';
        deleteButton.appendChild(deleteIcon);
        deleteButton.addEventListener('click', () => {
            if (confirm(`Are you sure you want to delete "${diagramData.name}"?`)) {
                deleteDiagram(diagramData.name);
                closeLibrary();
                renderLibraryList();
            }
        });

        const openButton = document.createElement('button');
        openButton.className = 'dg-button';
        openButton.title = 'Open diagram';
        const openIcon = document.createElement('span');
        openIcon.className = 'material-symbols-rounded';
        openIcon.textContent = 'open_in_browser';
        openButton.appendChild(openIcon);
        openButton.addEventListener('click', () => {
            openDiagram(diagramData.name);
            closeLibrary();
        });

        buttonsGroup.appendChild(deleteButton);
        buttonsGroup.appendChild(openButton);
    }

    item.appendChild(infoDiv);
    item.appendChild(buttonsGroup);
    container.appendChild(item);
}

function openDiagram(name) {
    const data = diagrams[name];
    if (!data) {
        showNotification(`Could not find diagram "${name}"`, false);
    };

    // Always open diagrams in view mode, even if they were last saved in
    // edit mode.
    data.mode = "view";
    updateCurrentDiagram(data, true, true);
    showNotification(`Opened "${name}"`, true);
}

function deleteDiagram(name) {
    const wasOpen = currentDiagram().name === name;
    let newlyOpened = null;
    delete diagrams[name];
    saveState();

    if (Object.keys(diagrams).length === 0) {
        updateCurrentDiagram(defaultDiagram(), true, true);
        showNotification(`Deleted "${name}", opened "${currentDiagram().name}"`, true);
    } else {
        // If the deleted diagram was the selected one, select the most
        // recently modified diagram.
        if (wasOpen) {
            let remainingDiagrams = Object.values(diagrams).sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
            newlyOpened = remainingDiagrams[0].name;
            openDiagram(newlyOpened);
        }

        // Show appropriate notification based on whether another diagram
        // was opened.
        if (wasOpen && newlyOpened) {
            showNotification(`Deleted "${name}", opened "${newlyOpened}"`, true);
        } else {
            showNotification(`Deleted "${name}"`, true);
        }
    }
}

// Import.
document.getElementById('close-import').addEventListener('click', closeImport);
document.getElementById('set-mode-import').addEventListener('click', showImport);
document.getElementById('import-confirm').addEventListener('click', confirmImport);
document.getElementById('import-diagram-name').addEventListener('input', onImportNameChanged);

async function showImport() {
    closeModals();
    const nameInput = document.getElementById('import-diagram-name');
    nameInput.value = generateImportName(currentDiagram().name);
    clearImportError();
    nameInput.focus();
    let modal = document.getElementById('import-modal');
    modal.style.display = 'flex';
}

function closeImport() {
    document.getElementById('import-modal').style.display = 'none';
}

function generateImportName(name) {
    // If the name doesn't exist in the library in non-import mode, keep the
    // name.
    if (!diagrams[name] || diagrams[name].mode === 'import') {
        return name;
    }

    // Remove any existing " - Imported" suffix to get the original name.
    let originalName = name;
    const importedMatch = name.match(/^(.*?)(?: - Imported(?: \d+)?)?$/);
    if (importedMatch && name.includes(' - Imported')) {
        originalName = name.replace(/ - Imported(?: \d+)?$/, '');
    }

    // Otherwise, generate a name like "name - Imported", "name - Imported 2",
    // etc.
    let counter = 1;
    let newName;
    do {
        newName = counter === 1 ? `${originalName} - Imported` : `${originalName} - Imported ${counter}`;
        counter++;
    } while (diagrams[newName]);

    return newName;
}

function clearImportError() {
    const errorDiv = document.getElementById('import-error');
    errorDiv.textContent = '';
    const button = document.getElementById('import-confirm');
    const icon = button.querySelector('.material-symbols-rounded');
    icon.textContent = 'upload';
    const label = button.querySelector('.label');
    label.textContent = 'Import';
}

function showImportError(message) {
    const errorDiv = document.getElementById('import-error');
    errorDiv.textContent = message;
}

function onImportNameChanged() {
    clearImportError();
}

async function confirmImport() {
    const nameInput = document.getElementById('import-diagram-name');
    const importName = nameInput.value.trim();

    if (!importName) {
        showImportError("Please enter a diagram name.");
        return;
    }

    // Check if the diagram already exists in non-import mode.
    if (diagrams[importName] && diagrams[importName].mode !== 'import') {
        const button = document.getElementById('import-confirm');
        const currentLabel = button.querySelector('.label').textContent;

        // If we're already in overwrite mode, proceed with the import.
        if (currentLabel === 'Overwrite') {
            performImport(importName);
            return;
        }

        // Otherwise, show the error and change button to Overwrite.
        showImportError("A diagram with this name already exists, please confirm that you want to overwrite it.");
        const icon = button.querySelector('.material-symbols-rounded');
        icon.textContent = 'upload';
        const label = button.querySelector('.label');
        label.textContent = 'Overwrite';
        return;
    }

    // Diagram doesn't exist, proceed with the import.
    performImport(importName);
}

async function performImport(importName) {
    const data = Object.assign(defaultDiagram(), currentDiagram(), {name: importName, mode: "view"});
    await updateCurrentDiagram(data, true);
    closeImport();
    showNotification(`Imported "${importName}"`, true);
}

// Export/copy.
document.getElementById('close-export').addEventListener('click', closeExport);

document.getElementById('export').addEventListener('click', function() {
    const scaleInput = document.getElementById('png-export-scale');
    const scaleLabel = document.getElementById('png-export-scale-value');
    if (scaleInput) scaleInput.value = currentDiagram().pngScale || 2;
    scaleLabel.textContent = scaleInput.value;

    showExport();
});

function showExport() {
    closeModals();
    let modal = document.getElementById('export-modal');
    document.getElementById('export-svg').style.display = 'inline-flex';
    document.getElementById('export-png').style.display = 'inline-flex';
    document.getElementById('copy-png').style.display = 'inline-flex';
    modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
}

function closeExport() {
    document.getElementById('export-modal').style.display = 'none';
}

document.getElementById("copy").addEventListener('click', async function(ev) {
    if (exporting) return;
    await updateCurrentDiagram({
        name: document.getElementById('diagram-name').value,
        content: monacoEditor.getValue()
    });
    export_('png', true);
});


// Update the PNG scale when the input changes.
document.getElementById('png-export-scale').addEventListener('input', async function(e) {
    let scale = parseInt(e.target.value);
    if (!scale || scale < 1 || scale > 100) scale = defaultScale;

    const scaleLabel = document.getElementById('png-export-scale-value');
    scaleLabel.textContent = scale;
    await updateCurrentDiagram({pngScale: scale});
});

// Export/copy buttons in the modal.
["export-png", "export-svg", "copy-png"].forEach(type => {
    document.getElementById(type).addEventListener("click", function(ev) {
        export_(type === 'export-svg' ? "svg" : "png", type === "copy-png");
        closeExport();
    });
});

// export_ exports the diagram in the specified format (png or svg).
// If clipboard is true, it copies the diagram to the clipboard instead
// of triggering a download.
async function export_(formatID, clipboard) {
    let formats = {
        "png": {ext: ".png", fn: pngExport},
        "svg": {ext: ".svg", fn: svgExport}
    }
    let format = formats[formatID];
    if (!format) {
        console.error(`Unknown export format: ${formatID}`);
        return;
    }

    await updateCurrentDiagram({
        name: document.getElementById('diagram-name').value,
        content: monacoEditor.getValue()
    });
    const svgElem = document.querySelector('#diagram-svg');
    if (!svgElem) {
        alert('No diagram to export.');
        return;
    }

    // Show loading indicator during PNG exports, and disable buttons to avoid
    // multiple exports at the same time.
    exporting = true;

    let opButton = clipboard ? document.getElementById('copy') : document.getElementById('export');
    ['export', 'copy'].forEach(type => {
        document.getElementById(type).disabled = true;
    });
    const icon = opButton ? opButton.querySelector('.material-symbols-rounded') : null;
    const originalIcon = icon ? icon.textContent : null;
    if (icon) {
        icon.textContent = 'progress_activity';
        icon.classList.add('icon-spinner');
    }
    let doneCallback = (err) => {
        if (icon && originalIcon) {
            icon.textContent = originalIcon;
            icon.classList.remove('icon-spinner');
        }
        ['export', 'copy'].forEach(type => {
            document.getElementById(type).disabled = false;
        });
        if (clipboard) {
            let msg = !err ?
                "Diagram copied to the clipboard" :
                "Error copying diagram to the clipboard";
            showNotification(msg, !err);
        } else {
            if (err) showNotification("Error exporting diagram", false);
        }
        exporting = false;
    };

    let name = document.getElementById('diagram-name').value.trim() || 'Diagrama';
    if (!name.toLowerCase().endsWith(format.ext)) name += format.ext;
    // Obtain the scale directly from the element to ensure it works even in
    // import mode, where the scale is not updated by updateCurrentDiagram.
    let scale = document.getElementById('png-export-scale').value;
    console.log(currentDiagram().content, scale);
    format.fn(currentDiagram().content, scale, svgElem, name, clipboard, doneCallback);
}

// Share.
document.getElementById('share').addEventListener('click', share);

async function share() {
    closeHelp();
    await updateCurrentDiagram({
        mode: "view",
        name: document.getElementById('diagram-name').value,
        content: monacoEditor.getValue(),
    });
    let ok = true;
    try {
        await navigator.clipboard.writeText(window.location.href);
    } catch (err) {
        console.error(err);
        ok = false;
    }
    let msg = ok ?
        "Link copied to the clipboard" :
        "Error copying link to the clipboard";
    showNotification(msg, ok);
}

async function showNotification(msg, ok) {
    const overlay = document.getElementById('notification-overlay');
    overlay.textContent = msg;
    ok ? overlay.classList.remove('error') : overlay.classList.add('error');
    overlay.classList.add('show');

    clearTimeout(notificationOverlayTimeout);
    notificationOverlayTimeout = setTimeout(() => {
        overlay.classList.remove('show');
    }, 2000);
}

// Auto-adjust editor font on resize.
new ResizeObserver(() => {
    setEditorFontSize(monacoEditor, localStorage.getItem("fontSizeOverride"))
}).observe(document.getElementById("editor"));

// Set font sizes on other open editors.
window.addEventListener("storage", ev => {
    if (ev.key == "fontSizeOverride") {
        setEditorFontSize(monacoEditor, ev.newValue);
    }
});

let monacoEditor = initEditor({
    element: document.getElementById("editor"),
    initialFontSize: localStorage.getItem("fontSizeOverride"),
    onContentChanged: (content) => updateCurrentDiagram({content}, true),
    onFontSizeChanged: (fontSize) => {
        if (fontSize === null) {
            localStorage.removeItem("fontSizeOverride");
            return;
        }
        localStorage.setItem("fontSizeOverride", fontSize);
    },
});
init();

