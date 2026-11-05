import { SelectMenu } from "../../components/SelectMenu";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight, Search } from "lucide-react";
import { ErrorState, Loading } from "../../components/ui";
import { useLoad } from "../../components/useLoad";
import { studentApi } from "../../services/studentApi";
import type { Progress } from "../../data/models";

type Difficulty = "Easy" | "Medium" | "Hard";
type PracticeProblem = {
  id: string;
  number: string;
  title: string;
  topics?: string[];
  difficulty: Difficulty;
  progress: Progress;
  acceptance?: number;
};

const DIFFICULTIES: Difficulty[] = ["Easy", "Medium", "Hard"];
const DIFFICULTY_RANK: Record<string, number> = { Easy: 0, Medium: 1, Hard: 2 };
const STATUSES: [string, string][] = [
  ["all", "All"],
  ["Not started", "Not started"],
  ["In progress", "In progress"],
  ["Solved", "Solved"],
];
const COLLECTIONS: [string, string][] = [["all", "All problems"], ["saved", "Saved"]];
const SORTS: [string, string][] = [["number", "Number"], ["difficulty", "Difficulty"], ["title", "Title A–Z"]];
const UNCATEGORIZED = "Uncategorized";

function primaryTopic(problem: PracticeProblem) {
  return problem.topics?.[0] || UNCATEGORIZED;
}

function compareNumber(a: PracticeProblem, b: PracticeProblem) {
  return a.number.localeCompare(b.number, undefined, { numeric: true });
}

function listParam(params: URLSearchParams, key: string) {
  return (params.get(key) || "").split(",").filter(Boolean);
}

