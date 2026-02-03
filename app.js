/**
 * Dashboard Sprint 30m - Suivi biomécanique hebdomadaire
 * @version 1.0.0
 * @author Claude Code
 */

// ==================== CONFIGURATION ====================

/**
 * URL de la Google Sheet publiée en CSV
 * Pour modifier la source de données, remplacez cette URL par celle de votre Google Sheet
 */
const SHEET_URL_DIRECT = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTRfcbF2qv9y9e5HVbn1x-mr4jPzx5GWx97LOFIiz4elXV-1iYGYD0rfFk7vUNtCZLC6KbOJNwZV4Pz/pub?gid=2066630061&single=true&output=csv';

/**
 * Fichier CSV local de secours
 * Utilisé si Google Sheets n'est pas accessible
 */
const LOCAL_CSV_FILE = 'data-test.csv';

/**
 * Liste des proxies CORS à essayer en séquence
 * Le premier à réussir est utilisé pour toutes les requêtes suivantes
 */
const CORS_PROXIES = [
    '', // Essayer d'abord sans proxy (si hébergé sur GitHub Pages ou si CORS est configuré)
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url='
];

/** Index du proxy actuellement utilisé */
let currentProxyIndex = 0;

// ==================== VARIABLES GLOBALES ====================

/** Tableau contenant toutes les données chargées depuis le CSV */
let allData = [];

/** Instances des graphiques Chart.js */
let chartF0 = null;
let chartV0 = null;
let chartGroupF0 = null;
let chartGroupV0 = null;
let chartGroupPower = null;
let chartGroupTime = null;
let chartRadar = null;
let chartCorrelation = null;
let chartQuadrant = null;

/** Athlète actuellement sélectionné */
let currentAthlete = null;

/** Statistiques des graphiques athlète (moyenne, écart-type, dates) */
let chartF0Stats = { mean: 0, std: 0, dates: [] };
let chartV0Stats = { mean: 0, std: 0, dates: [] };

/** Statistiques des graphiques de groupe (dates et données pour le zoom temporel et tendance) */
let chartGroupF0Stats = { dates: [], parsedDates: [], avgF0: [] };
let chartGroupV0Stats = { dates: [], parsedDates: [], avgV0: [] };
let chartGroupPowerStats = { dates: [], parsedDates: [], avgPower: [] };
let chartGroupTimeStats = { dates: [], parsedDates: [], avgTime: [] };

// Plugin pour ajouter un fond gris clair à la légende
const legendBackgroundPlugin = {
    id: 'legendBackground',
    beforeDraw: (chart) => {
        const legend = chart.legend;
        if (!legend || !legend.legendItems || legend.legendItems.length === 0) return;

        const ctx = chart.ctx;
        const { left, top, width, height } = legend;

        // Dessiner le fond gris clair avec bordure arrondie
        ctx.save();
        ctx.fillStyle = 'rgba(245, 245, 245, 0.95)';
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.5)';
        ctx.lineWidth = 1;

        const padding = 8;
        const radius = 8;
        const x = left - padding;
        const y = top - padding;
        const w = width + padding * 2;
        const h = height + padding * 2;

        // Rectangle arrondi
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + w - radius, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
        ctx.lineTo(x + w, y + h - radius);
        ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
        ctx.lineTo(x + radius, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();

        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
};

// ==================== FONCTIONS DE CONTRÔLE DES GRAPHIQUES ====================

/**
 * Réinitialise l'échelle d'un graphique aux valeurs par défaut
 * @param {string} chartType - Type de graphique ('f0', 'v0', 'group', 'group-power', 'group-time')
 */
function resetScale(chartType) {
    document.getElementById(`weeks-${chartType}`).value = 10;
    document.getElementById(`weeks-${chartType}-value`).textContent = '10';

    // Les graphiques de groupe n'ont pas de contrôle Y scale
    const yScaleElement = document.getElementById(`scale-y-${chartType}`);
    if (yScaleElement) {
        yScaleElement.value = 1.5;
        document.getElementById(`scale-y-${chartType}-value`).textContent = '±1.5';
    }

    updateWeeksScale(chartType);
    if (yScaleElement) {
        updateYScale(chartType);
    }
}

/**
 * Ajuste le nombre de semaines affichées sur l'axe X d'un graphique
 * @param {string} chartType - Type de graphique
 */
function updateWeeksScale(chartType) {
    const weeks = parseInt(document.getElementById(`weeks-${chartType}`).value);
    document.getElementById(`weeks-${chartType}-value`).textContent = weeks;

    let chart, stats;

    // Déterminer quel graphique et stats utiliser
    if (chartType === 'f0') {
        chart = chartF0;
        stats = chartF0Stats;
    } else if (chartType === 'v0') {
        chart = chartV0;
        stats = chartV0Stats;
    } else if (chartType === 'group-f0') {
        chart = chartGroupF0;
        stats = chartGroupF0Stats;
    } else if (chartType === 'group-v0') {
        chart = chartGroupV0;
        stats = chartGroupV0Stats;
    } else if (chartType === 'group-power') {
        chart = chartGroupPower;
        stats = chartGroupPowerStats;
    } else if (chartType === 'group-time') {
        chart = chartGroupTime;
        stats = chartGroupTimeStats;
    }

    if (!chart || !stats.dates || stats.dates.length === 0) return;

    // Calculer la date minimum basée sur le nombre de semaines
    const maxDate = Math.max(...stats.dates);
    const msPerWeek = 7 * 24 * 60 * 60 * 1000;
    const minDate = maxDate - (weeks * msPerWeek);

    chart.options.scales.x.min = minDate;
    chart.options.scales.x.max = maxDate;
    chart.update('none');
}

/**
 * Ajuste l'échelle Y d'un graphique athlète en fonction du nombre d'écarts-types
 * @param {string} chartType - 'f0' ou 'v0'
 */
function updateYScale(chartType) {
    const scaleValue = parseFloat(document.getElementById(`scale-y-${chartType}`).value);
    document.getElementById(`scale-y-${chartType}-value`).textContent = `±${scaleValue.toFixed(1)}`;

    const chart = chartType === 'f0' ? chartF0 : chartV0;
    const stats = chartType === 'f0' ? chartF0Stats : chartV0Stats;

    if (!chart || !stats.mean) return;

    const yMin = stats.mean - scaleValue * stats.std;
    const yMax = stats.mean + scaleValue * stats.std;

    chart.options.scales.y.min = yMin;
    chart.options.scales.y.max = yMax;
    chart.update('none');
}

// ==================== MAPPING DES COLONNES CSV ====================

/**
 * Mapping des noms de colonnes du CSV
 * Permet de centraliser la gestion des noms de colonnes
 */
const COLUMNS = {
    DATE: 'Date',
    NAME: 'Name',
    TIME_5M: '5m',
    TIME_10M: '10m',
    TIME_15M: '15m',
    TIME_20M: '20m',
    TIME_25M: '25m',
    TIME_30M: '30m',
    F0_RELATIVE: 'F0 (N/Kg)',
    V0: 'V (0)',
    V_MAX: 'V Max',
    F0_ABSOLUTE: 'F0 (N)',
    P_MAX: 'P Max (W)',
    P_MAX_RELATIVE: 'P Max (W/Kg)',
    DRF: 'DRF',
    FV: 'FV',
    RF_10M: 'RF_10m',
    RF_PEAK: 'RF Peak',
    HEIGHT: 'Height',
    WEIGHT: 'Weight',
    AGE: 'Age'
};

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupEventListeners();
});

// Configuration des événements
function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`page-${btn.dataset.page}`).classList.add('active');
        });
    });

    // Sélection athlète
    document.getElementById('athlete-select').addEventListener('change', (e) => {
        if (e.target.value) {
            currentAthlete = e.target.value;
            updateAthleteView(e.target.value);
            populateCompareSelect(e.target.value);
        }
    });

    // Sélection athlète pour comparaison radar
    document.getElementById('compare-select').addEventListener('change', (e) => {
        updateRadarChart();
    });

    // Sélection métrique de tri pour le tableau groupe
    document.getElementById('sort-metric-select').addEventListener('change', (e) => {
        const dates = [...new Set(allData.map(row => row[COLUMNS.DATE]))].sort((a, b) => {
            return parseDate(b) - parseDate(a);
        });
        if (dates.length > 0) {
            updateGroupTable(dates[0]);
        }
    });

    // Date selector removed - table now shows latest date automatically

    // Bouton refresh
    document.getElementById('refresh-btn').addEventListener('click', loadData);

    // Toggle tableau
    document.getElementById('toggle-table').addEventListener('click', () => {
        const container = document.getElementById('table-container');
        const btn = document.getElementById('toggle-table');
        container.classList.toggle('hidden');
        btn.textContent = container.classList.contains('hidden')
            ? 'Afficher tous les tests'
            : 'Masquer les tests';
    });

    // Exploration page event listeners
    document.getElementById('metric-x').addEventListener('change', updateExplorationView);
    document.getElementById('metric-y').addEventListener('change', updateExplorationView);
    document.getElementById('exploration-date-start').addEventListener('change', updateExplorationView);
    document.getElementById('exploration-date-end').addEventListener('change', updateExplorationView);
    document.getElementById('reset-date-range').addEventListener('click', resetExplorationDateRange);

    // Navigation - update exploration view when switching to exploration page
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.page === 'exploration' && allData.length > 0) {
                setTimeout(() => {
                    populateExplorationDateSelectors();
                    updateExplorationView();
                }, 100);
            }
        });
    });
}

