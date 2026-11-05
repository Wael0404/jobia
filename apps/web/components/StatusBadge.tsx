import { STATUS_LABELS } from "@jobia/api-client";
import type { ApplicationStatus } from "@jobia/shared";

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return <span className={`badge ${status}`}>{STATUS_LABELS[status]}</span>;
}
