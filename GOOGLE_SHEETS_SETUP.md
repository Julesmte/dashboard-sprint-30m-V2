# 📊 Configuration Google Sheets

## 🔴 Problème actuel
Votre Google Sheet n'est pas correctement publiée, ce qui empêche le dashboard de charger les données.

## ✅ Solution : Publier correctement la Google Sheet

### Étape 1 : Ouvrir votre Google Sheet
1. Ouvrez votre Google Sheet dans le navigateur
2. Assurez-vous d'avoir les colonnes suivantes dans l'ordre :
   - Date, Name, 30m, F0 (N/Kg), V (0), V Max, F0 (N), P Max (W), P Max (W/Kg), DRF, FV, RF_10m, RF Peak, Height, Weight, Age

### Étape 2 : Publier la feuille sur le Web

1. **Cliquez sur "Fichier"** dans le menu
2. **Sélectionnez "Partager" → "Publier sur le Web"**
3. **Dans la fenêtre qui s'ouvre :**
   - **Onglet 1 (Lien)** : Sélectionnez la feuille à publier (ou "Feuille de calcul entière")
   - **Format** : Choisissez **"Valeurs séparées par des virgules (.csv)"**
   - **Cochez** "Republier automatiquement lorsque des modifications sont apportées"
4. **Cliquez sur "Publier"**
5. **Copiez l'URL générée** (elle ressemble à ça) :
   ```
   https://docs.google.com/spreadsheets/d/e/XXXXXXXXXX/pub?gid=XXXXXXXXX&single=true&output=csv
   ```

### Étape 3 : Tester l'URL

Ouvrez l'URL dans un navigateur. Vous devriez voir le contenu CSV brut (texte avec des virgules).

**✅ Correct :**
```
Date,Name,30m,F0 (N/Kg),V (0)...
15/01/2024,Athlète A,3.92,8.45,9.12...
```

**❌ Incorrect :**
- Page HTML de redirection
- Message d'erreur
- Page de connexion Google

### Étape 4 : Mettre à jour le Dashboard

1. Ouvrez le fichier `app.js`
2. Ligne 13, remplacez l'URL par votre nouvelle URL :
   ```javascript
   const SHEET_URL_DIRECT = 'COLLEZ_VOTRE_URL_ICI';
   ```
3. Enregistrez le fichier
4. Actualisez la page du dashboard (F5)

## 🔧 Format des données

### Format de date accepté
- **JJ/MM/AAAA** : 15/01/2024 ✅
- **AAAA-MM-JJ** : 2024-01-15 ✅

### Nombres décimaux
- Virgule : 8,45 ✅
- Point : 8.45 ✅
- Le dashboard convertit automatiquement les virgules en points

### Noms des colonnes (EXACT)
Les noms doivent correspondre exactement (respecter majuscules/minuscules) :
```
Date
Name
30m
F0 (N/Kg)
V (0)
V Max
F0 (N)
P Max (W)
P Max (W/Kg)
DRF
FV
RF_10m
RF Peak
Height
Weight
Age
```

## 🆘 En cas de problème

### Le CSV contient des caractères bizarres
- Vérifiez l'encodage : UTF-8
- Évitez les caractères spéciaux dans les noms

### Les données ne s'affichent pas
1. Ouvrez la console (F12)
2. Regardez les messages d'erreur
3. Vérifiez que toutes les colonnes obligatoires sont présentes

### Google Sheets ne se charge toujours pas
Le dashboard utilise automatiquement les données locales du fichier `data-test.csv` comme solution de secours.

## 📝 Alternative : Utiliser uniquement le fichier local

Si vous préférez ne pas utiliser Google Sheets :

1. Éditez le fichier `data-test.csv` avec vos données
2. Respectez le format CSV (virgules comme séparateurs)
3. Le dashboard chargera automatiquement ce fichier si Google Sheets échoue

## ✅ Vérification finale

Pour vérifier que tout fonctionne :
```bash
# Windows PowerShell
Invoke-WebRequest -Uri "VOTRE_URL_GOOGLE_SHEET" -UseBasicParsing

# Ou dans le navigateur, ouvrez directement l'URL
```

Vous devriez voir le contenu CSV brut sans redirection ni page HTML.

## 📞 Support

Si vous continuez à avoir des problèmes :
1. Vérifiez la console du navigateur (F12)
2. Assurez-vous que la feuille est publique
3. Testez avec le fichier `data-test.csv` en attendant
