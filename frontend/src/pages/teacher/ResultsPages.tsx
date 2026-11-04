import { useEffect, useMemo, useState, useRef } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "@codemirror/view";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Dialog, ErrorState, Loading } from "../../components/ui";
import { TeacherField, TeacherPageIntro, TeacherSectionTitle } from "./TeacherPageParts";
import { teacherService, type TeacherSubmissionItem } from "../../services/teacherService";
import { useLoad } from "../../components/useLoad";
import { sqlCodeExtensions } from "../../components/sqlCodeTheme";
import { useTheme } from "../../context/ThemeContext";
import { formatSql } from "../../utils/formatSql";

const SQL_BLOCK_MIN_HEIGHT = 72;
const SQL_BLOCK_KEY_STEP = 40;

/** Read-only SQL with a full-width drag handle. The browser's own resize corner shrinks with the app's 4px scrollbars and is too small to grab reliably. */
function ReviewSqlBlock({ label, query }: { label: string; query: string }) {
  const [code, setCode] = useState(query);
  const [height, setHeight] = useState<number | null>(null);
  const codeRef = useRef<HTMLDivElement>(null);
  const { dark } = useTheme();
  const extensions = useMemo(
    // tabindex keeps the read-only code reachable for keyboard scrolling.
    () => [...sqlCodeExtensions(dark), EditorView.contentAttributes.of({ tabindex: "0", "aria-label": label })],
    [dark, label],
  );
  const drag = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    let active = true;
    setCode(query);
    // Unparseable SQL stays as the student wrote it.
    formatSql(query).then((formatted) => { if (active) setCode(formatted); }).catch(() => undefined);
    return () => { active = false; };
  }, [query]);

  const currentHeight = () => codeRef.current?.getBoundingClientRect().height ?? SQL_BLOCK_MIN_HEIGHT;
  const resizeTo = (next: number) => {
    setHeight(Math.max(SQL_BLOCK_MIN_HEIGHT, Math.min(window.innerHeight * 0.8, next)));
  };

  return (
    <div className="teacher-sql-block">
      <div
        ref={codeRef}
        className={`teacher-sql-code${height === null ? "" : " is-resized"}`}
        style={height === null ? undefined : { height }}
      >
        <CodeMirror
          value={code}
          theme="none"
          editable={false}
          readOnly
          extensions={extensions}
          basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: false, highlightActiveLineGutter: false }}
        />
      </div>
      <div
        className="teacher-sql-resize"
        role="separator"
        aria-orientation="horizontal"
        aria-label={`Resize ${label}`}
        aria-valuenow={Math.round(height ?? SQL_BLOCK_MIN_HEIGHT)}
        tabIndex={0}
        title="Drag to resize. Double-click to reset."
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { startY: event.clientY, startHeight: currentHeight() };
        }}
        onPointerMove={(event) => {
          if (drag.current) resizeTo(drag.current.startHeight + event.clientY - drag.current.startY);
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        onDoubleClick={() => setHeight(null)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          resizeTo(currentHeight() + (event.key === "ArrowDown" ? SQL_BLOCK_KEY_STEP : -SQL_BLOCK_KEY_STEP));
        }}
      />
    </div>
  );
}

