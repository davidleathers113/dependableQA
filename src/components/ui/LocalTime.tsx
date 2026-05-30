import * as React from "react";

/**
 * Renders a timestamp without a hydration mismatch.
 *
 * `new Date(x).toLocaleString(...)` formats in the runtime's locale + timezone,
 * so an Astro island rendered on the server (server tz) produces different text
 * than the browser (viewer tz) — a React #418 hydration error, and the displayed
 * time is wrong for the viewer anyway.
 *
 * This component renders a DETERMINISTIC value (fixed `en-US` locale + UTC) on
 * the server and on the client's first paint, so the hydration markup matches
 * exactly; then, after mount, it swaps to the viewer's local locale + timezone.
 * `suppressHydrationWarning` is a belt-and-suspenders guard on the text node.
 */

const DEFAULT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
};

interface Props {
  /** ISO timestamp string. */
  value: string | null | undefined;
  /** Intl options for the LOCAL (post-mount) format; UTC is forced pre-mount. */
  options?: Intl.DateTimeFormatOptions;
  /** Text shown when `value` is missing/invalid. */
  fallback?: string;
  className?: string;
  title?: string;
}

function formatDeterministic(date: Date, options: Intl.DateTimeFormatOptions): string {
  // Fixed locale + UTC → identical output on server and on the client's first
  // render, regardless of either runtime's locale/timezone.
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(date);
}

function formatLocal(date: Date, options: Intl.DateTimeFormatOptions): string {
  // Viewer's locale + local timezone (only after mount).
  return date.toLocaleString([], options);
}

export function LocalTime({ value, options = DEFAULT_OPTIONS, fallback = "—", className, title }: Props) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  if (!value) {
    return <span className={className}>{fallback}</span>;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return <span className={className}>{fallback}</span>;
  }

  const text = mounted ? formatLocal(date, options) : formatDeterministic(date, options);
  return (
    <time dateTime={value} className={className} title={title} suppressHydrationWarning>
      {text}
    </time>
  );
}
