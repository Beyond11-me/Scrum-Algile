import { Children, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type SelectHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

type OptionProps = { value?: string | number; disabled?: boolean; children?: ReactNode };
type Option = { value: string; label: string; disabled: boolean };

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

function readOptions(children: ReactNode): Option[] {
  return Children.toArray(children).flatMap((child) => {
    if (!isValidElement<OptionProps>(child)) return [];
    if (child.type !== "option") return readOptions(child.props.children);
    const label = textOf(child.props.children).trim();
    return [{ value: String(child.props.value ?? label), label, disabled: !!child.props.disabled }];
  });
}

/** Themed single-select retaining the native select's change and form behavior. */
export function SelectMenu({ children, value, disabled, id, className, onChange, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  const generatedId = useId();
  const triggerId = id || `${generatedId}-trigger`;
  const listId = `${generatedId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const nativeRef = useRef<HTMLSelectElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const typeahead = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 240 });
  const options = readOptions(children);
  const currentValue = String(value ?? "");
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === currentValue));

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const below = window.innerHeight - rect.bottom - 14;
      const above = rect.top - 14;
      const height = Math.min(240, options.length * 36 + 10);
      const placeAbove = below < height && above > below;
      const available = Math.max(0, placeAbove ? above : below);
      const maxHeight = Math.min(240, available);
      setPosition({ left: rect.left, top: placeAbove ? Math.max(8, rect.top - 6 - Math.min(height, maxHeight)) : rect.bottom + 6, width: rect.width, maxHeight });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !listRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  const firstEnabled = (start: number, step: number) => {
    for (let index = start; index >= 0 && index < options.length; index += step) {
      if (!options[index].disabled) return index;
    }
    return -1;
  };
  const show = () => {
    const initial = options[selectedIndex] && !options[selectedIndex].disabled ? selectedIndex : firstEnabled(0, 1);
    setActiveIndex(initial < 0 ? 0 : initial);
    setOpen(true);
  };
  const choose = (index: number) => {
    const option = options[index];
    const native = nativeRef.current;
    if (!option || option.disabled || !native) return;
    if (native.value !== option.value) {
      native.value = option.value;
      native.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setInvalid(!native.validity.valid);
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) show();
      else {
        const next = firstEnabled(activeIndex + (event.key === "ArrowDown" ? 1 : -1), event.key === "ArrowDown" ? 1 : -1);
        if (next >= 0) setActiveIndex(next);
      }
    } else if (open && (event.key === "Home" || event.key === "End")) {
      event.preventDefault();
      const next = firstEnabled(event.key === "Home" ? 0 : options.length - 1, event.key === "Home" ? 1 : -1);
      if (next >= 0) setActiveIndex(next);
    } else if (open && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      choose(activeIndex);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === "Tab") {
      setOpen(false);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && event.key !== " ") {
      const now = Date.now();
      const query = (now - typeahead.current.time < 700 ? typeahead.current.text : "") + event.key.toLocaleLowerCase();
      typeahead.current = { text: query, time: now };
      const match = options.findIndex((option) => !option.disabled && option.label.toLocaleLowerCase().startsWith(query));
      if (match >= 0) { event.preventDefault(); setActiveIndex(match); setOpen(true); }
    }
  };
  const portalTarget = triggerRef.current?.closest("dialog[open]") || document.body;

  return (
    <div className={`select-menu${className ? ` ${className}` : ""}`} ref={rootRef}>
      <button
        ref={triggerRef} id={triggerId} type="button" className="select-menu-trigger" role="combobox"
        disabled={disabled} aria-label={props["aria-label"]} aria-labelledby={props["aria-labelledby"]}
        aria-required={props.required || undefined} aria-invalid={invalid || props["aria-invalid"] || undefined}
        aria-describedby={[props["aria-describedby"], invalid ? `${generatedId}-error` : undefined].filter(Boolean).join(" ") || undefined}
        aria-expanded={open} aria-controls={open ? listId : undefined}
        aria-activedescendant={open && options[activeIndex] ? `${generatedId}-option-${activeIndex}` : undefined}
        aria-haspopup="listbox" onClick={() => open ? setOpen(false) : show()} onKeyDown={handleKeyDown}
      >
        <span>{options[selectedIndex]?.label || ""}</span><ChevronDown size={16} aria-hidden="true" className="select-menu-chevron" />
      </button>
      <select
        {...props} ref={nativeRef} value={value} disabled={disabled} onChange={onChange} tabIndex={-1} aria-hidden="true"
        onInvalid={(event) => { event.preventDefault(); setInvalid(true); triggerRef.current?.focus(); props.onInvalid?.(event); }}
        style={{ position: "absolute", width: 1, height: 1, minHeight: 0, padding: 0, border: 0, opacity: 0, pointerEvents: "none" }}
      >{children}</select>
      {invalid && <span id={`${generatedId}-error`} className="select-menu-error" role="alert">Please select an option.</span>}
      {open && createPortal(
        <div ref={listRef} id={listId} className="select-menu-list" role="listbox" aria-labelledby={triggerId} style={{ position: "fixed", left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}>
          {options.map((option, index) => (
            <div key={`${option.value}-${index}`} ref={(element) => { optionRefs.current[index] = element; }} id={`${generatedId}-option-${index}`}
              role="option" aria-selected={option.value === currentValue} aria-disabled={option.disabled || undefined}
              className={`select-menu-option${index === activeIndex ? " is-active" : ""}${option.value === currentValue ? " is-selected" : ""}${option.disabled ? " is-disabled" : ""}`}
              onMouseMove={() => { if (!option.disabled) setActiveIndex(index); }} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)}>
              <span>{option.label}</span>{option.value === currentValue && <Check size={15} aria-hidden="true" />}
            </div>
          ))}
        </div>, portalTarget,
      )}
    </div>
  );
}