// Charger les données depuis Google Sheets
async function loadData() {
    document.body.classList.add('loading');

    // Essayer chaque proxy dans l'ordre
    for (let i = 0; i < CORS_PROXIES.length; i++) {
        try {
            const proxy = CORS_PROXIES[i];
            const url = proxy ? proxy + encodeURIComponent(SHEET_URL_DIRECT) : SHEET_URL_DIRECT;

            console.log(`Tentative de chargement avec ${proxy || 'accès direct'}...`);

            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const csvText = await response.text();

            // Vérifier que c'est bien du CSV
            if (!csvText.includes('Date') || csvText.length < 100) {
                throw new Error('Format de données invalide');
            }

            allData = parseCSV(csvText);

            if (allData.length === 0) {
                throw new Error('Aucune donnée trouvée dans le CSV');
            }

            populateAthleteSelect();
            populateDateSelect();
            populateExplorationDateSelectors();
            updateGroupView();

            // Sélectionner le premier athlète par défaut
            const select = document.getElementById('athlete-select');
            if (select.options.length > 1) {
                select.selectedIndex = 1;
                currentAthlete = select.value;
                populateCompareSelect(select.value);
                updateAthleteView(select.value);
            }

            document.getElementById('last-update').textContent =
                `Dernière mise à jour : ${new Date().toLocaleString('fr-FR')}`;

            console.log('✅ Données chargées avec succès!');
            currentProxyIndex = i;
            document.body.classList.remove('loading');
            return; // Succès!

        } catch (error) {
            console.warn(`❌ Échec avec ${CORS_PROXIES[i] || 'accès direct'}:`, error.message);

            // Si c'est la dernière tentative, essayer le fichier local
            if (i === CORS_PROXIES.length - 1) {
                console.warn('Toutes les tentatives Google Sheets ont échoué. Tentative avec fichier local...');

                try {
                    const response = await fetch(LOCAL_CSV_FILE);
                    if (!response.ok) {
                        throw new Error('Fichier local non trouvé');
                    }

                    const csvText = await response.text();
                    allData = parseCSV(csvText);

                    if (allData.length === 0) {
                        throw new Error('Aucune donnée dans le fichier local');
                    }

                    populateAthleteSelect();
                    populateDateSelect();
                    populateExplorationDateSelectors();
                    updateGroupView();

                    const select = document.getElementById('athlete-select');
                    if (select.options.length > 1) {
                        select.selectedIndex = 1;
                        currentAthlete = select.value;
                        populateCompareSelect(select.value);
                        updateAthleteView(select.value);
                    }

                    document.getElementById('last-update').textContent =
                        `Dernière mise à jour : ${new Date().toLocaleString('fr-FR')} (Données locales)`;

                    console.log('✅ Données locales chargées avec succès!');
                    document.body.classList.remove('loading');
                    return;

                } catch (localError) {
                    console.error('Échec du chargement du fichier local:', localError);
                    alert(`❌ Impossible de charger les données\n\nGoogle Sheets: ${error.message}\nFichier local: ${localError.message}\n\n📋 Instructions:\n1. Vérifiez votre connexion internet\n2. Republier la Google Sheet:\n   - Fichier → Partager → Publier sur le Web\n   - Feuille de calcul entière → CSV\n3. Ou utilisez le fichier local: ${LOCAL_CSV_FILE}`);
                    document.body.classList.remove('loading');
                }
            }
            // Sinon, continuer avec le prochain proxy
        }
    }
}

// Parser le CSV (gestion format français avec virgule décimale)
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = parseCSVLine(lines[0]);

    return lines.slice(1).map(line => {
        const values = parseCSVLine(line);
        const obj = {};
        headers.forEach((header, i) => {
            let value = values[i] || '';
            value = value.trim();
            if (value.match(/^-?\d+,\d+$/)) {
                value = value.replace(',', '.');
            }
            obj[header.trim()] = value;
        });
        return obj;
    }).filter(row => row[COLUMNS.NAME] && row[COLUMNS.DATE]);
}

// Parser une ligne CSV (gestion des guillemets)
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.replace(/"/g, '').trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.replace(/"/g, '').trim());
    return result;
}

// Remplir le sélecteur d'athlètes
function populateAthleteSelect() {
    const select = document.getElementById('athlete-select');
    const athletes = [...new Set(allData.map(row => row[COLUMNS.NAME].trim()))].sort();

    select.innerHTML = '<option value="">-- Choisir un athlète --</option>';
    athletes.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });
}

// Remplir le sélecteur de comparaison (exclut l'athlète actuellement sélectionné)
function populateCompareSelect(excludeAthlete) {
    const select = document.getElementById('compare-select');
    const athletes = [...new Set(allData.map(row => row[COLUMNS.NAME].trim()))]
        .filter(name => name !== excludeAthlete)
        .sort();

    select.innerHTML = '<option value="">-- Aucune comparaison --</option>';
    athletes.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        select.appendChild(option);
    });
}

// Automatically get the latest date for group table
function populateDateSelect() {
    const dates = [...new Set(allData.map(row => row[COLUMNS.DATE]))].sort((a, b) => {
        return parseDate(b) - parseDate(a);
    });

    if (dates.length > 0) {
        updateGroupTable(dates[0]);
    }
}

// Parser une date (format JJ/MM/AAAA ou AAAA-MM-JJ)
function parseDate(dateStr) {
    if (!dateStr) return new Date(0);

    if (dateStr.includes('-')) {
        return new Date(dateStr);
    }

    const parts = dateStr.split('/');
    if (parts.length === 3) {
        return new Date(parts[2], parts[1] - 1, parts[0]);
    }

    return new Date(dateStr);
}

// Formater une date pour l'affichage
function formatDate(dateStr) {
    const date = parseDate(dateStr);
    return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

// Mettre à jour la vue athlète
function updateAthleteView(athleteName) {
    currentAthlete = athleteName;

    const athleteData = allData
        .filter(row => row[COLUMNS.NAME].trim() === athleteName)
        .sort((a, b) => parseDate(a[COLUMNS.DATE]) - parseDate(b[COLUMNS.DATE]));

    if (athleteData.length === 0) return;

    updateSummaryCards(athleteData, athleteName);
    updateRadarChart();
    updateChartF0(athleteData);
    updateChartV0(athleteData);
    updateAthleteTable(athleteData);
}

// Mettre à jour les cartes résumé (F0, V0, Temps 30m)
function updateSummaryCards(athleteData, athleteName) {
    // Stats F0
    const f0Stats = calculateStatsWithZScore(athleteData, COLUMNS.F0_RELATIVE);
    if (f0Stats) {
        document.getElementById('f0-value').textContent = f0Stats.last.toFixed(2);
        document.getElementById('f0-zscore').textContent = `Z: ${f0Stats.zScore.toFixed(2)}`;
        updateVariation('f0-variation', f0Stats.variation, false);
        const f0Ranking = calculateRanking(athleteName, COLUMNS.F0_RELATIVE, false);
        document.getElementById('f0-ranking').textContent = `Last: ${f0Ranking.lastRank}/${f0Ranking.total} | Best: ${f0Ranking.bestRank}/${f0Ranking.total}`;
    }

    // Stats V0
    const v0Stats = calculateStatsWithZScore(athleteData, COLUMNS.V0);
    if (v0Stats) {
        document.getElementById('v0-value').textContent = v0Stats.last.toFixed(2);
        document.getElementById('v0-zscore').textContent = `Z: ${v0Stats.zScore.toFixed(2)}`;
        updateVariation('v0-variation', v0Stats.variation, false);
        const v0Ranking = calculateRanking(athleteName, COLUMNS.V0, false);
        document.getElementById('v0-ranking').textContent = `Last: ${v0Ranking.lastRank}/${v0Ranking.total} | Best: ${v0Ranking.bestRank}/${v0Ranking.total}`;
    }

    // Stats Temps 30m
    const timeStats = calculateStatsWithZScore(athleteData, COLUMNS.TIME_30M);
    if (timeStats) {
        document.getElementById('time-value').textContent = timeStats.last.toFixed(3);
        document.getElementById('time-zscore').textContent = `Z: ${timeStats.zScore.toFixed(2)}`;
        updateVariation('time-variation', timeStats.variation, true);

        const diff = timeStats.last - timeStats.min;
        const compEl = document.getElementById('time-comparison');
        if (diff === 0) {
            compEl.textContent = `🏆 Record égalé !`;
        } else {
            compEl.textContent = `+${diff.toFixed(3)}s vs record (${timeStats.min.toFixed(3)}s)`;
        }

        const timeRanking = calculateRanking(athleteName, COLUMNS.TIME_30M, true);
        document.getElementById('time-ranking').textContent = `Last: ${timeRanking.lastRank}/${timeRanking.total} | Best: ${timeRanking.bestRank}/${timeRanking.total}`;
    }
}

// Calculer stats avec Z-score
function calculateStatsWithZScore(data, column) {
    const values = data.map(row => parseFloat(row[column])).filter(v => !isNaN(v));
    if (values.length === 0) return null;

    const last10 = values.slice(-10);
    const mean = last10.reduce((a, b) => a + b, 0) / last10.length;
    const variance = last10.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / last10.length;
    const std = Math.sqrt(variance);

    const last = values[values.length - 1];
    const zScore = std !== 0 ? (last - mean) / std : 0;
    const variation = ((last - mean) / mean) * 100;

    return { mean, std, last, min: Math.min(...values), max: Math.max(...values), zScore, variation };
}

// Calculer le ranking d'un athlète dans le groupe
function calculateRanking(athleteName, column, isTimeMetric) {
    const allValues = [];
    const allBestValues = [];
    const athletes = [...new Set(allData.map(row => row[COLUMNS.NAME].trim()))];

    athletes.forEach(athlete => {
        const athleteRows = allData.filter(row => row[COLUMNS.NAME].trim() === athlete);
        const values = athleteRows.map(row => parseFloat(row[column])).filter(v => !isNaN(v));

        if (values.length > 0) {
            const lastValue = values[values.length - 1];
            const bestValue = isTimeMetric ? Math.min(...values) : Math.max(...values);
            allValues.push({ athlete, value: lastValue });
            allBestValues.push({ athlete, value: bestValue });
        }
    });

    if (isTimeMetric) {
        allValues.sort((a, b) => a.value - b.value);
        allBestValues.sort((a, b) => a.value - b.value);
    } else {
        allValues.sort((a, b) => b.value - a.value);
        allBestValues.sort((a, b) => b.value - a.value);
    }

    const lastRank = allValues.findIndex(item => item.athlete === athleteName) + 1;
    const bestRank = allBestValues.findIndex(item => item.athlete === athleteName) + 1;

    return { lastRank: lastRank || '-', bestRank: bestRank || '-', total: allValues.length };
}

// Mettre à jour l'affichage de la variation
function updateVariation(elementId, variation, isTimeMetric) {
    const el = document.getElementById(elementId);
    const absVariation = Math.abs(variation);
    let className, arrow;

    if (isTimeMetric) {
        if (variation > 0) {
            className = 'negative';
            arrow = '↑';
        } else {
            className = 'positive';
            arrow = '↓';
        }
    } else {
        if (variation > 0) {
            className = 'positive';
            arrow = '↑';
        } else {
            className = 'negative';
            arrow = '↓';
        }
    }

    el.innerHTML = `<span class="arrow">${arrow}</span> ${absVariation.toFixed(1)}%`;
    el.className = `variation ${className}`;
}

// Calculer moyenne et écart-type des 10 derniers
function calculateStats(data, column) {
    const values = data.slice(-10).map(row => parseFloat(row[column])).filter(v => !isNaN(v));
    if (values.length === 0) return { mean: 0, std: 0 };

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);

    return { mean, std };
}

