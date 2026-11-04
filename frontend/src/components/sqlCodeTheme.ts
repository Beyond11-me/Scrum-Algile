import { MSSQL, sql } from "@codemirror/lang-sql";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

type SqlPalette = {
  text: string;
  keyword: string;
  builtin: string;
  number: string;
  string: string;
  comment: string;
  selection: string;
};

const DARK: SqlPalette = {
  text: "#d4d4d4",
  keyword: "#569cd6",
  builtin: "#dcdcaa",
  number: "#b5cea8",
  string: "#ce9178",
  comment: "#6a9955",
  selection: "#264f78",
};

const LIGHT: SqlPalette = {
  text: "#1f2328",
  keyword: "#0000ff",
  builtin: "#795e26",
  number: "#098658",
  string: "#a31515",
  comment: "#008000",
  selection: "#add6ff",
};

function extensionsFor(palette: SqlPalette, dark: boolean) {
  return [
    sql({ dialect: MSSQL }),
    EditorView.theme(
      {
        "&": { color: palette.text },
        ".cm-content": { caretColor: palette.text },
        ".cm-cursor, .cm-dropCursor": { borderLeftColor: palette.text },
        "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
          backgroundColor: palette.selection,
        },
      },
      { dark },
    ),
    syntaxHighlighting(
      HighlightStyle.define([
        { tag: [tags.keyword, tags.typeName, tags.bool, tags.null], color: palette.keyword },
        { tag: tags.standard(tags.name), color: palette.builtin },
        { tag: tags.number, color: palette.number },
        { tag: tags.string, color: palette.string },
        { tag: [tags.lineComment, tags.blockComment], color: palette.comment, fontStyle: "italic" },
      ]),
    ),
  ];
}

const darkExtensions = extensionsFor(DARK, true);
const lightExtensions = extensionsFor(LIGHT, false);

/** T-SQL language support and colors for CodeMirror. Pass `theme="none"` so its built-in theme does not compete with these. */
export function sqlCodeExtensions(dark: boolean) {
  return dark ? darkExtensions : lightExtensions;
}
