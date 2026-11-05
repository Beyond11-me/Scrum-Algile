import { SelectMenu } from "../../components/SelectMenu";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { studentApi } from "../../services/studentApi";
import { type Submission } from "../../data/models";
import { SubmissionDetails } from "../../components/SubmissionDetails";
import { useLoad } from "../../components/useLoad";
import { Empty, ErrorState, Loading, Status } from "../../components/ui";
import { selectOnKey } from "../../utils/selectOnKey";
import { submissionTimeLabel } from "../../utils/serverDateTime";

const SUBMISSION_PAGE_SIZE = 15;

export function SubmissionsPage() {
  const [selected, setSelected] = useState<Submission | null>(null);
  const [search, setSearch] = useState("");
  const [result, setResult] = useState("");
  const [source, setSource] = useState("");
  const [page, setPage] = useState(1);
  const desktopListRef = useRef<HTMLDivElement>(null);
  const mobileListRef = useRef<HTMLDivElement>(null);
  const { data, loading, error } = useLoad(
    () => studentApi.getSubmissions({ search, result, source }),
    [search, result, source],
  );
  
  const { data: problemsList } = useLoad(() => studentApi.getProblems({ includePrivate: true }), []);
  const pageCount = Math.max(1, Math.ceil((data?.length || 0) / SUBMISSION_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * SUBMISSION_PAGE_SIZE;
  const pageSubmissions = (data || []).slice(firstIndex, firstIndex + SUBMISSION_PAGE_SIZE);
  useEffect(() => {
    setPage(1);
  }, [search, source, result]);
  useEffect(() => {
    desktopListRef.current?.scrollTo({ top: 0 });
    mobileListRef.current?.scrollTo({ top: 0 });
  }, [currentPage, search, source, result]);
  useEffect(() => {
    const visible = (data || []).slice(firstIndex, firstIndex + SUBMISSION_PAGE_SIZE);
    setSelected((previous) => visible.find((submission: Submission) => submission.id === previous?.id) || visible[0] || null);
  }, [data, firstIndex]);
  return (
    <section className="page submissions-page compact-tables-page compact-student-submissions">
      <h1 className="sr-only">Submissions</h1>
      <div className="submissions-split">
      <div className="submissions-list-column">
      <div className="filters submissions-filters">
        <label className="field search-field">
          Search
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SQL problems…"
          />
        </label>
        <label className="field">
          Source
          <SelectMenu value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All sources</option>
            {["Practice", "Assignments", "Contests"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </SelectMenu>
        </label>
        <label className="field">
          Result
          <SelectMenu value={result} onChange={(e) => setResult(e.target.value)}>
            <option value="">All results</option>
            {[
              "Accepted",
              "Wrong Answer",
              "Runtime Error",
              "Time Limit Exceeded",
              "Rejected",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </SelectMenu>
        </label>
      </div>
      <div className="submissions-results-frame">
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorState title="Could not load submissions" message={error} onRetry={() => window.location.reload()} />
      ) : !data?.length ? (
        <Empty title="No submissions found">
          Your attempts will appear here. Try changing the filters or{" "}
          <Link to="/assignments">open an assignment</Link>.
        </Empty>
      ) : (
        <>
          <div
            className="table-scroll submissions-desktop"
            ref={desktopListRef}
            aria-busy={loading}
            tabIndex={0}
            aria-label="Submission history"
          >
            <table className="submissions-table">
              <colgroup><col style={{ width: "40%" }} /><col style={{ width: "23%" }} /><col style={{ width: "15%" }} /><col style={{ width: "22%" }} /></colgroup>
              <thead>
                <tr>
                  <th>SQL problem</th>
                  <th>Source</th>
                  <th>Result</th>
                  <th>Submitted ↓</th>
                </tr>
              </thead>
              <tbody>
                {pageSubmissions.map((s: Submission) => {
                  const p =
                    problemsList?.find((p: any) => p.id === s.problemId) || {
                      id: s.problemId,
                      number: "?",
                      title: "Unknown problem",
                    };
                  return (
                    <tr key={s.id} className={selected?.id === s.id ? "selected" : undefined} tabIndex={0} aria-current={selected?.id === s.id ? "true" : undefined} onClick={() => setSelected(s)} onKeyDown={(event) => selectOnKey(event, () => setSelected(s))}>
                      <td>
                        <Link className="submission-problem-link" to={"/workspace/" + p.id}>
                          {p.number}. {p.title}
                        </Link>
                      </td>
                      <td>
                        {s.source}
                        <small>{s.contextTitle || s.context}</small>
                      </td>
                      <td>
                        <Status value={s.result} />
                      </td>
                      <td className="muted">
                        {submissionTimeLabel(s.submittedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div
            className="submission-mobile-list"
            ref={mobileListRef}
            aria-busy={loading}
            aria-label="Submission history"
          >
            {pageSubmissions.map((s: Submission) => {
              const p =
                problemsList?.find((p: any) => p.id === s.problemId) || {
                  id: s.problemId,
                  number: "?",
                  title: "Unknown problem",
                };
              return (
                <article
                  className={`submission-mobile-row${selected?.id === s.id ? " selected" : ""}`}
                  tabIndex={0}
                  aria-current={selected?.id === s.id ? "true" : undefined}
                  key={s.id}
                  onClick={() => setSelected(s)}
                  onKeyDown={(event) => selectOnKey(event, () => setSelected(s))}
                >
                  <span className="submission-mobile-main">
                    <span className="submission-mobile-problem">
                      <b>
                        <Link className="title-link" to={"/workspace/" + p.id}>{p.number}. {p.title}</Link>
                      </b>
                      <small>{s.source} · {s.contextTitle || s.context}</small>
                    </span>
                    <Status value={s.result} />
                  </span>
                  <span className="submission-mobile-meta">
                    <small>{submissionTimeLabel(s.submittedAt)}</small>
                  </span>
                </article>
              );
            })}
          </div>
          <div className="submissions-pagination-footer">
            <p aria-live="polite">Showing {firstIndex + 1}–{Math.min(firstIndex + SUBMISSION_PAGE_SIZE, data.length)} of {data.length} submissions · Newest first</p>
            <nav className="submissions-pagination" aria-label="Submission pages">
              <button type="button" className="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>← Previous</button>
              <span>Page {currentPage} of {pageCount}</span>
              <button type="button" className="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next →</button>
            </nav>
          </div>
        </>
      )}
      </div>
      </div>
      <aside className="submission-inline-panel" aria-label="Selected submission details">
      {selected ? (
        <SubmissionDetails
          key={selected.id}
          inline
          submission={selected}
          problem={
            problemsList?.find((p: any) => p.id === selected.problemId) || {
              number: "?",
              title: "Unknown problem",
              id: selected.problemId,
            }
          }
          onClose={() => setSelected(null)}
        />
      ) : (
        <Empty title="Submission details">Select a submission to view its result and submitted SQL.</Empty>
      )}
      </aside>
      </div>
    </section>
  );
}