// Créer les données pour les bandes d'écart-type
function createBandData(dates, mean, std, multiplier) {
    return {
        upper: dates.map(() => mean + multiplier * std),
        lower: dates.map(() => mean - multiplier * std)
    };
}

// Mettre à jour le graphique F0
function updateChartF0(athleteData) {
    const ctx = document.getElementById('chart-f0').getContext('2d');

    const dates = athleteData.map(row => parseDate(row[COLUMNS.DATE]));
    const f0Values = athleteData.map(row => parseFloat(row[COLUMNS.F0_RELATIVE]));

    const stats = calculateStats(athleteData, COLUMNS.F0_RELATIVE);
    const band05 = createBandData(dates, stats.mean, stats.std, 0.5);
    const band10 = createBandData(dates, stats.mean, stats.std, 1.0);

    if (chartF0) chartF0.destroy();

    // Stocker les stats pour les curseurs d'échelle et tendance
    chartF0Stats.mean = stats.mean;
    chartF0Stats.std = stats.std;
    chartF0Stats.dates = dates.map(d => d.getTime());
    chartF0Stats.parsedDates = dates;
    chartF0Stats.values = f0Values;

    // Calculer la tendance
    const trendWeeks = parseInt(document.getElementById('trend-weeks-f0')?.value || 10);
    const trendData = calculateSingleTrendData(dates, f0Values, trendWeeks);

    chartF0 = new Chart(ctx, {
        type: 'line',
        plugins: [legendBackgroundPlugin],
        data: {
            labels: dates,
            datasets: [
                {
                    label: '+1.0 σ',
                    data: band10.upper,
                    borderColor: '#00FF00',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: '+0.5 σ',
                    data: band05.upper,
                    borderColor: '#8B4513',
                    borderWidth: 2,
                    borderDash: [8, 4],
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: 'Moyenne',
                    data: dates.map(() => stats.mean),
                    borderColor: 'rgba(0, 0, 0, 0.3)',
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: '-0.5 σ',
                    data: band05.lower,
                    borderColor: '#FFD700',
                    borderWidth: 2,
                    borderDash: [8, 4],
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: '-1.0 σ',
                    data: band10.lower,
                    borderColor: '#FF0000',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: 'F0 (N/Kg)',
                    data: f0Values,
                    borderColor: '#000000',
                    backgroundColor: '#000000',
                    borderWidth: 2,
                    pointRadius: 10,
                    pointHoverRadius: 14,
                    pointStyle: 'cross',
                    pointBorderWidth: 3,
                    showLine: false,
                    fill: false
                },
                {
                    label: 'Tendance',
                    data: trendData,
                    borderColor: 'rgba(120, 120, 120, 0.7)',
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    borderDash: [8, 4],
                    pointRadius: 0,
                    fill: false,
                    spanGaps: false
                }
            ]
        },
        options: getChartOptions('F0 (N/Kg)', stats, dates)
    });

    // Calculer le nombre total de semaines disponibles
    const totalWeeks = Math.max(10, Math.ceil((Math.max(...chartF0Stats.dates) - Math.min(...chartF0Stats.dates)) / (7 * 24 * 60 * 60 * 1000)));

    // Mettre à jour le max du slider dynamiquement
    const weeksSlider = document.getElementById('weeks-f0');
    const displayWeeks = Math.min(50, totalWeeks);
    weeksSlider.max = displayWeeks;

    // Appliquer l'échelle par défaut (10 semaines, ±1.5 ET) comme lors d'un reset
    resetScale('f0');
}

// Mettre à jour le graphique V0
function updateChartV0(athleteData) {
    const ctx = document.getElementById('chart-v0').getContext('2d');

    const dates = athleteData.map(row => parseDate(row[COLUMNS.DATE]));
    const v0Values = athleteData.map(row => parseFloat(row[COLUMNS.V0]));

    const stats = calculateStats(athleteData, COLUMNS.V0);
    const band05 = createBandData(dates, stats.mean, stats.std, 0.5);
    const band10 = createBandData(dates, stats.mean, stats.std, 1.0);

    if (chartV0) chartV0.destroy();

    // Stocker les stats pour les curseurs d'échelle et tendance
    chartV0Stats.mean = stats.mean;
    chartV0Stats.std = stats.std;
    chartV0Stats.dates = dates.map(d => d.getTime());
    chartV0Stats.parsedDates = dates;
    chartV0Stats.values = v0Values;

    // Calculer la tendance
    const trendWeeks = parseInt(document.getElementById('trend-weeks-v0')?.value || 10);
    const trendData = calculateSingleTrendData(dates, v0Values, trendWeeks);

    chartV0 = new Chart(ctx, {
        type: 'line',
        plugins: [legendBackgroundPlugin],
        data: {
            labels: dates,
            datasets: [
                {
                    label: '+1.0 σ',
                    data: band10.upper,
                    borderColor: '#00FF00',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: '+0.5 σ',
                    data: band05.upper,
                    borderColor: '#8B4513',
                    borderWidth: 2,
                    borderDash: [8, 4],
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: 'Moyenne',
                    data: dates.map(() => stats.mean),
                    borderColor: 'rgba(0, 0, 0, 0.3)',
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: '-0.5 σ',
                    data: band05.lower,
                    borderColor: '#FFD700',
                    borderWidth: 2,
                    borderDash: [8, 4],
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: '-1.0 σ',
                    data: band10.lower,
                    borderColor: '#FF0000',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                },
                {
                    label: 'V0 (m/s)',
                    data: v0Values,
                    borderColor: '#000000',
                    backgroundColor: '#000000',
                    borderWidth: 2,
                    pointRadius: 10,
                    pointHoverRadius: 14,
                    pointStyle: 'cross',
                    pointBorderWidth: 3,
                    showLine: false,
                    fill: false
                },
                {
                    label: 'Tendance',
                    data: trendData,
                    borderColor: 'rgba(120, 120, 120, 0.7)',
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    borderDash: [8, 4],
                    pointRadius: 0,
                    fill: false,
                    spanGaps: false
                }
            ]
        },
        options: getChartOptions('V0 (m/s)', stats, dates)
    });

    // Calculer le nombre total de semaines disponibles
    const totalWeeks = Math.max(10, Math.ceil((Math.max(...chartV0Stats.dates) - Math.min(...chartV0Stats.dates)) / (7 * 24 * 60 * 60 * 1000)));

    // Mettre à jour le max du slider dynamiquement
    const weeksSlider = document.getElementById('weeks-v0');
    const displayWeeks = Math.min(50, totalWeeks);
    weeksSlider.max = displayWeeks;

    // Appliquer l'échelle par défaut (10 semaines, ±1.5 ET) comme lors d'un reset
    resetScale('v0');
}

// Options communes pour les graphiques
function getChartOptions(yLabel, stats, dates) {
    const yMin = stats ? stats.mean - 1.5 * stats.std : undefined;
    const yMax = stats ? stats.mean + 1.5 * stats.std : undefined;

    // Calculer les limites X pour afficher 10 semaines par défaut
    let xMin, xMax;
    if (dates && dates.length > 0) {
        const timestamps = dates.map(d => d.getTime());
        xMax = Math.max(...timestamps);
        const msPerWeek = 7 * 24 * 60 * 60 * 1000;
        xMin = xMax - (10 * msPerWeek);
    }

    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            intersect: true,
            mode: 'nearest'
        },
        plugins: {
            legend: {
                display: true,
                position: 'right',
                labels: {
                    usePointStyle: true,
                    font: { size: 11 },
                    padding: 15,
                    boxWidth: 15,
                    boxHeight: 10
                }
            },
            tooltip: {
                enabled: true,
                filter: function(tooltipItem) {
                    // N'afficher le tooltip que pour les données (pas les lignes de référence)
                    return tooltipItem.dataset.showLine === false;
                },
                callbacks: {
                    title: (items) => {
                        if (items.length === 0) return '';
                        return formatDate(items[0].label);
                    },
                    label: (item) => {
                        return `${item.parsed.y.toFixed(2)}`;
                    }
                },
                displayColors: false,
                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                titleFont: { size: 12 },
                bodyFont: { size: 14, weight: 'bold' },
                padding: 10,
                cornerRadius: 6
            },
        },
        scales: {
            x: {
                type: 'time',
                time: {
                    unit: 'week',
                    displayFormats: { week: 'dd MMM' }
                },
                title: { display: true, text: 'Date' },
                min: xMin,
                max: xMax
            },
            y: {
                title: { display: true, text: yLabel },
                min: yMin,
                max: yMax
            }
        }
    };
}

