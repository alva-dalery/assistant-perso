# 🌐 Mettre Assistant perso en ligne — accès réservé à vous seul

L'application est un Next.js 15 sans backend : tout l'état vit dans le navigateur.
Elle peut donc être hébergée gratuitement, et il suffit d'ajouter une **barrière d'authentification**
pour qu'elle ne soit accessible qu'à vous.

---

## 🟢 Version ultra simple (10 minutes, sans GitHub)

En clair :
- **Vercel** = l'entreprise qui garde votre application allumée sur Internet, gratuitement.
- **Le middleware** = la serrure déjà installée : sans mot de passe, personne n'entre.

1. **Créer un compte gratuit** sur [vercel.com](https://vercel.com) (bouton « Sign up », connexion Google ou e-mail).

2. **Envoyer l'application en ligne.** Dans le Terminal, collez ceci :

   ```bash
   cd "/Users/alvadalery/Projets IA/Antigravity projects/Assistant perso"
   npx vercel@latest
   ```

   - Tapez `Y` puis appuyez sur **Entrée** à chaque question (tout par défaut).
   - Une page s'ouvre dans le navigateur : connectez-vous.
   - À la fin, le Terminal affiche votre adresse, du type
     `https://assistant-perso-abc123.vercel.app`.

3. **Poser le mot de passe.** Sur vercel.com → votre projet → **Settings → Environment Variables**, ajoutez :
   - `SITE_USER` → votre identifiant, par exemple `alex`
   - `SITE_PASSWORD` → un mot de passe long (générez-le avec `openssl rand -base64 24`)

4. **Redéployer.** Onglet **Deployments** → sur le dernier déploiement, menu `…` → **Redeploy**.

5. **Tester.** Ouvrez votre adresse : le navigateur demande identifiant + mot de passe.
   Eux seuls ouvrent la porte. Un inconnu voit juste « Accès réservé ».

**Pour mettre à jour l'application plus tard**, une seule commande :

```bash
npx vercel@latest --prod
```

---

Trois stratégies plus détaillées, de la plus simple à la plus étanche :

| Option | Effort | Protection | Où sont les données |
| --- | --- | --- | --- |
| **A. Vercel + mot de passe** | 15 min | 1 mot de passe (Basic Auth) | Serveur Vercel |
| **B. Vercel + Cloudflare Access** | 45 min | Connexion Google/e-mail avec code à usage unique | Serveur Vercel |
| **C. Tunnel privé (aucun site public)** | 30 min | Réseau privé (Tailscale / Cloudflare Tunnel) | Votre Mac uniquement |

> La protection par middleware ajoutée dans [`src/middleware.ts`](src/middleware.ts:1) est **déjà active** :
> elle bloque tout visiteur sans identifiants et reste désactivée en local (`npm run dev`).

---

## 📦 Mettre le code sur GitHub

✅ **Déjà fait** : dépôt privé en ligne sur <https://github.com/alva-dalery/assistant-perso>,
branche `main` poussée (commits `2b0e8ca` et `b52b614`).

`node_modules`, `.next`, les variables d'environnement et `Assistant perso.app` sont exclus
par [`.gitignore`](.gitignore:1). Les instructions ci-dessous restent utiles pour un futur dépôt.

### Méthode 1 — Sans rien installer (site web GitHub)

1. Créez un compte sur [github.com](https://github.com) si vous n'en avez pas.
2. En haut à droite : **+** → **New repository**.
3. Remplissez :
   - **Repository name** : `assistant-perso`
   - **Visibility** : **Private** ← le code reste privé
   - Ne cochez **aucune** case (pas de README ni de `.gitignore` : ils existent déjà)
4. Cliquez **Create repository**, puis dans le Terminal :

   ```bash
   cd "/Users/alvadalery/Projets IA/Antigravity projects/Assistant perso"
   git remote add origin https://github.com/VOTRE_COMPTE/assistant-perso.git
   git push -u origin main
   ```

5. GitHub demande vos identifiants. ⚠️ Le mot de passe du compte ne suffit pas :
   il faut un **token**. Générez-le sur GitHub → **Settings → Developer settings →
   Personal access tokens → Tokens (classic) → Generate new token**, cochez la case **repo**,
   copiez la valeur et collez-la à la place du mot de passe (macOS la mémorise ensuite).

> Alternative sans ligne de commande : installez **GitHub Desktop** (<https://desktop.github.com>),
> puis **File → Add local repository** → ce dossier → **Publish repository**
> (cochez *Keep this code private*).

### Méthode 2 — Avec GitHub CLI

```bash
brew install gh
gh auth login        # suivez les questions, connexion via le navigateur
cd "/Users/alvadalery/Projets IA/Antigravity projects/Assistant perso"
gh repo create assistant-perso --private --source=. --remote=origin --push
```

### À chaque modification ensuite

```bash
git add .
git commit -m "Description de ma modification"
git push
```

> L'identité Git locale est réglée sur `alvadalery <alvadalery@users.noreply.github.com>`.
> Pour la changer : `git config user.name "..."` puis `git config user.email "..."`.

---

## Option A — Vercel + mot de passe (recommandé pour démarrer)

### 1. Mettre le code sur GitHub

✅ Déjà fait (voir ci-dessus).

### 2. Importer le projet sur Vercel

1. [vercel.com](https://vercel.com) → **Sign Up** → **Continue with GitHub**, puis autorisez Vercel.
2. Tableau de bord → **Add New… → Project**.
3. Si `assistant-perso` n'apparaît pas dans la liste : **Adjust GitHub App Permissions**
   → cochez le dépôt privé `assistant-perso` → **Install / Save**.
4. Cliquez **Import** en face de `assistant-perso`.
5. Écran de configuration — gardez tout par défaut :
   - **Project Name** : `assistant-perso`
   - **Framework Preset** : `Next.js`
   - **Root Directory** : `./`
   - **Build Command** : `next build`
   - **Output Directory** : `.next`
6. **Avant de cliquer sur Deploy**, ouvrez **Environment Variables** et créez deux variables :
   - `SITE_USER` → votre identifiant (ex. `alex`)
   - `SITE_PASSWORD` → mot de passe long généré avec `openssl rand -base64 24`
   - Laissez **Production** cochée (ajoutez **Preview** si vous voulez protéger aussi les aperçus).
7. **Deploy** (1 à 2 minutes).
8. Vercel affiche l'URL `https://assistant-perso-xxxx.vercel.app` : ouvrez-la,
   le navigateur demande identifiant + mot de passe.

> ⚠️ Le mot de passe doit rester en **ASCII** (lettres, chiffres, `!@#%^&*-_=+`).
> Un accent casserait le décodage de l'authentification du navigateur.
>
> Si vous avez déployé avant de créer les variables : **Settings → Environment Variables**,
> puis **Deployments → `…` → Redeploy**. Sans `SITE_PASSWORD`, le middleware renvoie
> volontairement une erreur 503 : l'application échoue « fermée », jamais ouverte à tous.

### 3. Vérifier la protection

- Ouvrez l'URL en **navigation privée** → la fenêtre de connexion doit apparaître.
- Mauvais mot de passe → erreur 401 « Identifiants invalides ».
- Bon mot de passe → l'application s'affiche normalement.

### 3. (Optionnel) Nom de domaine personnel

Vercel → **Settings → Domains** → ajoutez `assistant.votredomaine.fr` et suivez l'enregistrement DNS indiqué.
HTTPS est automatique.

### Mises à jour ensuite

```bash
git add .
git commit -m "Mes modifications"
git push
```

Vercel redéploie tout seul à chaque `push`.

---

## Option B — Vercel + Cloudflare Access (connexion Google, sans mot de passe partagé)

Objectif : garder Vercel pour l'hébergement, mais déléguer l'authentification à Cloudflare
(gratuit jusqu'à 50 utilisateurs) avec **vérification par e-mail à usage unique** ou **Google**.

1. Achetez/un domaine et faites-le gérer par **Cloudflare** (nameservers Cloudflare).
2. Sur Vercel : ajoutez ce domaine, puis dans Cloudflare créez un **CNAME** vers `cname.vercel-dns.com`
   avec le **proxy Cloudflare activé** (nuage orange).
3. Cloudflare Dashboard → **Zero Trust → Access → Applications → Add an application → Self-hosted** :
   - Application domain : `assistant.votredomaine.fr`
   - Policy : **Allow** → **Emails** → votre adresse e-mail uniquement
   - Session duration : 1 mois
4. Résultat : avant même d'atteindre l'application, Cloudflare exige une connexion
   (code envoyé par e-mail ou compte Google). Aucune autre personne ne peut entrer.

Le mot de passe du middleware (Option A) peut rester en place : c'est une seconde couche.

---

## Option C — Aucun site public : accès privé via tunnel

Ici l'application continue de tourner **sur votre Mac** : vos données ne quittent jamais la machine,
mais vous y accédez depuis votre téléphone ou un autre ordinateur.

### Variante 1 — Tailscale (le plus simple)

```bash
brew install --cask tailscale        # puis connectez-vous dans l'app
cd "/Users/alvadalery/Projets IA/Antigravity projects/Assistant perso"
npm run build
npm start                            # serveur sur le port 3000
```

Installez Tailscale sur votre iPhone / autre Mac avec **le même compte**,
puis ouvrez `http://<nom-du-mac>:3000`. Seuls les appareils de votre réseau Tailscale peuvent y accéder.

Pour du HTTPS propre :

```bash
tailscale serve --bg https / http://localhost:3000
```

### Variante 2 — Cloudflare Tunnel + Access

```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create assistant-perso
cloudflared tunnel route dns assistant-perso assistant.votredomaine.fr
cloudflared tunnel run --url http://localhost:3000 assistant-perso
```

Puis ajoutez la policy **Access** décrite dans l'option B (e-mail autorisé = vous).
Aucun port n'est ouvert sur votre box : le tunnel sort vers Cloudflare.

---

## 📧 Connecter Gmail (IMAP + SMTP, sans validation Google)

L'application lit et envoie vos emails via **IMAP / SMTP** avec un **mot de passe d'application**.
Pas de projet Google Cloud, pas d'écran de consentement, pas de validation par Google.

### 1. Créer le mot de passe d'application

1. [myaccount.google.com](https://myaccount.google.com) → **Sécurité** → activer la **validation en deux étapes**
   (obligatoire pour obtenir un mot de passe d'application).
2. Toujours dans **Sécurité** → **Mots de passe des applications**.
3. Nom : `Assistant perso` → **Créer**. Google affiche 16 caractères du type `abcd efgh ijkl mnop`.
4. Notez-les : ils ne seront plus réaffichés.

### 2. Renseigner les variables

Sur Vercel → projet → **Settings → Environment Variables** :

| Key | Value |
| --- | --- |
| `GMAIL_USER` | votre adresse Gmail complète |
| `GMAIL_APP_PASSWORD` | les 16 caractères (avec ou sans espaces) |

Environnements : **Production** (+ Preview). Puis **Deployments → `…` → Redeploy**
en décochant le cache de build.

En local, les mêmes lignes dans `.env.local` (fichier ignoré par Git), puis `npm run dev`.

### 3. Utiliser

- Onglet **Secrétariat** → bouton **Boîte Gmail réelle** : liste des derniers messages,
  lecture du contenu, réponse avec deux options :
  - **Enregistrer en brouillon** → le message arrive dans le dossier *Brouillons* de Gmail (rien n'est envoyé) ;
  - **Envoyer maintenant** → confirmation obligatoire, puis envoi réel par SMTP.
- Onglet **Paramètres → Synchronisation** : la carte Google affiche l'adresse réellement connectée
  et le nombre de messages, avec un bouton **Tester la connexion**.

### Factures fournisseurs : téléchargement et suppression

Quand un email classé **Factures** provient d'un fournisseur reconnu **Lagoon**, **EEC Engie**,
**CDE (Calédonienne des eaux)**, **OPT.nc Internet** (compte 9000019168) ou **OPT.nc Mobile**
(compte 1.11150452), l'application :

1. détecte le fournisseur (expéditeur, objet, corps, numéro de compte) ;
2. repère les **pièces jointes PDF** ;
3. détermine la **période** : mois/année ou trimestre lu dans l'objet ou le corps
   (`août 2026`, `09/2026`, `T3 2026`, `3e trimestre 2026`), sinon mois/trimestre de réception ;
4. propose un **nom normalisé**, modifiable avant validation :

| Fournisseur | Exemple de nom proposé |
| --- | --- |
| Lagoon | `2026-08 - LAGOON - Facture.pdf` |
| EEC Engie | `2026-09 - EEC - Facture.pdf` |
| CDE | `2026-T3 - CDE - Facture.pdf` |
| OPT Internet | `2026-06 - OPT Internet - Facture.pdf` |
| OPT Mobile | `2026-06 - OPT Mobile - Facture.pdf` |

**OPT.nc Internet ou Mobile ?** Les emails des deux offres se ressemblent et l'objet ne permet pas de
les distinguer : la différence se lit dans le **n° de compte imprimé dans le PDF**. L'application
télécharge donc le PDF joint, en extrait le texte (pdf.js) et applique :

| N° de compte lu dans le PDF | Fournisseur retenu |
| --- | --- |
| `9000019168` | OPT.nc **Internet** |
| `1.11150452` (ou `1 111 50452`) | OPT.nc **Mobile** |

Le nom du fichier et l'icône du fournisseur suivent cette lecture. Si le PDF est illisible, l'objet et le corps de
l'email servent de repli, et le nom proposé reste modifiable avant téléchargement.

**Règle de période** : si un **mois en toutes lettres** est écrit dans l'objet ou le corps
(« Facture : Mois de Octobre 2026 [Ref. …] »), c'est lui qui fait foi, sans décalage. Même logique
pour un **trimestre explicite** (`T3 2026`) chez CDE. Autrement, on utilise la date de facture
(celle citée dans l'email, sinon la date de réception). Si cette date tombe dans les **5 premiers jours** du mois, la période est le **mois
précédent** (facture du 01/11/2026 → `2026-10`), sinon c'est le mois courant
(facture du 31/08/2026 → `2026-08`). CDE reste en trimestres (`2026-T3`).

Rien n'est téléchargé tant que vous n'avez pas validé. L'onglet **Factures** fonctionne en
**traitement en lot**, sans ouvrir chaque email :

1. dès l'ouverture de l'onglet, tous les emails de facture sont analysés par paquets de 5 (une seule
   connexion IMAP par paquet) : **nom du fournisseur**, objet, date, **nom de PDF proposé** et
   **montant de la facture** apparaissent directement dans la liste ;
2. une **case à cocher** par email et une case **« Tout sélectionner »** permettent de choisir les
   factures à traiter ;
3. chaque nom reste **modifiable** dans la liste (champ de saisie), le montant s'affiche juste à
   droite ;
4. **« Valider les noms et télécharger (n) »** télécharge tous les PDF sélectionnés avec les noms
   affichés, puis **déplace chaque email correspondant dans la corbeille Gmail** ;
5. une **icône œil** ouvre le PDF dans un nouvel onglet, uniquement si vous le demandez (aucun
   aperçu automatique) ;
6. les emails sans facture reconnue restent visibles avec la mention « Aucune facture reconnue ».

Le PDF joint (≤ 8 Mo) est lu pour chaque facture : il fournit le **montant TTC** en `XPF` / `FCFP`
(ou `€`) — les lignes « net à payer », « total » ou « montant » sont prioritaires — et, pour OPT.nc,
le **n° de compte** qui distingue Internet de Mobile. Si le PDF est illisible, le montant est
recherché dans le texte de l'email.

Quand une facture est ouverte depuis un autre onglet (« Tous », « À traiter »…), la fiche garde la
présentation en **trois colonnes** : liste des emails, détail (nom du fichier modifiable + boutons)
et **aperçu complet du PDF**. La section **Ranger**, le bloc **Résumé de l'email** et la barre
« Information à lire / Répondre quand même » sont masqués : la fiche ne montre que le traitement de
la facture. Chaque facture porte une **icône de fournisseur** (aucun logo externe chargé) :

| Fournisseur | Icône |
| --- | --- |
| Lagoon | box internet |
| EEC Engie | éclair (électricité) |
| Calédonienne des eaux | goutte d'eau |
| OPT.nc Internet | Wi-Fi (internet) |
| OPT.nc Mobile | smartphone |

Pour **EEC Engie**, la facture est souvent disponible via un **lien** dans l'email plutôt qu'en
pièce jointe : l'application crée une entrée virtuelle, affiche le PDF dans l'aperçu via une route
proxy (`/api/gmail/invoice/download`) restreinte aux domaines des fournisseurs (`*.engie.nc`,
`*.eec.nc`, `*.opt.nc`, `*.lagoon.nc`, `*.cde.nc`, `*.helia.nc`), permet de **renommer** le fichier,
puis le télécharge et supprime le mail comme pour une pièce jointe.

Avant d'afficher l'aperçu, l'application **vérifie que le lien renvoie réellement un fichier PDF**
(lecture des 5 premiers octets `%PDF-`). Si le fournisseur renvoie une page HTML (session expirée,
connexion requise) ou un statut d'erreur, l'aperçu n'est pas affiché, un message explicite apparaît
et un lien de secours **« Ouvrir la facture dans le navigateur »** est proposé : il ouvre la page
interne `/facture`, qui affiche le PDF en plein écran dans un vrai onglet web (et propose un bouton
« Télécharger le PDF » si vous le souhaitez, avec le nom de fichier choisi). Le proxy tente aussi de
basculer un lien `http://` en `https://`.
Après le téléchargement réussi, **l'email est déplacé dans la corbeille Gmail** (suppression
récupérable). Si plusieurs PDF sont joints, ils reçoivent un suffixe `(1)`, `(2)`…

### Suivi de colis et commandes

Un email de suivi de colis (expédition, acheminement, livraison) reçoit l'étiquette **Commande** et
apparaît dans l'onglet **Commandes** (il reste aussi dans **À traiter**). La détection s'appuie sur :

- l'**objet** (« votre colis », « commande expédiée », « shipment notification », « out for delivery »…) ;
- l'**expéditeur** : La Poste / Colissimo, Chronopost, DHL, UPS, FedEx, GLS, Mondial Relay, Amazon,
  AliExpress / Cainiao, Vinted, Shein, Temu, OPT.nc (Colis Poste) ;
- le **format du numéro de suivi** (UPS `1Z…`, Amazon `TBA…`, DHL `JD…`, Cainiao `LP…`, format
  international `XX123456789FR`, Colissimo 13 caractères).

La fiche du message affiche alors une carte **Suivi de colis** avec :

| Information | Détail |
| --- | --- |
| Transporteur | reconnu via l'expéditeur ou le format du numéro |
| Numéro de suivi | jusqu'à 3 numéros, sélectionnables, bouton **« Copier le numéro »** |
| Statut | pris en charge, en transit, en cours de livraison, disponible en point relais, livré, retard |
| Livraison prévue | date annoncée dans l'email, si présente |
| Lien | bouton **« Suivre le colis »** : lien de l'email, sinon page du transporteur avec le numéro |

La détection passe **avant** le tri « diffusion de masse » : une boutique comme **Kapten & Son** qui
expédie ses emails via une régie marketing (en-têtes `List-Unsubscribe`, Klaviyo…) reste bien dans
**Commandes** et non dans *Newsletter/pubs*. En complément, **le corps du message est relu** à
l'ouverture : si un email classé par défaut en newsletter/pub/infos contient un vrai suivi de colis
(numéro + transporteur), il est reclassé en **Commande**.

Ces notifications ne demandent pas de réponse : aucun brouillon n'est proposé, mais le bouton
**« Répondre quand même »** reste disponible. Une vraie question d'un expéditeur (« Question sur ma
commande ? ») reste classée **Répondre**.

#### Valider un suivi et le ranger

Pour un email de **commande**, la section **Ranger** et la recherche de dossier sont masquées : seul
le bouton de suppression reste. Dans la carte **Suivi de colis**, le dossier est **présélectionné**
(**« Commandes et Factures »**, sinon le premier dossier contenant « commande », à défaut
« facture ») ; vous pouvez le changer, puis cliquez sur **« Valider et suivre »** :

1. l'email est **déplacé dans le dossier Gmail** choisi ;
2. le colis est enregistré dans le navigateur (`localStorage`, clé `assistantPerso.tracking.v1`) ;
3. il apparaît dans le **tableau de bord**, section **Colis en cours**.

Chaque colis du tableau de bord affiche le **magasin**, le **transporteur**, le **numéro de suivi**,
un bouton **« Suivre »**, le **statut**, la **date d'expédition** et un **historique en accordéon**
(étapes datées lues dans l'email, sinon message invitant à ouvrir le lien du transporteur). Une
corbeille retire le colis du tableau de bord — l'email reste rangé dans Gmail. Les 20 derniers colis
sont conservés.

Le pied de fiche **« Suivi de colis : aucune réponse attendue »** et le bouton **« Répondre quand
même »** n'apparaissent pas pour ces emails : une notification d'expédition ne se répond pas.

#### Bibliothèque de Lyon (BM Lyon)

Un email venant d'une adresse en **@bm-lyon.fr** qui contient une liste de prêts est reconnu
automatiquement. La fiche affiche une carte **Livres empruntés** : une vignette par ouvrage avec sa
**couverture**, le **titre**, l'**auteur** et la **date de retour** (`À rendre le 12 déc. 2026`), en
rouge si la date est dépassée, en ambre dans les sept jours.

Trois formats sont reconnus :

- blocs étiquetés (`Titre : …`, `Auteur : …`, `Date de retour : …`) ;
- lignes simples (`Titre - Auteur - à rendre le 12/12/2026`, `Titre (Auteur) - retour le 22 novembre 2026`) ;
- tableaux (`Titre` / `Auteur` / `Date de retour` en en-tête, puis une ligne par ouvrage).

Jusqu'à 15 ouvrages, dédoublonnés par titre. Les couvertures sont cherchées sur **Google Books** à
partir du titre et de l'auteur (mise en cache, repli sur une vignette sobre si aucune couverture).
Aucune analyse n'a lieu pour les autres expéditeurs.

#### Corriger une étiquette à la main

Chaque email peut être reclassé manuellement, dans **tous les onglets** : un bouton **« … »** est
placé **juste à côté de l'étiquette** (liste des emails, fiche de lecture et lignes de l'onglet
Factures). Il ouvre un menu avec les sept catégories — **Répondre, Important, Factures, Commande,
Infos, Newsletter, Publicité** — et l'option **Automatique** en bas du menu.

Le choix est prioritaire sur le tri automatique, s'applique immédiatement (compteurs et onglets
recalculés) et est **mémorisé dans le navigateur** (`localStorage`, clé `assistantPerso.labels.v1`).
Le bouton passe en teal quand une étiquette manuelle est active ; **Automatique** rétablit le
classement d'origine. Un email classé à la main en « Répondre » passe dans l'onglet **Répondre** et
propose un brouillon à l'ouverture.

### Tri automatique et rédaction de réponse

Chaque message est classé **sans IA**, à partir de trois familles d'indices (en-têtes de diffusion,
forme de l'adresse, objet), puis rangé dans **quatre filtres** avec leur compteur :

| Filtre | Contenu | Étiquette affichée |
| --- | --- | --- |
| **À traiter** | **tout ce qui demande votre attention** : répondre, important, factures et infos | `Répondre`, `Important`, `Factures`, `Infos` |
| **Répondre** | questions et demandes directes d'une personne | `Répondre` |
| **Important** | impôts, RUAMM / CPS, cotisations, amendes, assurances, convocations | `Important` |
| **Factures** | factures, avis d'échéance, paiements, prélèvements, remboursements | `Factures` |
| **Infos** | abonnements, réunions, confirmations, livraisons | `Infos` |
| **Newsletters & pubs** | `List-Unsubscribe`, `List-ID`, `Precedence: bulk`, `X-Mailchimp`, objets promotionnels | `Newsletter`, `Publicité` |

L'onglet **À traiter** est la vue de travail par défaut : il rassemble tous les emails qui
nécessitent un coup d'œil (réponse, action ou simple lecture utile), sans les newsletters et
publicités, et sans les messages déjà répondus. Chaque ligne porte une **étiquette colorée** : `Répondre` (proposition rédigée automatiquement),
`Important`, `Factures` ou `Infos`. Les boutons de la barre « Ranger » sont des icônes :
déplacer (dossier présélectionné) et supprimer (corbeille).

Une **question** reconnue (sujet contenant « ? » ou commençant par « question », « demande »,
« pouvez-vous », « merci de me »…) reste toujours dans **À traiter**, même si elle parle de facture.

**Toute la boîte de réception est prise en compte** : 500 messages analysés au premier chargement,
puis l'application **complète automatiquement** jusqu'à l'intégralité de la boîte (plafond 2000,
bouton **Tout charger** si besoin). Seuls les en-têtes sont récupérés ; le corps n'est lu qu'à
l'ouverture d'un message.

La date de chaque email est accompagnée d'un **âge relatif** : « aujourd'hui », « hier »,
« il y a 2 jours », « il y a 3 semaines », calculé à partir de la date de réception.

Le message ouvert affiche un bloc **« Résumé de l'email »** : une **synthèse rédigée**, pas un
extrait du texte. L'application identifie l'action du message et la reformule :

| Email reçu | Résumé produit |
| --- | --- |
| « Vous trouverez ci-joint votre formulaire de résiliation complété » | *Envoi du formulaire de résiliation complété.* |
| « Votre facture d'électricité de 148,90 € est à régler avant le 30 novembre » | *Paiement à effectuer : 148,90 € avant le 30 novembre.* |
| « Je vous confirme la réunion projet jeudi 21 novembre à 14h » | *Rendez-vous : jeudi 21 novembre à 14h en salle B.* |
| « Pouvez-vous me confirmer le montant et le délai ? » | *Demande : Pouvez-vous me confirmer le montant et le délai ?* |

Les absences et indisponibilités sont résumées d'emblée (« **Absente jusqu'au 17/11.** »).

Les formules creuses (« Nous vous en souhaitons une agréable lecture ! », « Nous restons à votre
disposition ») sont écartées, et une information chiffrée (taux, montant, date, pourcentage) est
préférée à une phrase de politesse. Une phrase d'information est préfixée par « Information : »,
une question par « Demande : ». Le chevron déplie le
texte intégral, un second clic le replie.

Si un email n'a pas de partie texte exploitable (HTML atypique ou message réduit à des pièces
jointes), l'application tente de récupérer le corps complet, liste les **pièces jointes** détectées
et affiche « Envoi de N pièce(s) jointe(s) : … » au lieu du message « contenu illisible ».

### Suggestion de dossier et rangement après envoi

- À l'ouverture d'un email, l'application interroge **tous vos libellés Gmail** par une recherche
  IMAP sur **l'adresse e-mail exacte de l'expéditeur** (priorité absolue) et, en second recours,
  sur **le domaine**. Aucun plafond de dossiers : l'analyse se fait **par lots de 15 libellés**,
  le client enchaînant automatiquement les lots avec une progression « Analyse 45/120 dossiers… ».
  Les échecs de recherche sont comptés et affichés au lieu d'être ignorés.
- Le domaine n'est utilisé que s'il est **spécifique** : jamais pour un domaine grand public
  (`gmail.com`, `orange.fr`, `outlook.fr`…) et uniquement si le **nom du dossier correspond au
  domaine** — et la recherche par domaine n'est même pas lancée dans les autres dossiers, ce qui
  divise le coût par deux — `BNC` ↔ `bnc.nc`, `BNC/Compta` ↔ `bnc.nc`. Un dossier comme `# PERSO/###_Perso` qui
  contient simplement des emails du même domaine n'est **pas** proposé.
- Si plusieurs dossiers correspondent, l'application affiche **jusqu'à 5 suggestions** en pastilles
  cliquables, triées (adresse exacte d'abord, puis domaine), et présélectionne la première. La
  pastille choisie est surlignée ; les autres restent disponibles d'un clic.
- **Sélectionner** un dossier ne déplace rien : le choix est mémorisé. Le déplacement est appliqué
  **automatiquement après l'envoi** de la réponse (ou immédiatement avec « Déplacer maintenant »,
  et « Supprimer maintenant » envoie le message dans la corbeille Gmail).
- Sans choix de dossier (« Ne pas ranger automatiquement »), le message reste simplement marqué
  comme répondu.

### Images et pièces jointes

Seules les **images insérées dans le corps** du message sont chargées : signatures JPG, illustrations,
visuels intégrés. Elles s'affichent **dans la zone du message**, à la suite du texte, lorsqu'on
déplie l'email (clic sur l'image pour l'ouvrir en grand).

Les **pièces jointes classiques** (PDF, documents) ne sont plus prévisualisées dans l'application :
elles restent consultables dans Gmail, l'interface ne les liste plus.

Les images passent par la route protégée `/api/gmail/attachment` (10 Mo max, types sûrs uniquement,
`nosniff`). Les images référencées par une URL externe (pixels de pistage) ne sont pas chargées :
seules les images réellement contenues dans l'email sont récupérées.

### Prise en compte du fil et mémoire de vos corrections

- **Fil d'échanges** : le corps est séparé en deux parties — le dernier message et l'historique cité
  (« Le 12 nov… a écrit : », « > … », « De : … »). L'intention et le registre sont déterminés sur le
  message courant, tandis que l'historique sert au générateur pour comprendre le contexte (montants
  déjà annoncés, questions déjà posées). Le nombre d'échanges analysés apparaît dans la confirmation
  de proposition.
- **Mémoire de style** : chaque réponse envoyée ou enregistrée est conservée dans le navigateur
  (`localStorage`, 30 derniers exemples). L'application en déduit votre salutation habituelle,
  la présence ou non de la phrase de clôture, votre bloc de signature et le registre utilisé.
  Ces préférences ne sont appliquées **que dans le même registre** : un email au vouvoiement ne
  recevra jamais un « Salut » ou une clôture familière apprise sur des échanges tutoyés.
  Limite : la mémoire est propre à cet appareil et à ce navigateur ; vider les données du site la
  réinitialise. Une base distante serait nécessaire pour la partager entre appareils.

Les propositions restent déterministes (règles, sans modèle de langage) : pour une rédaction
vraiment personnalisée, il faudra brancher un modèle (Gemini/OpenAI) en complément.

Pour répondre, aucune action n'est nécessaire : **dès qu'un email « À traiter » est ouvert, la
proposition de réponse est rédigée** (et à la première ouverture du module, le premier email en
attente est sélectionné et rédigé automatiquement). Le bouton **Régénérer la réponse** permet de
relancer la proposition après avoir modifié le contexte.

La proposition est construite à partir du sujet et du contenu (facturation, rendez-vous, devis,
relance, litige, question), avec votre signature — ici `Alva DALERY`.

**Le prénom est détecté avant la salutation**, dans cet ordre : signature du message
(« Cordialement, Mélanie »), nom affiché de l'expéditeur s'il s'agit d'une personne, adresse e-mail
(`melanie.dupont@…`) puis nom de fichier d'une signature image (`signature-melanie.png`).
Le prénom doit appartenir à une liste de prénoms reconnus et ne pas être une raison sociale :
« Fitness Park Les Quais » ou « La Patrimoniale » ne produisent donc pas « Bonjour La, » — si aucun
prénom fiable n'existe, la réponse commence simplement par « Bonjour, ».
Limite : une signature uniquement composée d'une image sans nom dans le fichier n'est pas lue
(pas d'OCR sans modèle de langage).

**Le registre est détecté automatiquement** : si l'expéditeur vouvoie (`vous`, `votre`, `pouvez-vous`…),
la réponse est au vouvoiement ; s'il tutoie (`tu`, `ton`, `peux-tu`…), la réponse est au tutoiement.
Un badge « Vouvoiement détecté » / « Tutoiement détecté » l'indique à côté du message.

Le texte reste **toujours éditable**, puis :
- **Enregistrer en brouillon** → déposé dans *Brouillons* Gmail, rien n'est envoyé ;
- **Envoyer maintenant** → confirmation explicite obligatoire.

Aucun envoi automatique n'existe dans l'application.

### Marquer comme répondu et ranger dans un dossier Gmail

- Après un envoi réel, l'application pose le drapeau `\Answered` sur le message d'origine :
  il sort de **À traiter** et porte un badge **« Répondu »**.
- Une barre **« Ranger »** sous le message permet de le déplacer vers n'importe quel
  **libellé Gmail** (par exemple `Fitness Park`) ou de le **supprimer** (déplacement vers la corbeille Gmail).
- Les dossiers sont lus en direct sur votre compte : tout libellé créé dans Gmail apparaît
  automatiquement dans la liste, sans configuration.

Si vous répondez directement depuis Gmail, le drapeau est déjà posé : le message quittera
aussi **À traiter** au prochain rafraîchissement.

### 4. Bonnes pratiques de sécurité

- Le mot de passe d'application donne accès à toute la boîte : ne le mettez **jamais** dans le code
  ni dans un fichier commité, uniquement dans les variables d'environnement.
- Révocation immédiate possible : myaccount.google.com → Sécurité → Mots de passe des applications → Supprimer.
- Les routes `/api/gmail/*` sont protégées par le middleware Basic Auth : elles ne sont pas publiques.
- Les emails ne sont **pas stockés** : ils sont lus à la demande et transmis au navigateur à chaque affichage.

### Dépannage

| Symptôme | Cause probable |
| --- | --- |
| Carte « Non configuré » | `GMAIL_USER` / `GMAIL_APP_PASSWORD` absents, ou ajoutés sans Redeploy |
| « Mot de passe refusé par Gmail » | mot de passe d'application révoqué, 2FA désactivée, ou mot de passe du compte utilisé à la place |
| « Connexion aux serveurs Gmail impossible » | réseau bloquant IMAP/SMTP (port 993 / 465) |
| Erreur au moment du Redeploy | vérifier que `imapflow` et `nodemailer` sont bien dans `package.json` |

---

## 🔒 À savoir avant de publier

- **Aucune donnée n'est persistée pour l'instant.** L'état est en mémoire React
  (voir [`src/app/page.tsx`](src/app/page.tsx:34)) : un rafraîchissement réinitialise tout.
  Avant un usage quotidien en ligne, prévoyez un stockage (`localStorage` côté navigateur,
  ou Vercel KV / Supabase côté serveur). Le `localStorage` est le plus simple et garde les données sur votre appareil.
- **Ne jamais committer** de clés API (OpenAI, Withings…) : elles iraient dans le dépôt public/privé.
  Utilisez les variables d'environnement (`SITE_USER`, `SITE_PASSWORD`, et futures clés).
- Le middleware ajoute `X-Robots-Tag: noindex`, donc l'application ne sera pas indexée par Google.
- HTTPS est fourni par Vercel/Cloudflare : le mot de passe circule chiffré.
- Le plan Vercel **Hobby** est gratuit et suffisant pour un usage personnel.
- Le module **Culture** (livres, films, expositions) stocke ses données dans le `localStorage` du
  navigateur : rien n'est envoyé au serveur, mais rien n'est partagé entre appareils non plus.

---

## ✅ Checklist de mise en ligne

- [x] Dépôt GitHub privé créé (`alva-dalery/assistant-perso`)
- [ ] Projet importé sur Vercel
- [ ] `SITE_USER` et `SITE_PASSWORD` définis dans Vercel
- [ ] Deploy effectué, ouverture de l'URL → fenêtre identifiant/mot de passe
- [ ] Mauvais mot de passe testé → 401
- [ ] (Optionnel) Domaine personnalisé branché, ou Cloudflare Access activé
- [ ] Décision prise sur la persistance des données (`localStorage` ou base distante)

---

## 🩹 Erreurs fréquentes

### `Project "assistant-perso" already exists, please use a new name.`

Le **nom du projet Vercel** est déjà utilisé : soit par vous lors d'un essai précédent, soit par
un autre compte (l'adresse `assistant-perso.vercel.app` est réservée globalement).
Votre code n'est pas en cause.

Deux solutions :

1. **Réutiliser le projet existant** (le plus propre s'il vous appartient) : tableau de bord Vercel →
   ouvrez `assistant-perso` → **Settings → Environment Variables** (ajoutez `SITE_USER` et
   `SITE_PASSWORD`) → **Deployments → `…` → Redeploy**.
2. **Choisir un autre nom** : dans le champ **Project Name** de l'écran d'import, mettez par exemple
   `assistant-perso-app` ou `assistant-perso-alva`. Le dépôt GitHub peut garder son nom
   `assistant-perso` : les deux sont indépendants. Le nom se change ensuite dans
   **Settings → General → Project Name**.

### `sudo mode challenge canceled`

Message de **GitHub**, pas de Vercel : la confirmation d'identité (« Confirm access ») a été fermée
ou annulée. Refaites l'action et complétez la fenêtre (mot de passe GitHub ou code à 6 chiffres /
passkey). Le dépôt déjà poussé n'est pas affecté.

### La page affiche `Protection non configurée : renseignez SITE_USER et SITE_PASSWORD`

C'est le message de sécurité du middleware : **le déploiement en ligne n'a pas reçu les variables**.
Quatre causes possibles, dans l'ordre de fréquence :

1. **Variables ajoutées après le déploiement.** Le middleware lit les variables **au moment du build** :
   il faut donc un **nouveau build**, pas simplement recharger la page.
   → **Deployments → `…` sur le dernier déploiement → Redeploy**, en **décochant
   « Use existing Build Cache »** (sinon l'ancien build, sans variables, est réutilisé).
2. **Mauvais environnement coché.** Dans la fenêtre d'ajout, la variable doit être cochée pour
   **Production** (pas seulement Preview / Development).
3. **Nom mal orthographié.** Les clés doivent être exactement `SITE_USER` et `SITE_PASSWORD`
   (majuscules, pas d'espace avant/après, pas de `.env` devant).
4. **Variables saisies sur un autre projet.** Vérifiez dans **Settings → Domains** que le projet
   ouvert est bien celui qui sert `assistant-perso.vercel.app`. Un import interrompu
   (erreur « project already exists ») crée parfois un projet fantôme où les variables ont été perdues.

Contrôle rapide après correction :

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://assistant-perso.vercel.app/
```

`503` = variables toujours absentes du build ; `401` = protection active et fonctionnelle.
