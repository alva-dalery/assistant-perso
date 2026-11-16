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

### Tri automatique et rédaction de réponse

Chaque message est classé **sans IA**, à partir de trois familles d'indices (en-têtes de diffusion,
forme de l'adresse, objet), puis rangé dans **quatre filtres** avec leur compteur :

| Filtre | Contenu | Réponse attendue |
| --- | --- | --- |
| **À traiter** | questions directes, demandes d'une personne | oui, proposition rédigée |
| **Important** | factures, impôts, RUAMM / CPS, cotisations, amendes, échéances, assurances | non, mais action à prévoir |
| **Infos** | abonnements qui se renouvellent ou se terminent, réunions, confirmations, livraisons | non, lecture seule |
| **Newsletters & pubs** | `List-Unsubscribe`, `List-ID`, `Precedence: bulk`, `X-Mailchimp`, objets promotionnels | aucune |

Une **question** reconnue (sujet contenant « ? » ou commençant par « question », « demande »,
« pouvez-vous », « merci de me »…) reste toujours dans **À traiter**, même si elle parle de facture.

**Toute la boîte de réception est prise en compte** : 50 messages analysés au chargement, puis le
bouton **Charger plus** étend l'analyse par tranches de 50 jusqu'à 200 messages. Seuls les en-têtes
sont récupérés (rapide) ; le corps n'est lu qu'à l'ouverture d'un message.

Le message ouvert affiche un bloc **« Résumé de la demande »** avec un chevron (accordéon) :
un clic déplie le texte intégral, un second le replie.

Pour répondre, aucune action n'est nécessaire : **dès qu'un email « À traiter » est ouvert, la
proposition de réponse est rédigée** (et à la première ouverture du module, le premier email en
attente est sélectionné et rédigé automatiquement). Le bouton **Régénérer la réponse** permet de
relancer la proposition après avoir modifié le contexte.

La proposition est construite à partir du sujet et du contenu (facturation, rendez-vous, devis,
relance, litige, question), avec votre signature — ici `Alva DALERY`.

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
  **libellé Gmail** (par exemple `Fitness Park`) ou de l'**Archiver** (déplacement vers
  *Tous les messages*, donc retrait de la boîte de réception).
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
