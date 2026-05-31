import * as React from "react";
import type { LucideIcon } from "lucide-react";

export interface TabDescriptor {
  /** Stable id used for selection, aria wiring, and (optionally) the URL. */
  id: string;
  label: string;
  /** Optional leading icon (lucide). Rendered decorative (aria-hidden). */
  icon?: LucideIcon;
  /** Optional trailing indicator (e.g. a status dot) shown after the label. */
  status?: React.ReactNode;
  /** Panel content. All panels stay mounted so form state survives tab switches. */
  panel: React.ReactNode;
}

interface TabsProps {
  tabs: TabDescriptor[];
  value: string;
  onValueChange: (id: string) => void;
  /** Accessible name for the tablist. */
  ariaLabel: string;
  /** Prefix for generated tab/panel ids; must be unique per Tabs instance. */
  idBase: string;
}

/**
 * Accessible, controlled tabs following the WAI-ARIA tabs pattern:
 * roving tabindex, ArrowLeft/Right/Up/Down + Home/End selection, and
 * aria-controls/aria-labelledby wiring. Panels are kept mounted and toggled
 * with the `hidden` attribute so component state (e.g. a half-filled form)
 * is preserved when the user moves between tabs.
 */
export function Tabs({ tabs, value, onValueChange, ariaLabel, idBase }: TabsProps) {
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  function selectByIndex(index: number) {
    const next = (index + tabs.length) % tabs.length;
    onValueChange(tabs[next].id);
    tabRefs.current[next]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      selectByIndex(index + 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      selectByIndex(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectByIndex(0);
    } else if (event.key === "End") {
      event.preventDefault();
      selectByIndex(tabs.length - 1);
    }
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        className="flex flex-wrap gap-1 rounded-2xl border border-slate-800 bg-slate-900/60 p-1"
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === value;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${idBase}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${idBase}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => onValueChange(tab.id)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                selected ? "bg-violet-600/20 text-violet-100" : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {Icon ? <Icon className="h-4 w-4" aria-hidden /> : null}
              <span>{tab.label}</span>
              {tab.status ? <span className="ml-0.5 flex items-center">{tab.status}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="mt-4">
        {tabs.map((tab) => {
          const selected = tab.id === value;
          return (
            <div
              key={tab.id}
              role="tabpanel"
              id={`${idBase}-panel-${tab.id}`}
              aria-labelledby={`${idBase}-tab-${tab.id}`}
              hidden={!selected}
              tabIndex={0}
              className="outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              {tab.panel}
            </div>
          );
        })}
      </div>
    </div>
  );
}
