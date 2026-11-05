import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { calendarDays, dateKey, parseDateKey } from "../utils/calendarDate";

type DateTimePickerProps = { label: string; value: string; onChange: (value: string) => void };

/** Choose a local date and time, retaining the datetime-local value format. */
export function DateTimePicker({ label, value, onChange }: DateTimePickerProps) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const focusDay = useRef(false);
  const [open, setOpen] = useState(false);
  const [activeDate, setActiveDate] = useState(() => dateKey(new Date()));
  const [chosenDate, setChosenDate] = useState(() => dateKey(new Date()));
  const [month, setMonth] = useState(() => new Date());
  const [hour, setHour] = useState("00");
  const [minute, setMinute] = useState("00");
  const [timeError, setTimeError] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const selectedDate = value.slice(0, 10);
  const today = dateKey(new Date());
  const monthName = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const selected = parseDateKey(selectedDate);
  const displayValue = selected ? `${selected.toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })}  ${value.slice(11, 16)}` : "Select date and time";

  useLayoutEffect(() => {
    if (!open) return;
    const positionPopup = () => {
      const anchor = trigger.current?.getBoundingClientRect();
      const panel = popup.current?.getBoundingClientRect();
      if (!anchor || !panel) return;
      const left = Math.max(8, Math.min(anchor.right - panel.width, window.innerWidth - panel.width - 8));
      const below = window.innerHeight - anchor.bottom - 8;
      const above = anchor.top - 8;
      const preferredTop = below < panel.height && above > below ? anchor.top - panel.height - 6 : anchor.bottom + 6;
      const top = Math.max(8, Math.min(preferredTop, window.innerHeight - panel.height - 8));
      setPosition({ top, left });
    };
    positionPopup();
    window.addEventListener("resize", positionPopup);
    window.addEventListener("scroll", positionPopup, true);
    return () => { window.removeEventListener("resize", positionPopup); window.removeEventListener("scroll", positionPopup, true); };
  }, [open, month, timeError]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !popup.current?.contains(target)) {
        if (selectedDate && validTime()) commit(chosenDate);
        setOpen(false);
      }
    };
    const handleFocus = (event: FocusEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !popup.current?.contains(target)) {
        if (selectedDate && validTime()) commit(chosenDate);
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", handleFocus);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("focusin", handleFocus); };
  }, [open, hour, minute, selectedDate, chosenDate, onChange]);

  useEffect(() => {
    if (open && focusDay.current) {
      popup.current?.querySelector<HTMLButtonElement>(`[data-date="${activeDate}"]`)?.focus();
      focusDay.current = false;
    }
  }, [open, activeDate, month]);

  function show() {
    const initial = selected || new Date();
    setActiveDate(dateKey(initial));
    setChosenDate(dateKey(initial));
    setMonth(new Date(initial.getFullYear(), initial.getMonth(), 1));
    setHour(value.slice(11, 13) || "00");
    setMinute(value.slice(14, 16) || "00");
    setTimeError(false);
    focusDay.current = true;
    setOpen(true);
  }
  function close() { setOpen(false); trigger.current?.focus({ preventScroll: true }); }
  function validTime() {
    return /^\d{1,2}$/.test(hour) && /^\d{1,2}$/.test(minute) && Number(hour) <= 23 && Number(minute) <= 59;
  }
  function commit(date: string) {
    if (!validTime()) { setTimeError(true); return false; }
    const formattedHour = hour.padStart(2, "0");
    const formattedMinute = minute.padStart(2, "0");
    const next = `${date}T${formattedHour}:${formattedMinute}`;
    if (next !== value) onChange(next);
    setHour(formattedHour);
    setMinute(formattedMinute);
    setTimeError(false);
    return true;
  }
  function chooseDay(date: string) {
    setActiveDate(date);
    setChosenDate(date);
    commit(date);
  }
  function moveMonth(delta: number) {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next);
    setActiveDate(dateKey(next));
  }
  function navigateDay(event: KeyboardEvent<HTMLButtonElement>, current: string) {
    const date = parseDateKey(current);
    if (!date) return;
    let next: Date;
    switch (event.key) {
      case "ArrowLeft": next = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1); break;
      case "ArrowRight": next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1); break;
      case "ArrowUp": next = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 7); break;
      case "ArrowDown": next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7); break;
      case "Home": next = new Date(date.getFullYear(), date.getMonth(), date.getDate() - (date.getDay() + 6) % 7); break;
      case "End": next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 6 - (date.getDay() + 6) % 7); break;
      default: return;
    }
    event.preventDefault();
    focusDay.current = true;
    setActiveDate(dateKey(next));
    setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
  }

  return <>
    <button ref={trigger} type="button" className="datetime-trigger" aria-label={`${label}: ${displayValue}`}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => { if (open) { if (selectedDate && validTime()) commit(chosenDate); close(); } else show(); }}>
      <span className={selected ? "" : "is-placeholder"}>{displayValue}</span><CalendarDays size={16} aria-hidden="true" />
    </button>
    {open && createPortal(<div ref={popup} id={id} className="datetime-popover" role="dialog" aria-label={`Choose ${label.toLowerCase()} date and time`} style={{ top: position.top, left: position.left }}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); } }}>
      <div className="datetime-calendar-header">
        <button type="button" className="datetime-icon" aria-label="Previous month" onClick={() => moveMonth(-1)}><ChevronLeft size={16} aria-hidden="true" /></button>
        <strong aria-live="polite">{monthName}</strong>
        <button type="button" className="datetime-icon" aria-label="Next month" onClick={() => moveMonth(1)}><ChevronRight size={16} aria-hidden="true" /></button>
      </div>
      <div className="datetime-weekdays" aria-hidden="true">{["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="datetime-days" role="group" aria-label={monthName}>
        {calendarDays(month.getFullYear(), month.getMonth()).map((date, index) => date ? <button type="button" key={date} data-date={date}
          className={`datetime-day${date === selectedDate ? " is-selected" : ""}${date === today ? " is-today" : ""}`}
          aria-label={parseDateKey(date)?.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          aria-pressed={date === selectedDate} tabIndex={date === activeDate ? 0 : -1} onKeyDown={(event) => navigateDay(event, date)} onClick={() => chooseDay(date)}>{Number(date.slice(-2))}</button> : <span key={`blank-${index}`} />)}
      </div>
      <div className="datetime-time">
        <span>TIME <small>24-hour</small></span>
        <div className="datetime-time-fields">
          <input aria-label="Hour" aria-invalid={timeError} type="number" min="0" max="23" value={hour} onChange={(event) => { setHour(event.target.value); setTimeError(false); }} />
          <span aria-hidden="true">:</span>
          <input aria-label="Minute" aria-invalid={timeError} type="number" min="0" max="59" value={minute} onChange={(event) => { setMinute(event.target.value); setTimeError(false); }} />
        </div>
      </div>
      {timeError && <p className="datetime-error" role="alert">Enter a valid time (00:00–23:59).</p>}
      <div className="datetime-actions">
        <button type="button" onClick={() => { onChange(""); close(); }}>Clear</button>
        <button type="button" onClick={() => { const now = new Date(); const day = dateKey(now); setActiveDate(day); setChosenDate(day); setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); commit(day); }}>Today</button>
        <button type="button" className="datetime-done" onClick={() => { if (commit(chosenDate)) close(); }}>Done</button>
      </div>
    </div>, document.body)}
  </>;
}
