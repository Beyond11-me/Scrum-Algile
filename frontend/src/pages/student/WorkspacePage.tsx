import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { Check, ChevronRight, Database, Lightbulb, Lock, Play, Star, RotateCcw, Maximize2, Minimize2, Braces, X } from "lucide-react";
import { indentRange } from "@codemirror/language";
import { AppHeader } from "../../components/AppHeader";
import { DataGrid, Dialog, Empty, Loading, Status } from "../../components/ui";
import { ProblemMarkdown } from "../../components/ProblemMarkdown";
import { useLoad } from "../../components/useLoad";
import { studentApi, type QueryResult } from "../../services/studentApi";
import { storage } from "../../services/storage";
import type { DataTable, Problem, Submission } from "../../data/models";
import { parseDatabaseSchema } from "../../utils/parseDatabaseSchema";
import { parseSeedData } from "../../utils/parseSeedData";
import { submissionTimeLabel } from "../../utils/serverDateTime";
import { AiChatPanel } from "../../components/AiChatPanel";
import { sqlCodeExtensions } from "../../components/sqlCodeTheme";
import { DifficultyBadge } from "./ProblemListPage";

const WORKSPACE_LAYOUT_KEY = "sql-practice:workspace-layout";
const DEFAULT_PROBLEM_WIDTH = 38;
const DEFAULT_EDITOR_HEIGHT = 62;
const MIN_PROBLEM_WIDTH = 22;
const MAX_PROBLEM_WIDTH = 55;
const MIN_EDITOR_HEIGHT = 30;
const MAX_EDITOR_HEIGHT = 80;

function clampPaneSize(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value * 10) / 10));
}

function readWorkspaceLayout() {
  try {
    const value = JSON.parse(storage.get(WORKSPACE_LAYOUT_KEY) || "null");
    return {
      problemWidth: Number.isFinite(value?.problemWidth)
        ? clampPaneSize(value.problemWidth, MIN_PROBLEM_WIDTH, MAX_PROBLEM_WIDTH)
        : DEFAULT_PROBLEM_WIDTH,
      editorHeight: Number.isFinite(value?.editorHeight)
        ? clampPaneSize(value.editorHeight, MIN_EDITOR_HEIGHT, MAX_EDITOR_HEIGHT)
        : DEFAULT_EDITOR_HEIGHT,
    };
  } catch {
    return {
      problemWidth: DEFAULT_PROBLEM_WIDTH,
      editorHeight: DEFAULT_EDITOR_HEIGHT,
    };
  }
}

// The editor stays dark in both app themes, matching the workspace design.
const editorTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--editor-bg)",
    color: "var(--editor-text)",
    height: "100%",
  },
  ".cm-content": {
    fontFamily: '"JetBrains Mono", monospace',
    padding: "14px 0",
    lineHeight: "24px",
    caretColor: "var(--editor-text)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--editor-bg)",
    color: "var(--editor-gutter)",
    border: "none",
    padding: "0 6px 0 12px",
  },
  ".cm-activeLine": { backgroundColor: "var(--editor-active-line)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--editor-text)" },
  ".cm-cursor": { borderLeftColor: "var(--editor-text)" },
  ".cm-scroller": { overflow: "auto" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
    backgroundColor: "var(--editor-selection) !important",
  },
}, { dark: true });

const editorExtensions = [...sqlCodeExtensions(true), editorTheme];

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function sameTable(actual?: DataTable | null, expected?: DataTable | null) {
  if (!actual || !expected) return false;
  const normalize = (value: unknown) => String(value ?? "").trim();
  return (
    actual.columns.length === expected.columns.length &&
    actual.columns.every((column, index) => column.toLowerCase() === expected.columns[index]?.toLowerCase()) &&
    actual.rows.length === expected.rows.length &&
    actual.rows.every((row, rowIndex) => row.every((value, index) => normalize(value) === normalize(expected.rows[rowIndex]?.[index])))
  );
}

export function WorkspacePage() {
  const { problemId = "" } = useParams();
  const [params] = useSearchParams();
  const context = params.get("context") || (params.get("source") || "Practice");
  const { data, loading, error } = useLoad(
    () => studentApi.getProblem(problemId, context),
    [problemId, context],
  );
  if (loading)
    return (
      <>
        <AppHeader
          workspace={{ title: "Loading problem…", number: "", topic: "" }}
        />
        <main id="main-content">
          <Loading />
        </main>
      </>
    );
  if (error || !data)
    return (
      <>
        <AppHeader />
        <main id="main-content">
          <Empty title="Problem unavailable">
            {error || "This problem ID does not exist."}{" "}
            <Link to="/problems">Back to problems</Link>
          </Empty>
        </main>
      </>
    );
  return <Workspace key={data.id} problem={data} />;
}

