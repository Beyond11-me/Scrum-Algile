import { useState, useEffect, useMemo } from "react";
import { adminService, type AdminClass, type LecturerOption } from "../../services/adminService";
import { Dialog, Loading, ErrorState } from "../../components/ui";
import { academicTerms } from "../../utils/academicTerms";

export function AdminClassesPage() {
  const [classes, setClasses] = useState<AdminClass[]>([]);
  const [lecturers, setLecturers] = useState<LecturerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedTerm, setSelectedTerm] = useState("All");

  // Dialog State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newId, setNewId] = useState("");
  const [newCourse, setNewCourse] = useState("");
  const [newTerm, setNewTerm] = useState(academicTerms()[0] || "HK1 2026");
  const [newInstructorId, setNewInstructorId] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const termOptions = academicTerms();

  async function loadData() {
    setLoading(true);
    setError("");
    try {
      const [classList, lecturerList] = await Promise.all([
        adminService.getClasses(),
        adminService.getLecturers(),
      ]);
      setClasses(classList);
      setLecturers(lecturerList);
      if (lecturerList.length > 0 && !newInstructorId) {
        setNewInstructorId(lecturerList[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể tải dữ liệu lớp học.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const filtered = useMemo(() => {
    return classes.filter((c) => {
      const matchSearch = `${c.id} ${c.course} ${c.instructor_name || ""}`.toLowerCase().includes(search.toLowerCase());
      const matchTerm = selectedTerm === "All" || c.term === selectedTerm;
      return matchSearch && matchTerm;
    });
  }, [classes, search, selectedTerm]);

  async function handleCreateClass(e: React.FormEvent) {
    e.preventDefault();
    if (!newId.trim()) {
      setFormError("Vui lòng nhập mã lớp học (ID).");
      return;
    }
    if (!newCourse.trim()) {
      setFormError("Vui lòng nhập tên môn học.");
      return;
    }
    setFormError("");
    setSubmitting(true);
    try {
      const created = await adminService.createClass({
        id: newId.trim().toUpperCase(),
        course: newCourse.trim(),
        term: newTerm.trim(),
        instructor_id: newInstructorId || undefined,
      });
      setClasses((prev) => [created, ...prev]);
      setDialogOpen(false);
      setNewId("");
      setNewCourse("");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Lỗi khi tạo lớp học.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteClass(classId: string) {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa lớp học "${classId}"?`)) return;
    try {
      await adminService.deleteClass(classId);
      setClasses((prev) => prev.filter((c) => c.id !== classId));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Không thể xóa lớp học.");
    }
  }

  return (
    <section className="teacher-page compact-teacher-library" style={{ padding: "1.5rem 2rem", maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700, margin: 0 }}>Quản lý Lớp học (Admin)</h1>
          <p className="muted" style={{ margin: "0.25rem 0 0 0", fontSize: "0.9rem" }}>
            Tạo và phân công giảng viên cho các lớp học trên hệ thống iSQL.
          </p>
        </div>
        <button
          className="button primary"
          type="button"
          onClick={() => {
            setFormError("");
            setDialogOpen(true);
          }}
          style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}
        >
          + Thêm lớp mới
        </button>
      </header>

      {/* Filters */}
      <div className="teacher-list-filters" style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem" }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-muted, #666)", display: "block", marginBottom: "0.25rem" }}>
            TÌM KIẾM
          </label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo mã lớp, môn học hoặc giảng viên..."
            style={{ width: "100%", padding: "0.5rem 0.75rem", borderRadius: "6px", border: "1px solid var(--color-border, #ddd)" }}
          />
        </div>
        <div style={{ width: 220 }}>
          <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-muted, #666)", display: "block", marginBottom: "0.25rem" }}>
            HỌC KỲ
          </label>
          <select
            value={selectedTerm}
            onChange={(e) => setSelectedTerm(e.target.value)}
            style={{ width: "100%", padding: "0.5rem 0.75rem", borderRadius: "6px", border: "1px solid var(--color-border, #ddd)" }}
          >
            <option value="All">Tất cả học kỳ</option>
            {termOptions.map((term) => (
              <option key={term} value={term}>{term}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <Loading label="Đang tải danh sách lớp học..." />
      ) : error ? (
        <ErrorState title="Lỗi tải dữ liệu" message={error} onRetry={loadData} />
      ) : (
        <div className="teacher-table-scroll sticky-list-table-wrap" style={{ background: "var(--color-surface, #fff)", borderRadius: "8px", border: "1px solid var(--color-border, #eee)", overflow: "hidden" }}>
          <table className="teacher-table sticky-list-table" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--color-surface-hover, #f8f9fa)", borderBottom: "1px solid var(--color-border, #eee)" }}>
                <th style={{ textAlign: "left", padding: "0.75rem 1rem" }}>MÃ LỚP</th>
                <th style={{ textAlign: "left", padding: "0.75rem 1rem" }}>MÔN HỌC</th>
                <th style={{ textAlign: "left", padding: "0.75rem 1rem" }}>HỌC KỲ</th>
                <th style={{ textAlign: "left", padding: "0.75rem 1rem" }}>GIẢNG VIÊN</th>
                <th style={{ textAlign: "center", padding: "0.75rem 1rem" }}>SINH VIÊN</th>
                <th style={{ textAlign: "center", padding: "0.75rem 1rem" }}>TRẠNG THÁI</th>
                <th style={{ textAlign: "right", padding: "0.75rem 1rem" }}>THAO TÁC</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} style={{ borderBottom: "1px solid var(--color-border, #f0f0f0)" }}>
                  <td style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "var(--color-primary, #4f46e5)" }}>{item.id}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>{item.course}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>{item.term}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>{item.instructor_name || "Chưa gán"}</td>
                  <td style={{ textAlign: "center", padding: "0.75rem 1rem" }}>{item.students}</td>
                  <td style={{ textAlign: "center", padding: "0.75rem 1rem" }}>
                    <span style={{ padding: "0.2rem 0.6rem", borderRadius: "999px", fontSize: "0.75rem", background: "rgba(16, 185, 129, 0.1)", color: "#10b981", fontWeight: 600 }}>
                      {item.status}
                    </span>
                  </td>
                  <td style={{ textAlign: "right", padding: "0.75rem 1rem" }}>
                    <button
                      className="text-button"
                      type="button"
                      style={{ color: "#ef4444", fontSize: "0.85rem" }}
                      onClick={() => handleDeleteClass(item.id)}
                    >
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={7} style={{ textAlign: "center", padding: "2rem", color: "var(--color-muted, #888)" }}>
                    Không có lớp học nào phù hợp với bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog Add Class */}
      {dialogOpen && (
        <Dialog title="Thêm Lớp Học Mới" onClose={() => setDialogOpen(false)}>
          <form onSubmit={handleCreateClass} style={{ width: 440, maxWidth: "100%", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                Mã lớp (ID) *
              </label>
              <input
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                placeholder="VD: IS004.R12"
                required
                style={{ width: "100%", padding: "0.5rem 0.75rem", borderRadius: "6px", border: "1px solid var(--color-border, #ddd)" }}
              />
              <small className="muted" style={{ fontSize: "0.75rem" }}>Mã định danh duy nhất cho lớp học.</small>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                Tên môn học *
              </label>
              <input
                value={newCourse}
                onChange={(e) => setNewCourse(e.target.value)}
                placeholder="VD: Hệ cơ sở dữ liệu"
                required
                style={{ width: "100%", padding: "0.5rem 0.75rem", borderRadius: "6px", border: "1px solid var(--color-border, #ddd)" }}
              />
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                Học kỳ *
              </label>
              <select
                value={newTerm}
                onChange={(e) => setNewTerm(e.target.value)}
                style={{ width: "100%", padding: "0.5rem 0.75rem", borderRadius: "6px", border: "1px solid var(--color-border, #ddd)" }}
              >
                {termOptions.map((term) => (
                  <option key={term} value={term}>{term}</option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                Giảng viên phụ trách
              </label>
              <select
                value={newInstructorId}
                onChange={(e) => setNewInstructorId(e.target.value)}
                style={{ width: "100%", padding: "0.5rem 0.75rem", borderRadius: "6px", border: "1px solid var(--color-border, #ddd)" }}
              >
                <option value="">-- Chọn giảng viên (Tùy chọn) --</option>
                {lecturers.map((lec) => (
                  <option key={lec.id} value={lec.id}>{lec.name} ({lec.email})</option>
                ))}
              </select>
            </div>

            {formError && (
              <p style={{ color: "#ef4444", fontSize: "0.85rem", margin: 0 }}>
                {formError}
              </p>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
              <button className="button" type="button" onClick={() => setDialogOpen(false)} disabled={submitting}>
                Hủy
              </button>
              <button className="button primary" type="submit" disabled={submitting}>
                {submitting ? "Đang tạo..." : "Tạo lớp học"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
