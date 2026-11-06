"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { api } from "../../../lib/api";

function Callback() {
  const params = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    const code = params.get("code");
    if (!code || done.current) return;
    done.current = true; // the one-time code must be exchanged exactly once (StrictMode double effects)
    api
      .exchangeLoginCode(code)
      .then(() => api.me())
      // First sign-in: the user picks a plan before reaching the dashboard.
      .then((me) => router.replace(me.planSelected ? "/dashboard" : "/pricing?onboarding=1"))
      .catch(() => setError("La connexion a échoué. Merci de réessayer."));
  }, [params, router]);

  return <main className="hero">{error ? <p>{error}</p> : <p className="muted">Connexion en cours…</p>}</main>;
}

export default function CallbackPage() {
  return (
    <Suspense>
      <Callback />
    </Suspense>
  );
}
