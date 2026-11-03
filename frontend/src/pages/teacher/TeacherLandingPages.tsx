import { useMemo, useState, useEffect, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ErrorState, Loading } from "../../components/ui";
import { teacherService } from "../../services/teacherService";
import { TeacherField } from "./TeacherPageParts";

type ProblemRow = {
  id: string;
  number: string;
  title: string;
  difficulty: "Easy" | "Medium" | "Hard" | string;
  topics: string;
  visibility: "Public" | "Private" | string;
  database: string;
};

export function ProblemLibraryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [problems, setProblemState] = useState<ProblemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await teacherService.getAllProblems();
        const mapped = data.map((p: any) => ({
          id: p.id,
          number: p.number,
          title: p.title,
          difficulty: p.difficulty,
          topics: (p.topics && p.topics.length > 0) ? p.topics.join(" · ") : (p.topic || ""),
          visibility: p.practiceListed ? "Public" : "Private",
          database: p.databaseType || "SQL Server",
        }));
        setProblemState(mapped);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Could not load problems.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("All levels");
  const [topic, setTopic] = useState("All topics");
  const [visibility, setVisibility] = useState(() => searchParams.get("visibility") || "All");
  const [selectedProblemId, setSelectedProblemId] = useState("");
  const [page, setPage] = useState(1);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => problems.filter((problem) =>
    `${problem.title} ${problem.topics}`.toLowerCase().includes(search.toLowerCase()) &&
    (difficulty === "All levels" || problem.difficulty === difficulty) &&
    (topic === "All topics" || problem.topics.toLowerCase().includes(topic.toLowerCase())) &&
    (visibility === "All" || problem.visibility === visibility),
  ), [problems, search, difficulty, topic, visibility]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / 15));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * 15;
  const pageProblems = filtered.slice(firstIndex, firstIndex + 15);
  const selectedProblem = pageProblems.find((problem) => problem.id === selectedProblemId) || pageProblems[0] || null;

  useEffect(() => {
    setPage(1);
    setSelectedProblemId("");
  }, [search, difficulty, topic, visibility]);
  useEffect(() => {
    tableScrollRef.current?.scrollTo({ top: 0 });
  }, [currentPage, search, difficulty, topic, visibility]);
  const topicOptions = [...new Set(problems.flatMap((problem) => problem.topics.split(" · ").map((topic) => topic.trim()).filter(Boolean)))].sort();

  return (
    <section className="teacher-page teacher-library-page compact-teacher-library">
      <h1 className="sr-only">Problem library</h1>
      {loading ? (
        <Loading label="Loading problems…" />
      ) : loadError ? (
        <ErrorState title="Could not load problems" message={loadError} onRetry={() => window.location.reload()} />
      ) : problems.length === 0 ? (
        <TeacherEmptyState
          title="No problems yet"
          description="Create your first SQL problem with a schema, seed data and a reference solution."
          primaryLabel="New problem"
          primaryTo="/teacher/problems/new"
          secondaryLabel="Browse public problems"
          secondaryTo="/teacher/problems?visibility=Public"
        />
      ) : (
        <>
          <div className="teacher-list-filters teacher-problem-filters">
            <TeacherField label="SEARCH"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title or topic…" /></TeacherField>
            <TeacherField label="DIFFICULTY"><select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option>All levels</option><option>Easy</option><option>Medium</option><option>Hard</option></select></TeacherField>
            <TeacherField label="TOPIC"><select value={topic} onChange={(event) => setTopic(event.target.value)}><option>All topics</option>{topicOptions.map((item) => <option key={item}>{item}</option>)}</select></TeacherField>
            <TeacherField label="VISIBILITY"><select value={visibility} onChange={(event) => setVisibility(event.target.value)}><option>All</option><option>Public</option><option>Private</option></select></TeacherField>
            <button className="button primary teacher-problem-new" type="button" onClick={() => navigate("/teacher/problems/new")}>New problem</button>
          </div>
          <div className="teacher-list-detail-layout">
            <div className="teacher-list-detail-main">
              <div ref={tableScrollRef} className="teacher-table-scroll teacher-list-table-scroll sticky-list-table-wrap">
                <table className="teacher-table teacher-library-table sticky-list-table">
                  <thead><tr><th>ID</th><th>PROBLEM</th><th>DIFFICULTY</th><th>TOPICS</th><th>VISIBILITY</th></tr></thead>
                  <tbody>{pageProblems.map((problem) => (
                    <tr
                      className={`teacher-selectable-list-row${selectedProblem?.id === problem.id ? " is-selected" : ""}`}
                      key={problem.id}
                      onClick={() => setSelectedProblemId(problem.id)}
                    >
                      <td data-label="ID">{problem.number}</td>
                      <td data-label="PROBLEM"><button className="teacher-selectable-row-title teacher-library-title" type="button" aria-label={`Show details for ${problem.title}`} onClick={(event) => { event.stopPropagation(); setSelectedProblemId(problem.id); }}>{problem.title}</button></td>
                      <td data-label="DIFFICULTY">{problem.difficulty}</td>
                      <td data-label="TOPICS">{problem.topics}</td>
                      <td data-label="VISIBILITY">{problem.visibility}</td>
                    </tr>
                  ))}
                  {!filtered.length && <tr><td className="teacher-empty-row" colSpan={5}>No problems match these filters.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="teacher-list-footer teacher-library-pagination">
                <span>Showing {filtered.length ? firstIndex + 1 : 0}–{firstIndex + pageProblems.length} of {filtered.length} problems</span>
                <nav aria-label="Problem library pagination">
                  <button className="button" type="button" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); setSelectedProblemId(""); }}>← Previous</button>
                  <span>Page {currentPage} of {pageCount}</span>
                  <button className="button" type="button" disabled={currentPage === pageCount} onClick={() => { setPage(currentPage + 1); setSelectedProblemId(""); }}>Next →</button>
                </nav>
              </div>
            </div>
            <aside className="teacher-list-detail-panel teacher-problem-details-panel">
              {selectedProblem ? (
                <>
                  <div className="teacher-problem-detail-body">
                    <span className="teacher-detail-eyebrow">PROBLEM DETAILS</span>
                    <h2>{selectedProblem.number} · {selectedProblem.title}</h2>
                    <p className="muted">{selectedProblem.topics}</p>
                    <dl className="teacher-list-detail-facts">
                      <div><dt>Difficulty</dt><dd>{selectedProblem.difficulty}</dd></div>
                      <div><dt>Visibility</dt><dd>{selectedProblem.visibility}</dd></div>
                      <div><dt>Database</dt><dd>{selectedProblem.database}</dd></div>
                    </dl>
                  </div>
                  <div className="teacher-list-detail-actions">
                    <Link className="button primary" to={selectedProblem.id === "new" ? "/teacher/problems/new" : `/teacher/problems/${selectedProblem.id}/edit`}>Edit</Link>
                  </div>
                </>
              ) : <p className="muted">Select a problem to view its details.</p>}
            </aside>
          </div>
        </>
      )}
    </section>
  );
}

function TeacherEmptyState({ title, description, primaryLabel, primaryTo, secondaryLabel, secondaryTo }: { title: string; description: string; primaryLabel: string; primaryTo: string; secondaryLabel: string; secondaryTo: string }) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="teacher-empty-actions">
        <Link className="button primary" to={primaryTo}>{primaryLabel}</Link>
        <Link className="button" to={secondaryTo}>{secondaryLabel}</Link>
      </div>
    </div>
  );
}
