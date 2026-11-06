# Conformité — à lire avant la production

Ce document liste les contraintes externes qui conditionnent la mise en production. Elles ne sont pas
techniques : ce sont des règles des plateformes et de la loi. Le code est conçu pour les respecter
au mieux, mais certaines décisions relèvent du produit et du juridique.

## 1. LinkedIn

- LinkedIn **n'a pas d'API publique** permettant de rechercher des offres ou de postuler pour un membre.
  « Sign In with LinkedIn » ne donne que le profil de base (nom, email), pas l'accès aux candidatures.
- Les **Conditions d'utilisation de LinkedIn (§8.2)** interdisent les bots, l'automatisation et le scraping,
  même sur le propre compte de l'utilisateur. LinkedIn détecte ces usages et **restreint ou bannit les comptes**.
  Des services similaires ont été poursuivis par LinkedIn.
- En conséquence :
  - le connecteur LinkedIn est **désactivé par défaut** (`FEATURE_LINKEDIN_AUTOMATION=false`) ;
  - l'utilisateur doit **accepter explicitement le risque** (case à cocher + avertissement) ;
  - rythme humain, quotas quotidiens faibles, aucun message privé envoyé aux recruteurs ;
  - les posts RH avec une adresse email sont traités par **email** (Gmail de l'utilisateur), ce qui
    ne nécessite pas d'agir sur LinkedIn au-delà de la lecture.
- **Candidatures Easy Apply** : le pipeline ne les automatise plus. L'agent postule par email quand l'entreprise
  publie une adresse de recrutement, sinon l'utilisateur postule lui-même en un clic depuis l'application
  (statut « À postuler vous-même »). Aucune action n'est faite sur LinkedIn au nom de l'utilisateur pour postuler.
- La **découverte** des offres reste une lecture automatisée de LinkedIn, soumise aux mêmes CGU : à décider
  avec un juriste avant d'activer `FEATURE_LINKEDIN_AUTOMATION`.
- Adresses email : seules des adresses **publiées** et vérifiées sur une page publique sont utilisées ;
  aucune adresse n'est devinée.

## 2. Sites d'emploi tunisiens

- Vérifier les CGU et le `robots.txt` de chaque site (Tanitjobs, Keejob, Emploitunisie…).
- Demander un **partenariat / une API** quand c'est possible : c'est plus fiable que l'automatisation
  de navigateur et évite les blocages.
- Les sélecteurs de `packages/connectors/src/sites/tunisia.ts` sont un point de départ à **valider sur
  les sites réels** (`pnpm --filter @jobia/worker smoke <site>`) avant activation.

## 3. Google / Gmail

- Les scopes `gmail.send` et `gmail.readonly` sont **restreints** : la publication de l'application exige
  la vérification OAuth de Google **et** un audit de sécurité annuel (CASA, via un évaluateur agréé).
  Sans cela, l'application est limitée à 100 utilisateurs de test.
- Politique « Limited Use » : les données Gmail ne servent qu'à la fonctionnalité visible par l'utilisateur
  (envoyer ses candidatures, détecter les réponses). Pas de publicité, pas de revente, pas d'entraînement
  de modèles sur ces données.
- L'agent n'envoie un email qu'à l'adresse indiquée dans une offre, au nom et avec l'accord de l'utilisateur.

## 4. Données personnelles

- Tunisie : **loi organique n° 2004-63** (déclaration auprès de l'INPDP) ; utilisateurs européens : **RGPD**.
- CV et identifiants sont des données personnelles : minimisation, chiffrement, droit à l'effacement
  (`DELETE /v1/me` supprime tout en cascade), durée de conservation documentée.
- Sous-traitants à déclarer : hébergeur, Anthropic (traitement des CV/emails par l'IA), Google.

## 5. Honnêteté de l'agent

- L'agent **n'invente jamais** d'expérience, de diplôme, de prétention salariale ou de disponibilité :
  sans information, la question remonte à l'utilisateur (`needs_user_action`).
- Un score minimum (70/100 par défaut) évite le « spam » de candidatures non pertinentes, qui nuit au
  candidat et à la réputation de la plateforme auprès des recruteurs.