type Outcome = { kind: "run" | "submit"; value: QueryResult & { passed?: number; total?: number } };

function Workspace({ problem }: { problem: Problem }) {
  const [params] = useSearchParams();
  const source: Submission["source"] =
    params.get("source") === "Assignments"
      ? "Assignments"
      : params.get("source") === "Contests"
        ? "Contests"
        : "Practice";
  const context = params.get("context") || source;
  const contextTitle = params.get("contextTitle") || context;
  const practiceMode = source === "Practice";
  const contestMode = source === "Contests";
  const contestClosed = contestMode && params.get("closed") === "1";
  const contestAiAllowed = !contestMode || params.get("aiAllowed") === "1";
  const topic = problem.topics?.[0] || problem.topic || "Uncategorized";
  const [favorite, setFavorite] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [initialLayout] = useState(readWorkspaceLayout);
  const [problemWidth, setProblemWidth] = useState(initialLayout.problemWidth);
  const [editorHeight, setEditorHeight] = useState(initialLayout.editorHeight);
  const [resizing, setResizing] = useState<"vertical" | "horizontal" | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const editor = useRef<EditorView | null>(null);
  const workspaceLayout = useRef<HTMLDivElement | null>(null);
  const editorResults = useRef<HTMLDivElement | null>(null);
  const activeResize = useRef<"vertical" | "horizontal" | null>(null);
  const expandTrigger = useRef<HTMLButtonElement>(null);
  const [code, setCode] = useState(
    () => studentApi.getDraft(problem.id) ?? (problem.draft || ""),
  );
  const [selected, setSelected] = useState("");
  const [problemTab, setProblemTab] = useState("Description");
  const [resultTab, setResultTab] = useState("Result");
  const [mobileTab, setMobileTab] = useState("Problem");
  const [hintOpen, setHintOpen] = useState(false);
  const [isAiPanelOpen, setIsAiPanelOpen] = useState(false);
  const [busy, setBusy] = useState<"run" | "submit" | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [solvedNow, setSolvedNow] = useState(false);
  const [confirmResetQuery, setConfirmResetQuery] = useState(false);
  const [notice, setNotice] = useState("");
  const aiTrigger = useRef<HTMLButtonElement | null>(null);
  const alive = useRef(true);
  const runRef = useRef<() => void>(() => {});
  const problemList = useLoad(
    () => (practiceMode ? studentApi.getProblems() : Promise.resolve([])),
    [practiceMode],
  );
  const submissions = useLoad(
    () => studentApi.getSubmissions().then((items: Submission[]) => items.filter((item) => item.problemId === problem.id)),
    [problem.id],
  );
  const ordered = [...(problemList.data || [])].sort((a: any, b: any) =>
    String(a.number).localeCompare(String(b.number), undefined, { numeric: true }));
  const position = ordered.findIndex((item: any) => item.id === problem.id);
  const neighbour = (offset: number) => {
    const item = position >= 0 ? ordered[position + offset] : undefined;
    return item ? `/workspace/${item.id}` : null;
  };
  const acceptance = position >= 0 ? ordered[position].acceptance : undefined;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    studentApi.saveDraft(problem.id, code);
  }, [code, problem.id]);
  useEffect(() => {
    const save = window.setTimeout(() => {
      storage.set(
        WORKSPACE_LAYOUT_KEY,
        JSON.stringify({ problemWidth, editorHeight }),
      );
    }, 120);
    return () => window.clearTimeout(save);
  }, [problemWidth, editorHeight]);
  useEffect(() => {
    let active = true;
    studentApi.getPreferences().then((preferences) => {
      if (active) setFavorite(preferences.favorites.includes(problem.id));
    }).catch(() => { if (active) setNotice("Could not load saved problems."); });
    return () => { active = false; };
  }, [problem.id]);
  async function toggleSaved() {
    if (favoriteBusy) return;
    setFavoriteBusy(true);
    try {
      const response = await studentApi.toggleFavorite(problem.id);
      setFavorite(response.status === "added");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update saved problems.");
    } finally {
      setFavoriteBusy(false);
    }
  }
  function closeAiPanel() {
    setIsAiPanelOpen(false);
    aiTrigger.current?.focus();
  }
  useEffect(() => {
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape" && expanded) {
        setExpanded(false);
        expandTrigger.current?.focus();
      }
    }
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("keydown", escape);
    };
  }, [expanded]);
  async function run(kind: "run" | "submit") {
    if (busy) return;
    setBusy(kind);
    setExpanded(false);
    setNotice("");
    setResultTab("Result");
    setMobileTab("Result");
    try {
      const value =
        kind === "submit"
          ? await studentApi.submitSolution(
              problem.id,
              code,
              "SQL Server",
              source,
              context,
            )
          : await studentApi.runQuery(
              problem.id,
              selected.trim() ? selected : code,
              "SQL Server",
              source,
              context,
            );
      if (alive.current) {
        setOutcome({ kind, value });
        if (kind === "submit") {
          if (value.status === "Accepted") setSolvedNow(true);
          void submissions.mutate();
        }
      }
    } catch (error) {
      if (alive.current)
        setNotice(error instanceof Error ? error.message : "The SQL runner is unavailable. Try again.");
    } finally {
      if (alive.current) setBusy(null);
    }
  }
  runRef.current = () => void run("run");
  function resizeFromPointer(
    orientation: "vertical" | "horizontal",
    clientX: number,
    clientY: number,
  ) {
    if (orientation === "vertical") {
      const bounds = workspaceLayout.current?.getBoundingClientRect();
      if (!bounds?.width) return;
      setProblemWidth(
        clampPaneSize(
          ((clientX - bounds.left) / bounds.width) * 100,
          MIN_PROBLEM_WIDTH,
          MAX_PROBLEM_WIDTH,
        ),
      );
      return;
    }
    const bounds = editorResults.current?.getBoundingClientRect();
    if (!bounds?.height) return;
    setEditorHeight(
      clampPaneSize(
        ((clientY - bounds.top) / bounds.height) * 100,
        MIN_EDITOR_HEIGHT,
        MAX_EDITOR_HEIGHT,
      ),
    );
  }
  function startResize(
    orientation: "vertical" | "horizontal",
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    activeResize.current = orientation;
    setResizing(orientation);
    resizeFromPointer(orientation, event.clientX, event.clientY);
  }
  function moveResize(
    orientation: "vertical" | "horizontal",
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (activeResize.current !== orientation) return;
    resizeFromPointer(orientation, event.clientX, event.clientY);
  }
  function stopResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    activeResize.current = null;
    setResizing(null);
  }
  function resizeWithKeyboard(
    orientation: "vertical" | "horizontal",
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) {
    const direction = orientation === "vertical"
      ? event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0
      : event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (!direction) return;
    event.preventDefault();
    if (orientation === "vertical") {
      setProblemWidth((value) =>
        clampPaneSize(value + direction * 2, MIN_PROBLEM_WIDTH, MAX_PROBLEM_WIDTH),
      );
    } else {
      setEditorHeight((value) =>
        clampPaneSize(value + direction * 2, MIN_EDITOR_HEIGHT, MAX_EDITOR_HEIGHT),
      );
    }
  }
  const schemaText = (problem as Problem & { schema?: string }).schema || "";
  const schemaTables = parseDatabaseSchema(schemaText);
  const seedDataText = (problem as Problem & { seedData?: string }).seedData || "";
  const seedTables = parseSeedData(seedDataText);
  const progress = solvedNow ? "Solved" : (problem.progress || "Not started");
  const display = outcome?.value;
  const verdict = display?.status || "";
  const errorVerdict = /Error|Time Limit/.test(verdict);
  const matchesExpected = outcome?.kind === "run" && !errorVerdict && sameTable(display?.table, problem.expected);
  const rowCount = display?.table?.rows?.length;
  const ranSelection = !!selected.trim();
  return (
    <div className={"workspace" + (expanded ? " editor-expanded" : "") + (resizing ? ` is-resizing resizing-${resizing}` : "")}>
      <AppHeader
        workspace={{
          title: problem.title,
          number: problem.number,
          topic,
          source,
          context: practiceMode ? topic : contextTitle,
          backTo: practiceMode ? "/problems" : "/assignments",
          backLabel: practiceMode ? "Problems" : source,
          ...(practiceMode && { prevTo: neighbour(-1), nextTo: neighbour(1) }),
        }}
      />
      <main id="main-content" className="workspace-main">
        <div
          className="workspace-mobile-tabs"
          role="tablist"
          aria-label="Workspace pane"
        >
          {["Problem", "SQL", "Result"].map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={mobileTab === t}
              className={mobileTab === t ? "active" : ""}
              onClick={() => setMobileTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <div
          ref={workspaceLayout}
          className={`workspace-layout ${isAiPanelOpen ? "with-ai" : ""}`}
          style={{
            "--problem-pane-width": `${problemWidth}%`,
            "--editor-pane-height": `${editorHeight}%`,
          } as CSSProperties}
        >
          <section
            id="workspace-problem-pane"
            className={
              "problem-pane mobile-pane" +
              (mobileTab === "Problem" ? " mobile-visible" : "")
            }
            aria-label="Problem description"
          >
            <div
              className="pane-tabs"
              role="tablist"
              aria-label="Problem information"
            >
              {["Description", "Database", "Submissions"].map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={problemTab === t}
                  className={problemTab === t ? "active" : ""}
                  onClick={() => setProblemTab(t)}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="problem-scroll">
              {problemTab === "Description" && (
                <>
                  <div className="problem-heading">
                    <p className="problem-kicker">#{problem.number} · {topic}</p>
                    <h1>{problem.title}</h1>
                    <div className="problem-meta">
                      <DifficultyBadge value={problem.difficulty || "Unknown"} />
                      {(problem.topics?.length ? problem.topics : [topic]).map((t) => (
                        <span className="problem-tag" key={t}>{t}</span>
                      ))}
                      <Status value={progress} />
                      {acceptance !== undefined && <span className="problem-acceptance">Acceptance {acceptance}%</span>}
                    </div>
                  </div>
                  <ProblemMarkdown>{problem.description || ""}</ProblemMarkdown>
                  {problem.requirements && <>
                    <h3>Requirements</h3>
                    <ProblemMarkdown>{problem.requirements}</ProblemMarkdown>
                  </>}
                  {problem.expected && <><h3>Expected output</h3><DataGrid table={problem.expected} /><p className="tiny muted">Output shown for the sample dataset.</p></>}
                  <div className={"problem-hint" + (contestMode ? " is-disabled" : "")}>
                    <button
                      type="button"
                      aria-expanded={hintOpen}
                      aria-controls="workspace-hint-panel"
                      disabled={contestMode}
                      title={contestMode ? "Hints are disabled during contests" : undefined}
                      onClick={() => setHintOpen((value) => !value)}
                    >
                      <span><Lightbulb size={16} aria-hidden="true" />Hint</span>
                      <small>{contestMode ? "Disabled in contests" : hintOpen ? "Hide" : "Show"}</small>
                    </button>
                    {hintOpen && !contestMode && (
                      <div id="workspace-hint-panel">
                        <ProblemMarkdown className="workspace-hint-content">
                          {problem.hint || "No hint for this problem."}
                        </ProblemMarkdown>
                        <small className="muted">Guidance only · no complete solution.</small>
                      </div>
                    )}
                  </div>
                </>
              )}
              {problemTab === "Database" && (
                <>
                  <h2>Database setup</h2>
                  <p className="muted">SQL Server · read-only schema and seed data used for evaluation</p>
                  <section className="schema-section">
                    <h3>Schema</h3>
                    {schemaTables.length ? (
                      <div className="workspace-schema-tables">
                        {schemaTables.map((table, tableIndex) => (
                          <section className="workspace-schema-table-card" key={`${table.name}-${tableIndex}`}>
                            <h4>{table.name}</h4>
                            <div className="workspace-schema-table-scroll">
                              <table className="workspace-schema-table">
                                <thead><tr><th>Column</th><th>Type</th><th>Constraints</th></tr></thead>
                                <tbody>{table.columns.map((column) => (
                                  <tr key={column.name}>
                                    <th scope="row">{column.name}</th>
                                    <td>{column.type}</td>
                                    <td>{column.constraints || "—"}</td>
                                  </tr>
                                ))}</tbody>
                              </table>
                            </div>
                            {(table.foreignKeys.length > 0 || table.constraints.length > 0) && <div className="workspace-schema-relations">
                              {table.foreignKeys.map((foreignKey, index) => (
                                <div className="workspace-schema-relation" key={`fk-${index}`}>
                                  <span className="workspace-schema-relation-label">FOREIGN KEY</span>
                                  <code>{foreignKey.columns.join(", ")}</code>
                                  <span aria-hidden="true">→</span>
                                  <code>{foreignKey.referencedTable}.{foreignKey.referencedColumns.join(", ")}</code>
                                </div>
                              ))}
                              {table.constraints.map((constraint, index) => (
                                <span className="workspace-schema-extra-constraint" key={`constraint-${index}`}>{constraint}</span>
                              ))}
                            </div>}
                          </section>
                        ))}
                      </div>
                    ) : (
                      <pre className="workspace-schema-code"><code>{schemaText || "No schema provided."}</code></pre>
                    )}
                  </section>
                  <section className="schema-section">
                    <h3>Seed data</h3>
                    {seedTables.length ? (
                      <div className="workspace-seed-tables">
                        {seedTables.map((table, tableIndex) => (
                          <section className="workspace-schema-table-card" key={`${table.name}-${tableIndex}`}>
                            <h4>{table.name}</h4>
                            <div className="workspace-schema-table-scroll">
                              <table className="workspace-seed-table">
                                <thead><tr>{table.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
                                <tbody>{table.rows.map((row, rowIndex) => (
                                  <tr key={rowIndex}>{row.map((value, columnIndex) => <td key={`${table.columns[columnIndex]}-${columnIndex}`}>{value}</td>)}</tr>
                                ))}</tbody>
                              </table>
                            </div>
                          </section>
                        ))}
                      </div>
                    ) : (
                      <pre className="workspace-schema-code"><code>{seedDataText || "No seed data provided."}</code></pre>
                    )}
                  </section>
                </>
              )}
              {problemTab === "Submissions" && (
                submissions.loading ? <Loading label="Loading submissions…" /> :
                submissions.data?.length ? (
                  <>
                    <div className="workspace-submissions table-scroll">
                      <table className="data-table">
                        <thead><tr><th>Result</th><th>Score</th><th>Source</th><th>Submitted</th></tr></thead>
                        <tbody>{submissions.data.map((item) => (
                          <tr key={item.id}>
                            <td><Status value={item.result} /></td>
                            <td>{item.score}/{item.maxScore ?? 100}</td>
                            <td>{item.source}</td>
                            <td className="muted">{submissionTimeLabel(item.submittedAt)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </div>
                    <Link className="text-button" to="/submissions">View full submission history →</Link>
                  </>
                ) : (
                  <div className="workspace-placeholder">
                    <Lock size={28} aria-hidden="true" />
                    <p>No submissions yet</p>
                    <small>Submit your query to see verdicts here.</small>
                  </div>
                )
              )}
            </div>
            <div className="help-dock">
              <button
                ref={aiTrigger}
                disabled={!contestAiAllowed}
                aria-expanded={isAiPanelOpen}
                aria-controls="workspace-ai-panel"
                title={
                  !contestAiAllowed
                    ? "AI assistance is disabled during contests"
                    : undefined
                }
                onClick={() => {
                  if (isAiPanelOpen) closeAiPanel();
                  else {
                    setIsAiPanelOpen(true);
                    if (expanded) setExpanded(false);
                  }
                }}
              >
                Ask AI
              </button>
              <button
                className="save-problem"
                aria-pressed={favorite}
                disabled={favoriteBusy}
                onClick={() => void toggleSaved()}
              >
                <Star size={15} fill={favorite ? "currentColor" : "none"} />
                {favorite ? "Saved" : "Save"}
              </button>
            </div>
          </section>
          <div
            className="workspace-splitter workspace-splitter-vertical"
            role="separator"
            aria-label="Resize problem and editor panes"
            aria-orientation="vertical"
            aria-controls="workspace-problem-pane workspace-editor-results"
            aria-valuemin={MIN_PROBLEM_WIDTH}
            aria-valuemax={MAX_PROBLEM_WIDTH}
            aria-valuenow={Math.round(problemWidth)}
            aria-valuetext={`Problem pane ${Math.round(problemWidth)} percent`}
            tabIndex={0}
            onPointerDown={(event) => startResize("vertical", event)}
            onPointerMove={(event) => moveResize("vertical", event)}
            onPointerUp={stopResize}
            onPointerCancel={stopResize}
            onLostPointerCapture={() => {
              activeResize.current = null;
              setResizing(null);
            }}
            onDoubleClick={() => setProblemWidth(DEFAULT_PROBLEM_WIDTH)}
            onKeyDown={(event) => resizeWithKeyboard("vertical", event)}
          />
          <div id="workspace-editor-results" className="editor-results" ref={editorResults}>
            <section
              id="workspace-editor-pane"
              className={
                "editor-pane mobile-pane" +
                (mobileTab === "SQL" ? " mobile-visible" : "")
              }
              aria-label="SQL editor"
            >
              <div className="editor-toolbar">
                <div className="editor-toolbar-group">
                  <span className="editor-dialect"><Database size={14} aria-hidden="true" />SQL Server</span>
                  <button
                    className="icon-button format-query"
                    type="button"
                    disabled={!!busy}
                    aria-label="Format SQL indentation"
                    title="Format SQL indentation"
                    onClick={() => {
                      const view = editor.current;
                      if (view) {
                        view.dispatch({
                          changes: indentRange(
                            view.state,
                            0,
                            view.state.doc.length,
                          ),
                        });
                        view.focus();
                      }
                    }}
                  >
                    <Braces size={16} />
                  </button>
                  <button className="icon-button" type="button" aria-label="Reset SQL query" title="Reset SQL query" onClick={() => setConfirmResetQuery(true)}><RotateCcw size={16} /></button>
                  <button
                    className="icon-button expand-editor"
                    type="button"
                    ref={expandTrigger}
                    aria-label={
                      expanded ? "Restore editor layout" : "Expand SQL editor"
                    }
                    title={expanded ? "Restore editor layout" : "Expand SQL editor"}
                    aria-pressed={expanded}
                    onClick={() => {
                      setExpanded((value) => !value);
                      setMobileTab("SQL");
                    }}
                  >
                    {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </button>
                </div>
                <div className="editor-toolbar-group">
                  <button
                    className="editor-run"
                    type="button"
                    disabled={!!busy}
                    title={ranSelection ? "Run the selected SQL" : "Run the whole query"}
                    onClick={() => void run("run")}
                  >
                    <Play size={14} aria-hidden="true" />
                    {busy === "run" ? "Running…" : ranSelection ? "Run selection" : "Run"}
                    <kbd>{isMac ? "⌘" : "Ctrl"} ↵</kbd>
                  </button>
                  <button
                    className="editor-submit"
                    type="button"
                    disabled={!!busy || contestClosed}
                    title={contestClosed ? "Contest submissions are closed" : undefined}
                    onClick={() => void run("submit")}
                  >
                    {busy === "submit"
                      ? "Submitting…"
                      : contestClosed ? "Submissions closed" : "Submit"}
                  </button>
                </div>
              </div>
              <div
                className="sql-editor"
                onKeyDownCapture={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    event.stopPropagation();
                    runRef.current();
                  }
                }}
              >
                <CodeMirror
                  value={code}
                  height="100%"
                  theme="none"
                  extensions={editorExtensions}
                  onChange={setCode}
                  onCreateEditor={(view) => {
                    editor.current = view;
                  }}
                  onUpdate={(v) => {
                    const selection = v.state.selection.main;
                    const line = v.state.doc.lineAt(selection.head);
                    const column = selection.head - line.from + 1;
                    setCursor((current) =>
                      current.line === line.number && current.column === column
                        ? current
                        : { line: line.number, column },
                    );
                    setSelected(v.state.sliceDoc(selection.from, selection.to));
                  }}
                  aria-label="SQL query"
                  basicSetup={{ foldGutter: false, highlightActiveLine: true }}
                />
              </div>
              <div className="editor-statusbar">
                <span>Draft saved locally</span>
                <span className="cursor-position">Ln {cursor.line}, Col {cursor.column}</span>
              </div>
            </section>
            <div
              className="workspace-splitter workspace-splitter-horizontal"
              role="separator"
              aria-label="Resize editor and result panes"
              aria-orientation="horizontal"
              aria-controls="workspace-editor-pane workspace-result-pane"
              aria-valuemin={MIN_EDITOR_HEIGHT}
              aria-valuemax={MAX_EDITOR_HEIGHT}
              aria-valuenow={Math.round(editorHeight)}
              aria-valuetext={`Editor pane ${Math.round(editorHeight)} percent`}
              tabIndex={0}
              onPointerDown={(event) => startResize("horizontal", event)}
              onPointerMove={(event) => moveResize("horizontal", event)}
              onPointerUp={stopResize}
              onPointerCancel={stopResize}
              onLostPointerCapture={() => {
                activeResize.current = null;
                setResizing(null);
              }}
              onDoubleClick={() => setEditorHeight(DEFAULT_EDITOR_HEIGHT)}
              onKeyDown={(event) => resizeWithKeyboard("horizontal", event)}
            />
            <section
              id="workspace-result-pane"
              className={
                "result-pane mobile-pane" +
                (mobileTab === "Result" ? " mobile-visible" : "")
              }
              aria-label="Query output"
            >
              <div className="pane-tabs result-tabs">
                <div role="tablist" aria-label="Execution output">
                  {["Result", ...(problem.expected ? ["Expected output"] : [])].map((t) => (
                    <button
                      key={t}
                      role="tab"
                      aria-selected={resultTab === t}
                      className={resultTab === t ? "active" : ""}
                      onClick={() => setResultTab(t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {resultTab === "Result" && rowCount !== undefined && !busy && (
                  <span className="result-meta">{rowCount} {rowCount === 1 ? "row" : "rows"}</span>
                )}
              </div>
              <div
                className={"result-scroll" + (resultTab === "Result" && !display && !busy ? " idle" : "")}
                aria-live="polite"
              >
                {resultTab === "Expected output" ? (
                  problem.expected
                    ? <DataGrid table={problem.expected} />
                    : <p className="muted">No expected output for this problem.</p>
                ) : busy ? (
                  <Loading
                    label={busy === "submit" ? "Submitting solution…" : "Running query…"}
                  />
                ) : display ? (
                  <>
                    {outcome?.kind === "submit" ? (
                      <div className={"result-verdict " + (verdict === "Accepted" ? "success" : "danger")}>
                        {verdict === "Accepted" ? <Check size={18} aria-hidden="true" /> : <X size={18} aria-hidden="true" />}
                        <b>{verdict === "Partial" ? "Partially correct" : verdict}</b>
                        {display.total !== undefined && <span>Passed {display.passed ?? 0}/{display.total} test cases</span>}
                      </div>
                    ) : errorVerdict ? (
                      <div className="result-verdict danger"><X size={18} aria-hidden="true" /><b>{verdict}</b></div>
                    ) : matchesExpected ? (
                      <p className="result-line success"><Check size={16} aria-hidden="true" />Matches the expected output for the sample data</p>
                    ) : problem.expected ? (
                      <p className="result-line">Query ran. Compare with the <button type="button" className="text-button" onClick={() => setResultTab("Expected output")}>expected output <ChevronRight size={14} /></button></p>
                    ) : (
                      <p className="result-line">Query ran on the sample data. Submit to check it against the test cases.</p>
                    )}
                    {display.message && (outcome?.kind === "submit" || errorVerdict) && <p className={errorVerdict ? "result-error" : "result-message"}>{display.message}</p>}
                    {display.table && <DataGrid table={display.table} />}
                    {outcome?.kind === "submit" && (
                      <button type="button" className="text-button" onClick={() => { setProblemTab("Submissions"); setMobileTab("Problem"); }}>
                        View submissions for this problem →
                      </button>
                    )}
                  </>
                ) : (
                  <div className="workspace-placeholder">
                    <Database size={28} aria-hidden="true" />
                    <p>Press <b>Run</b> to see the query result</p>
                    <small>Submit when ready for evaluation against hidden test cases.</small>
                  </div>
                )}
                {notice && (
                  <p role="status" className="form-message">
                    {notice}
                  </p>
                )}
              </div>
            </section>
          </div>
          <div
            id="workspace-ai-panel"
            className="workspace-ai-region"
            aria-hidden={!isAiPanelOpen}
          >
            <AiChatPanel
              problem={problem}
              code={code}
              onClose={closeAiPanel}
            />
          </div>
        </div>
      </main>
      {confirmResetQuery && <Dialog title="Reset SQL query?" onClose={() => setConfirmResetQuery(false)}><p>Your current SQL draft will be cleared from this browser.</p><div className="dialog-actions"><button className="button" type="button" onClick={() => setConfirmResetQuery(false)}>Cancel</button><button className="button primary" type="button" onClick={() => { setCode(""); setOutcome(null); setConfirmResetQuery(false); }}>Clear query</button></div></Dialog>}
    </div>
  );
}
