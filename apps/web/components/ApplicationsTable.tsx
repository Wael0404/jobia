import type { ApplicationDto } from "@jobia/shared";
import Link from "next/link";
import { StatusBadge } from "./StatusBadge";

export function ApplicationsTable({ items }: { items: ApplicationDto[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th>Poste</th>
          <th className="hide-mobile">Source</th>
          <th>Statut</th>
          <th className="hide-mobile">Score</th>
        </tr>
      </thead>
      <tbody>
        {items.map((a) => (
          <tr key={a.id}>
            <td>
              <Link href={`/applications/${a.id}`}>{a.job.title}</Link>
              <div className="muted">{a.job.company}</div>
            </td>
            <td className="hide-mobile">{a.source}</td>
            <td>
              <StatusBadge status={a.status} />
            </td>
            <td className="hide-mobile">{a.matchScore}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