export function ResultsDashboardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedResultId, setSelectedResultId] = useState("");
  const [page, setPage] = useState(1);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  const { data: submissions, loading, error } = useLoad(teacherService.getTeacherSubmissions);

  const filtered = useMemo(() => {
    if (!submissions) return [];
    return submissions.filter((item: TeacherSubmissionItem) => {
      const matchSearch = `${item.student} ${item.problemTitle}`.toLowerCase().includes(search.toLowerCase());
      const isNeedsReview = item.finalScore === null || item.finalScore === undefined;
      const matchStatus =
        statusFilter === "All" ||
        (statusFilter === "Needs review" && isNeedsReview) ||
        (statusFilter === "Reviewed" && !isNeedsReview) ||
        statusFilter === item.status;
      return matchSearch && matchStatus;
    });
  }, [search, statusFilter, submissions]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / 15));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * 15;
  const pageResults = filtered.slice(firstIndex, firstIndex + 15);
  const selectedResult = pageResults.find((item) => item.id === selectedResultId) || pageResults[0] || null;

  useEffect(() => { setPage(1); setSelectedResultId(""); }, [search, statusFilter]);
  useEffect(() => { tableScrollRef.current?.scrollTo({ top: 0 }); }, [currentPage, search, statusFilter]);

  if (loading) return <div className="teacher-page"><Loading label="Loading results…" /></div>;
  if (error) return <div className="teacher-page"><TeacherPageIntro compact title="Results" context="Results unavailable" /><ErrorState title="Could not load results" message={error} onRetry={() => window.location.reload()} /></div>;

  return (
    <section className="teacher-page teacher-results-page compact-teacher-results">
      <h1 className="sr-only">Results</h1>

      <div className="teacher-list-filters teacher-results-filters">
        <TeacherField label="SEARCH">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student or problem…" />
        </TeacherField>
        <TeacherField label="REVIEW STATUS">
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option>All</option>
            <option>Needs review</option>
            <option>Reviewed</option>
          </select>
        </TeacherField>
      </div>

      <div className="teacher-list-detail-layout teacher-results-detail-layout">
        <div className="teacher-list-detail-main teacher-results-table-wrap">
          <div ref={tableScrollRef} className="teacher-table-scroll teacher-list-table-scroll sticky-list-table-wrap">
            <table className="teacher-table teacher-results-table teacher-activity-results-table sticky-list-table">
              <thead>
                <tr>
                  <th>STUDENT</th>
                  <th>PROBLEM</th>
                  <th>AUTO SCORE</th>
                  <th>FINAL SCORE</th>
                  <th>STATUS</th>
                  <th>SUBMITTED</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {pageResults.map((item) => (
                  <tr
                    className={`teacher-selectable-list-row${selectedResult?.id === item.id ? " is-selected" : ""}`}
                    key={item.id}
                    onClick={() => setSelectedResultId(item.id)}
                  >
                    <td data-label="STUDENT">
                      <Link className="teacher-selectable-row-title teacher-list-row-title" to={`/teacher/results/review/${item.id}`}>
                        {item.student}
                      </Link>
                    </td>
                    <td data-label="PROBLEM">{item.problemTitle}</td>
                    <td data-label="AUTO SCORE">{item.autoScore}</td>
                    <td data-label="FINAL SCORE">{item.finalScore !== null && item.finalScore !== undefined ? item.finalScore : "—"}</td>
                    <td data-label="STATUS" className={item.finalScore === null || item.finalScore === undefined ? "teacher-state-warning" : "teacher-state-success"}>
                      {item.finalScore === null || item.finalScore === undefined ? "Needs review" : item.status}
                    </td>
                    <td data-label="SUBMITTED">{item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : ""}</td>
                    <td data-label="ACTIONS" className="teacher-list-actions">
                      <button type="button" onClick={() => navigate(`/teacher/results/review/${item.id}`)}>Review</button>
                    </td>
                  </tr>
                ))}
                {!filtered.length && <tr><td className="teacher-empty-row" colSpan={7}>No submissions match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="teacher-list-footer teacher-library-pagination">
            <span>Showing {filtered.length ? firstIndex + 1 : 0}–{firstIndex + pageResults.length} of {filtered.length} submissions</span>
            <nav aria-label="Results pagination">
              <button className="button" type="button" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); setSelectedResultId(""); }}>← Previous</button>
              <span>Page {currentPage} of {pageCount}</span>
              <button className="button" type="button" disabled={currentPage === pageCount} onClick={() => { setPage(currentPage + 1); setSelectedResultId(""); }}>Next →</button>
            </nav>
          </div>
        </div>
        <aside className="teacher-list-detail-panel">
          {selectedResult ? (
            <>
              <span className="teacher-detail-eyebrow">SUBMISSION DETAILS</span>
              <h2><Link className="title-link" to={`/teacher/results/review/${selectedResult.id}`}>{selectedResult.student}</Link></h2>
              <p className="muted">{selectedResult.problemTitle}</p>
              <dl className="teacher-list-detail-facts">
                <div><dt>Auto score</dt><dd>{selectedResult.autoScore}</dd></div>
                <div><dt>Final score</dt><dd>{selectedResult.finalScore !== null && selectedResult.finalScore !== undefined ? selectedResult.finalScore : "Not graded yet"}</dd></div>
                <div><dt>Status</dt><dd>{selectedResult.finalScore === null || selectedResult.finalScore === undefined ? "Needs review" : selectedResult.status}</dd></div>
                {selectedResult.feedback && <div><dt>Feedback</dt><dd>{selectedResult.feedback}</dd></div>}
              </dl>
              <button className="button primary teacher-list-detail-edit" type="button" onClick={() => navigate(`/teacher/results/review/${selectedResult.id}`)}>Review submission</button>
            </>
          ) : <p className="muted">Select a submission to view its details.</p>}
        </aside>
      </div>
    </section>
  );
}

