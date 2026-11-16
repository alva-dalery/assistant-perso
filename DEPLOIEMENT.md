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

## Option A — Vercel + mot de passe (recommandé pour démarrer)

### 1. Mettre le code sur GitHub (dépôt privé)

```bash
cd "/Users/alvadalery/Projets IA/Antigravity projects/Assistant perso"
git init
git add .
git commit -m "Assistant perso — première version"
git branch -M main
# créez d'abord un dépôt privé "assistant-perso" sur github.com
git remote add origin https://github.com/VOTRE_COMPTE/assistant-perso.git
git push -u origin main
```

Le fichier [`.gitignore`](.gitignore:1) exclut déjà `node_modules`, `.next`, les variables d'environnement
et le lanceur macOS `Assistant perso.app`.

### 2. Importer le projet sur Vercel

1. [vercel.com](https://vercel.com) → **Add New… → Project** → importez le dépôt GitHub.
2. Framework détecté automatiquement : **Next.js**. Ne changez rien aux commandes de build.
3. Ouvrez **Environment Variables** et ajoutez :
   - `SITE_USER` = par exemple `alex`
   - `SITE_PASSWORD` = un mot de passe long, ASCII, généré ainsi :

```bash
openssl rand -base64 24
```

4. **Deploy**. L'URL `https://assistant-perso-xxxx.vercel.app` demande immédiatement
   identifiant + mot de passe (fenêtre du navigateur).

> ⚠️ Sans `SITE_PASSWORD`, le middleware renvoie volontairement une erreur 503 :
> l'application échoue « fermée », jamais ouverte à tous.
> Modifier le mot de passe = changer la variable puis **Redeploy**.

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

- [ ] `git init` + dépôt GitHub privé créé
- [ ] Projet importé sur Vercel
- [ ] `SITE_USER` et `SITE_PASSWORD` définis dans Vercel
- [ ] Deploy effectué, ouverture de l'URL → fenêtre identifiant/mot de passe
- [ ] Mauvais mot de passe testé → 401
- [ ] (Optionnel) Domaine personnalisé branché, ou Cloudflare Access activé
- [ ] Décision prise sur la persistance des données (`localStorage` ou base distante)
