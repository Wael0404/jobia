"use client";

import { PLANS } from "@jobia/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api } from "../lib/api";

function Usage({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const ratio = limit === null ? 0 : Math.min(1, used / limit);
  return (
    <div>
      <div className="usage-row">
        <span className="muted">{label}</span>
        <strong>{limit === null ? `${used} · illimité` : `${used} / ${limit}`}</strong>
      </div>
      {limit !== null && (
        <div className="meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
          <span style={{ transform: `scaleX(${ratio})` }} />
        </div>
      )}
    </div>
  );
}

/** Current plan and today's usage against its limits. */
export function PlanCard() {
  const billing = useQuery({ queryKey: ["billing"], queryFn: api.billing, refetchInterval: 60_000 });
  if (!billing.data) return null;
  const plan = PLANS[billing.data.plan];
  const { usage } = billing.data;
  const limitReached = plan.dailyMatches !== null && usage.matchesToday >= plan.dailyMatches;

  return (
    <section className="card stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Mon forfait</h3>
        <span className="plan-pill">
          {plan.name} · {plan.priceTnd === 0 ? "Gratuit" : `${plan.priceTnd} TND`}
        </span>
      </div>
      <div className="usage">
        <Usage label="Offres proposées aujourd'hui" used={usage.matchesToday} limit={plan.dailyMatches} />
        <Usage label="Candidatures aujourd'hui" used={usage.applicationsToday} limit={plan.dailyApplications} />
      </div>
      {limitReached && billing.data.plan !== "premium" ? (
        <p className="muted" style={{ margin: 0 }}>
          Limite du jour atteinte : l&apos;agent reprend demain.{" "}
          <Link href="/pricing">Passer à un forfait supérieur →</Link>
        </p>
      ) : (
        <Link href="/pricing">Changer de forfait →</Link>
      )}
    </section>
  );
}
