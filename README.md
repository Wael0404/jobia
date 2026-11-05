# Jobia — agent IA de candidature (web + mobile)

L'utilisateur se connecte avec **Google**, dépose son **CV**, et un **agent IA** :

1. lit le CV (Claude) et en extrait un profil structuré (compétences, postes visés, mots-clés) ;
2. se connecte **en son nom** à LinkedIn et aux sites d'emploi tunisiens (Tanitjobs, Keejob, Emploitunisie) ;
3. cherche les offres + les posts LinkedIn de RH (« envoyez votre CV à rh@… ») ;
4. note chaque offre (score 0-100) et ne garde que les bonnes ;
5. **postule** : formulaire du site, LinkedIn Easy Apply, ou **email envoyé depuis le Gmail de l'utilisateur** avec le CV en pièce jointe et une lettre personnalisée ;
6. lit les réponses dans Gmail et met à jour chaque candidature (**vue, entretien, refus, offre**) ;
7. affiche un **rapport** : candidatures envoyées, entretiens à venir, avancement de chaque poste.

Deux modes : **Validation** (l'agent propose, l'utilisateur valide) et **Pilote automatique**.

> ⚠️ À lire avant la mise en production : [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) — l'automatisation LinkedIn
> est interdite par les CGU de LinkedIn, et les scopes Gmail exigent une vérification Google.

## Architecture en bref

```
 Web (Next.js) ─┐                       ┌─▶ cv.parse ──▶ discovery ──▶ match ──▶ submit
 Mobile (Expo) ─┼─▶ API (Fastify, JWT) ─┤        (Claude)  (Playwright)  (Claude)  (Playwright / Gmail)
                │      │   │            └─▶ inbox.sync (Gmail + Claude)   ◀── scheduler (toutes les 15 min)
                │      │   └─ Redis (cache, rate-limit, files BullMQ)
                │      └───── PostgreSQL (Drizzle)       S3 (CV, upload direct par URL présignée)
```

Détails, dimensionnement pour **100 000+ utilisateurs simultanés** : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
Sécurité (chiffrement des identifiants, tokens, RGPD) : [`docs/SECURITY.md`](docs/SECURITY.md).

## Structure du monorepo

| Dossier | Rôle |
| --- | --- |
| `apps/api` | API REST Fastify : auth Google (PKCE), CV, intégrations, candidatures, rapports |
| `apps/worker` | Workers BullMQ : parsing CV, découverte, matching, candidature, suivi Gmail, scheduler |
| `apps/web` | Dashboard Next.js |
| `apps/mobile` | Application Expo / React Native (iOS + Android) |
| `packages/shared` | Domaine : statuts, machine d'états, schémas Zod, DTO |
| `packages/db` | Schéma Drizzle, migrations, transition d'état atomique |
| `packages/ai` | Capacités IA (Claude) : parsing CV, matching, rédaction, formulaires, tri d'emails |
| `packages/connectors` | Un connecteur par site (LinkedIn, sites tunisiens), remplissage de formulaires générique |
| `packages/queue` | Noms des files, payloads typés, ids de jobs idempotents |
| `packages/security` | Coffre-fort de secrets (chiffrement enveloppe AES-256-GCM), tokens |
| `packages/api-client` | Client HTTP typé partagé web/mobile (refresh token transparent) |
| `infra/` | Dockerfiles, manifests Kubernetes (HPA + KEDA) |

## Démarrage local

Prérequis : Node 22, pnpm 10, Docker.

```bash
cp .env.example .env                # remplir GOOGLE_*, ANTHROPIC_API_KEY, VAULT_MASTER_KEY (openssl rand -base64 32)
docker compose up -d postgres redis minio minio-init
pnpm install
pnpm db:migrate
pnpm dev                            # api :4000, web :3000, workers
pnpm --filter @jobia/mobile start   # application mobile (Expo)
```

Google Cloud Console → identifiants OAuth « Application Web » avec l'URI de redirection
`http://localhost:4000/v1/auth/google/callback`, et l'API Gmail activée.

## Qualité

```bash
pnpm typecheck                         # 11 packages, TypeScript strict
pnpm test                              # tests unitaires
INTEGRATION=1 pnpm test                # + tests d'intégration (Postgres + Redis réels)
pnpm --filter @jobia/worker smoke tanitjobs "développeur"   # connecteur contre le vrai site (compte de test)
```

Les tests d'intégration couvrent : rotation des refresh tokens et détection de vol, machine d'états
(transitions illégales refusées), isolation entre utilisateurs, matching (seuil, deal-breakers, idempotence),
détection d'entretien dans Gmail sans doublon en cas de rejeu.
