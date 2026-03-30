import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Safe HTML id from full path / arbitrary string */
export function toDomId(s: string, prefix = "el"): string {
  const safe = s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 96);
  return `${prefix}_${safe}`;
}
