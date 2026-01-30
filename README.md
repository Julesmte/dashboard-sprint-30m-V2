# 🏃 Dashboard Sprint 30m

Dashboard interactif de suivi biomécanique pour les athlètes d'épreuve combiné. Visualisation des performances de sprint 30m avec analyse statistique et tendances de groupe.

## 📋 Fonctionnalités

### Vue Athlète
- **Cartes résumé** : Affichage des dernières valeurs F0, V0 et temps 30m
- **Z-Score** : Évaluation de la performance par rapport à la moyenne des 10 derniers tests
- **Graphiques évolutifs** : Visualisation des performances avec bandes d'écart-type (±0.5σ et ±1.0σ)
- **Contrôles de zoom** : Ajustement de la période affichée (10-50 semaines) et de l'échelle Y
- **Classement** : Position de l'athlète dans le groupe (dernière performance et meilleure performance)
- **Historique complet** : Tableau détaillé de tous les tests

### Vue Groupe
- **Statistiques moyennes** : F0, V0 et temps 30m moyen du groupe avec tendances
- **Graphiques d'évolution** : Moyennes du groupe avec lignes de tendance sur les 10 dernières semaines
- **Analyse de puissance** : Évolution de la puissance moyenne (P Max)
- **Comparaison** : Tableau des performances de tous les athlètes pour une date sélectionnée
- **Contrôles de zoom** : Ajustement de la période affichée pour chaque graphique

## 🚀 Installation

### Prérequis
- Un navigateur web moderne (Chrome, Firefox, Safari, Edge)
- Une connexion internet (pour charger Chart.js et les données Google Sheets)

### Démarrage rapide

1. **Cloner le repository**
```bash
git clone https://github.com/votre-username/dashboard-sprint-30m.git
cd dashboard-sprint-30m
```

2. **Ouvrir le dashboard**
   - Ouvrez directement `index.html` dans votre navigateur
   - Ou utilisez un serveur local :
```bash
# Python 3
python -m http.server 8000

# Node.js (avec http-server)
npx http-server
```

3. **Accéder au dashboard**
   - Ouvrez votre navigateur et allez à `http://localhost:8000`

## 📊 Configuration des données

### Google Sheets
Le dashboard récupère les données depuis une Google Sheet publiée. Pour utiliser vos propres données :

1. **Créez une Google Sheet** avec les colonnes suivantes :
   - Date
   - Name
   - 30m (temps en secondes)
   - F0 (N/Kg)
   - V (0) (m/s)
   - P Max (W/Kg)
   - RF Peak
   - DRF
   - V Max
   - F0 (N)
   - P Max (W)
   - FV
   - RF_10m
   - Height
   - Weight
   - Age

2. **Publiez la feuille** :
   - Fichier → Partager → Publier sur le Web
   - Choisissez "Feuille de calcul entière" et format CSV
   - Copiez l'URL générée

3. **Modifiez le fichier `app.js`** (ligne 2) :
```javascript
const SHEET_URL_DIRECT = 'VOTRE_URL_GOOGLE_SHEET_CSV';
```

## 🛠️ Technologies utilisées

- **HTML5/CSS3** : Structure et style
- **JavaScript (ES6+)** : Logique métier
- **Chart.js** : Bibliothèque de graphiques
- **date-fns** : Gestion des dates via Chart.js adapter
- **Google Sheets API** : Source de données

## 📁 Structure du projet

```
dashboard-sprint-30m/
│
├── index.html          # Page principale
├── app.js             # Logique JavaScript
├── style.css          # Styles CSS
├── README.md          # Documentation
└── .gitignore         # Fichiers à ignorer par Git
```

## 🎨 Personnalisation

### Couleurs
Les couleurs sont définies dans `style.css` via des variables CSS :
```css
:root {
    --primary: #3498db;
    --secondary: #2ecc71;
    --accent: #e74c3c;
    /* ... */
}
```

### Proxies CORS
Si vous rencontrez des problèmes CORS, vous pouvez ajouter/modifier les proxies dans `app.js` (lignes 5-9) :
```javascript
const CORS_PROXIES = [
    '',
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url='
];
```

## 📈 Calculs statistiques

### Z-Score
Le Z-Score est calculé sur les 10 derniers tests :
```
Z = (valeur - moyenne) / écart-type
```

### Ligne de tendance
Régression linéaire calculée sur les 10 dernières semaines pour identifier l'évolution des performances.

### Bandes d'écart-type
- **+1.0σ** : Performance excellente
- **+0.5σ** : Performance supérieure à la moyenne
- **Moyenne** : Performance moyenne du groupe
- **-0.5σ** : Performance inférieure à la moyenne
- **-1.0σ** : Performance à améliorer

## 🐛 Résolution des problèmes

### Les données ne se chargent pas
1. Vérifiez que la Google Sheet est bien publiée en CSV
2. Vérifiez l'URL dans `app.js`
3. Ouvrez la console (F12) pour voir les erreurs détaillées
4. Vérifiez votre connexion internet

### Les graphiques ne s'affichent pas
1. Vérifiez que Chart.js est bien chargé (console F12)
2. Vérifiez que les données contiennent des valeurs numériques valides
3. Effacez le cache du navigateur (Ctrl+Shift+R)

### Format de date incorrect
Le dashboard accepte les formats de date suivants :
- JJ/MM/AAAA (ex: 15/01/2024)
- AAAA-MM-JJ (ex: 2024-01-15)

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou à soumettre une pull request.

1. Fork le projet
2. Créez votre branche (`git checkout -b feature/AmazingFeature`)
3. Committez vos changements (`git commit -m 'Add some AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

## 📝 Licence

Ce projet est distribué sous licence MIT. Voir le fichier `LICENSE` pour plus d'informations.

## 👨‍💻 Auteur

Développé avec Claude Code

## 🙏 Remerciements

- [Chart.js](https://www.chartjs.org/) pour la bibliothèque de graphiques
- [Google Sheets](https://www.google.com/sheets) pour l'hébergement des données
- Les athlètes et entraîneurs pour les retours et suggestions
