# Assistant perso — Assistant Personnel IA Tout-en-Un (Spécial TDAH & TAG)

Une application d'assistant de vie personnelle avec tableau de bord unifié, spécialement conçue pour alléger la charge cognitive, stimuler la motivation et prévenir l'anxiété (TDAH & Trouble Anxiété Généralisée).

---

## 🌟 Fonctionnalités Clés

### 1. 📬 Secrétariat & Emails (Style Naturel & Validation en 1 clic)
* **Clonage de plume** : L'IA répond en adoptant votre style naturel (pas de tournures froides ou robotiques).
* **Validation obligatoire** : Aucun email n'est envoyé sans votre relecture et votre clic de validation direct.
* **Édition instantanée** : Ajustez le texte ou modifiez les directives de tonalité en direct.

### 2. 👗 Dressing Numérique, Morphologie, Colorimétrie & Valises
* **Inventaire photo** : Analyse des pièces, couleurs, coupes et saisons.
* **Morphologie & Colorimétrie** : Conseils personnalisés (silhouette en V, saison Automne Chaud) avec alertes sur les coupes flatteuses et celles à éviter.
* **Assistant Valise Météo** : Calcul des prévisions météo locales (ex: Thaïlande, week-end) et génération d'une checklist bagages optimisée en mix & match.

### 3. 🧠 Santé Mentale, Neuro-régulation TDAH / TAG & Objets Connectés
* **Synchronisation Withings & Apple Santé** : Suivi en direct du score de sommeil, de la fréquence cardiaque au repos, de la variabilité cardiaque (VFC) et des pas.
* **Régulation émotionnelle immédiate** : Outil interactif selon l'état du moment (Paralysie TDAH, Pic d'anxiété TAG, Fatigue/Crash dopamine, Flow).
* **Pilulier Cérébral** : Horodatage optimal des compléments (L-Tyrosine, Magnésium Bisglycinate, Oméga-3 EPA).
* **Compagnon Body-Doubling** : Sprint de concentration bienveillant de 15 minutes.

### 4. 🥗 Frigo, Recettes Dopaminergiques & Scanner Yuka
* **Inventaire Frigo & Placards** : Visualisation des stocks disponibles pour éviter le gaspillage.
* **Scanner Yuka / Open Food Facts** : Évaluation de la qualité nutritionnelle et des additifs.
* **Recettes Focus** : Menus riches en protéines et à faible index glycémique pour une attention soutenue sans coup de pompe.
* **Calculateur de courses** : Chiffrage budgétaire automatique en euros.

### 5. 🏋️ Sport & Énergie Modulable
* **Adaptation au niveau d'énergie du jour** :
  - *Énergie Basse* : Micro-séance douce de déverrouillage et respiration (8 min).
  - *Énergie Modérée/Haute* : Circuit dopamine et renforcement (20 min).

### 6. ⚖️ Litiges Administratifs & Démarches Juridiques
* **Dossiers centralisés** : Suivi des sinistres auto (Pacifica/AXA) et contestations bancaires (BNP Paribas).
* **Courriers officiels rédigés par l'IA** : Mises en demeure avec visas des articles de loi pertinents (Code des Assurances, Code de la Consommation) et boutons de copie en 1 clic.

### 7. 🛠️ Projets Personnels (Bain Nordique DIY & Voyage Thaïlande)
* **Décomposition anti-paralysie** : Chaque grand projet est découpé en micro-étapes digestes de 10 min à 1h.
* **Suivi de budget engagé vs estimé**.

### 8. ⚡ Mode Focus (TDAH) & 💭 Vider sa tête (Brain Dump)
* **Mode Focus** : Masque l'intégralité du tableau de bord pour n'afficher qu'une seule micro-action avec minuteur apaisant et célébration dopamine.
* **Brain Dump** : Saisissez n'importe quelle pensée brute, l'IA la classe automatiquement dans le bon module sans aucun effort de tri manuel.

---