// Mettre à jour le tableau athlète
function updateAthleteTable(athleteData) {
    const thead = document.querySelector('#athlete-table thead');
    const tbody = document.querySelector('#athlete-table tbody');

    const headers = ['Date', 'Temps 30m', 'F0 (N/Kg)', 'V0', 'P Max (W/Kg)', 'DRF', 'RF Peak'];
    thead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`;

    const sortedData = [...athleteData].sort((a, b) =>
        parseDate(b[COLUMNS.DATE]) - parseDate(a[COLUMNS.DATE])
    );

    tbody.innerHTML = sortedData.map(row => `
        <tr>
            <td>${formatDate(row[COLUMNS.DATE])}</td>
            <td>${parseFloat(row[COLUMNS.TIME_30M]).toFixed(2)}</td>
            <td>${parseFloat(row[COLUMNS.F0_RELATIVE]).toFixed(2)}</td>
            <td>${parseFloat(row[COLUMNS.V0]).toFixed(2)}</td>
            <td>${parseFloat(row[COLUMNS.P_MAX_RELATIVE]).toFixed(2)}</td>
            <td>${parseFloat(row[COLUMNS.DRF]).toFixed(3)}</td>
            <td>${parseFloat(row[COLUMNS.RF_PEAK]).toFixed(2)}</td>
        </tr>
    `).join('');
}

// Obtenir les dernières valeurs d'un athlète pour le radar chart
function getLatestAthleteValues(athleteName) {
    const athleteData = allData
        .filter(row => row[COLUMNS.NAME].trim() === athleteName)
        .sort((a, b) => parseDate(b[COLUMNS.DATE]) - parseDate(a[COLUMNS.DATE]));

    if (athleteData.length === 0) return null;

    const latest = athleteData[0];
    return {
        f0: parseFloat(latest[COLUMNS.F0_RELATIVE]) || 0,
        v0: parseFloat(latest[COLUMNS.V0]) || 0,
        time30m: parseFloat(latest[COLUMNS.TIME_30M]) || 0,
        pMax: parseFloat(latest[COLUMNS.P_MAX_RELATIVE]) || 0,
        drf: parseFloat(latest[COLUMNS.DRF]) || 0,
        rf10m: parseFloat(latest[COLUMNS.RF_10M]) || 0
    };
}

// Échelles absolues fixes pour le radar chart (valeurs de référence)
const RADAR_SCALES = {
    f0: { min: 5, max: 10 },           // F0 : 6 à 11 N/Kg
    v0: { min: 7, max: 10 },           // V0 : 7 à 11 m/s
    time30m: { min: 5.2, max: 3.9 },   // Temps 30m : 5.2s (pire) à 3.9s (meilleur)
    pMax: { min: 10, max: 25 },        // P Max : 10 à 25 W/Kg
    drf: { min: -0.15, max: -0.065 },   // DRF : -0.10 (pire) à -0.06 (meilleur)
    rf10m: { min: 0.25, max: 0.40 }    // RF 10m : 0.25 à 0.40
};

// Retourner les échelles fixes pour le radar chart
function getRadarScales() {
    return RADAR_SCALES;
}

// Normaliser une valeur entre 0 et 100 (pour le radar chart)
function normalizeValue(value, min, max, invert = false) {
    if (max === min) return 50;
    const normalized = ((value - min) / (max - min)) * 100;
    return invert ? 100 - normalized : normalized;
}

// Mettre à jour le radar chart
function updateRadarChart() {
    if (!currentAthlete) return;

    const ctx = document.getElementById('chart-radar').getContext('2d');
    const compareSelect = document.getElementById('compare-select');
    const compareAthlete = compareSelect.value;

    const mainValues = getLatestAthleteValues(currentAthlete);
    if (!mainValues) return;

    const scales = getRadarScales();

    // Normaliser les valeurs avec les échelles fixes
    // Pour temps 30m et DRF : min = pire valeur, max = meilleure valeur (inversé dans l'échelle)
    const mainNormalized = [
        normalizeValue(mainValues.f0, scales.f0.min, scales.f0.max),
        normalizeValue(mainValues.v0, scales.v0.min, scales.v0.max),
        normalizeValue(mainValues.time30m, scales.time30m.min, scales.time30m.max), // 5.2s=0%, 3.9s=100%
        normalizeValue(mainValues.pMax, scales.pMax.min, scales.pMax.max),
        normalizeValue(mainValues.drf, scales.drf.min, scales.drf.max), // -0.10=0%, -0.06=100%
        normalizeValue(mainValues.rf10m, scales.rf10m.min, scales.rf10m.max)
    ];

    const datasets = [
        {
            label: currentAthlete,
            data: mainNormalized,
            backgroundColor: 'rgba(255, 140, 0, 0.3)',
            borderColor: 'rgb(255, 140, 0)',
            borderWidth: 2,
            pointBackgroundColor: 'rgb(255, 140, 0)',
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: 'rgb(255, 140, 0)',
            pointRadius: 4
        }
    ];

    // Ajouter les données de comparaison si un athlète est sélectionné
    if (compareAthlete) {
        const compareValues = getLatestAthleteValues(compareAthlete);
        if (compareValues) {
            const compareNormalized = [
                normalizeValue(compareValues.f0, scales.f0.min, scales.f0.max),
                normalizeValue(compareValues.v0, scales.v0.min, scales.v0.max),
                normalizeValue(compareValues.time30m, scales.time30m.min, scales.time30m.max),
                normalizeValue(compareValues.pMax, scales.pMax.min, scales.pMax.max),
                normalizeValue(compareValues.drf, scales.drf.min, scales.drf.max),
                normalizeValue(compareValues.rf10m, scales.rf10m.min, scales.rf10m.max)
            ];

            datasets.push({
                label: compareAthlete,
                data: compareNormalized,
                backgroundColor: 'rgba(30, 144, 255, 0.3)',
                borderColor: 'rgb(30, 144, 255)',
                borderWidth: 2,
                pointBackgroundColor: 'rgb(30, 144, 255)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgb(30, 144, 255)',
                pointRadius: 4
            });
        }
    }

    if (chartRadar) chartRadar.destroy();

    // Labels avec les plages de valeurs pour chaque métrique
    const radarLabels = [
        `F0 (${scales.f0.min}-${scales.f0.max} N/Kg)`,
        `V0 (${scales.v0.min}-${scales.v0.max} m/s)`,
        `Temps 30m (${scales.time30m.min}-${scales.time30m.max}s)`,
        `P Max (${scales.pMax.min}-${scales.pMax.max} W/Kg)`,
        `DRF (${scales.drf.min} à ${scales.drf.max})`,
        `RF 10m (${scales.rf10m.min}-${scales.rf10m.max})`
    ];

    chartRadar = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: radarLabels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        font: { size: 12 },
                        usePointStyle: true,
                        padding: 15
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const athleteName = context.dataset.label;
                            const metricIndex = context.dataIndex;
                            const values = getLatestAthleteValues(athleteName);
                            if (!values) return '';

                            const rawValues = [values.f0, values.v0, values.time30m, values.pMax, values.drf, values.rf10m];
                            const units = ['N/Kg', 'm/s', 's', 'W/Kg', '', ''];
                            const percentage = context.parsed.r.toFixed(0);

                            return `${athleteName}: ${rawValues[metricIndex].toFixed(2)} ${units[metricIndex]} (${percentage}%)`;
                        }
                    }
                }
            },
            scales: {
                r: {
                    beginAtZero: true,
                    max: 100,
                    min: 0,
                    ticks: {
                        stepSize: 25,
                        display: true,
                        backdropColor: 'rgba(255, 255, 255, 0.8)',
                        color: '#666',
                        font: { size: 9 },
                        callback: function(value) {
                            return value + '%';
                        }
                    },
                    pointLabels: {
                        font: { size: 10, weight: '500' },
                        color: '#333'
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    },
                    angleLines: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                }
            }
        }
    });

    // Mettre à jour la légende custom
    updateRadarLegend(compareAthlete);
}

// Mettre à jour la légende du radar chart
function updateRadarLegend(compareAthlete) {
    const legendContainer = document.querySelector('.radar-legend');
    const compareLegend = legendContainer.querySelector('.legend-item.compare');

    if (compareAthlete) {
        compareLegend.style.display = 'flex';
    } else {
        compareLegend.style.display = 'none';
    }
}

// Mettre à jour la vue groupe
function updateGroupView() {
    updateGroupStats();
    updateGroupF0Chart();
    updateGroupV0Chart();
    updateGroupPowerChart();
    updateGroupTimeChart();

    // Automatically show latest date in table
    populateDateSelect();
}

// Mettre à jour les stats groupe
function updateGroupStats() {
    const dataByDate = {};
    allData.forEach(row => {
        const date = row[COLUMNS.DATE];
        if (!dataByDate[date]) {
            dataByDate[date] = [];
        }
        dataByDate[date].push(row);
    });

    const dates = Object.keys(dataByDate).sort((a, b) => parseDate(a) - parseDate(b));

    if (dates.length < 2) return;

    const lastDate = dates[dates.length - 1];
    const prevDate = dates[dates.length - 2];

    const lastData = dataByDate[lastDate];
    const prevData = dataByDate[prevDate];

    const avgF0 = average(lastData.map(r => parseFloat(r[COLUMNS.F0_RELATIVE])));
    const avgV0 = average(lastData.map(r => parseFloat(r[COLUMNS.V0])));
    const avgTime = average(lastData.map(r => parseFloat(r[COLUMNS.TIME_30M])));

    const prevF0 = average(prevData.map(r => parseFloat(r[COLUMNS.F0_RELATIVE])));
    const prevV0 = average(prevData.map(r => parseFloat(r[COLUMNS.V0])));
    const prevTime = average(prevData.map(r => parseFloat(r[COLUMNS.TIME_30M])));

    document.getElementById('group-f0').textContent = avgF0.toFixed(2);
    document.getElementById('group-v0').textContent = avgV0.toFixed(2);
    document.getElementById('group-time').textContent = avgTime.toFixed(2);

    setTrend('trend-f0', avgF0 - prevF0, true);
    setTrend('trend-v0', avgV0 - prevV0, true);
    setTrend('trend-time', avgTime - prevTime, false);
}

function average(arr) {
    const valid = arr.filter(v => !isNaN(v));
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
}

function setTrend(elementId, diff, higherIsBetter) {
    const el = document.getElementById(elementId);
    const isPositive = higherIsBetter ? diff > 0 : diff < 0;
    const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';

    el.textContent = `${arrow} ${Math.abs(diff).toFixed(2)} vs semaine préc.`;
    el.className = `trend ${isPositive ? 'up' : 'down'}`;
}

// Fonction pour calculer la régression linéaire (ligne de tendance)
function calculateLinearRegression(xValues, yValues) {
    const n = xValues.length;
    if (n === 0) return null;

    // Convertir les dates en timestamps numériques pour les calculs
    const x = xValues.map(date => date.getTime ? date.getTime() : date);
    const y = yValues;

    // Calcul de la moyenne
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const meanX = sumX / n;
    const meanY = sumY / n;

    // Calcul de la pente (slope) et de l'ordonnée à l'origine (intercept)
    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
        numerator += (x[i] - meanX) * (y[i] - meanY);
        denominator += (x[i] - meanX) * (x[i] - meanX);
    }

    const slope = denominator !== 0 ? numerator / denominator : 0;
    const intercept = meanY - slope * meanX;

    // Calculer les valeurs prédites
    const predictions = x.map(xi => slope * xi + intercept);

    return { slope, intercept, predictions };
}

// Mettre à jour le graphique F0 du groupe
function updateGroupF0Chart() {
    const ctx = document.getElementById('chart-group-f0').getContext('2d');

    const dataByDate = {};
    allData.forEach(row => {
        const date = row[COLUMNS.DATE];
        if (!dataByDate[date]) {
            dataByDate[date] = { f0: [] };
        }
        dataByDate[date].f0.push(parseFloat(row[COLUMNS.F0_RELATIVE]));
    });

    const dates = Object.keys(dataByDate).sort((a, b) => parseDate(a) - parseDate(b));
    const parsedDates = dates.map(d => parseDate(d));
    const avgF0 = dates.map(d => average(dataByDate[d].f0));

    // Stocker les données pour le calcul de tendance dynamique
    chartGroupF0Stats.parsedDates = parsedDates;
    chartGroupF0Stats.avgF0 = avgF0;
    chartGroupF0Stats.dates = parsedDates.map(d => d.getTime());

    // Obtenir le nombre de semaines pour la tendance (défaut: 10)
    const trendWeeks = parseInt(document.getElementById('trend-weeks-group-f0')?.value || 10);
    const trendF0Data = calculateSingleTrendData(parsedDates, avgF0, trendWeeks);

    if (chartGroupF0) chartGroupF0.destroy();

    chartGroupF0 = new Chart(ctx, {
        type: 'line',
        data: {
            labels: parsedDates,
            datasets: [
                {
                    label: 'F0 moyen (N/Kg)',
                    data: avgF0,
                    borderColor: '#3498db',
                    backgroundColor: '#3498db',
                    borderWidth: 0,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    pointStyle: 'circle',
                    showLine: false
                },
                {
                    label: 'Tendance',
                    data: trendF0Data,
                    borderColor: '#3498db',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [10, 5],
                    pointRadius: 0,
                    pointStyle: 'line',
                    spanGaps: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        font: { size: 11 },
                        padding: 15
                    }
                },
                tooltip: {
                    callbacks: {
                        title: (items) => formatDate(items[0].label)
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'week', displayFormats: { week: 'dd MMM' } },
                    title: { display: true, text: 'Date' }
                },
                y: {
                    type: 'linear',
                    display: true,
                    title: { display: true, text: 'F0 moyen (N/Kg)' }
                }
            }
        }
    });

    // Calculer le nombre total de semaines disponibles
    const totalWeeks = Math.max(10, Math.ceil((Math.max(...chartGroupF0Stats.dates) - Math.min(...chartGroupF0Stats.dates)) / (7 * 24 * 60 * 60 * 1000)));

    // Mettre à jour le max du slider dynamiquement
    const weeksSlider = document.getElementById('weeks-group-f0');
    const displayWeeks = Math.min(50, totalWeeks);
    weeksSlider.max = displayWeeks;

    // Appliquer 10 semaines par défaut
    weeksSlider.value = 10;
    document.getElementById('weeks-group-f0-value').textContent = '10';
    updateWeeksScale('group-f0');
}

// Mettre à jour le graphique V0 du groupe
function updateGroupV0Chart() {
    const ctx = document.getElementById('chart-group-v0').getContext('2d');

    const dataByDate = {};
    allData.forEach(row => {
        const date = row[COLUMNS.DATE];
        if (!dataByDate[date]) {
            dataByDate[date] = { v0: [] };
        }
        dataByDate[date].v0.push(parseFloat(row[COLUMNS.V0]));
    });

    const dates = Object.keys(dataByDate).sort((a, b) => parseDate(a) - parseDate(b));
    const parsedDates = dates.map(d => parseDate(d));
    const avgV0 = dates.map(d => average(dataByDate[d].v0));

    // Stocker les données pour le calcul de tendance dynamique
    chartGroupV0Stats.parsedDates = parsedDates;
    chartGroupV0Stats.avgV0 = avgV0;
    chartGroupV0Stats.dates = parsedDates.map(d => d.getTime());

    // Obtenir le nombre de semaines pour la tendance (défaut: 10)
    const trendWeeks = parseInt(document.getElementById('trend-weeks-group-v0')?.value || 10);
    const trendV0Data = calculateSingleTrendData(parsedDates, avgV0, trendWeeks);

    if (chartGroupV0) chartGroupV0.destroy();

    chartGroupV0 = new Chart(ctx, {
        type: 'line',
        data: {
            labels: parsedDates,
            datasets: [
                {
                    label: 'V0 moyen (m/s)',
                    data: avgV0,
                    borderColor: '#e74c3c',
                    backgroundColor: '#e74c3c',
                    borderWidth: 0,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    pointStyle: 'circle',
                    showLine: false
                },
                {
                    label: 'Tendance',
                    data: trendV0Data,
                    borderColor: '#e74c3c',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [10, 5],
                    pointRadius: 0,
                    pointStyle: 'line',
                    spanGaps: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        font: { size: 11 },
                        padding: 15
                    }
                },
                tooltip: {
                    callbacks: {
                        title: (items) => formatDate(items[0].label)
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'week', displayFormats: { week: 'dd MMM' } },
                    title: { display: true, text: 'Date' }
                },
                y: {
                    type: 'linear',
                    display: true,
                    title: { display: true, text: 'V0 moyen (m/s)' }
                }
            }
        }
    });

    // Calculer le nombre total de semaines disponibles
    const totalWeeks = Math.max(10, Math.ceil((Math.max(...chartGroupV0Stats.dates) - Math.min(...chartGroupV0Stats.dates)) / (7 * 24 * 60 * 60 * 1000)));

    // Mettre à jour le max du slider dynamiquement
    const weeksSlider = document.getElementById('weeks-group-v0');
    const displayWeeks = Math.min(50, totalWeeks);
    weeksSlider.max = displayWeeks;

    // Appliquer 10 semaines par défaut
    weeksSlider.value = 10;
    document.getElementById('weeks-group-v0-value').textContent = '10';
    updateWeeksScale('group-v0');
}

// Mettre à jour le graphique de puissance moyenne du groupe
function updateGroupPowerChart() {
    const ctx = document.getElementById('chart-group-power').getContext('2d');

    const dataByDate = {};
    allData.forEach(row => {
        const date = row[COLUMNS.DATE];
        if (!dataByDate[date]) {
            dataByDate[date] = { power: [] };
        }
        dataByDate[date].power.push(parseFloat(row[COLUMNS.P_MAX_RELATIVE]));
    });

    const dates = Object.keys(dataByDate).sort((a, b) => parseDate(a) - parseDate(b));
    const parsedDates = dates.map(d => parseDate(d));
    const avgPower = dates.map(d => average(dataByDate[d].power));

    // Stocker les données pour le calcul de tendance dynamique
    chartGroupPowerStats.parsedDates = parsedDates;
    chartGroupPowerStats.avgPower = avgPower;
    chartGroupPowerStats.dates = parsedDates.map(d => d.getTime());

    // Obtenir le nombre de semaines pour la tendance (défaut: 10)
    const trendWeeks = parseInt(document.getElementById('trend-weeks-group-power')?.value || 10);
    const trendPowerData = calculateSingleTrendData(parsedDates, avgPower, trendWeeks);

    if (chartGroupPower) chartGroupPower.destroy();

    chartGroupPower = new Chart(ctx, {
        type: 'line',
        data: {
            labels: parsedDates,
            datasets: [
                {
                    label: 'P Max moyen (W/Kg)',
                    data: avgPower,
                    borderColor: '#9b59b6',
                    backgroundColor: '#9b59b6',
                    borderWidth: 0,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    pointStyle: 'circle',
                    showLine: false
                },
                {
                    label: 'Tendance',
                    data: trendPowerData,
                    borderColor: '#9b59b6',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [10, 5],
                    pointRadius: 0,
                    pointStyle: 'line',
                    spanGaps: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: { size: 11 },
                        padding: 15,
                        generateLabels: (chart) => {
                            const datasets = chart.data.datasets;
                            return datasets.map((dataset, i) => ({
                                text: dataset.label,
                                fillStyle: dataset.backgroundColor,
                                strokeStyle: dataset.borderColor,
                                lineWidth: dataset.borderWidth,
                                hidden: !chart.isDatasetVisible(i),
                                index: i,
                                pointStyle: dataset.label.includes('Tendance') ? 'line' : 'circle'
                            }));
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        title: (items) => formatDate(items[0].label),
                        label: (item) => {
                            return `${item.dataset.label}: ${item.parsed.y.toFixed(2)} W/Kg`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'week', displayFormats: { week: 'dd MMM' } },
                    title: { display: true, text: 'Date' }
                },
                y: {
                    type: 'linear',
                    display: true,
                    title: { display: true, text: 'Puissance moyenne (W/Kg)' }
                }
            }
        }
    });

    // Calculer le nombre total de semaines disponibles
    const totalWeeks = Math.max(10, Math.ceil((Math.max(...chartGroupPowerStats.dates) - Math.min(...chartGroupPowerStats.dates)) / (7 * 24 * 60 * 60 * 1000)));

    // Mettre à jour le max du slider dynamiquement
    const weeksSlider = document.getElementById('weeks-group-power');
    const displayWeeks = Math.min(50, totalWeeks);
    weeksSlider.max = displayWeeks;

    // Appliquer 10 semaines par défaut
    weeksSlider.value = 10;
    document.getElementById('weeks-group-power-value').textContent = '10';
    updateWeeksScale('group-power');
}

// Calculer les données de tendance pour un seul jeu de données
function calculateSingleTrendData(parsedDates, avgData, trendWeeks) {
    const lastNDates = parsedDates.slice(-trendWeeks);
    const lastNData = avgData.slice(-trendWeeks);

    const trend = calculateLinearRegression(lastNDates, lastNData);

    return parsedDates.map((_, i) =>
        i >= parsedDates.length - trendWeeks ? trend.predictions[i - (parsedDates.length - trendWeeks)] : null
    );
}

// Mettre à jour le graphique de temps 30m moyen du groupe
function updateGroupTimeChart() {
    const ctx = document.getElementById('chart-group-time').getContext('2d');

    const dataByDate = {};
    allData.forEach(row => {
        const date = row[COLUMNS.DATE];
        if (!dataByDate[date]) {
            dataByDate[date] = { time: [] };
        }
        dataByDate[date].time.push(parseFloat(row[COLUMNS.TIME_30M]));
    });

    const dates = Object.keys(dataByDate).sort((a, b) => parseDate(a) - parseDate(b));
    const parsedDates = dates.map(d => parseDate(d));
    const avgTime = dates.map(d => average(dataByDate[d].time));

    // Stocker les données pour le calcul de tendance dynamique
    chartGroupTimeStats.parsedDates = parsedDates;
    chartGroupTimeStats.avgTime = avgTime;
    chartGroupTimeStats.dates = parsedDates.map(d => d.getTime());

    // Obtenir le nombre de semaines pour la tendance (défaut: 10)
    const trendWeeks = parseInt(document.getElementById('trend-weeks-group-time')?.value || 10);
    const trendTimeData = calculateSingleTrendData(parsedDates, avgTime, trendWeeks);

    if (chartGroupTime) chartGroupTime.destroy();

    chartGroupTime = new Chart(ctx, {
        type: 'line',
        data: {
            labels: parsedDates,
            datasets: [
                {
                    label: 'Temps 30m moyen (s)',
                    data: avgTime,
                    borderColor: '#27ae60',
                    backgroundColor: '#27ae60',
                    borderWidth: 0,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    pointStyle: 'circle',
                    showLine: false
                },
                {
                    label: 'Tendance',
                    data: trendTimeData,
                    borderColor: '#27ae60',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [10, 5],
                    pointRadius: 0,
                    pointStyle: 'line',
                    spanGaps: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'circle',
                        font: { size: 11 },
                        padding: 15,
                        generateLabels: (chart) => {
                            const datasets = chart.data.datasets;
                            return datasets.map((dataset, i) => ({
                                text: dataset.label,
                                fillStyle: dataset.backgroundColor,
                                strokeStyle: dataset.borderColor,
                                lineWidth: dataset.borderWidth,
                                hidden: !chart.isDatasetVisible(i),
                                index: i,
                                pointStyle: dataset.label.includes('Tendance') ? 'line' : 'circle'
                            }));
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        title: (items) => formatDate(items[0].label),
                        label: (item) => {
                            return `${item.dataset.label}: ${item.parsed.y.toFixed(3)} s`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: { unit: 'week', displayFormats: { week: 'dd MMM' } },
                    title: { display: true, text: 'Date' }
                },
                y: {
                    type: 'linear',
                    display: true,
                    title: { display: true, text: 'Temps moyen (secondes)' }
                }
            }
        }
    });

    // Calculer le nombre total de semaines disponibles
    const totalWeeks = Math.max(10, Math.ceil((Math.max(...chartGroupTimeStats.dates) - Math.min(...chartGroupTimeStats.dates)) / (7 * 24 * 60 * 60 * 1000)));

    // Mettre à jour le max du slider dynamiquement
    const weeksSlider = document.getElementById('weeks-group-time');
    const displayWeeks = Math.min(50, totalWeeks);
    weeksSlider.max = displayWeeks;

    // Appliquer 10 semaines par défaut
    weeksSlider.value = 10;
    document.getElementById('weeks-group-time-value').textContent = '10';
    updateWeeksScale('group-time');
}

// ==================== PAGE EXPLORATION ====================

/** Liste des métriques disponibles pour l'exploration */
const EXPLORATION_METRICS = {
    F0_RELATIVE: { label: 'F0 (N/Kg)', shortLabel: 'F0', column: COLUMNS.F0_RELATIVE, decimals: 2 },
    V0: { label: 'V0 (m/s)', shortLabel: 'V0', column: COLUMNS.V0, decimals: 2 },
    TIME_5M: { label: 'Temps 5m (s)', shortLabel: '5m', column: COLUMNS.TIME_5M, decimals: 3 },
    TIME_10M: { label: 'Temps 10m (s)', shortLabel: '10m', column: COLUMNS.TIME_10M, decimals: 3 },
    TIME_15M: { label: 'Temps 15m (s)', shortLabel: '15m', column: COLUMNS.TIME_15M, decimals: 3 },
    TIME_20M: { label: 'Temps 20m (s)', shortLabel: '20m', column: COLUMNS.TIME_20M, decimals: 3 },
    TIME_25M: { label: 'Temps 25m (s)', shortLabel: '25m', column: COLUMNS.TIME_25M, decimals: 3 },
    TIME_30M: { label: 'Temps 30m (s)', shortLabel: '30m', column: COLUMNS.TIME_30M, decimals: 3 },
    P_MAX_RELATIVE: { label: 'P Max (W/Kg)', shortLabel: 'P Max', column: COLUMNS.P_MAX_RELATIVE, decimals: 2 },
    DRF: { label: 'DRF', shortLabel: 'DRF', column: COLUMNS.DRF, decimals: 3 },
    RF_10M: { label: 'RF 10m', shortLabel: 'RF10m', column: COLUMNS.RF_10M, decimals: 2 },
    RF_PEAK: { label: 'RF Peak', shortLabel: 'RFpk', column: COLUMNS.RF_PEAK, decimals: 2 }
};

// Mettre à jour la vue exploration
function updateExplorationView() {
    if (allData.length === 0) return;

    const data = getExplorationData();
    const metricX = document.getElementById('metric-x').value;
    const metricY = document.getElementById('metric-y').value;

    // Extraire les valeurs X et Y
    const points = data.map(row => ({
        x: parseFloat(row[EXPLORATION_METRICS[metricX].column]),
        y: parseFloat(row[EXPLORATION_METRICS[metricY].column]),
        name: row[COLUMNS.NAME].trim(),
        date: row[COLUMNS.DATE]
    })).filter(p => !isNaN(p.x) && !isNaN(p.y));

    if (points.length === 0) return;

    const xValues = points.map(p => p.x);
    const yValues = points.map(p => p.y);

    // Calculer les statistiques
    const statsX = calculateDescriptiveStats(xValues);
    const statsY = calculateDescriptiveStats(yValues);
    const correlation = calculatePearsonCorrelation(xValues, yValues);

    // Mettre à jour l'affichage des stats
    updateStatsDisplay(statsX, statsY, correlation, points.length);

    // Mettre à jour les graphiques
    updateCorrelationChart(points, metricX, metricY, correlation);
    updateQuadrantChart(points, metricX, metricY, statsX.mean, statsY.mean);

    // Mettre à jour la matrice de corrélation
    updateCorrelationMatrix(data);
}

// Peupler les sélecteurs de dates pour l'exploration
function populateExplorationDateSelectors() {
    const startSelect = document.getElementById('exploration-date-start');
    const endSelect = document.getElementById('exploration-date-end');

    // Obtenir toutes les dates uniques triées
    const dates = [...new Set(allData.map(row => row[COLUMNS.DATE]))].sort((a, b) => {
        return parseDate(a) - parseDate(b);
    });

    if (dates.length === 0) return;

    // Sauvegarder les valeurs actuelles
    const currentStart = startSelect.value;
    const currentEnd = endSelect.value;

    // Peupler le sélecteur de début
    startSelect.innerHTML = '<option value="">Depuis le début</option>';
    dates.forEach(date => {
        const option = document.createElement('option');
        option.value = date;
        option.textContent = formatDate(date);
        startSelect.appendChild(option);
    });

    // Peupler le sélecteur de fin
    endSelect.innerHTML = '<option value="">Jusqu\'à maintenant</option>';
    dates.forEach(date => {
        const option = document.createElement('option');
        option.value = date;
        option.textContent = formatDate(date);
        endSelect.appendChild(option);
    });

    // Restaurer les valeurs si elles existent encore
    if (currentStart && dates.includes(currentStart)) {
        startSelect.value = currentStart;
    }
    if (currentEnd && dates.includes(currentEnd)) {
        endSelect.value = currentEnd;
    }
}

// Réinitialiser la période d'exploration
function resetExplorationDateRange() {
    document.getElementById('exploration-date-start').value = '';
    document.getElementById('exploration-date-end').value = '';
    updateExplorationView();
}

// Obtenir les données filtrées selon la période sélectionnée
function getExplorationData() {
    const startDate = document.getElementById('exploration-date-start').value;
    const endDate = document.getElementById('exploration-date-end').value;

    let filteredData = allData;

    // Filtrer par date de début
    if (startDate) {
        const startTimestamp = parseDate(startDate).getTime();
        filteredData = filteredData.filter(row => {
            return parseDate(row[COLUMNS.DATE]).getTime() >= startTimestamp;
        });
    }

    // Filtrer par date de fin
    if (endDate) {
        const endTimestamp = parseDate(endDate).getTime();
        filteredData = filteredData.filter(row => {
            return parseDate(row[COLUMNS.DATE]).getTime() <= endTimestamp;
        });
    }

    return filteredData;
}

// Calculer les statistiques descriptives
function calculateDescriptiveStats(values) {
    const n = values.length;
    if (n === 0) return { mean: 0, std: 0, min: 0, max: 0 };

    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / n;
    const std = Math.sqrt(variance);
    const min = Math.min(...values);
    const max = Math.max(...values);

    return { mean, std, min, max };
}

// Calculer la corrélation de Pearson, R² et p-value
function calculatePearsonCorrelation(x, y) {
    const n = x.length;
    if (n < 3) return { r: 0, r2: 0, pValue: 1 };

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

    if (denominator === 0) return { r: 0, r2: 0, pValue: 1 };

    const r = numerator / denominator;
    const r2 = r * r;

    // Calculer la p-value approximative (test t pour corrélation)
    const t = r * Math.sqrt((n - 2) / (1 - r2));
    const df = n - 2;
    const pValue = calculateTTestPValue(Math.abs(t), df);

    return { r, r2, pValue };
}

// Approximation de la p-value pour un test t (two-tailed)
function calculateTTestPValue(t, df) {
    // Approximation using the regularized incomplete beta function
    if (df <= 0) return 1;

    const x = df / (df + t * t);
    // Simplified approximation for p-value
    if (t === 0) return 1;

    // Use normal approximation for large df
    if (df > 100) {
        const z = t;
        const p = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
        return Math.min(1, 2 * p * Math.sqrt(df));
    }

    // Simplified approximation for smaller df
    const a = df / 2;
    const b = 0.5;
    let result = Math.pow(x, a) * Math.pow(1 - x, b);
    result = result / (a * betaFunction(a, b));

    return Math.min(1, 2 * (1 - incompleteBeta(x, a, b)));
}

// Fonction Beta (approximation)
function betaFunction(a, b) {
    return (gammaFunction(a) * gammaFunction(b)) / gammaFunction(a + b);
}

// Approximation de la fonction Gamma (Stirling)
function gammaFunction(z) {
    if (z < 0.5) {
        return Math.PI / (Math.sin(Math.PI * z) * gammaFunction(1 - z));
    }
    z -= 1;
    const g = 7;
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
        771.32342877765313, -176.61502916214059, 12.507343278686905,
        -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

    let x = c[0];
    for (let i = 1; i < g + 2; i++) {
        x += c[i] / (z + i);
    }

    const t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

// Approximation de l'intégrale bêta incomplète
function incompleteBeta(x, a, b) {
    if (x === 0) return 0;
    if (x === 1) return 1;

    // Simple approximation
    const bt = Math.exp(
        gammaLn(a + b) - gammaLn(a) - gammaLn(b) +
        a * Math.log(x) + b * Math.log(1 - x)
    );

    if (x < (a + 1) / (a + b + 2)) {
        return bt * betaCF(x, a, b) / a;
    } else {
        return 1 - bt * betaCF(1 - x, b, a) / b;
    }
}

function gammaLn(z) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
        -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];

    let x = z;
    let y = z;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;

    for (let j = 0; j < 6; j++) {
        ser += c[j] / ++y;
    }

    return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function betaCF(x, a, b) {
    const maxIterations = 100;
    const epsilon = 3e-7;

    let m, m2;
    let aa, c, d, del, h, qab, qam, qap;

    qab = a + b;
    qap = a + 1;
    qam = a - 1;
    c = 1;
    d = 1 - qab * x / qap;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    h = d;

    for (m = 1; m <= maxIterations; m++) {
        m2 = 2 * m;
        aa = m * (b - m) * x / ((qam + m2) * (a + m2));
        d = 1 + aa * d;
        if (Math.abs(d) < 1e-30) d = 1e-30;
        c = 1 + aa / c;
        if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d;
        h *= d * c;
        aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
        d = 1 + aa * d;
        if (Math.abs(d) < 1e-30) d = 1e-30;
        c = 1 + aa / c;
        if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d;
        del = d * c;
        h *= del;
        if (Math.abs(del - 1) < epsilon) break;
    }

    return h;
}

// Mettre à jour l'affichage des statistiques
function updateStatsDisplay(statsX, statsY, correlation, n) {
    const metricX = document.getElementById('metric-x').value;
    const metricY = document.getElementById('metric-y').value;
    const decX = EXPLORATION_METRICS[metricX].decimals;
    const decY = EXPLORATION_METRICS[metricY].decimals;

    // Stats X
    document.getElementById('stat-x-mean').textContent = statsX.mean.toFixed(decX);
    document.getElementById('stat-x-std').textContent = statsX.std.toFixed(decX);
    document.getElementById('stat-x-min').textContent = statsX.min.toFixed(decX);
    document.getElementById('stat-x-max').textContent = statsX.max.toFixed(decX);

    // Stats Y
    document.getElementById('stat-y-mean').textContent = statsY.mean.toFixed(decY);
    document.getElementById('stat-y-std').textContent = statsY.std.toFixed(decY);
    document.getElementById('stat-y-min').textContent = statsY.min.toFixed(decY);
    document.getElementById('stat-y-max').textContent = statsY.max.toFixed(decY);

    // Corrélation
    document.getElementById('stat-r2').textContent = correlation.r2.toFixed(3);
    document.getElementById('stat-r').textContent = correlation.r.toFixed(3);
    document.getElementById('stat-pvalue').textContent = correlation.pValue < 0.001 ? '< 0.001' : correlation.pValue.toFixed(3);
    document.getElementById('stat-n').textContent = n;

    // Colorer le R² selon la force de la corrélation
    const r2Element = document.getElementById('stat-r2');
    if (correlation.r2 >= 0.7) {
        r2Element.style.color = '#27ae60'; // Forte corrélation (vert)
    } else if (correlation.r2 >= 0.4) {
        r2Element.style.color = '#f39c12'; // Corrélation moyenne (orange)
    } else {
        r2Element.style.color = '#e74c3c'; // Faible corrélation (rouge)
    }
}

// Mettre à jour le graphique de corrélation
function updateCorrelationChart(points, metricX, metricY, correlation) {
    const ctx = document.getElementById('chart-correlation').getContext('2d');

    const xValues = points.map(p => p.x);
    const yValues = points.map(p => p.y);

    // Calculer la ligne de régression
    const regression = calculateLinearRegressionSimple(xValues, yValues);
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);

    // Créer les points de la ligne de tendance
    const trendlinePoints = [
        { x: minX, y: regression.slope * minX + regression.intercept },
        { x: maxX, y: regression.slope * maxX + regression.intercept }
    ];

    // Générer des couleurs uniques par athlète
    const athletes = [...new Set(points.map(p => p.name))];
    const colorMap = {};
    athletes.forEach((name, i) => {
        const hue = (i * 137.5) % 360;
        colorMap[name] = `hsl(${hue}, 70%, 50%)`;
    });

    if (chartCorrelation) chartCorrelation.destroy();

    chartCorrelation = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Points',
                    data: points.map(p => ({ x: p.x, y: p.y, name: p.name, date: p.date })),
                    backgroundColor: points.map(p => colorMap[p.name]),
                    borderColor: points.map(p => colorMap[p.name]),
                    pointRadius: 8,
                    pointHoverRadius: 12
                },
                {
                    label: 'Ligne de tendance',
                    data: trendlinePoints,
                    type: 'line',
                    borderColor: 'rgba(231, 76, 60, 0.8)',
                    borderWidth: 2,
                    borderDash: [8, 4],
                    pointRadius: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const point = context.raw;
                            if (point.name) {
                                return [
                                    `${point.name}`,
                                    `${EXPLORATION_METRICS[metricX].label}: ${point.x.toFixed(EXPLORATION_METRICS[metricX].decimals)}`,
                                    `${EXPLORATION_METRICS[metricY].label}: ${point.y.toFixed(EXPLORATION_METRICS[metricY].decimals)}`
                                ];
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: EXPLORATION_METRICS[metricX].label }
                },
                y: {
                    title: { display: true, text: EXPLORATION_METRICS[metricY].label }
                }
            }
        }
    });

    // Mettre à jour l'équation affichée
    const sign = regression.intercept >= 0 ? '+' : '';
    document.getElementById('correlation-equation').textContent =
        `y = ${regression.slope.toFixed(4)}x ${sign} ${regression.intercept.toFixed(4)} | R² = ${correlation.r2.toFixed(3)}`;
}

// Régression linéaire simple
function calculateLinearRegressionSimple(x, y) {
    const n = x.length;
    if (n === 0) return { slope: 0, intercept: 0 };

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    const meanX = sumX / n;
    const meanY = sumY / n;

    const numerator = sumXY - n * meanX * meanY;
    const denominator = sumX2 - n * meanX * meanX;

    const slope = denominator !== 0 ? numerator / denominator : 0;
    const intercept = meanY - slope * meanX;

    return { slope, intercept };
}

// Mettre à jour le graphique quadrant
function updateQuadrantChart(points, metricX, metricY, meanX, meanY) {
    const ctx = document.getElementById('chart-quadrant').getContext('2d');

    // Générer des couleurs par quadrant
    const quadrantColors = {
        q1: 'rgba(46, 125, 50, 0.7)',   // Haut-Droite (vert)
        q2: 'rgba(21, 101, 192, 0.7)',  // Haut-Gauche (bleu)
        q3: 'rgba(198, 40, 40, 0.7)',   // Bas-Gauche (rouge)
        q4: 'rgba(239, 108, 0, 0.7)'    // Bas-Droite (orange)
    };

    // Attribuer un quadrant à chaque point
    const categorizedPoints = points.map(p => {
        let quadrant;
        if (p.x >= meanX && p.y >= meanY) quadrant = 'q1';
        else if (p.x < meanX && p.y >= meanY) quadrant = 'q2';
        else if (p.x < meanX && p.y < meanY) quadrant = 'q3';
        else quadrant = 'q4';

        return { ...p, quadrant, color: quadrantColors[quadrant] };
    });

    const xValues = points.map(p => p.x);
    const yValues = points.map(p => p.y);
    const xPadding = (Math.max(...xValues) - Math.min(...xValues)) * 0.1;
    const yPadding = (Math.max(...yValues) - Math.min(...yValues)) * 0.1;

    if (chartQuadrant) chartQuadrant.destroy();

    // Plugin pour dessiner les lignes de quadrant
    const quadrantLinesPlugin = {
        id: 'quadrantLines',
        afterDraw: (chart) => {
            const ctx = chart.ctx;
            const xAxis = chart.scales.x;
            const yAxis = chart.scales.y;

            const xPixel = xAxis.getPixelForValue(meanX);
            const yPixel = yAxis.getPixelForValue(meanY);

            ctx.save();
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);

            // Ligne verticale (moyenne X)
            ctx.beginPath();
            ctx.moveTo(xPixel, yAxis.top);
            ctx.lineTo(xPixel, yAxis.bottom);
            ctx.stroke();

            // Ligne horizontale (moyenne Y)
            ctx.beginPath();
            ctx.moveTo(xAxis.left, yPixel);
            ctx.lineTo(xAxis.right, yPixel);
            ctx.stroke();

            ctx.restore();
        }
    };

    chartQuadrant = new Chart(ctx, {
        type: 'scatter',
        plugins: [quadrantLinesPlugin],
        data: {
            datasets: [{
                label: 'Athlètes',
                data: categorizedPoints.map(p => ({ x: p.x, y: p.y, name: p.name, date: p.date, quadrant: p.quadrant })),
                backgroundColor: categorizedPoints.map(p => p.color),
                borderColor: categorizedPoints.map(p => p.color.replace('0.7', '1')),
                borderWidth: 2,
                pointRadius: 10,
                pointHoverRadius: 14
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const point = context.raw;
                            const quadrantNames = {
                                q1: 'Q1 (Haut-Droite)',
                                q2: 'Q2 (Haut-Gauche)',
                                q3: 'Q3 (Bas-Gauche)',
                                q4: 'Q4 (Bas-Droite)'
                            };
                            return [
                                `${point.name}`,
                                `${EXPLORATION_METRICS[metricX].label}: ${point.x.toFixed(EXPLORATION_METRICS[metricX].decimals)}`,
                                `${EXPLORATION_METRICS[metricY].label}: ${point.y.toFixed(EXPLORATION_METRICS[metricY].decimals)}`,
                                `Quadrant: ${quadrantNames[point.quadrant]}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: EXPLORATION_METRICS[metricX].label },
                    min: Math.min(...xValues) - xPadding,
                    max: Math.max(...xValues) + xPadding
                },
                y: {
                    title: { display: true, text: EXPLORATION_METRICS[metricY].label },
                    min: Math.min(...yValues) - yPadding,
                    max: Math.max(...yValues) + yPadding
                }
            }
        }
    });
}

