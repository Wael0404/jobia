# Sécurité

## Identifiants tiers (mots de passe des sites, refresh token Google, sessions navigateur)

- Chiffrement **enveloppe** (`packages/security/src/vault.ts`) : une clé de données AES-256-GCM aléatoire par
  secret, elle-même chiffrée par une clé maître (KEK).
- Chaque chiffré est **lié à son propriétaire** par les données authentifiées (`user:<id>:<provider>`) :
  copier un chiffré sur la ligne d'un autre utilisateur le rend indéchiffrable.
- Les secrets ne sont **jamais renvoyés par l'API** et ne sont déchiffrés que dans les workers, au moment
  de l'usage. Les logs masquent `password`, `secret`, `refreshToken`, `authorization`.
- Production : remplacer `StaticKeyProvider` par un `KeyProvider` KMS (AWS KMS, GCP KMS, Vault Transit)
  pour que la clé maître ne soit jamais en mémoire applicative ; rotation de la KEK sans re-chiffrer les
  données (seules les DEK sont ré-encapsulées).

## Authentification

- Google OAuth 2.0 **Authorization Code + PKCE**, `state` à usage unique (Redis, 10 min), liste blanche
  des URI de retour (pas d'open redirect), vérification de l'`id_token` et de `email_verified`.
- Le secret OAuth reste côté serveur ; web et mobile reçoivent un **code à usage unique (60 s)** échangé
  contre les tokens.
- Access token JWT 15 min ; refresh token opaque 256 bits, **haché** en base, **rotatif** ; la réutilisation
  d'un ancien token révoque toute la famille (détection de vol).
- Mobile : tokens dans le Keychain / Keystore (`expo-secure-store`).

## API

- Validation Zod de toutes les entrées ; limite de corps 256 Ko ; Helmet ; CORS restreint au domaine web.
- Rate limiting global et par route, stocké dans Redis (cohérent entre tous les pods).
- Chaque requête est filtrée par `user_id` issu du JWT : un utilisateur ne peut pas lire la candidature
  d'un autre (test d'intégration dédié).

## CV et fichiers

- Upload direct vers S3 par URL présignée (5 min, type et taille imposés, chiffrement SSE), taille vérifiée
  à la confirmation. Copies locales temporaires dans les workers (`0600`) supprimées après usage.

## IA et contenu non fiable

- Offres d'emploi, formulaires et emails sont du **contenu tiers non fiable** : encapsulés dans des balises
  dédiées, avec consigne explicite de les traiter comme des données ; sorties contraintes par des schémas
  (structured outputs) — le modèle ne peut pas déclencher d'action hors du schéma.
- En-têtes MIME assainis (pas d'injection `Bcc:` via un champ contrôlé par une offre).

## Navigateurs

- Un `BrowserContext` isolé par job (cookies, cache, stockage) : aucune fuite de session entre utilisateurs.
