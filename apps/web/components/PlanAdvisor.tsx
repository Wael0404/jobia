"use client";

import { PLANS } from "@jobia/shared";
import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "../lib/motion";
import { RobotAgent } from "./RobotAgent";

const pro = PLANS.standard;
const free = PLANS.free;
const perMonth = (perDay: number) => perDay * 30;

/** What the agent says, one bubble at a time. Every number is derived from PLANS. */
const MESSAGES = [
  `Bonjour ! Je suis votre agent. Je vous conseille le forfait ${pro.name} à ${pro.priceTnd} TND.`,
  `Avec ${free.name}, j'envoie ${free.dailyApplications} candidature par jour. Avec ${pro.name}, j'en envoie ${pro.dailyApplications} : ${pro.dailyApplications! / free.dailyApplications!} fois plus de chances chaque jour.`,
  `Sur un mois, ça fait jusqu'à ${perMonth(pro.dailyApplications!)} candidatures ciblées au lieu de ${perMonth(free.dailyApplications!)}.`,
  `${pro.priceTnd} TND par mois, c'est ${(pro.priceTnd / 30).toLocaleString("fr-TN", { maximumFractionDigits: 2 })} TND par jour : moins qu'un café ☕.`,
  `Plus de candidatures bien ciblées, c'est plus de chances de décrocher un entretien. Choisissez ${pro.name} et je m'occupe du reste ! 🚀`,
];

const TYPE_MS = 28;
const HOLD_MS = 2_600;

/** The robot explains, with a typewriter effect, why the recommended plan is the best value. */
export function PlanAdvisor() {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState(0);
  const message = MESSAGES[index]!;

  useEffect(() => {
    if (reduced) {
      setTyped(message.length);
      const id = window.setTimeout(() => setIndex((i) => (i + 1) % MESSAGES.length), HOLD_MS * 2);
      return () => window.clearTimeout(id);
    }
    if (typed < message.length) {
      const id = window.setTimeout(() => setTyped((t) => t + 1), TYPE_MS);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => {
      setIndex((i) => (i + 1) % MESSAGES.length);
      setTyped(0);
    }, HOLD_MS);
    return () => window.clearTimeout(id);
  }, [typed, message, reduced]);

  const talking = typed < message.length;

  return (
    <section className="advisor card reveal" aria-label="Conseil de votre agent">
      <div className="advisor-robot">
        <RobotAgent state={talking ? "searching" : "done"} size={130} />
      </div>
      <div className="advisor-bubble">
        <span className="advisor-name">🤖 Votre agent</span>
        {/* Full sentence for screen readers; the typed version is visual only. */}
        <p className="sr-only">{message}</p>
        <p aria-hidden="true" className="advisor-text">
          {message.slice(0, typed)}
          <span className={`caret ${talking ? "" : "idle"}`} />
        </p>
        <div className="advisor-dots" aria-hidden="true">
          {MESSAGES.map((_, i) => (
            <span key={i} className={i === index ? "on" : ""} />
          ))}
        </div>
      </div>
    </section>
  );
}