// Mettre à jour la matrice de corrélation
function updateCorrelationMatrix(data) {
    const container = document.getElementById('correlation-matrix');
    const metrics = Object.keys(EXPLORATION_METRICS);

    // Extraire les valeurs pour chaque métrique
    const metricValues = {};
    metrics.forEach(metric => {
        metricValues[metric] = data.map(row =>
            parseFloat(row[EXPLORATION_METRICS[metric].column])
        ).filter(v => !isNaN(v));
    });

    // Calculer la matrice de corrélation
    const correlationMatrix = {};
    metrics.forEach(m1 => {
        correlationMatrix[m1] = {};
        metrics.forEach(m2 => {
            if (m1 === m2) {
                correlationMatrix[m1][m2] = 1;
            } else {
                // Aligner les valeurs (utiliser uniquement les indices valides pour les deux métriques)
                const validIndices = [];
                data.forEach((row, i) => {
                    const v1 = parseFloat(row[EXPLORATION_METRICS[m1].column]);
                    const v2 = parseFloat(row[EXPLORATION_METRICS[m2].column]);
                    if (!isNaN(v1) && !isNaN(v2)) {
                        validIndices.push(i);
                    }
                });

                const x = validIndices.map(i => parseFloat(data[i][EXPLORATION_METRICS[m1].column]));
                const y = validIndices.map(i => parseFloat(data[i][EXPLORATION_METRICS[m2].column]));

                const corr = calculatePearsonCorrelation(x, y);
                correlationMatrix[m1][m2] = corr.r;
            }
        });
    });

    // Générer le HTML de la matrice
    const gridSize = metrics.length + 1;
    container.style.gridTemplateColumns = `repeat(${gridSize}, 80px)`;

    let html = '';

    // En-tête vide (coin supérieur gauche)
    html += '<div class="matrix-cell header"></div>';

    // En-têtes des colonnes
    metrics.forEach(metric => {
        const shortLabel = EXPLORATION_METRICS[metric].shortLabel;
        html += `<div class="matrix-cell header">${shortLabel}</div>`;
    });

    // Lignes de données
    metrics.forEach(m1 => {
        // En-tête de ligne
        const shortLabel = EXPLORATION_METRICS[m1].shortLabel;
        html += `<div class="matrix-cell header">${shortLabel}</div>`;

        // Cellules de corrélation
        metrics.forEach(m2 => {
            const r = correlationMatrix[m1][m2];
            const color = getCorrelationColor(r);
            const textColor = Math.abs(r) > 0.5 ? '#fff' : '#333';
            const isDiagonal = m1 === m2;

            html += `<div class="matrix-cell ${isDiagonal ? 'diagonal' : ''}"
                style="background-color: ${color}; color: ${textColor};"
                data-metric-x="${m1}" data-metric-y="${m2}"
                onclick="selectMatrixMetrics('${m1}', '${m2}')"
                title="${EXPLORATION_METRICS[m1].label} vs ${EXPLORATION_METRICS[m2].label}: r = ${r.toFixed(3)}">
                ${r.toFixed(2)}
            </div>`;
        });
    });

    container.innerHTML = html;
}

