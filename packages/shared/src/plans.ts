/**
 * Subscription plans — single source of truth for limits (enforced by the
 * worker), prices and marketing copy (shown by the web and mobile apps).
 */
export const PLAN_IDS = ["free", "standard", "premium"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export interface PlanDefinition {
  id: PlanId;
  name: string;
  /** Monthly price in Tunisian dinars; 0 = free. */
  priceTnd: number;
  /** Offers the agent may retain (analyse + propose) per day; null = no plan limit. */
  dailyMatches: number | null;
  /** Applications the agent may send per day; null = no plan limit. */
  dailyApplications: number | null;
  tagline: string;
  /** Short promotional line shown on the card ("publicité"). */
  pitch: string;
  features: string[];
  recommended?: boolean;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Découverte",
    priceTnd: 0,
    dailyMatches: 1,
    dailyApplications: 1,
    tagline: "Pour essayer l'agent sans engagement",
    pitch: "Testez la magie : votre robot trouve et prépare votre meilleure offre du jour.",
    features: ["1 offre analysée et proposée par jour", "1 candidature par jour", "Analyse de votre CV", "Tableau de bord de suivi"],
  },
  standard: {
    id: "standard",
    name: "Pro",
    priceTnd: 15,
    dailyMatches: 5,
    dailyApplications: 5,
    tagline: "Le bon rythme pour décrocher des entretiens",
    pitch: "5 candidatures ciblées par jour : jusqu'à 150 par mois, pour seulement 0,5 TND par jour.",
    features: [
      "5 offres analysées et proposées par jour",
      "5 candidatures par jour",
      "Recherche automatique en arrière-plan",
      "Score de compatibilité pour chaque offre",
      "Suivi des réponses et des entretiens",
    ],
    recommended: true,
  },
  premium: {
    id: "premium",
    name: "Illimité",
    priceTnd: 35,
    dailyMatches: null,
    dailyApplications: null,
    tagline: "Pour une recherche intensive",
    pitch: "Aucune limite de forfait : votre robot postule à toutes les offres qui vous correspondent.",
    features: [
      "Offres analysées sans limite",
      "Candidatures sans limite de forfait*",
      "Recherche automatique en arrière-plan",
      "Score de compatibilité pour chaque offre",
      "Suivi des réponses et des entretiens",
      "Support prioritaire",
    ],
  },
};

/** Applies the plan limit on top of another cap (user preference, safety cap). */
export function capFor(limit: number | null, otherCap: number): number {
  return limit === null ? otherCap : Math.min(limit, otherCap);
}
