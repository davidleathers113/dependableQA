import { getImportStatusClassName, getImportStatusLabel } from "../helpers";

interface Props {
  status: string;
}

export function ImportStatusBadge({ status }: Props) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${getImportStatusClassName(status)}`}
    >
      {getImportStatusLabel(status)}
    </span>
  );
}
