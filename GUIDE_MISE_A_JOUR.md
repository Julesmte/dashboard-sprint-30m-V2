# 📝 Guide de mise à jour des données

## 🎯 Vue d'ensemble

Le dashboard peut charger les données de **2 sources** :
1. **Google Sheets** (source principale, recommandée)
2. **Fichier CSV local** (fallback automatique si Google Sheets échoue)

---

## 📊 Option 1 : Google Sheets (Recommandé)

### ✅ Avantages
- Mise à jour en temps réel
- Accessible depuis n'importe où
- Partage facile avec l'équipe
- Actualisation automatique du dashboard

### 🔧 Configuration initiale (À faire une seule fois)

#### Étape 1 : Préparer votre Google Sheet

Votre feuille doit avoir **EXACTEMENT** ces colonnes dans cet ordre :

```
Date | Name | 30m | F0 (N/Kg) | V (0) | V Max | F0 (N) | P Max (W) | P Max (W/Kg) | DRF | FV | RF_10m | RF Peak | Height | Weight | Age
```

**⚠️ IMPORTANT :**
- Les noms des colonnes doivent être **exactement** comme ci-dessus (majuscules, parenthèses, espaces)
- Les dates au format : `JJ/MM/AAAA` (ex: 15/01/2024) ou `AAAA-MM-JJ`
- Les nombres décimaux avec **virgule** `,` ou **point** `.` (le dashboard convertit automatiquement)

#### Étape 2 : Publier la Google Sheet en CSV

1. Ouvrez votre Google Sheet
2. Cliquez sur **Fichier** → **Partager** → **Publier sur le Web**
3. Dans l'onglet **Lien** :
   - Sélectionnez **"Feuille de calcul entière"** (ou la feuille spécifique)
   - Choisissez le format **"Valeurs séparées par des virgules (.csv)"**
4. ☑️ Cochez **"Republier automatiquement lorsque des modifications sont apportées"**
5. Cliquez sur **"Publier"**
6. **Copiez l'URL générée**

L'URL ressemble à :
```
https://docs.google.com/spreadsheets/d/e/XXXXXXXXXX/pub?gid=XXXXXXX&single=true&output=csv
```

#### Étape 3 : Configurer le dashboard

1. Ouvrez le fichier `app.js`
2. Ligne 13, remplacez l'URL :
```javascript
const SHEET_URL_DIRECT = 'COLLEZ_VOTRE_URL_ICI';
```
3. **Enregistrez** le fichier

#### Étape 4 : Tester

1. Ouvrez l'URL CSV dans votre navigateur
2. Vous devez voir le contenu CSV brut (pas de page HTML)
3. Actualisez le dashboard (F5)
4. Les données doivent se charger ! ✅

---

### 🔄 Mise à jour des données (Usage quotidien)

Une fois configuré, c'est **TRÈS SIMPLE** :

#### Pour ajouter un nouveau test :

1. **Ouvrez votre Google Sheet**
2. **Ajoutez une nouvelle ligne** avec les données du test
3. **C'est tout !** 🎉

Le dashboard se mettra à jour automatiquement car :
- Google Sheets republie automatiquement le CSV
- Le dashboard recharge les données à chaque actualisation
- Vous pouvez aussi cliquer sur le bouton **🔄 Actualiser** dans le dashboard

#### Exemples de lignes à ajouter :

```csv
30/01/2024,Athlète A,3.85,8.65,9.32,10.5,692.0,2565,32.1,-0.95,0.935,0.45,0.54,1.82,80,24
30/01/2024,Athlète B,3.95,8.32,9.15,10.1,665.6,2420,31.2,-0.98,0.916,0.44,0.52,1.78,80,25
```

---

## 📁 Option 2 : Fichier CSV local

### ✅ Avantages
- Fonctionne hors ligne
- Pas de dépendance à Google
- Contrôle total des données

### ❌ Inconvénients
- Pas de mise à jour automatique
- Nécessite de modifier le fichier manuellement
- Pas de partage en temps réel

### 🔧 Utilisation

1. **Ouvrez le fichier** `data-test.csv` avec Excel, LibreOffice ou un éditeur de texte

2. **Ajoutez vos nouvelles données** en respectant le format :
```csv
Date,Name,30m,F0 (N/Kg),V (0),V Max,F0 (N),P Max (W),P Max (W/Kg),DRF,FV,RF_10m,RF Peak,Height,Weight,Age
30/01/2024,Athlète A,3.85,8.65,9.32,10.5,692.0,2565,32.1,-0.95,0.935,0.45,0.54,1.82,80,24
```

3. **Enregistrez** le fichier

4. **Actualisez le dashboard** (F5)

**⚠️ ATTENTION :**
- Utilisez la **virgule** `,` comme séparateur de colonnes
- Utilisez le **point** `.` pour les décimales (Excel convertit automatiquement)
- N'ajoutez pas d'espace après les virgules

---

## 🔄 Actualisation du Dashboard

### Méthode 1 : Actualisation manuelle
- Appuyez sur **F5** (ou **Ctrl+R**)
- Le dashboard recharge les données

### Méthode 2 : Bouton Actualiser
- Cliquez sur le bouton **🔄 Actualiser** en haut du dashboard
- Les données sont rechargées sans recharger toute la page

### Actualisation automatique (optionnel)

Si vous voulez que le dashboard se recharge automatiquement toutes les X minutes, ajoutez ce code à la fin du fichier `app.js` :

```javascript
// Actualiser automatiquement toutes les 5 minutes (300000 ms)
setInterval(() => {
    console.log('Actualisation automatique...');
    loadData();
}, 300000);
```

