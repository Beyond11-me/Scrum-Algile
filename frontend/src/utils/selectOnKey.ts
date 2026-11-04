import type { KeyboardEvent } from "react";

/** Lets a clickable row be selected from the keyboard, ignoring keys pressed on controls inside it. */
export function selectOnKey(event: KeyboardEvent<HTMLElement>, select: () => void) {
  if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) return;
  event.preventDefault();
  select();
}