export function ProgressIcon({ value }: { value: Progress }) {
  if (value === "Solved")
    return (
      <svg className="progress-icon solved" width="20" height="20" viewBox="0 0 24 24" role="img" aria-label="Solved">
        <circle cx="12" cy="12" r="10" fill="currentColor" />
        <path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="var(--surface)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (value === "In progress")
    return (
      <svg className="progress-icon tried" width="20" height="20" viewBox="0 0 24 24" role="img" aria-label="In progress">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
      </svg>
    );
  return (
    <svg className="progress-icon todo" width="20" height="20" viewBox="0 0 24 24" role="img" aria-label="Not started">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function DifficultyBadge({ value }: { value: string }) {
  return <span className={`difficulty-badge ${value.toLowerCase()}`}>{value}</span>;
}

export function ProblemListPage() {
  const [params, setParams] = useSearchParams();
  const { data, loading, error, mutate } = useLoad(async () => {
    const [problems, preferences] = await Promise.all([
      studentApi.getProblems() as Promise<PracticeProblem[]>,
      studentApi.getPreferences().catch(() => ({ favorites: [] as string[] })),
    ]);
    return { problems, favorites: (preferences?.favorites || []) as string[] };
  }, []);

  const collection = params.get("collection") === "saved" ? "saved" : "all";
  const q = params.get("q") || "";
  const difficulties = listParam(params, "difficulty");
  const topics = listParam(params, "topic");
  const status = params.get("status") || "all";
  const view = params.get("view") === "list" ? "list" : "grouped";
  const sort = params.get("sort") || "number";
  const closed = listParam(params, "closed");

  function update(changes: Record<string, string | string[] | null>) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(changes)) {
        const text = Array.isArray(value) ? value.join(",") : value;
        if (!text || (key === "collection" && text === "all") || (key === "status" && text === "all") ||
          (key === "view" && text === "grouped") || (key === "sort" && text === "number")) next.delete(key);
        else next.set(key, text);
      }
      return next;
    }, { replace: true });
  }
  function toggle(key: string, current: string[], value: string) {
    update({ [key]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] });
  }

  const derived = useMemo(() => {
    const all = data?.problems || [];
    const favorites = new Set(data?.favorites || []);
    const topicNames: string[] = [];
    for (const problem of [...all].sort(compareNumber)) {
      for (const topic of problem.topics?.length ? problem.topics : [UNCATEGORIZED]) {
        if (!topicNames.includes(topic)) topicNames.push(topic);
      }
    }
    const inCollection = all.filter((p) => collection === "all" || favorites.has(p.id));
    const query = q.trim().toLowerCase();
    const base = inCollection.filter((p) =>
      (!query || p.title.toLowerCase().includes(query) || p.number.toLowerCase().includes(query)) &&
      (!difficulties.length || difficulties.includes(p.difficulty)) &&
      (!topics.length || (p.topics?.length ? p.topics : [UNCATEGORIZED]).some((t) => topics.includes(t))));
    const shown = base
      .filter((p) => status === "all" || p.progress === status)
      .sort((a, b) =>
        sort === "difficulty"
          ? (DIFFICULTY_RANK[a.difficulty] ?? 3) - (DIFFICULTY_RANK[b.difficulty] ?? 3) || compareNumber(a, b)
          : sort === "title"
            ? a.title.localeCompare(b.title, "vi")
            : compareNumber(a, b));
    const groups = view === "grouped"
      ? topicNames
          .map((name) => {
            const total = inCollection.filter((p) => primaryTopic(p) === name);
            return {
              name,
              rows: shown.filter((p) => primaryTopic(p) === name),
              progress: `${total.filter((p) => p.progress === "Solved").length}/${total.length}`,
            };
          })
          .filter((group) => group.rows.length > 0)
      : shown.length ? [{ name: "", rows: shown, progress: "" }] : [];
    return {
      all,
      topicNames,
      base,
      shown,
      groups,
      collectionCounts: { all: all.length, saved: all.filter((p) => favorites.has(p.id)).length } as Record<string, number>,
    };
  }, [data, collection, q, difficulties.join(), topics.join(), status, view, sort]);

  const hasFilters = !!q.trim() || difficulties.length > 0 || topics.length > 0 || status !== "all";
  const clearFilters = () => update({ q: null, difficulty: null, topic: null, status: null });

  if (loading) return <Loading label="Loading problems…" />;
  if (error || !data) return <ErrorState title="Problems unavailable" message={error || "Problems could not be loaded."} onRetry={() => void mutate()} />;

  const solved = derived.all.filter((p) => p.progress === "Solved").length;

  return (
    <div className="practice-page">
      <div className="practice-heading">
        <div>
          <h1>SQL problems</h1>
          <p>Practise from basic SELECT to window functions, graded on real data.</p>
        </div>
        <p className="practice-solved">Solved <b>{solved}/{derived.all.length}</b></p>
      </div>

      <div className="practice-collections" role="group" aria-label="Problem collection">
        {COLLECTIONS.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={collection === id} className={collection === id ? "active" : ""} onClick={() => update({ collection: id })}>
            {label} <span>{derived.collectionCounts[id]}</span>
          </button>
        ))}
      </div>

      <div className="practice-layout">
        <aside className="practice-filters" aria-label="Filters">
          <div className="practice-filter-group">
            <label htmlFor="practice-search">Search</label>
            <div className="practice-search">
              <Search size={16} aria-hidden="true" />
              <input id="practice-search" type="search" value={q} placeholder="Title or number…" onChange={(event) => update({ q: event.target.value })} />
            </div>
          </div>

          <fieldset className="practice-filter-group">
            <legend>Difficulty</legend>
            <div className="practice-chips">
              {DIFFICULTIES.map((d) => (
                <button key={d} type="button" aria-pressed={difficulties.includes(d)} onClick={() => toggle("difficulty", difficulties, d)}>{d}</button>
              ))}
            </div>
          </fieldset>

          <fieldset className="practice-filter-group">
            <legend>Status</legend>
            <div className="practice-status-list">
              {STATUSES.map(([id, label]) => (
                <button key={id} type="button" aria-pressed={status === id} onClick={() => update({ status: id })}>
                  <span>{label}</span>
                  <span className="count">{derived.base.filter((p) => id === "all" || p.progress === id).length}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {derived.topicNames.length > 0 && (
            <fieldset className="practice-filter-group">
              <legend>Topic</legend>
              <div className="practice-chips">
                {derived.topicNames.map((t) => (
                  <button key={t} type="button" aria-pressed={topics.includes(t)} onClick={() => toggle("topic", topics, t)}>{t}</button>
                ))}
              </div>
            </fieldset>
          )}

          {hasFilters && <button type="button" className="button practice-clear" onClick={clearFilters}>Clear filters</button>}
        </aside>

        <section className="practice-results" aria-label="Problem list">
          <div className="practice-toolbar">
            <p><b>{derived.shown.length}</b> problems</p>
            <div className="practice-toolbar-controls">
              <div className="practice-segmented" role="group" aria-label="View">
                <button type="button" aria-pressed={view === "grouped"} onClick={() => update({ view: "grouped" })}>By topic</button>
                <button type="button" aria-pressed={view === "list"} onClick={() => update({ view: "list" })}>List</button>
              </div>
              <label htmlFor="practice-sort">Sort</label>
              <SelectMenu id="practice-sort" value={sort} onChange={(event) => update({ sort: event.target.value })}>
                {SORTS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </SelectMenu>
            </div>
          </div>

          {derived.shown.length === 0 && (
            <div className="practice-card practice-empty">
              <p>{derived.all.length ? "No problems match these filters" : "No practice problems yet"}</p>
              {hasFilters && <button type="button" className="button" onClick={clearFilters}>Clear filters</button>}
              {collection === "saved" && !hasFilters && <small className="muted">Save problems from the workspace to see them here.</small>}
            </div>
          )}

          {derived.groups.map((group) => {
            const open = !group.name || !closed.includes(group.name);
            return (
              <div className="practice-card" key={group.name || "all"}>
                {group.name && (
                  <button type="button" className="practice-group-header" aria-expanded={open} onClick={() => toggle("closed", closed, group.name)}>
                    <span>
                      <ChevronRight size={16} aria-hidden="true" className={open ? "open" : ""} />
                      <b>{group.name}</b>
                    </span>
                    <span className="count">{group.progress}</span>
                  </button>
                )}
                {open && (
                  <div className="practice-table-scroll">
                    <table className="practice-table">
                      <thead>
                        <tr>
                          <th scope="col" className="col-status">Status</th>
                          <th scope="col">Problem</th>
                          <th scope="col">Topic</th>
                          <th scope="col" className="col-acceptance">Acceptance</th>
                          <th scope="col" className="col-difficulty">Difficulty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((p) => (
                          <tr key={p.id}>
                            <td className="col-status"><ProgressIcon value={p.progress} /></td>
                            <td>
                              <Link className="practice-problem-link" to={`/workspace/${p.id}`}>
                                <span className="number">{p.number}</span>
                                <span>{p.title}</span>
                              </Link>
                            </td>
                            <td className="topic">{(p.topics?.length ? p.topics : [UNCATEGORIZED]).join(", ")}</td>
                            <td className="col-acceptance count">{p.acceptance ?? 0}%</td>
                            <td className="col-difficulty"><DifficultyBadge value={p.difficulty} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
