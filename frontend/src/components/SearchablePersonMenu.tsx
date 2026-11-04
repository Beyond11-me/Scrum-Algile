import { useMemo, type CSSProperties, type ReactNode } from "react";
import { Search } from "lucide-react";

export type PersonOption = {
  id: string;
  name: string;
  email?: string;
};

const OPAQUE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Email when known; otherwise a human-readable ID. Database UUIDs are never shown. */
export function personSecondary(person: { id?: string; email?: string }) {
  if (person.email) return person.email;
  return person.id && !OPAQUE_ID.test(person.id) ? person.id : "";
}

function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function hue(seed: string) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  return Math.abs(hash) % 360;
}

export function PersonAvatar({ name, seed }: { name: string; seed?: string }) {
  return (
    <span className="person-avatar" aria-hidden="true" style={{ "--avatar-hue": hue(seed || name) } as CSSProperties}>
      {initials(name)}
    </span>
  );
}

export function PersonIdentity({ name, id, email }: { name: string; id?: string; email?: string }) {
  const secondary = personSecondary({ id, email });
  return (
    <span className="person-identity">
      <PersonAvatar name={name} seed={id || email} />
      <span className="person-identity-text">
        <strong>{name}</strong>
        {secondary && <small>{secondary}</small>}
      </span>
    </span>
  );
}

type SearchablePersonMenuProps = {
  items: PersonOption[];
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (item: PersonOption) => void;
  searchPlaceholder: string;
  emptyText: string;
  label?: string;
  footer?: ReactNode;
  disabledId?: string;
  currentId?: string;
  actionLabel?: string;
  busy?: boolean;
  autoFocus?: boolean;
};

/** Type-to-narrow list used for assigning lecturers and adding students. */
export function SearchablePersonMenu({
  items,
  query,
  onQueryChange,
  onSelect,
  searchPlaceholder,
  emptyText,
  label,
  footer,
  disabledId,
  currentId,
  actionLabel = "Select",
  busy,
  autoFocus = false,
}: SearchablePersonMenuProps) {
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      `${item.name} ${item.email || ""} ${item.id}`.toLowerCase().includes(needle),
    );
  }, [items, query]);

  return (
    <div className="searchable-person-menu">
      <label className="person-search">
        <span className="sr-only">{label || searchPlaceholder}</span>
        <Search size={15} aria-hidden="true" />
        <input
          autoFocus={autoFocus}
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={searchPlaceholder}
        />
      </label>
      <ul className="searchable-person-menu-list" aria-label={label || "Matching people"}>
        {filtered.map((item) => {
          const isCurrent = currentId === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                className={"searchable-person-menu-option" + (isCurrent ? " is-current" : "")}
                disabled={busy || isCurrent}
                onClick={() => onSelect(item)}
              >
                <PersonIdentity name={item.name} id={item.id} email={item.email} />
                <span className="person-option-action">
                  {isCurrent ? "Current" : disabledId === item.id ? "Saving…" : actionLabel}
                </span>
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && (
          <li className="searchable-person-menu-empty">{emptyText}</li>
        )}
      </ul>
      {footer}
    </div>
  );
}