---

## 🧪 Vérification et Dépannage

### ✅ Comment vérifier que tout fonctionne ?

1. **Ouvrez la console du navigateur** (F12)
2. Regardez les messages :
   - ✅ `"✅ Données chargées avec succès!"` → Tout va bien
   - ✅ `"✅ Données locales chargées avec succès!"` → Fichier local utilisé
   - ❌ Erreur → Voir le dépannage ci-dessous

### 🔍 Messages dans le footer

Le dashboard affiche la source des données dans le footer :
- `"Dernière mise à jour : 30/01/2024 15:30:45"` → Google Sheets
- `"Dernière mise à jour : 30/01/2024 15:30:45 (Données locales)"` → Fichier CSV local

---

## ❌ Problèmes courants

### Problème 1 : "Erreur lors du chargement des données"

**Causes possibles :**
- Google Sheet pas publiée correctement
- URL incorrecte
- Pas de connexion internet

**Solutions :**
1. Vérifiez l'URL dans `app.js` ligne 13
2. Testez l'URL dans votre navigateur (vous devez voir du CSV brut)
3. Vérifiez votre connexion internet
4. Le dashboard charge automatiquement `data-test.csv` en secours

### Problème 2 : "Les nouvelles données n'apparaissent pas"

**Solutions :**
1. Actualisez le dashboard (F5)
2. Videz le cache du navigateur (Ctrl+Shift+R)
3. Vérifiez que la Google Sheet a bien l'option "Republier automatiquement" cochée
4. Attendez 1-2 minutes (délai de publication Google)

### Problème 3 : "Certaines valeurs sont à 0 ou NaN"

**Causes :**
- Format de nombres incorrect
- Colonnes manquantes ou dans le mauvais ordre

**Solutions :**
1. Vérifiez que toutes les colonnes sont présentes
2. Vérifiez que les nombres utilisent le bon format (virgule ou point)
3. Vérifiez qu'il n'y a pas de cellules vides (mettez 0 si nécessaire)

### Problème 4 : "Les graphiques sont vides"

**Causes :**
- Pas assez de données (minimum 2 dates)
- Format de date incorrect

**Solutions :**
1. Ajoutez au moins 2 lignes de données avec des dates différentes
2. Vérifiez le format des dates : `JJ/MM/AAAA` ou `AAAA-MM-JJ`

---

## 📋 Checklist avant de publier

Avant de publier le dashboard, vérifiez :

- [ ] Google Sheet configurée avec les bonnes colonnes
- [ ] Google Sheet publiée en CSV avec "Republier automatiquement"
- [ ] URL mise à jour dans `app.js` ligne 13
- [ ] Test de l'URL dans le navigateur (affiche du CSV)
- [ ] Dashboard testé avec quelques données
- [ ] Bouton "Actualiser" fonctionne
- [ ] Les 3 athlètes s'affichent dans la vue Athlète
- [ ] Les graphiques de groupe s'affichent
- [ ] Le fichier `data-test.csv` contient des données de secours

---

## 🎓 Exemple complet

### Scénario : Vous venez de faire un nouveau test

1. **Vous ouvrez votre Google Sheet**
2. **Vous ajoutez une nouvelle ligne :**
   ```
   30/01/2024 | Athlète A | 3.85 | 8.65 | 9.32 | 10.5 | 692.0 | 2565 | 32.1 | -0.95 | 0.935 | 0.45 | 0.54 | 1.82 | 80 | 24
   ```
3. **La feuille est enregistrée automatiquement**
4. **Vous ouvrez le dashboard dans le navigateur**
5. **Vous cliquez sur 🔄 Actualiser** (ou F5)
6. **Les nouvelles données apparaissent !** ✅

---

## 🚀 Workflow recommandé

Pour une utilisation optimale :

1. **Utilisez Google Sheets** comme source principale
2. **Gardez `data-test.csv`** comme backup (le dashboard l'utilise automatiquement si Google Sheets échoue)
3. **Actualisez le dashboard** après chaque ajout de données
4. **Vérifiez les graphiques** pour voir l'évolution

---

## 💡 Astuces

### Astuce 1 : Import depuis Excel
Si vous avez vos données dans Excel :
1. Exportez en CSV
2. Copiez-collez dans Google Sheets
3. Ou remplacez directement `data-test.csv`

### Astuce 2 : Sauvegardes automatiques
Google Sheets garde un historique des versions :
- **Fichier** → **Historique des versions**
- Vous pouvez restaurer une version précédente si nécessaire

### Astuce 3 : Partage avec l'équipe
- La Google Sheet peut être partagée avec votre équipe
- Chacun peut ajouter des données
- Le dashboard se met à jour pour tout le monde

---

## 📞 Support

Si vous rencontrez un problème :

1. **Consultez la section Dépannage** ci-dessus
2. **Ouvrez la console** (F12) et regardez les erreurs
3. **Vérifiez le fichier** `GOOGLE_SHEETS_SETUP.md`
4. **Testez avec** `data-test.csv` pour vérifier que le problème vient de Google Sheets

---

## ✅ Récapitulatif

| Action | Google Sheets | CSV Local |
|--------|--------------|-----------|
| Configuration initiale | Une fois | Jamais |
| Ajout de données | Éditer la feuille | Éditer le fichier |
| Actualisation | Automatique | Manuel |
| Hors ligne | ❌ Non | ✅ Oui |
| Partage équipe | ✅ Oui | ❌ Non |
| Recommandé | ✅ Oui | Backup seulement |

**→ Utilisez Google Sheets pour la production, CSV local comme backup !**