// Obtenir la couleur pour une valeur de corrélation
function getCorrelationColor(r) {
    // Rouge (-1) -> Blanc (0) -> Bleu (+1)
    if (r < 0) {
        const intensity = Math.abs(r);
        const red = Math.round(198 + (255 - 198) * (1 - intensity));
        const green = Math.round(40 + (205 - 40) * (1 - intensity));
        const blue = Math.round(40 + (210 - 40) * (1 - intensity));
        return `rgb(${red}, ${green}, ${blue})`;
    } else {
        const intensity = r;
        const red = Math.round(255 - (255 - 21) * intensity);
        const green = Math.round(255 - (255 - 101) * intensity);
        const blue = Math.round(255 - (255 - 192) * intensity);
        return `rgb(${red}, ${green}, ${blue})`;
    }
}

// Sélectionner les métriques depuis la matrice
function selectMatrixMetrics(metricX, metricY) {
    if (metricX === metricY) return; // Ignorer la diagonale

    document.getElementById('metric-x').value = metricX;
    document.getElementById('metric-y').value = metricY;
    updateExplorationView();

    // Scroll vers le haut pour voir les graphiques
    document.querySelector('.exploration-controls').scrollIntoView({ behavior: 'smooth' });
}

// Mettre à jour le tableau groupe
function updateGroupTable(selectedDate) {
    const thead = document.querySelector('#group-table thead');
    const tbody = document.querySelector('#group-table tbody');

    const dateData = allData.filter(row => row[COLUMNS.DATE] === selectedDate);

    if (dateData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8">Aucune donnée pour cette date</td></tr>';
        return;
    }

    // Récupérer la métrique de tri sélectionnée
    const sortMetricSelect = document.getElementById('sort-metric-select');
    const sortMetric = sortMetricSelect ? sortMetricSelect.value : 'TIME_30M';

    // Définir les colonnes et leur mapping
    const columnConfig = [
        { key: 'NAME', label: 'Athlète', format: (v) => v },
        { key: 'TIME_30M', label: 'Temps 30m (s)', format: (v) => parseFloat(v).toFixed(2), lowerIsBetter: true },
        { key: 'F0_RELATIVE', label: 'F0 (N/Kg)', format: (v) => parseFloat(v).toFixed(2), lowerIsBetter: false },
        { key: 'V0', label: 'V0 (m/s)', format: (v) => parseFloat(v).toFixed(2), lowerIsBetter: false },
        { key: 'P_MAX_RELATIVE', label: 'P Max (W/Kg)', format: (v) => parseFloat(v).toFixed(2), lowerIsBetter: false },
        { key: 'DRF', label: 'DRF', format: (v) => parseFloat(v).toFixed(3), lowerIsBetter: false },
        { key: 'RF_10M', label: 'RF 10m', format: (v) => parseFloat(v).toFixed(2), lowerIsBetter: false },
        { key: 'RF_PEAK', label: 'RF Peak', format: (v) => parseFloat(v).toFixed(2), lowerIsBetter: false }
    ];

    // Générer l'en-tête avec indication de la colonne triée
    thead.innerHTML = `
        <tr>
            ${columnConfig.map(col => {
                const isSorted = col.key === sortMetric;
                return `<th class="${isSorted ? 'sorted-column' : ''}">${col.label}${isSorted ? ' ▼' : ''}</th>`;
            }).join('')}
        </tr>
    `;

    // Déterminer si la métrique de tri est "plus bas = meilleur"
    const sortConfig = columnConfig.find(col => col.key === sortMetric);
    const lowerIsBetter = sortConfig ? sortConfig.lowerIsBetter : true;

    // Trier les données
    const sortedData = [...dateData].sort((a, b) => {
        const valA = parseFloat(a[COLUMNS[sortMetric]]);
        const valB = parseFloat(b[COLUMNS[sortMetric]]);

        if (isNaN(valA)) return 1;
        if (isNaN(valB)) return -1;

        return lowerIsBetter ? valA - valB : valB - valA;
    });

    // Générer les lignes du tableau
    tbody.innerHTML = sortedData.map((row, index) => {
        const medal = index === 0 ? '🥇 ' : index === 1 ? '🥈 ' : index === 2 ? '🥉 ' : '';

        return `
            <tr>
                <td>${medal}${row[COLUMNS.NAME]}</td>
                <td class="${sortMetric === 'TIME_30M' ? 'sorted-column' : ''}">${parseFloat(row[COLUMNS.TIME_30M]).toFixed(2)}</td>
                <td class="${sortMetric === 'F0_RELATIVE' ? 'sorted-column' : ''}">${parseFloat(row[COLUMNS.F0_RELATIVE]).toFixed(2)}</td>
                <td class="${sortMetric === 'V0' ? 'sorted-column' : ''}">${parseFloat(row[COLUMNS.V0]).toFixed(2)}</td>
                <td class="${sortMetric === 'P_MAX_RELATIVE' ? 'sorted-column' : ''}">${parseFloat(row[COLUMNS.P_MAX_RELATIVE]).toFixed(2)}</td>
                <td class="${sortMetric === 'DRF' ? 'sorted-column' : ''}">${parseFloat(row[COLUMNS.DRF]).toFixed(3)}</td>
                <td class="${sortMetric === 'RF_10M' ? 'sorted-column' : ''}">${parseFloat(row[COLUMNS.RF_10M]).toFixed(2)}</td>
                <td class="${sortMetric === 'RF_PEAK' ? 'sorted-column' : ''}">${parseFloat(row[COLUMNS.RF_PEAK]).toFixed(2)}</td>
            </tr>
        `;
    }).join('');
}

