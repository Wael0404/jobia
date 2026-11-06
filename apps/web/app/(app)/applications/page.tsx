"use client";

import { STATUS_LABELS } from "@jobia/api-client";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@jobia/shared";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { ApplicationsTable } from "../../../components/ApplicationsTable";
import { api } from "../../../lib/api";

function ApplicationsList() {
  const params = useSearchParams();
  const router = useRouter();
  const status = (params.get("status") as ApplicationStatus | null) ?? undefined;

  const query = useInfiniteQuery({
    queryKey: ["applications", "list", status],
    queryFn: ({ pageParam }) => api.applications({ status, cursor: pageParam, limit: 25 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="stack">
      <div className="row">
        <h1 style={{ marginRight: "auto" }}>Candidatures</h1>
        <select
          value={status ?? ""}
          onChange={(e) => router.replace(e.target.value ? `/applications?status=${e.target.value}` : "/applications")}
        >
          <option value="">Tous les statuts</option>
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
