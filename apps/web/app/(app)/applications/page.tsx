"use client";

import { STATUS_LABELS } from "@jobia/api-client";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@jobia/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ApplicationsTable } from "../../../components/ApplicationsTable";
import { api } from "../../../lib/api";

function ApplicationsList() {
  const params = useSearchParams();
  const router = useRouter();
  const status = (params.get("status") as ApplicationStatus | null) ?? undefined;
  const group = !status && params.get("group") === "sent" ? ("sent" as const) : undefined;
  // One <select> value encodes either a single status or the "sent" group.
  const filter = status ?? (group ? "group:sent" : "");

  const query = useInfiniteQuery({
    queryKey: ["applications", "list", status, group],
    queryFn: ({ pageParam }) => api.applications({ status, group, cursor: pageParam, limit: 25 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  const onFilter = (value: string) =>
    router.replace(
      value === "group:sent" ? "/applications?group=sent" : value ? `/applications?status=${value}` : "/applications",
    );

  return (
    <div className="stack">
      <Link href="/dashboard" className="back-link">
        ← Tableau de bord
      </Link>
      <div className="row">
        <h1 style={{ marginRight: "auto", marginBottom: 0 }}>Candidatures</h1>
        <select value={filter} onChange={(e) => onFilter(e.target.value)} aria-label="Filtrer par statut">
          <option value="">Tous les statuts</option>
          <option value="group:sent">Candidatures envoyées</option>
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <section className="card">
        {items.length ? <ApplicationsTable items={items} actions /> : <p className="muted">Aucune candidature.</p>}
        {query.hasNextPage && (
          <button className="btn" onClick={() => void query.fetchNextPage()} disabled={query.isFetchingNextPage}>
            Charger plus
          </button>
        )}
      </section>
    </div>
  );
}

export default function ApplicationsPage() {
  return (
    <Suspense>
      <ApplicationsList />
    </Suspense>
  );
}