// Mettre à jour la tendance dynamiquement selon le curseur
function updateTrendWeeks(chartType) {
    const slider = document.getElementById(`trend-weeks-${chartType}`);
    const valueDisplay = document.getElementById(`trend-weeks-${chartType}-value`);

    if (!slider || !valueDisplay) return;

    const trendWeeks = parseInt(slider.value);
    valueDisplay.textContent = trendWeeks;

    if (chartType === 'f0') {
        // Graphique F0 de l'athlète
        if (!chartF0 || !chartF0Stats.parsedDates || chartF0Stats.parsedDates.length === 0) return;

        const trendF0Data = calculateSingleTrendData(
            chartF0Stats.parsedDates,
            chartF0Stats.values,
            trendWeeks
        );

        // Mettre à jour le dataset de tendance (indice 6 - après les bandes et les points)
        chartF0.data.datasets[6].data = trendF0Data;
        chartF0.update();

    } else if (chartType === 'v0') {
        // Graphique V0 de l'athlète
        if (!chartV0 || !chartV0Stats.parsedDates || chartV0Stats.parsedDates.length === 0) return;

        const trendV0Data = calculateSingleTrendData(
            chartV0Stats.parsedDates,
            chartV0Stats.values,
            trendWeeks
        );

        // Mettre à jour le dataset de tendance (indice 6 - après les bandes et les points)
        chartV0.data.datasets[6].data = trendV0Data;
        chartV0.update();

    } else if (chartType === 'group-f0') {
        // Graphique F0 du groupe
        if (!chartGroupF0 || chartGroupF0Stats.parsedDates.length === 0) return;

        const trendF0Data = calculateSingleTrendData(
            chartGroupF0Stats.parsedDates,
            chartGroupF0Stats.avgF0,
            trendWeeks
        );

        // Mettre à jour le dataset de tendance (indice 1)
        chartGroupF0.data.datasets[1].data = trendF0Data;
        chartGroupF0.update();

    } else if (chartType === 'group-v0') {
        // Graphique V0 du groupe
        if (!chartGroupV0 || chartGroupV0Stats.parsedDates.length === 0) return;

        const trendV0Data = calculateSingleTrendData(
            chartGroupV0Stats.parsedDates,
            chartGroupV0Stats.avgV0,
            trendWeeks
        );

        // Mettre à jour le dataset de tendance (indice 1)
        chartGroupV0.data.datasets[1].data = trendV0Data;
        chartGroupV0.update();

    } else if (chartType === 'group-power') {
        // Graphique Puissance du groupe
        if (!chartGroupPower || chartGroupPowerStats.parsedDates.length === 0) return;

        const trendPowerData = calculateSingleTrendData(
            chartGroupPowerStats.parsedDates,
            chartGroupPowerStats.avgPower,
            trendWeeks
        );

        // Mettre à jour le dataset de tendance (indice 1)
        chartGroupPower.data.datasets[1].data = trendPowerData;
        chartGroupPower.update();

    } else if (chartType === 'group-time') {
        // Graphique Temps 30m du groupe
        if (!chartGroupTime || chartGroupTimeStats.parsedDates.length === 0) return;

        const trendTimeData = calculateSingleTrendData(
            chartGroupTimeStats.parsedDates,
            chartGroupTimeStats.avgTime,
            trendWeeks
        );

        // Mettre à jour le dataset de tendance (indice 1)
        chartGroupTime.data.datasets[1].data = trendTimeData;
        chartGroupTime.update();
    }
}