export function ManualReviewPage() {
  const navigate = useNavigate();
  const { submissionId } = useParams();
  
  const { data: submission, loading, error, mutate: setSubmission } = useLoad(
    () => teacherService.getSubmission(submissionId!)
  );

  const [finalScore, setFinalScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saveError, setSaveError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (submission) {
      setFinalScore(submission.finalScore == null ? "" : `${submission.finalScore}`);
      setFeedback(submission.feedback || "");
    }
  }, [submission]);

  async function saveReview() {
    if (!finalScore.trim() || !submission) return;
    const numericScore = Number(finalScore.split("/")[0].trim());
    const max = submission.maxScore ?? 100;
    if (!Number.isFinite(numericScore) || numericScore < 0 || numericScore > max) {
      setSaveError(`Enter a score from 0 to ${max}.`);
      return;
    }
    setSaveError("");
    setIsSaving(true);
    try {
      const updated = await teacherService.updateSubmissionReview(submission.id, numericScore, feedback);
      setSubmission(updated);
      setDialogOpen(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save review.");
    } finally {
      setIsSaving(false);
    }
  }

  if (loading) return <div className="teacher-page"><Loading label="Loading submission…" /></div>;
  if (error || !submission) return <div className="teacher-page"><p className="teacher-state-error">Error loading submission.</p></div>;

  const attemptHistory = [
    { number: 1, score: submission.autoScore, submittedAt: submission.submittedAt, query: submission.query }
  ];
  const activeAttempt = attemptHistory[0];

  return (
    <section className="teacher-page teacher-review-page">
      <TeacherPageIntro
        title="Manual review"
        context={`${submission.student} / ${submission.problem} / ${submission.attempts} / Submission #${submission.id.substring(0, 8)}`}
      >
        <Link className="button" to="/teacher/results">Back to results</Link>
        <button className="button primary" type="button" onClick={saveReview} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save review"}
        </button>
      </TeacherPageIntro>
      <div className="teacher-divider" />

      <div className="teacher-review-layout">
        <div className="teacher-review-main">
          <div className="teacher-attempt-switcher">
            <span className="teacher-attempt-label">ATTEMPT</span>
            {attemptHistory.map((attempt) => (
              <button
                type="button"
                key={attempt.number}
                className={`teacher-attempt-pill${activeAttempt.number === attempt.number ? " active" : ""}`}
                aria-pressed={activeAttempt.number === attempt.number}
              >
                Attempt {attempt.number} · {attempt.score} / {submission.maxScore ?? 100}
              </button>
            ))}
          </div>
          <section className="teacher-review-code-section">
            <h2>Student SQL · submitted {activeAttempt.submittedAt}</h2>
            <ReviewSqlBlock label="Student SQL" query={activeAttempt.query} />
          </section>
          <section className="teacher-review-code-section">
            <h2>Reference SQL</h2>
            {submission.referenceSolution
              ? <ReviewSqlBlock label="Reference SQL" query={submission.referenceSolution} />
              : <p className="tiny muted">No reference solution provided</p>}
          </section>
          <p className="tiny muted">Per-test-case results are unavailable for this submission.</p>
        </div>
        <aside className="teacher-grading-panel">
          <TeacherSectionTitle title="Grading" />
          <strong className="teacher-test-summary">Evaluated by platform</strong>
          <p className="teacher-auto-score">Automatic score · {activeAttempt.score} / {submission.maxScore ?? 100}</p>
          <TeacherField label="FINAL SCORE">
            <input
              type="number"
              min="0"
              max={submission.maxScore ?? 100}
              value={finalScore}
              onChange={(event) => setFinalScore(event.target.value)}
              aria-label="Final score"
              placeholder={`0–${submission.maxScore ?? 100}`}
              inputMode="numeric"
            />
          </TeacherField>
          <TeacherField label="FEEDBACK">
            <textarea rows={3} value={feedback} onChange={(event) => setFeedback(event.target.value)} />
          </TeacherField>
          {saveError && <p className="teacher-state-failed" role="alert">{saveError}</p>}
          <div className="teacher-review-history">
            <TeacherSectionTitle title="Saved review" />
            {submission.finalScore !== null ? (
              <p className="tiny muted">
                Saved in database<br />
                Final Score: {submission.finalScore}<br />
                {submission.feedback && <>Feedback: {submission.feedback}</>}
              </p>
            ) : (
              <p className="tiny muted">No manual changes yet.<br />Your saved review will update the student's score.</p>
            )}
          </div>
        </aside>
      </div>
      {dialogOpen && (
        <Dialog title="Review saved" onClose={() => setDialogOpen(false)}>
          <p className="tiny">The score has been updated in the database.</p>
          <div className="teacher-dialog-actions">
            <button className="button primary" type="button" onClick={() => { setDialogOpen(false); navigate("/teacher/results"); }}>Continue</button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
