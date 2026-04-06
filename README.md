# Formulaire d'inscription électorale algérienne

Formulaire web complet avec :
- Tous les champs du PDF officiel (dont **prénom ET nom de la mère**)
- Signature tactile (doigt / souris)
- Génération automatique du PDF rempli
- Envoi par email en pièce jointe
- Interface mobile-first

---

## 📁 Structure

```
electoral-form/
├── server.js          ← backend Node.js
├── package.json
├── template.pdf       ← ⚠️ À placer manuellement (voir ci-dessous)
└── public/
    └── index.html     ← formulaire frontend
```

---

## ⚠️ Étape 1 — Obtenir le PDF officiel

Téléchargez le PDF depuis :
https://www.algerian-consulate.org.uk/images/Forms_2021/enrolment_electoral.pdf

Renommez-le exactement **`template.pdf`** et placez-le à la racine du projet (même niveau que `server.js`).

---

## 🔧 Étape 2 — Variables d'environnement

Créez un fichier `.env` ou configurez directement :

| Variable             | Description                                  | Exemple                    |
|----------------------|----------------------------------------------|----------------------------|
| `EMAIL_USER`         | Adresse Gmail expéditrice                    | `votre@gmail.com`          |
| `EMAIL_PASS`         | Mot de passe d'application Gmail             | `xxxx xxxx xxxx xxxx`      |
| `DESTINATION_EMAIL`  | Adresse qui reçoit les formulaires           | `consulat@exemple.com`     |
| `PORT`               | Port du serveur (défaut : 3000)              | `3000`                     |
| `SMTP_HOST`          | Hôte SMTP (défaut : smtp.gmail.com)          | `smtp.gmail.com`           |
| `SMTP_PORT`          | Port SMTP (défaut : 587)                     | `587`                      |

### Gmail — Mot de passe d'application

1. Activez la double authentification sur votre compte Google
2. Allez dans **Sécurité → Mots de passe d'application**
3. Créez un mot de passe pour "Mail"
4. Utilisez ce code 16 caractères comme `EMAIL_PASS`

---

## 🚀 Déploiement gratuit sur Glitch.com

**La méthode la plus rapide (5 min, sans GitHub) :**

1. Allez sur https://glitch.com et créez un compte
2. Cliquez **New Project → Import from GitHub** (ou **glitch.sh**)
3. Dans le terminal Glitch (`Tools → Terminal`) :
   ```bash
   rm -rf *
   # Uploadez vos fichiers via l'interface ou git clone
   ```
4. Uploadez les fichiers via **Assets** ou le panneau de gauche
5. Dans `.env` (Glitch le gère automatiquement) :
   ```
   EMAIL_USER=votre@gmail.com
   EMAIL_PASS=xxxx xxxx xxxx xxxx
   DESTINATION_EMAIL=consulat@exemple.com
   ```
6. Glitch démarre automatiquement → URL publique fournie

### Alternative : Render.com (aussi gratuit)

1. Pushez le projet sur GitHub
2. https://render.com → **New Web Service**
3. Connectez le repo, configurez :
   - Build : `npm install`
   - Start : `node server.js`
4. Ajoutez les variables d'environnement dans l'onglet **Environment**

---

## 🎯 Ajustement des coordonnées PDF

Si le texte n'est pas aligné sur les lignes du PDF :

1. Lancez le serveur avec `CALIBRATE=1 node server.js`
2. Soumettez un formulaire test → le PDF généré aura une grille de repères (rouge = Y, bleu = X)
3. Repérez les coordonnées souhaitées pour chaque champ
4. Modifiez `FIELDS` dans `server.js`

Rappel : dans pdf-lib, l'origine est en **bas à gauche** du PDF.

---

## 🔒 Sécurité

- Ne committez jamais `.env` sur GitHub (il est dans `.gitignore`)
- Utilisez toujours un mot de passe d'application Gmail, jamais votre vrai mot de passe
- En production, ajoutez un captcha (ex: hCaptcha) pour éviter le spam
