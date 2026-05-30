# 📦 Publier une application Python (.exe) sur le Microsoft Store

Ce guide explique comment publier une application (ex: Python compilée en `.exe`) sur le Microsoft Store afin d’éviter les alertes de sécurité Windows et rendre ton app plus professionnelle.

---

# ✅ 1. Créer un compte développeur Microsoft

## Étapes :
1. Aller sur la page d'inscription officielle : https://storedeveloper.microsoft.com/
2. Cliquer sur le bouton **Get started for free** (ou "S'inscrire")
3. Choisir le type de compte :
   - Compte individuel (pour développeurs indépendants, gratuit)
   - Compte entreprise (pour les sociétés/organisations, gratuit)
   *(Note : Depuis 2026, l'inscription est devenue gratuite pour la majorité des comptes)*

4. Se connecter avec un compte Microsoft (MSA)
5. Vérifier ton identité (cela nécessite souvent une pièce d'identité officielle et un selfie depuis un smartphone)
6. Finaliser le profil et accéder au **Microsoft Partner Center** (le tableau de bord pour publier tes apps)

---

# ✅ 2. Créer ton application

## Étapes :
1. Dans le dashboard → **Create a new app**
2. Réserver un nom (ex: `MonSuperApp`)
3. Valider

---

# ✅ 3. Préparer ton application

⚠️ Le Microsoft Store préfère le format **MSIX** (recommandé)

---

## ➤ Option recommandée : Convertir ton `.exe` en `.msix`

### 🔧 Installer l’outil :
- Installer **MSIX Packaging Tool** depuis le Microsoft Store

---

### 📦 Conversion :

1. Lancer MSIX Packaging Tool
2. Choisir **"Application packaging"**
3. Sélectionner ton `.exe`
4. Suivre le wizard :
   - installation de ton appli
   - capture des fichiers
   - génération du `.msix`

---

### 🧾 Résultat :
Tu obtiens :
```
mon_app.msix
```

---

## ➤ Alternative (moins recommandée) :
Uploader directement un `.exe`

⚠️ Inconvénients :
- validation plus stricte
- possible refus
- expérience moins propre

---

# ✅ 4. Compléter la fiche produit

Dans Partner Center :

## 📝 Informations requises :
- Nom
- Description
- Catégorie
- Mots-clés

## 🖼️ Assets :
- Icône (PNG)
- Captures d’écran
- Bannière (optionnel)

## 🎯 Classification :
- Âge (PEGI-like simplifié)
- Public cible

---

# ✅ 5. Upload ton application

1. Aller dans **Packages**
2. Upload ton fichier `.msix`
3. Lancer la validation automatique

---

# ✅ 6. Soumettre pour validation

1. Cliquer sur **Submit**
2. Attendre validation

⏱️ Temps :
- 24h à 3 jours

---

# ✅ 7. Mise en ligne 🎉

Une fois validée :

✅ Ton app apparaît sur le Microsoft Store  
✅ Installation sécurisée  
✅ Plus de warning SmartScreen  

---

# 🛡️ Avantages

- ✅ Reconnu comme application sûre par Windows
- ✅ Pas besoin d’acheter un certificat de signature
- ✅ Installation propre (comme une app officielle)
- ✅ Mise à jour possible via le Store

---

# ⚠️ Bonnes pratiques

- Ne pas inclure de malware ou comportement suspect
- Éviter les installs silencieuses
- Fournir une description claire
- Tester ton app avant packaging

---

# 🧠 Astuce (Python + PyInstaller)

Si tu utilises PyInstaller :

```bash
pyinstaller monscript.py --onefile
```

Ensuite :
👉 Convertis le `.exe` généré en `.msix`

---

# ✅ Conclusion

Le Microsoft Store est une excellente alternative au code signing payant :

✔ Paiement unique  
✔ Confiance immédiate  
✔ Distribution facile

