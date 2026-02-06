# Dashboard Sprint 30m

**Application web de suivi biomécanique pour athlètes de haut niveau**

Dashboard interactif permettant l'analyse des performances de sprint 30m avec statistiques avancées, visualisations graphiques et génération de rapports PDF.

---

## Fonctionnalités

### 1. Suivi Athlète (Vue Individuelle)
- **Cartes résumé** : Affichage des dernières valeurs F0, V0 et temps 30m
- **Z-Score** : Évaluation de la performance par rapport aux 10 derniers tests
- **Radar Chart** : Profil biomécanique comparé à la moyenne du groupe (par sexe)
- **Graphiques évolutifs** : Visualisation avec bandes d'écart-type (±0.5σ et ±1.0σ)
- **Contrôles avancés** : Zoom temporel (10-50 semaines), ajustement d'échelle Y
- **Sélecteurs de dates** : Filtrage personnalisé de la période d'analyse
- **Classement** : Position dans le groupe (dernière et meilleure performance)
- **Historique complet** : Tableau détaillé de tous les tests

### 2. Vue Groupe (Analyse Collective)
- **Statistiques moyennes** : F0, V0, temps 30m et puissance avec indicateurs de tendance
- **Graphiques d'évolution** : Moyennes du groupe avec lignes de tendance
- **Comparaison par sexe** : Filtrage Hommes/Femmes/Tous
- **Tableau comparatif** : Performances de tous les athlètes pour une date sélectionnée
- **Contrôles de zoom** : Ajustement de période pour chaque graphique

### 3. Exploration des Données
- **Analyse de corrélation** : Nuage de points avec régression linéaire
- **Statistiques avancées** : R², R (Pearson), P-value, nombre de points
- **Analyse par quadrants** : Répartition des athlètes en 4 zones de performance
- **Filtrage dynamique** : Par athlète, sexe et période
- **Variables configurables** : Choix des axes X et Y parmi toutes les métriques

### 4. Génération de Rapports PDF
- **Rapport individuel** : Analyse complète d'un athlète
- **Rapport de groupe** : Vue d'ensemble de l'équipe
- **Modules personnalisables** :
  - Valeurs résumé
  - Radar Chart du profil
  - Graphiques d'évolution F0/V0
  - Tableau des données
  - Statistiques
  - Zone de commentaires
- **Prévisualisation** : Aperçu avant export
- **Filtrage par période** : Données des X dernières semaines

---

## Installation

### Prérequis
- Navigateur web moderne (Chrome, Firefox, Safari, Edge)
- Connexion internet (pour Chart.js et données Google Sheets)

### Démarrage rapide

1. **Cloner le repository**
```bash
git clone https://github.com/Julesmte/dashboard-sprint-30m-V2.git
cd dashboard-sprint-30m-V2
```

2. **Ouvrir le dashboard**
   - Ouvrez directement `index.html` dans votre navigateur
   - Ou utilisez un serveur local :
```bash
# Python 3
python -m http.server 8000

# Node.js
npx http-server
```

3. **Accéder au dashboard** : `http://localhost:8000`

---

## Configuration des données

### Google Sheets
Le dashboard récupère les données depuis une Google Sheet publiée en CSV.

**Colonnes requises :**
| Colonne | Description | Exemple |
|---------|-------------|---------|
| Date | Date du test | 15/01/2024 |
| Name | Nom de l'athlète | Jean Dupont |
| Sexe | M ou F | M |
| 30m | Temps 30m (secondes) | 3.85 |
| F0 (N/Kg) | Force relative | 8.5 |
| V (0) | Vitesse initiale (m/s) | 10.2 |
| P Max (W/Kg) | Puissance relative | 21.5 |
| V Max | Vitesse maximale | 10.8 |
| F0 (N) | Force absolue | 680 |
| P Max (W) | Puissance absolue | 1720 |
| DRF | Ratio de force | -0.075 |
| FV | Ratio force-vitesse | 0.83 |
| RF_10m | Ratio de force à 10m | 0.42 |
| RF Peak | Ratio de force maximal | 0.52 |
| Height | Taille (cm) | 185 |
| Weight | Poids (kg) | 80 |
| Age | Âge | 24 |

**Publication Google Sheets :**
1. Fichier → Partager → Publier sur le Web
2. Choisir "Feuille de calcul entière" et format CSV
3. Copier l'URL et la coller dans `app.js` ligne 13

---

## Technologies

| Technologie | Usage |
|-------------|-------|
| HTML5/CSS3 | Structure et style responsive |
| JavaScript ES6+ | Logique métier et interactions |
| Chart.js | Visualisation des données |
| date-fns | Gestion des dates |
| html2pdf.js | Génération de rapports PDF |
| Google Sheets | Source de données |

---

## Structure du projet

```
dashboard-sprint-30m/
├── index.html              # Page principale (4 vues)
├── app.js                  # Logique JavaScript (~3800 lignes)
├── style.css               # Styles CSS (~1750 lignes)
├── data-test.csv           # Données de test/secours
├── README.md               # Documentation principale
├── GUIDE_MISE_A_JOUR.md    # Guide de mise à jour des données
├── GOOGLE_SHEETS_SETUP.md  # Configuration Google Sheets
└── .gitignore              # Fichiers ignorés par Git
```

---

## Calculs statistiques

### Z-Score
Évaluation de la performance sur les 10 derniers tests :
```
Z = (valeur - moyenne) / écart-type
```

### Corrélation de Pearson
Mesure la relation linéaire entre deux variables :
```
R = Σ(xi - x̄)(yi - ȳ) / √[Σ(xi - x̄)² × Σ(yi - ȳ)²]
```

### P-value
Test statistique bilatéral basé sur la distribution t de Student pour évaluer la significativité de la corrélation.

### Ligne de tendance
Régression linéaire sur les 10 dernières semaines :
```
y = ax + b
```

### Bandes d'écart-type
- **+1.0σ** : Performance excellente
- **+0.5σ** : Supérieure à la moyenne
- **Moyenne** : Performance typique
- **-0.5σ** : Inférieure à la moyenne
- **-1.0σ** : À améliorer

---

## Résolution des problèmes

| Problème | Solution |
|----------|----------|
| Données non chargées | Vérifier publication Google Sheet, URL dans app.js |
| Graphiques absents | Vérifier console (F12), effacer cache (Ctrl+Shift+R) |
| CORS bloqué | Essayer un autre proxy dans CORS_PROXIES |
| Format date invalide | Utiliser JJ/MM/AAAA ou AAAA-MM-JJ |

---

## Contribution

1. Fork le projet
2. Créer une branche (`git checkout -b feature/NouvelleFonction`)
3. Committer (`git commit -m 'Ajout nouvelle fonction'`)
4. Push (`git push origin feature/NouvelleFonction`)
5. Ouvrir une Pull Request

---

## Licence

Distribué sous licence MIT.

---

## Auteur

Développé pour le suivi des athlètes de sports combinés.

## Remerciements

- [Chart.js](https://www.chartjs.org/) - Bibliothèque de graphiques
- [html2pdf.js](https://ekoopmans.github.io/html2pdf.js/) - Génération PDF
- [Google Sheets](https://www.google.com/sheets) - Hébergement des données
