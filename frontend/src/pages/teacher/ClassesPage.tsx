import { SelectMenu } from "../../components/SelectMenu";
import { useEffect, useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Dialog, ErrorState, Loading } from "../../components/ui";
import { Search, Upload, X } from "lucide-react";
import { PersonIdentity, SearchablePersonMenu } from "../../components/SearchablePersonMenu";
import {
  type TeacherClass,
  type TeacherClassMember,
} from "../../data/teacherTypes";
import { TeacherField } from "./TeacherPageParts";
import { teacherService } from "../../services/teacherService";
import { downloadCsv, downloadRosterTemplate, rosterImportNotice } from "../../utils/rosterCsv";

export function ClassesPage() {
  const [classes, setClasses] = useState<TeacherClass[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const [classesError, setClassesError] = useState("");
  const [term, setTerm] = useState("All terms");
  const [search, setSearch] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [page, setPage] = useState(1);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [classDetailsOpen, setClassDetailsOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<"assignments" | "members">("members");
  const [addSearch, setAddSearch] = useState("");
  const [classActivities, setClassActivities] = useState<any[]>([]);
  const [detailMembers, setDetailMembers] = useState<TeacherClassMember[]>([]);
  const [allStudents, setAllStudents] = useState<TeacherClassMember[]>([]);
  const [detailError, setDetailError] = useState("");
  const [membersNotice, setMembersNotice] = useState("");
  const [memberBusyId, setMemberBusyId] = useState("");
  const [importing, setImporting] = useState(false);
  const rosterFileRef = useRef<HTMLInputElement>(null);
  const pickerShield = useRef<(() => void) | null>(null);

  useEffect(() => {
    teacherService.getClasses().then((data) => {
      setClasses(data);
      setSelectedClassId(data[0]?.id || "");
    }).catch((error) => setClassesError(error instanceof Error ? error.message : "Could not load classes.")).finally(() => setClassesLoading(false));
  }, []);

  useEffect(() => {
    if (!classDetailsOpen || !selectedClassId) return;
    let active = true;
    setDetailError("");
    setMembersNotice("");
    setClassActivities([]);
    setDetailMembers([]);
    setAllStudents([]);
    Promise.all([
      teacherService.getAssignments(),
      teacherService.getClassMembers(selectedClassId),
      teacherService.getAllStudents(),
    ])
      .then(([activities, classMembers, students]) => {
        if (!active) return;
        setClassActivities(activities.filter((item: any) => item.classIds?.includes(selectedClassId)));
        setDetailMembers(classMembers);
        setAllStudents(students);
      })
      .catch(() => { if (active) setDetailError("Could not load class activity or members."); });
    return () => { active = false; };
  }, [classDetailsOpen, selectedClassId]);

  const termOptions = useMemo(
    () => Array.from(new Set(classes.map((classInfo) => classInfo.term))).sort((a, b) => {
      const termA = /Semester ([12]), (\d{4})/.exec(a);
      const termB = /Semester ([12]), (\d{4})/.exec(b);
      if (!termA || !termB) return a.localeCompare(b);
      return Number(termB[2]) - Number(termA[2]) || Number(termB[1]) - Number(termA[1]);
    }),
    [classes],
  );
  const visibleClasses = useMemo(() => classes.filter((classInfo) => {
    const matchesTerm = term === "All terms" || classInfo.term === term;
    const matchesSearch = `${classInfo.id} ${classInfo.course} ${classInfo.term}`
      .toLowerCase()
      .includes(search.toLowerCase());
    return matchesTerm && matchesSearch;
  }), [classes, search, term]);
  const pageCount = Math.max(1, Math.ceil(visibleClasses.length / 15));
  const currentPage = Math.min(page, pageCount);
  const firstIndex = (currentPage - 1) * 15;
  const pageClasses = visibleClasses.slice(firstIndex, firstIndex + 15);
  const selectedClass = pageClasses.find((classInfo) => classInfo.id === selectedClassId) || pageClasses[0] || null;
  useEffect(() => { setPage(1); setSelectedClassId(""); }, [search, term]);
  useEffect(() => { tableScrollRef.current?.scrollTo({ top: 0 }); }, [currentPage, search, term]);
  const assignments = classActivities.filter(item => !item.isContest);
  const contests = classActivities.filter(item => item.isContest);
  const enrolledIds = useMemo(
    () => new Set(detailMembers.map((member) => member.id).filter(Boolean)),
    [detailMembers],
  );
  const filteredStudents = useMemo(() => detailMembers.filter((student) =>
    `${student.name} ${student.id} ${student.email || ""}`.toLowerCase().includes(studentSearch.toLowerCase()),
  ), [detailMembers, studentSearch]);
  const availableStudents = useMemo(() => allStudents.filter((student) =>
    student.id && !enrolledIds.has(student.id),
  ), [allStudents, enrolledIds]);

  useEffect(() => {
    if (selectedClass && selectedClassId !== selectedClass.id) setSelectedClassId(selectedClass.id);
  }, [selectedClass, selectedClassId]);

  function selectClass(classInfo: TeacherClass) {
    setSelectedClassId(classInfo.id);
    setStudentSearch("");
  }

  function openClassDetails(tab: "assignments" | "members" = "members") {
    setDetailTab(tab);
    setStudentSearch("");
    setAddSearch("");
    setMembersNotice("");
    setClassDetailsOpen(true);
  }

  function setClassStudentCount(classId: string, count: number) {
    setClasses((current) => current.map((item) => item.id === classId ? { ...item, students: count } : item));
  }

  async function changeMembership(student: TeacherClassMember, action: "add" | "remove") {
    if (!selectedClassId || !student.id || memberBusyId) return;
    setMemberBusyId(student.id);
    setDetailError("");
    setMembersNotice("");
    try {
      if (action === "add") {
        const added = await teacherService.addClassMember(selectedClassId, { student_id: student.id });
        const next = [...detailMembers, added].sort((a, b) => a.name.localeCompare(b.name));
        setDetailMembers(next);
        setClassStudentCount(selectedClassId, next.length);
        setMembersNotice(`${student.name} added to this class.`);
      } else {
        await teacherService.removeClassMember(selectedClassId, student.id);
        const next = detailMembers.filter((member) => member.id !== student.id);
        setDetailMembers(next);
        setClassStudentCount(selectedClassId, next.length);
        setMembersNotice(`${student.name} removed from this class.`);
      }
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : `Could not ${action} this student.`);
    } finally {
      setMemberBusyId("");
    }
  }

  function openRosterFilePicker() {
    const input = rosterFileRef.current;
    if (!input || importing) return;
    pickerShield.current?.();
    input.click();
    const swallowBackdropClick = (event: Event) => {
      if (event.target instanceof HTMLDialogElement) {
        event.preventDefault();
        event.stopPropagation();
      }
      cleanup();
    };
    const cleanup = () => {
      window.removeEventListener("click", swallowBackdropClick, true);
      if (pickerShield.current === cleanup) pickerShield.current = null;
    };
    window.setTimeout(() => {
      window.addEventListener("click", swallowBackdropClick, true);
      pickerShield.current = cleanup;
      input.addEventListener("cancel", () => window.setTimeout(cleanup, 400), { once: true });
      input.addEventListener("change", () => window.setTimeout(cleanup, 400), { once: true });
    }, 0);
  }

  async function importRoster(file: File) {
    if (!selectedClassId || importing) return;
    setImporting(true);
    setDetailError("");
    setMembersNotice("");
    try {
      const result = await teacherService.importClassMembers(selectedClassId, file);
      const classMembers = await teacherService.getClassMembers(selectedClassId);
      setDetailMembers(classMembers);
      setClassStudentCount(selectedClassId, classMembers.length);
      if (result.reportRows) downloadCsv(result.filename, result.reportCsv);
      setMembersNotice(rosterImportNotice(result));
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : "Could not import the CSV roster.");
    } finally {
      setImporting(false);
      if (rosterFileRef.current) rosterFileRef.current.value = "";
    }
  }

  return (
    <section className="teacher-page teacher-classes-page compact-teacher-classes">
      <h1 className="sr-only">Classes</h1>

      {classesLoading ? <Loading label="Loading classes…" /> : classesError ? <ErrorState title="Could not load classes" message={classesError} onRetry={() => window.location.reload()} /> : classes.length === 0 ? <div className="teacher-empty-state">
        <div><h2>No classes yet</h2><p>No classes have been assigned to you yet.</p></div>
      </div> : <>
      <div className="teacher-class-filters">
        <TeacherField label="SEARCH">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search classes..."
          />
        </TeacherField>
        <TeacherField label="ACADEMIC TERM">
          <SelectMenu value={term} onChange={(event) => setTerm(event.target.value)}>
            <option>All terms</option>
            {termOptions.map((termOption) => <option key={termOption}>{termOption}</option>)}
          </SelectMenu>
        </TeacherField>
      </div>

      <div className="teacher-classes-layout teacher-list-detail-layout">
        <div className="teacher-classes-main teacher-list-detail-main">
          <div ref={tableScrollRef} className="teacher-table-scroll teacher-list-table-scroll sticky-list-table-wrap">
            <table className="teacher-table teacher-classes-table sticky-list-table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Term</th>
                  <th>Members</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pageClasses.map((classInfo) => (
                  <tr
                    className={`teacher-class-row${selectedClass?.id === classInfo.id ? " is-selected" : ""}`}
                    key={classInfo.id}
                    onClick={() => selectClass(classInfo)}
                  >
                    <td data-label="Class">
                      <button
                        className="teacher-table-link teacher-class-identity"
                        type="button"
                        aria-label={`Open details for ${classInfo.id}`}
                        aria-current={selectedClass?.id === classInfo.id ? "true" : undefined}
                        onClick={(event) => {
                          event.stopPropagation();
                          selectClass(classInfo);
                          openClassDetails("members");
                        }}
                      >
                        <span>{classInfo.id}</span>
                        <small>{classInfo.course}</small>
                      </button>
                    </td>
                    <td data-label="Term">{classInfo.term}</td>
                    <td data-label="Members">{classInfo.students}</td>
                    <td data-label="Status" className={classInfo.status === "Active" ? "teacher-state-success" : "muted"}>{classInfo.status}</td>
                  </tr>
                ))}
                {!visibleClasses.length && (
                  <tr><td colSpan={4} className="muted">No classes match this term and search.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="teacher-list-footer teacher-library-pagination">
            <span>Showing {visibleClasses.length ? firstIndex + 1 : 0}–{firstIndex + pageClasses.length} of {visibleClasses.length} classes</span>
            <nav aria-label="Classes pagination">
              <button className="button" type="button" disabled={currentPage === 1} onClick={() => { setPage(currentPage - 1); setSelectedClassId(""); }}>← Previous</button>
              <span>Page {currentPage} of {pageCount}</span>
              <button className="button" type="button" disabled={currentPage === pageCount} onClick={() => { setPage(currentPage + 1); setSelectedClassId(""); }}>Next →</button>
            </nav>
          </div>
        </div>

        <aside className="teacher-class-details teacher-list-detail-panel">
          {selectedClass ? <>
            <div className="teacher-class-detail-heading">
              <div>
                <span className="teacher-detail-eyebrow">CLASS SUMMARY</span>
                <h2><button type="button" className="title-link" onClick={() => openClassDetails("members")}>{selectedClass.id}</button></h2>
                <p className="muted">{selectedClass.course} · {selectedClass.term}</p>
              </div>
              <span className={selectedClass.status === "Active" ? "teacher-state-success" : "muted"}>{selectedClass.status}</span>
            </div>

            <p className="teacher-class-summary-students">{selectedClass.students} students</p>
            <div className="teacher-class-summary-actions">
              <button className="button primary teacher-class-detail-button" type="button" onClick={() => openClassDetails("members")}>
                Manage students
              </button>
              <button className="button teacher-class-detail-button" type="button" onClick={() => openClassDetails("assignments")}>
                View assignments
              </button>
            </div>
          </> : <p className="muted">Select a class to view its assignments and student progress.</p>}
        </aside>
      </div>
      </>}

      {classDetailsOpen && selectedClass && (
        <Dialog
          className="teacher-class-detail-dialog-modal"
          title={selectedClass.id}
          onClose={() => setClassDetailsOpen(false)}
        >
          <div className="teacher-class-detail-dialog-content">
            <header className="class-dialog-header">
              <div className="class-dialog-meta">
                <strong>{selectedClass.course}</strong>
                <span className="class-dialog-term">{selectedClass.term}</span>
              </div>
              <dl className="class-dialog-stats">
                <div><dt>Students</dt><dd>{selectedClass.students}</dd></div>
                <div><dt>Assignments</dt><dd>{assignments.length}</dd></div>
                <div><dt>Contests</dt><dd>{contests.length}</dd></div>
              </dl>
            </header>
            {detailError && <p role="alert" className="class-dialog-alert">{detailError}</p>}

            <div className="teacher-class-detail-tabs" role="tablist" aria-label="Class details">
              <button id="class-members-tab" type="button" role="tab" aria-selected={detailTab === "members"} aria-controls="class-members-panel" className={detailTab === "members" ? "is-active" : ""} onClick={() => setDetailTab("members")}>
                Students <span>{detailMembers.length}</span>
              </button>
              <button id="class-assignments-tab" type="button" role="tab" aria-selected={detailTab === "assignments"} aria-controls="class-assignments-panel" className={detailTab === "assignments" ? "is-active" : ""} onClick={() => setDetailTab("assignments")}>
                Assignments <span>{assignments.length}</span>
              </button>
            </div>

            <section id="class-assignments-panel" className="teacher-class-detail-section" role="tabpanel" aria-labelledby="class-assignments-tab" hidden={detailTab !== "assignments"}>
              {assignments.length ? assignments.map((assignment) => (
                <article className="teacher-class-assignment" key={assignment.id}>
                  <div className="teacher-class-assignment-topline">
                    <div>
                      <strong><Link className="title-link" to={`/teacher/assignments/${assignment.id}/edit`}>{assignment.title}</Link></strong>
                      <small>Due {assignment.due || "—"} · {assignment.status}</small>
                    </div>
                    <b>{assignment.submitted}</b>
                  </div>
                </article>
              )) : <p className="muted">No assignment progress is available for this class yet.</p>}
            </section>

            {/* Lecturers own the roster: CSV import and type-to-narrow add. Admins only assign lecturers. */}
            <section id="class-members-panel" className="teacher-class-detail-section" role="tabpanel" aria-labelledby="class-members-tab" hidden={detailTab !== "members"}>
              {membersNotice && <p className="class-roster-notice" role="status">{membersNotice}</p>}
              <div className="class-roster">
                <section className="class-roster-pane" aria-labelledby="enrolled-students-heading">
                  <div className="class-roster-pane-heading">
                    <h3 id="enrolled-students-heading">In this class</h3>
                    <span className="class-roster-count">{detailMembers.length}</span>
                  </div>
                  {detailMembers.length > 5 && (
                    <label className="person-search">
                      <span className="sr-only">Filter enrolled students</span>
                      <Search size={15} aria-hidden="true" />
                      <input
                        type="search"
                        value={studentSearch}
                        onChange={(event) => setStudentSearch(event.target.value)}
                        placeholder="Filter by name or email..."
                      />
                    </label>
                  )}
                  <ul className="class-roster-list">
                    {filteredStudents.map((student) => (
                      <li className="class-roster-row" key={student.id}>
                        <PersonIdentity name={student.name} id={student.id} email={student.email} />
                        <button
                          className="class-roster-remove"
                          type="button"
                          aria-label={`Remove ${student.name} from this class`}
                          title="Remove from class"
                          disabled={Boolean(memberBusyId)}
                          onClick={() => void changeMembership(student, "remove")}
                        >
                          {memberBusyId === student.id ? "…" : <X size={14} aria-hidden="true" />}
                        </button>
                      </li>
                    ))}
                    {!filteredStudents.length && (
                      <li className="class-roster-empty">{detailMembers.length ? "No students match this filter." : "No students yet. Use Add students to enroll them."}</li>
                    )}
                  </ul>
                </section>

                <section className="class-roster-pane class-roster-add" aria-labelledby="add-students-heading">
                  <div className="class-roster-pane-heading">
                    <h3 id="add-students-heading">Add students</h3>
                    <span className="class-roster-count">{availableStudents.length} available</span>
                  </div>
                  <SearchablePersonMenu
                    label="Search students to add"
                    items={availableStudents.filter((student) => student.id).map((student) => ({
                      id: student.id as string,
                      name: student.name,
                      email: student.email,
                    }))}
                    query={addSearch}
                    onQueryChange={setAddSearch}
                    onSelect={(person) => {
                      const student = allStudents.find((item) => item.id === person.id);
                      if (student) void changeMembership(student, "add");
                    }}
                    searchPlaceholder="Search name or email..."
                    emptyText={availableStudents.length ? "No students match this search." : "Everyone is already in this class."}
                    actionLabel="+ Add"
                    disabledId={memberBusyId}
                    busy={Boolean(memberBusyId)}
                  />
                  <div className="class-roster-bulk">
                    <button type="button" className="class-roster-import" disabled={importing} onClick={openRosterFilePicker}>
                      <Upload size={14} aria-hidden="true" />
                      {importing ? "Importing…" : "Import from CSV"}
                    </button>
                    <button type="button" className="class-roster-template" onClick={downloadRosterTemplate} title="A result file is downloaded after each import.">
                      Get template
                    </button>
                    <input
                      ref={rosterFileRef}
                      type="file"
                      accept=".csv,text/csv"
                      hidden
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void importRoster(file);
                      }}
                    />
                  </div>
                </section>
              </div>
            </section>
          </div>
        </Dialog>
      )}

    </section>
  );
}
