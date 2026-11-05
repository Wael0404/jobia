# Architecture

## Principes

- **API sans état** : authentification par JWT court (15 min) vérifié sans I/O ; refresh token opaque,
  rotatif, stocké haché. Aucune session serveur → scalabilité horizontale linéaire.
- **Tout le travail lourd est asynchrone** dans des files BullMQ (Redis). L'API ne fait que lire/écrire
  la base et pousser des jobs ; elle répond en quelques ms.
- **Idempotence partout** : ids de jobs déterministes, contraintes uniques (`user_id, job_offer_id`),
  clé de déduplication par email Gmail. Un job rejoué ne produit jamais de doublon.
- **Machine d'états explicite** (`packages/shared/src/application-status.ts`) appliquée par un
  UPDATE conditionnel (compare-and-set) dans `transitionApplication` : deux workers concurrents ne
  peuvent pas faire régresser une candidature.
- **Ports & adaptateurs** : chaque site d'emploi est un `JobSourceConnector` ; ajouter un site = ajouter
  un profil, sans toucher au pipeline. L'IA est derrière des classes métier (`CvParser`, `JobMatcher`…).
- **Composition root** unique par process (`container.ts`, `context.ts`) : injection par constructeur.

## Pipeline de l'agent

| File | Déclencheur | Travail | Coût dominant |
| --- | --- | --- | --- |
| `cv.parse` | upload confirmé | PDF/DOCX → profil structuré (Claude, sortie Zod validée) | LLM |
| `discovery` | scheduler / nouveau CV / nouvelle intégration | login (session chiffrée réutilisée) + recherche | navigateur |
| `match` | fin de discovery | pré-filtre mots-clés gratuit, puis score LLM par lots de 10 | LLM |
| `submit` | match (autopilot) / validation utilisateur | email Gmail **ou** formulaire / Easy Apply | navigateur ou Gmail |
| `inbox.sync` | scheduler | historique Gmail incrémental → tri LLM → statut / entretien | Gmail + LLM |
| `scheduler` | toutes les 15 min (1 seul worker) | parcourt les utilisateurs actifs (keyset) et planifie | DB |

Garde-fous : quotas quotidiens par utilisateur et par site (Redis, atomiques, partagés entre workers),
délais aléatoires « humains », un seul onglet par utilisateur, questions sans réponse → **jamais inventées** :
la candidature passe en `needs_user_action` et la réponse fournie par l'utilisateur est mémorisée.

## Dimensionnement pour 100 000+ utilisateurs simultanés

**Lecture (dashboard)** — le flux dominant. Avec un rafraîchissement toutes les 30-60 s, 100k utilisateurs
connectés ≈ 2 000 à 4 000 req/s.
- API Fastify : ~1 000 req/s par pod avec requêtes DB → HPA de 6 à 80 pods (`infra/k8s/api.yaml`).
- Rapport mis en cache Redis 60 s par utilisateur ; liste paginée par keyset sur l'index
  `(user_id, status, updated_at)` → pas d'OFFSET, coût constant.
- PostgreSQL derrière **PgBouncer** (transaction pooling) : 80 pods × 10 connexions restent sous la limite.
  Étape suivante : réplica de lecture pour les GET.

**Écriture / agent** — exemple : 100k utilisateurs × 20 candidatures/jour = 2 M/jour ≈ 23/s en moyenne.
- Email (Gmail API) : quelques centaines de ms, négligeable.
- Navigateur : ~45-90 s par candidature → ~1 500 contextes Chromium en parallèle au pic. Les workers
  navigateur ont leur propre pool (2-3 Go, 3 contextes/pod) autoscalé par **KEDA** sur la longueur de la file
  (`infra/k8s/workers.yaml`). C'est le poste de coût principal : privilégier le canal email et les API
  officielles quand elles existent.

**Gmail** : le polling 15 min de 100k boîtes ≈ 110 appels/s. À cette échelle, passer aux notifications push
(`users.watch` + Google Pub/Sub) : un message Pub/Sub déclenche `inbox.sync` pour l'utilisateur concerné.

**LLM** : coût maîtrisé par le pré-filtre (la majorité des offres n'atteint jamais le LLM), le batch
de 10 offres par appel, le cache de prompt sur le profil, et `effort: low` pour le scoring et le tri d'emails.
Le modèle est configurable (`AI_MODEL`). Les refus du modèle sont gérés (fallback serveur activé, puis erreur typée).

## Base de données

- `job_offers` est **globale** : une offre vue par 5 000 utilisateurs est stockée une fois.
- `applications` et `application_events` sont les tables chaudes, toujours filtrées par `user_id` :
  à partir de ~50 M lignes, les partitionner par `HASH(user_id)` (16 ou 32 partitions) ; les index
  existants restent valables par partition.
- `application_events` est append-only (journal d'audit + timeline + rapports).
- Purge : offres expirées archivées après 90 jours ; événements conservés tant que le compte existe.

## Évolutions recommandées

1. Notifications temps réel (SSE/WebSocket via Redis pub/sub) à la place du polling.
2. Push mobile (Expo Notifications) quand un entretien est détecté.
3. Remplacer le `StaticKeyProvider` du coffre-fort par AWS KMS / GCP KMS.
4. Observabilité : OpenTelemetry (traces API → job → appel LLM), métriques BullMQ, alertes sur
   le taux de `needs_reauth` par site (signal de changement d'interface).