## 🚀 Lancement Rapide (Lanceurs macOS)

Vous disposez de plusieurs façons ultra-simples de lancer votre assistant :

### 1. Application Native Mac : `Assistant perso.app`
* **Double-cliquez simplement** sur `Assistant perso.app` dans le Finder.
* L'application démarre le serveur en arrière-plan (si nécessaire) et ouvre directement votre navigateur par défaut sur `http://localhost:3000`.
* *Astuce* : Vous pouvez glisser `Assistant perso.app` dans votre **Dock** macOS ou dans votre dossier **Applications**.

### 2. Double-clic Script : `lancer.command`
* Double-cliquez sur `lancer.command` depuis le Finder pour ouvrir l'application avec la console interactive.
* Pour arrêter l'application, fermez simplement la fenêtre du terminal.

### 3. Script d'arrêt : `arreter.command`
* Double-cliquez sur `arreter.command` pour stopper instantanément le serveur en arrière-plan.

### 4. En ligne de commande (Terminal)
```bash
npm run dev
```

---

## 📧 Connexion Gmail réelle (IMAP + SMTP)

Le module **Secrétariat** contient un onglet **Boîte Gmail réelle** : il lit les messages
de votre boîte de réception et permet d'enregistrer un brouillon ou d'envoyer une réponse
(avec confirmation). Aucun projet Google Cloud n'est nécessaire : un **mot de passe
d'application** suffit.

1. Activer la validation en deux étapes sur `myaccount.google.com`.
2. Sécurité → **Mots de passe des applications** → générer `Assistant perso`.
3. Définir `GMAIL_USER` et `GMAIL_APP_PASSWORD` (localement dans `.env.local`,
   en ligne dans les variables d'environnement Vercel).
4. Redéployer, puis ouvrir **Secrétariat → Boîte Gmail réelle**.

Le module trie automatiquement **toute la boîte de réception** dans quatre filtres comptés :
**À traiter** (question d'une personne → réponse), **Important** (factures, impôts, RUAMM, échéances →
action à prévoir), **Infos** (abonnements, réunions, confirmations → lecture seule) et
**Newsletters & pubs** (diffusion de masse). Le tri s'appuie sur les en-têtes (`List-Unsubscribe`,
`Precedence: bulk`…), l'adresse de l'expéditeur et l'objet. Le bouton **Charger plus** étend
l'analyse jusqu'à 200 messages, et un accordéon « Résumé de la demande » permet de déplier
le texte complet.

Dès qu'un email à traiter est ouvert, une **proposition de réponse est rédigée immédiatement** :
elle respecte l'intention détectée (facturation, rendez-vous, devis, relance, litige, question)
et le **registre de l'expéditeur** (vouvoiement ou tutoiement), avec la signature `Alva DALERY`.
La salutation utilise le prénom réel de votre interlocuteur (signature, adresse e-mail) et se limite
à « Bonjour, » lorsqu'il s'agit d'une société comme Fitness Park.
Vous relisez, modifiez, puis choisissez **Enregistrer en brouillon** ou **Envoyer maintenant**.
Aucun mail ne part sans votre validation.

Après un envoi réel, le message d'origine est marqué **« Répondu »** et sort de la file
**À traiter**. Une barre **Ranger** permet ensuite de le déplacer dans n'importe quel libellé
Gmail (ex. `Fitness Park`) ou de l'archiver.

Le bloc **Résumé de l'email** rédige une synthèse de l'action du message
(ex. *Envoi du formulaire de résiliation complété.*) au lieu d'en recopier le début,
l'accordéon donnant accès au texte complet. Les échanges précédents du fil sont analysés pour
rédiger la réponse, et vos corrections sont mémorisées localement pour rapprocher les propositions
suivantes de votre style (salutation, phrase de clôture, signature), sans jamais mélanger
vouvoiement et tutoiement.

Détails et dépannage : [`DEPLOIEMENT.md`](DEPLOIEMENT.md).


