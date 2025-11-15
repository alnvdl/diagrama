import { editor, languages, KeyCode, KeyMod } from 'monaco-editor';

export function initEditor({
    element,
    initialFontSize,
    onContentChanged,
    onFontSizeChanged,

}) {
    initLang();
    initTheme();

    let monacoEditor = editor.create(element, {
        guides: {highlightActiveIndentation: false, indentation: false},
        language: 'mermaid',
        fontFamily: 'monospace',
        minimap: {enabled: false},
        multiCursorModifier: "ctrlCmd",
        overviewRulerLanes: 0,
        renderWhitespace: "none",
        scrollBeyondLastLine: false,
        theme: "diagrama-dark",
        automaticLayout: true,
        lineNumbersMinChars: 3,
    });

    // Editor-specific keyboard shortcuts.
    editor.addKeybindingRules([{
        keybinding: KeyCode.F2,
        command: 'editor.action.selectHighlights',
        when: null,
    }, {
        keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyK,
        command: 'editor.action.addSelectionToNextFindMatch',
        when: null,
    }, {
        keybinding: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyP,
        command: 'editor.action.quickCommand',
        when: null,
    }, {
        keybinding: KeyMod.CtrlCmd | KeyCode.KeyD,
        command: 'editor.action.deleteLines',
        when: null,
    }, {
        keybinding: KeyMod.CtrlCmd | KeyCode.KeyM,
        command: 'editor.action.jumpToBracket',
        when: null,
    }, {
        keybinding: KeyMod.Shift | KeyMod.Alt | KeyCode.UpArrow,
        command: 'editor.action.insertCursorAbove',
        when: null,
    }, {
        keybinding: KeyMod.Shift | KeyMod.Alt | KeyCode.DownArrow,
        command: 'editor.action.insertCursorBelow',
        when: null,
    }]);

    // Update data on Ctrl+Enter.
    monacoEditor.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, function() {
        onContentChanged(monacoEditor.getValue());
    });
    // Go back to auto-font-size on Ctrl+Shift+0.
    monacoEditor.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Digit0, function() {
        setEditorFontSize(monacoEditor);
        onFontSizeChanged(null);
    });

    // Set font size on Ctrl+scroll.
    monacoEditor.getDomNode().addEventListener('wheel', function(e) {
        if (monacoEditor && e.ctrlKey) {
            e.preventDefault();
            let fontSize = monacoEditor.getOption(editor.EditorOption.fontSize);
            fontSize += e.deltaY < 0 ? 1 : -1;
            setEditorFontSize(monacoEditor, fontSize);
            onFontSizeChanged(fontSize);
        }
    }, {passive: false});

    setEditorFontSize(monacoEditor, initialFontSize);
    return monacoEditor;
}

const minFontSize = 9;
// The line height proportion is the golden ratio, which happened
// to produce a result that the author likes.
const lineHeightRatio = 1.618;

// setEditorFontSize sets the font size and line height based on
// fontSize. Omit fontSize (or pass null) to enable automatic font
// sizes.
export function setEditorFontSize(monacoEditor, fontSize) {
    if (!monacoEditor) return;

    if (fontSize > 0) {
        fontSize = Math.max(fontSize, minFontSize);
        let lineHeight = Math.floor(fontSize * lineHeightRatio);
        monacoEditor.updateOptions({fontSize, lineHeight});
        return;
    }

    // If fontSize is not defined, set it automatically.
    const editorContainer = monacoEditor.getDomNode().parentNode;
    // The number 55 was determined as being a decent match calculating
    // the font size based upon the preferences of the author.
    fontSize = Math.max(Math.floor(editorContainer.offsetWidth / 55), 9);
    let lineHeight = Math.floor(fontSize * lineHeightRatio);
    monacoEditor.updateOptions({fontSize, lineHeight});
}

function initLang() {
    languages.register({id: 'mermaid'});

    languages.setMonarchTokensProvider('mermaid', {
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

    languages.setLanguageConfiguration('mermaid', {
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

function initTheme() {
    editor.defineTheme("diagrama-dark", {
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
