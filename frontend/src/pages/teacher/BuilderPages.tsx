import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Dialog, Loading } from "../../components/ui";
import { teacherService } from "../../services/teacherService";
import { TeacherField, TeacherSectionTitle } from "./TeacherPageParts";
import { toDateTimeLocal } from "../../utils/serverDateTime";

type BuilderProblem = { id: string; points: number };
type BuilderDraft = {
  title: string;
  classIds: string[];
  instructions: string;
  opens: string;
  closes: string;
  problems: BuilderProblem[];
  studentOptions: { hints: boolean; comments: boolean; aiAllowed: boolean };
  published: boolean;
};

const defaultDraft: BuilderDraft = {
  title: "",
  classIds: [],
  instructions: "",
  opens: "",
  closes: "",
  problems: [],
  studentOptions: { hints: true, comments: true, aiAllowed: true },
  published: false,
};

const MULTIPLE_CLASSES = "__multiple__";

function previewDate(value: string) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Not set";
}

function AssignmentPreview({
  draft,
  classes,
  problems,
}: {
  draft: BuilderDraft;
  classes: { id: string; course?: string }[];
  problems: { id: string; title: string; topic?: string; difficulty?: string }[];
}) {
  const [selectedClassId, setSelectedClassId] = useState(draft.classIds[0] || "");
  const classId = draft.classIds.includes(selectedClassId) ? selectedClassId : draft.classIds[0];
  const classLabel = classes.find((item) => item.id === classId)?.course || classId || "No class selected";
  const totalPoints = draft.problems.reduce((sum, item) => sum + item.points, 0);
  const title = draft.title.trim() || "Untitled assignment";

  return (
    <div className="teacher-activity-preview">
      <div className="teacher-preview-mode-bar">
        <span>STUDENT PREVIEW · Draft content is not published</span>
        {draft.classIds.length > 1 && (
          <label>
            View as class
            <select value={classId} onChange={(event) => setSelectedClassId(event.target.value)}>
              {draft.classIds.map((id) => (
                <option value={id} key={id}>
                  {classes.find((item) => item.id === id)?.course || id}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <header className="assignment-work-heading">
        <h1>{title}</h1>
        <p>{classLabel}</p>
      </header>
      <dl className="assignment-summary">
        <div>
          <dt>DUE DATE</dt>
          <dd>{previewDate(draft.closes)}</dd>
        </div>
        <div>
          <dt>PROBLEMS</dt>
          <dd>
            {draft.problems.length} SQL problem{draft.problems.length === 1 ? "" : "s"}
          </dd>
        </div>
        <div>
          <dt>POINTS</dt>
          <dd>{totalPoints}</dd>
        </div>
        <div>
          <dt>STATUS</dt>
          <dd>Not started</dd>
        </div>
      </dl>
      <section className="assignment-instructions">
        <h2>Instructions</h2>
        <p>{draft.instructions || "No instructions yet."}</p>
      </section>
      <section className="assignment-problems-card">
        <div className="section-heading">
          <h2>Problems</h2>
          <small className="muted">
            {draft.problems.length} problem{draft.problems.length === 1 ? "" : "s"}
          </small>
        </div>
        {draft.problems.map((item, index) => {
          const problem = problems.find((row) => row.id === item.id);
          return (
            <div className="assignment-problem-row" key={item.id}>
              <span className="assignment-problem-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3>{problem?.title || item.id}</h3>
                <p>
                  {problem?.topic || "SQL"} · {problem?.difficulty || "Problem"}
                </p>
              </div>
              <span className="assignment-problem-status">{item.points} points</span>
            </div>
          );
        })}
        {!draft.problems.length && <p className="muted">No problems selected yet.</p>}
      </section>
    </div>
  );
}

export function AssignmentBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isNew = !id || id === "new";
  const duplicateFromId = isNew ? searchParams.get("from") : null;

  const [draft, setDraft] = useState<BuilderDraft | null>(null);
  const [duplicateNotice, setDuplicateNotice] = useState("");
  const [availableClasses, setAvailableClasses] = useState<any[]>([]);
  const [allProblems, setAllProblems] = useState<any[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [classesError, setClassesError] = useState("");
  const [problemsLoading, setProblemsLoading] = useState(true);
  const [problemsError, setProblemsError] = useState("");
  const [draftError, setDraftError] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveState, setSaveState] = useState("");
  const [alertText, setAlertText] = useState("");
  const [addProblemOpen, setAddProblemOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [eligibleStudents, setEligibleStudents] = useState<number | null>(null);

  useEffect(() => {
    async function fetchClasses() {
      try {
        const data = await teacherService.getClasses();
        const activeClasses = data.filter((c: any) => c.status === "Active");
        setAvailableClasses(activeClasses);
      } catch (e) {
        setClassesError(e instanceof Error ? e.message : "Could not load classes.");
      } finally {
        setClassesLoading(false);
      }
    }
    fetchClasses();

    const problemsRequest = teacherService.getAllProblems();

    async function fetchProblems() {
      try {
        const data = await problemsRequest;
        setAllProblems(data);
      } catch (e) {
        setProblemsError(e instanceof Error ? e.message : "Could not load problems.");
      } finally {
        setProblemsLoading(false);
      }
    }
    fetchProblems();

    setDuplicateNotice("");

    if (duplicateFromId) {
      // Only the problems carry over. Saving creates a brand-new assignment.
      const sourceId = duplicateFromId;
      async function fetchDuplicateSource() {
        try {
          const [source, library] = await Promise.all([
            teacherService.getAssignment(sourceId),
            problemsRequest,
          ]);
          const sourceProblems: BuilderProblem[] = source.problemList || [];
          const problems = sourceProblems.filter((item) =>
            library.some((problem) => problem.id === item.id),
          );
          const skipped = sourceProblems.length - problems.length;
          setDraft({ ...defaultDraft, problems });
          setDuplicateNotice(
            `Duplicated from "${source.title}". Problems and points were copied. Add a title, class and schedule, then save.` +
              (skipped
                ? ` ${skipped} problem${skipped === 1 ? " is" : "s are"} no longer in the library and ${skipped === 1 ? "was" : "were"} left out.`
                : ""),
          );
        } catch (e) {
          setDraftError(e instanceof Error ? e.message : "Could not load this assignment.");
        }
      }
      fetchDuplicateSource();
      return;
    }

    if (isNew) {
      setDraft(defaultDraft);
      return;
    }

    async function fetchAssignment() {
      try {
        const data = await teacherService.getAssignment(id!);
        setDraft({
          title: data.title,
          classIds: data.classIds || [],
          instructions: data.instructions || "",
          opens: toDateTimeLocal(data.opens),
          closes: toDateTimeLocal(data.closes),
          problems: data.problemList || [],
          studentOptions: data.studentOptions || defaultDraft.studentOptions,
          published: data.published,
        });
      } catch (e) {
        setDraftError(e instanceof Error ? e.message : "Could not load this assignment.");
      }
    }
    fetchAssignment();
  }, [id, isNew, duplicateFromId]);

  const selectedIds = draft?.classIds.join("|") || "";
  useEffect(() => {
    if (!selectedIds) {
      setEligibleStudents(0);
      return;
    }
    let active = true;
    setEligibleStudents(null);
    teacherService
      .getAudienceCount("classes", selectedIds.split("|"))
      .then((result) => {
        if (active) setEligibleStudents(result.eligibleStudents);
      })
      .catch(() => {
        if (active) setEligibleStudents(null);
      });
    return () => {
      active = false;
    };
  }, [selectedIds]);

  if (!draft) {
    return (
      <div className="teacher-page">
        {draftError ? (
          <div className="empty-state" role="alert">
            {draftError}
          </div>
        ) : (
          <Loading label="Loading builder…" />
        )}
      </div>
    );
  }

  function update<K extends keyof BuilderDraft>(field: K, value: BuilderDraft[K]) {
    setDraft((current) => (current ? { ...current, [field]: value } : null));
    setSaveState("Unsaved changes");
    setAlertText("");
  }

  const scheduleValid =
    !!draft.opens && !!draft.closes && new Date(draft.opens) < new Date(draft.closes);
  const readyToPublish =
    !!draft.title.trim() &&
    draft.classIds.length > 0 &&
    draft.problems.length > 0 &&
    draft.problems.every((item) => item.points > 0) &&
    scheduleValid;

  async function saveToServer(isPublished: boolean) {
    if (saveBusy) return;
    if (!draft || !draft.title.trim() || !scheduleValid) {
      setAlertText("Add a title and valid start and end times before saving.");
      return;
    }
    if (isPublished && !readyToPublish) {
      setAlertText("Select a class, add scored problems, and check the schedule before publishing.");
      return;
    }

    setSaveBusy(true);
    setSaveState("Saving to server...");
    try {
      const payload = {
        title: draft.title,
        isContest: false,
        classIds: draft.classIds,
        audienceType: "classes" as const,
        shortDescription: "",
        description: "",
        rules: "",
        instructions: draft.instructions,
        opens: draft.opens ? new Date(draft.opens).toISOString() : null,
        closes: draft.closes ? new Date(draft.closes).toISOString() : null,
        problems: draft.problems,
        studentOptions: {
          hints: draft.studentOptions.hints,
          comments: draft.studentOptions.comments,
          aiAllowed: draft.studentOptions.aiAllowed,
        },
        published: isPublished,
      };

      if (isNew) {
        await teacherService.createAssignment(payload);
      } else {
        await teacherService.updateAssignment(id!, payload);
      }

      setDraft({ ...draft, published: isPublished });
      setSaveState("All changes saved");
      setAlertText(isPublished ? "Successfully published." : "Draft saved successfully.");

      if (isNew) {
        navigate("/teacher/assignments");
      }
    } catch (e) {
      setSaveState(e instanceof Error ? e.message : "Could not save to server.");
    } finally {
      setSaveBusy(false);
    }
  }

  function addProblem(problemId: string) {
    if (!draft!.problems.some((item) => item.id === problemId)) {
      update("problems", [...draft!.problems, { id: problemId, points: 10 }]);
    }
  }

  const availableProblems = allProblems.filter(
    (problem) => !draft!.problems.some((item) => item.id === problem.id),
  );

  // Older assignments can still have several classes. Keep them visible and
  // untouched until the lecturer picks a single class to replace them.
  const hasMultipleClasses = draft.classIds.length > 1;
  const classOptions = availableClasses.map((item) => item.id as string);
  if (draft.classIds.length === 1 && !classOptions.includes(draft.classIds[0])) {
    classOptions.unshift(draft.classIds[0]);
  }

  return (
    <section className="teacher-page teacher-builder-page">
      <div className="teacher-builder-layout">
        <section className="teacher-builder-main">
          <div className="teacher-builder-setup">
            <TeacherSectionTitle title="Assignment setup" />
            {duplicateNotice && (
              <p className="teacher-builder-notice" role="status">
                {duplicateNotice}
              </p>
            )}
            <TeacherField label="TITLE">
              <input
                value={draft.title}
                onChange={(event) => update("title", event.target.value)}
                placeholder="e.g. Bài thực hành 01: SQL cơ bản"
              />
            </TeacherField>
            <TeacherField label="CLASS">
              <select
                value={hasMultipleClasses ? MULTIPLE_CLASSES : draft.classIds[0] || ""}
                disabled={classesLoading}
                onChange={(event) =>
                  update("classIds", event.target.value ? [event.target.value] : [])
                }
              >
                <option value="">
                  {classesLoading
                    ? "Loading classes…"
                    : classOptions.length
                      ? "Select a class"
                      : "No classes available"}
                </option>
                {hasMultipleClasses && (
                  <option value={MULTIPLE_CLASSES} disabled>
                    {draft.classIds.join(", ")}
                  </option>
                )}
                {classOptions.map((classId) => (
                  <option value={classId} key={classId}>
                    {classId}
                  </option>
                ))}
              </select>
              {classesError && (
                <small className="teacher-state-failed" role="alert">
                  {classesError}
                </small>
              )}
            </TeacherField>
            <TeacherField label="ASSIGNED TO">
              <div className="teacher-readonly-field">
                {`${draft.classIds.length} ${draft.classIds.length === 1 ? "class" : "classes"}`}
                {eligibleStudents !== null
                  ? ` · ${eligibleStudents} eligible student${eligibleStudents === 1 ? "" : "s"}`
                  : " · student count unavailable"}
              </div>
            </TeacherField>
            <TeacherField label="INSTRUCTIONS">
              <textarea
                rows={4}
                value={draft.instructions}
                onChange={(event) => update("instructions", event.target.value)}
                placeholder="Instructions or guidelines for students..."
              />
            </TeacherField>
          </div>

          <div className="teacher-builder-problems">
            <TeacherSectionTitle title="Problems & points" />
            {problemsError && (
              <p className="teacher-state-failed" role="alert">
                {problemsError}
              </p>
            )}
            <div className="teacher-table-scroll">
              <table className="teacher-table teacher-problem-points-table">
                <thead>
                  <tr>
                    <th>Order / problem</th>
                    <th>Difficulty</th>
                    <th>Points / order</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.problems.map((item, index) => {
                    const problem = allProblems.find((row) => row.id === item.id);
                    if (!problem) return null;
                    return (
                      <tr key={item.id}>
                        <td data-label="Order / problem">
                          <span className="teacher-problem-order">
                            {String(index + 1).padStart(2, "0")}
                          </span>
                          {problem.title}
                        </td>
                        <td data-label="Difficulty">{problem.difficulty}</td>
                        <td data-label="Points / order" className="builder-points-actions">
                          <input
                            type="number"
                            min="1"
                            aria-label={`Points for ${problem.title}`}
                            value={item.points}
                            onChange={(event) =>
                              update(
                                "problems",
                                draft.problems.map((row) =>
                                  row.id === item.id
                                    ? { ...row, points: Number(event.target.value) }
                                    : row,
                                ),
                              )
                            }
                          />
                          <button
                            type="button"
                            aria-label={`Move ${problem.title} up`}
                            disabled={index === 0}
                            onClick={() => {
                              const next = [...draft.problems];
                              [next[index - 1], next[index]] = [next[index], next[index - 1]];
                              update("problems", next);
                            }}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            aria-label={`Move ${problem.title} down`}
                            disabled={index === draft.problems.length - 1}
                            onClick={() => {
                              const next = [...draft.problems];
                              [next[index], next[index + 1]] = [next[index + 1], next[index]];
                              update("problems", next);
                            }}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove ${problem.title}`}
                            onClick={() =>
                              update(
                                "problems",
                                draft.problems.filter((row) => row.id !== item.id),
                              )
                            }
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button
              className="button teacher-small-button"
              type="button"
              disabled={problemsLoading || !!problemsError}
              onClick={() => setAddProblemOpen(true)}
            >
              {problemsLoading ? "Loading library…" : "Add from library"}
            </button>
          </div>
        </section>

        <aside className="teacher-builder-sidebar">
          <div className="teacher-schedule-section">
            <TeacherSectionTitle title="Schedule" />
            <TeacherField label="OPENS">
              <input
                type="datetime-local"
                value={draft.opens}
                onChange={(event) => update("opens", event.target.value)}
              />
            </TeacherField>
            <TeacherField label="DUE DATE">
              <input
                type="datetime-local"
                value={draft.closes}
                onChange={(event) => update("closes", event.target.value)}
              />
            </TeacherField>
          </div>
          <div className="teacher-student-options">
            <TeacherSectionTitle title="Student options" />
            {(
              [
                ["hints", "Hints", "Students can open hints while solving"],
                ["comments", "Comments", "Students can comment on each problem"],
                [
                  "aiAllowed",
                  "AI assistance",
                  draft.studentOptions.aiAllowed
                    ? "Students can use AI assistance while solving"
                    : "AI assistance is not allowed",
                ],
              ] as const
            ).map(([key, label, help]) => (
              <div className="teacher-option-row" key={key}>
                <span>
                  <b>{label}</b>
                  <small>{help}</small>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-label={key === "aiAllowed" ? "Allow AI assistance" : label}
                  aria-checked={draft.studentOptions[key]}
                  className={`teacher-toggle${draft.studentOptions[key] ? " is-on" : ""}`}
                  onClick={() =>
                    update("studentOptions", {
                      ...draft.studentOptions,
                      [key]: !draft.studentOptions[key],
                    })
                  }
                >
                  <span />
                </button>
              </div>
            ))}
          </div>
          {alertText && (
            <p className="teacher-form-message" role="status">
              {alertText}
            </p>
          )}
          <p className="teacher-builder-save-state tiny muted">{saveState}</p>
          <div className="teacher-builder-actions">
            <button className="button" type="button" onClick={() => setPreviewOpen(true)}>
              Preview assignment
            </button>
            <button
              className="button"
              type="button"
              onClick={() => saveToServer(false)}
              disabled={saveBusy || !draft.title.trim() || !scheduleValid}
            >
              {saveBusy ? "Saving…" : "Save draft"}
            </button>
            <button
              className="button primary"
              type="button"
              onClick={() => saveToServer(true)}
              disabled={saveBusy || !readyToPublish}
            >
              Publish
            </button>
          </div>
        </aside>
      </div>

      {addProblemOpen && (
        <Dialog title="Add problem" onClose={() => setAddProblemOpen(false)}>
          <div className="teacher-add-problem-list">
            {availableProblems.length ? (
              availableProblems.map((problem) => (
                <div key={problem.id}>
                  <span>
                    <b>
                      {problem.number} · {problem.title}
                    </b>
                    <small>
                      {problem.difficulty} · {problem.topics}
                    </small>
                  </span>
                  <button className="button" type="button" onClick={() => addProblem(problem.id)}>
                    Add
                  </button>
                </div>
              ))
            ) : (
              <p className="tiny muted">All available problems are already included.</p>
            )}
          </div>
        </Dialog>
      )}
      {previewOpen && (
        <Dialog
          title="Assignment preview"
          onClose={() => setPreviewOpen(false)}
          className="teacher-activity-preview-dialog"
        >
          <AssignmentPreview
            draft={draft}
            classes={availableClasses}
            problems={allProblems}
          />
        </Dialog>
      )}
    </section>
  );
}
