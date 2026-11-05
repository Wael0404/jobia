# Déploiement gratuit (Oracle Cloud Always Free)

Coût : **0 €** pour l'hébergement. Seule l'**API Claude** est payante, à l'usage
(quelques dollars pour les tests ; fixez une limite de dépense mensuelle).

Résultat : `https://<votre-nom>.duckdns.org` avec le dashboard web, l'API et les robots, sur une seule machine.
Capacité de cette configuration : quelques centaines d'utilisateurs. Pour 100k, voir `infra/k8s` et `docs/ARCHITECTURE.md`.

Durée : ~45 minutes, dont ~15 min d'attente.

---

## Étape 1 — Serveur gratuit (Oracle Cloud)

1. Créez un compte sur **cloud.oracle.com** (une carte bancaire est demandée pour vérifier l'identité ;
   rien n'est prélevé tant que vous restez sur les ressources « Always Free »).
2. Menu **Compute → Instances → Create instance** :
   - Image : **Ubuntu 24.04** ;
   - Shape : **Ampere (VM.Standard.A1.Flex)**, **4 OCPU, 24 Go RAM** (gratuit) ;
   - Ajoutez votre clé SSH publique ;
   - Si « Out of capacity » : réessayez plus tard ou changez d'« Availability domain ».
3. Ouvrez les ports web : **Networking → Virtual cloud networks → votre VCN → Security Lists → Default →
   Add Ingress Rules** : source `0.0.0.0/0`, TCP, ports **80** et **443**.
4. Notez l'**adresse IP publique** de l'instance.

## Étape 2 — Nom de domaine gratuit (DuckDNS)

1. Allez sur **duckdns.org**, connectez-vous (Google ou GitHub).
2. Créez un sous-domaine, par ex. `jobia-wael` → `jobia-wael.duckdns.org`.
3. Mettez l'**IP publique** de l'étape 1 dans le champ *current ip*, puis **update ip**.

## Étape 3 — Connexion Google + Gmail (gratuit)

1. **console.cloud.google.com** → créez un projet « Jobia ».
2. **APIs & Services → Library** → activez **Gmail API**.
3. **OAuth consent screen** (Google Auth Platform) :
   - Type : **External**, nom « Jobia », votre email de support ;
   - Scopes : `openid`, `email`, `profile`, `.../auth/gmail.send`, `.../auth/gmail.readonly` ;
   - Laissez l'app en mode **Testing** et ajoutez vos utilisateurs dans **Test users** (100 maximum).
     *La publication à tous exige la vérification Google + l'audit CASA, voir `docs/COMPLIANCE.md`.*
4. **Credentials → Create credentials → OAuth client ID** :
   - Type : **Web application** ;
   - Authorized redirect URI : `https://jobia-wael.duckdns.org/v1/auth/google/callback` ;
   - Copiez le **Client ID** et le **Client secret**.

## Étape 4 — Clé IA (payante à l'usage)

1. **console.anthropic.com** → créez un compte, ajoutez un moyen de paiement (crédit minimum ~5 $).
2. **Settings → Limits** : fixez une limite mensuelle (par ex. 10 $).
3. **API Keys → Create key** → copiez la clé.
4. Pour réduire le coût, vous pouvez mettre `AI_MODEL=claude-sonnet-5-5` dans `.env` (moins cher, très bon
   pour ce type de tâches).

## Étape 5 — Déploiement (une commande)

Connectez-vous au serveur (`ssh ubuntu@<IP>`), puis :

```bash
git clone https://github.com/wael0404/jobia.git
cd jobia
git checkout ccr-fa46b2d0-j88zgx      # ou main une fois la branche fusionnée
bash infra/deploy/deploy.sh             # installe Docker, crée infra/deploy/.env et s'arrête
nano infra/deploy/.env                  # remplissez DOMAIN, ACME_EMAIL, GOOGLE_*, ANTHROPIC_API_KEY
bash infra/deploy/deploy.sh             # build (~10 min) puis démarrage
```

> Si le dépôt est privé, pour `git clone`, utilisez un *personal access token* GitHub
> (`https://<token>@github.com/wael0404/jobia.git`) ou une clé SSH de déploiement.

Vérification :

```bash
curl https://jobia-wael.duckdns.org/health/ready     # → {"ok":true}
```

Ouvrez `https://jobia-wael.duckdns.org` → **Continuer avec Google** (avec un compte ajouté en « Test users »).

**Sauvegardez `infra/deploy/.env`** (gestionnaire de mots de passe) : sans `VAULT_MASTER_KEY`, les identifiants
chiffrés des utilisateurs sont perdus.

## Étape 6 — Application mobile (gratuit)

Sur votre ordinateur :

```bash
pnpm install
cd apps/mobile
EXPO_PUBLIC_API_URL=https://jobia-wael.duckdns.org npx expo start
```

Scannez le QR code avec **Expo Go** (iOS / Android). Pour un vrai fichier `.apk` / TestFlight : `npx eas build`
(offre gratuite d'Expo, avec file d'attente).

## Exploitation

| Action | Commande (dans `infra/deploy`) |
| --- | --- |
| Mettre à jour | `bash deploy.sh` |
| Logs | `sudo docker compose -f docker-compose.prod.yml logs -f api worker-browser` |
| État | `sudo docker compose -f docker-compose.prod.yml ps` |
| Sauvegarde DB | `sudo docker compose -f docker-compose.prod.yml exec postgres pg_dump -U jobia jobia > backup.sql` |
| Arrêter | `sudo docker compose -f docker-compose.prod.yml down` (les données restent dans les volumes) |

## Dépannage

- **HTTPS ne marche pas** : vérifiez que le domaine DuckDNS pointe sur l'IP et que les ports 80/443 sont ouverts
  (Security List Oracle **et** iptables — `deploy.sh` s'occupe d'iptables).
- **`redirect_uri_mismatch` chez Google** : l'URI de l'étape 3.4 doit être exactement
  `https://<DOMAIN>/v1/auth/google/callback`.
- **« Access blocked: app not verified »** : ajoutez le compte dans *Test users*.
- **L'agent ne trouve pas d'offres** : les sélecteurs des sites doivent être validés
  (`docs/COMPLIANCE.md` §2) ; consultez `logs worker-browser`.
