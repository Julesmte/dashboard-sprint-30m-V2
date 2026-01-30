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
let chartGroup = null;
let chartGroupPower = null;
let chartGroupTime = null;

/** Statistiques des graphiques athlète (moyenne, écart-type, dates) */
let chartF0Stats = { mean: 0, std: 0, dates: [] };
let chartV0Stats = { mean: 0, std: 0, dates: [] };

/** Statistiques des graphiques de groupe (dates pour le zoom temporel) */
let chartGroupStats = { dates: [] };
let chartGroupPowerStats = { dates: [] };
let chartGroupTimeStats = { dates: [] };

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
    } else if (chartType === 'group') {
        chart = chartGroup;
        stats = chartGroupStats;
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
            updateAthleteView(e.target.value);
        }
    });

    // Sélection date groupe
    document.getElementById('date-select').addEventListener('change', (e) => {
        if (e.target.value) {
            updateGroupTable(e.target.value);
        }
    });

    // Bouton refresh
    document.getElementById('refresh-btn').addEventListener('click', loadData);

    // Toggle tableau
    document.getElementById('toggle-table').addEventListener('click', () => {
        const container = document.getElementById('table-container');
        const btn = document.getElementById('toggle-table');
        container.classList.toggle('hidden');
        btn.textContent = container.classList.contains('hidden')
            ? '📊 Afficher tous les tests'
            : '📊 Masquer les tests';
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
            updateGroupView();

            // Sélectionner le premier athlète par défaut
            const select = document.getElementById('athlete-select');
            if (select.options.length > 1) {
                select.selectedIndex = 1;
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
                    updateGroupView();

                    const select = document.getElementById('athlete-select');
                    if (select.options.length > 1) {
                        select.selectedIndex = 1;
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

// Remplir le sélecteur de dates
function populateDateSelect() {
    const select = document.getElementById('date-select');
    const dates = [...new Set(allData.map(row => row[COLUMNS.DATE]))].sort((a, b) => {
        return parseDate(b) - parseDate(a);
    });

    select.innerHTML = '<option value="">-- Choisir une date --</option>';
    dates.forEach(date => {
        const option = document.createElement('option');
        option.value = date;
        option.textContent = formatDate(date);
        select.appendChild(option);
    });

    if (dates.length > 0) {
        select.value = dates[0];
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
    const athleteData = allData
        .filter(row => row[COLUMNS.NAME].trim() === athleteName)
        .sort((a, b) => parseDate(a[COLUMNS.DATE]) - parseDate(b[COLUMNS.DATE]));

    if (athleteData.length === 0) return;

    updateSummaryCards(athleteData, athleteName);
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

    // Stocker les stats pour les curseurs d'échelle
    chartF0Stats.mean = stats.mean;
    chartF0Stats.std = stats.std;
    chartF0Stats.dates = dates.map(d => d.getTime());

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
                }
            ]
        },
        options: getChartOptions('F0 (N/Kg)', stats)
    });

    // Calculer le nombre total de semaines disponibles
    const totalWeeks = Math.max(10, Math.ceil((Math.max(...chartF0Stats.dates) - Math.min(...chartF0Stats.dates)) / (7 * 24 * 60 * 60 * 1000)));

    // Mettre à jour le max du slider dynamiquement
    const weeksSlider = document.getElementById('weeks-f0');
    const displayWeeks = Math.min(50, totalWeeks);
    weeksSlider.max = displayWeeks;
    weeksSlider.value = displayWeeks;
    document.getElementById('weeks-f0-value').textContent = displayWeeks.toString();

    document.getElementById('scale-y-f0').value = 1.5;
    document.getElementById('scale-y-f0-value').textContent = '±1.5';

    // Appliquer uniquement l'échelle Y (pas l'échelle X pour voir toutes les données)
    updateYScale('f0');
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

    // Stocker les stats pour les curseurs d'échelle
    chartV0Stats.mean = stats.mean;
    chartV0Stats.std = stats.std;
    chartV0Stats.dates = dates.map(d => d.getTime());

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
                }
            ]
        },
        options: getChartOptions('V0 (m/s)', stats)
    });

    // Calculer le nombre total de semaines disponibles
    const totalWeeks = Math.max(10, Math.ceil((Math.max(...chartV0Stats.dates) - Math.min(...chartV0Stats.dates)) / (7 * 24 * 60 * 60 * 1000)));

    // Mettre à jour le max du slider dynamiquement
    const weeksSlider = document.getElementById('weeks-v0');
    const displayWeeks = Math.min(50, totalWeeks);
    weeksSlider.max = displayWeeks;
    weeksSlider.value = displayWeeks;
    document.getElementById('weeks-v0-value').textContent = displayWeeks.toString();

    document.getElementById('scale-y-v0').value = 1.5;
    document.getElementById('scale-y-v0-value').textContent = '±1.5';

    // Appliquer uniquement l'échelle Y (pas l'échelle X pour voir toutes les données)
    updateYScale('v0');
}

// Options communes pour les graphiques
function getChartOptions(yLabel, stats) {
    const yMin = stats ? stats.mean - 1.0 * stats.std : undefined;
    const yMax = stats ? stats.mean + 1.0 * stats.std : undefined;

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
                title: { display: true, text: 'Date' }
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

// Mettre à jour la vue groupe
function updateGroupView() {
    updateGroupStats();
    updateGroupChart();
    updateGroupPowerChart();
    updateGroupTimeChart();

    const dateSelect = document.getElementById('date-select');
    if (dateSelect.value) {
        updateGroupTable(dateSelect.value);
    }
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

// Mettre à jour le graphique groupe
function updateGroupChart() {
    const ctx = document.getElementById('chart-group').getContext('2d');

    const dataByDate = {};
    allData.forEach(row => {
        const date = row[COLUMNS.DATE];
        if (!dataByDate[date]) {
            dataByDate[date] = { f0: [], v0: [], time: [] };
        }
        dataByDate[date].f0.push(parseFloat(row[COLUMNS.F0_RELATIVE]));
        dataByDate[date].v0.push(parseFloat(row[COLUMNS.V0]));
        dataByDate[date].time.push(parseFloat(row[COLUMNS.TIME_30M]));
    });

    const dates = Object.keys(dataByDate).sort((a, b) => parseDate(a) - parseDate(b));
    const parsedDates = dates.map(d => parseDate(d));
    const avgF0 = dates.map(d => average(dataByDate[d].f0));
    const avgV0 = dates.map(d => average(dataByDate[d].v0));

    // Prendre seulement les 10 dernières semaines pour la tendance
    const last10Dates = parsedDates.slice(-10);
    const last10F0 = avgF0.slice(-10);
    const last10V0 = avgV0.slice(-10);

    // Calculer les lignes de tendance sur les 10 dernières semaines
    const trendF0 = calculateLinearRegression(last10Dates, last10F0);
    const trendV0 = calculateLinearRegression(last10Dates, last10V0);

    // Créer des tableaux avec null pour les dates hors des 10 dernières semaines
    const trendF0Data = parsedDates.map((_, i) =>
        i >= parsedDates.length - 10 ? trendF0.predictions[i - (parsedDates.length - 10)] : null
    );
    const trendV0Data = parsedDates.map((_, i) =>
        i >= parsedDates.length - 10 ? trendV0.predictions[i - (parsedDates.length - 10)] : null
    );

    if (chartGroup) chartGroup.destroy();

    // Stocker les dates pour les curseurs d'échelle
    chartGroupStats.dates = parsedDates.map(d => d.getTime());

    chartGroup = new Chart(ctx, {
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
                    yAxisID: 'y',
                    showLine: false
                },
                {
                    label: 'Tendance F0 (10 sem.)',
                    data: trendF0Data,
                    borderColor: '#3498db',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [10, 5],
                    pointRadius: 0,
                    pointStyle: 'line',
                    yAxisID: 'y',
                    spanGaps: false
                },
                {
                    label: 'V0 moyen (m/s)',
                    data: avgV0,
                    borderColor: '#e74c3c',
                    backgroundColor: '#e74c3c',
                    borderWidth: 0,
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    pointStyle: 'circle',
                    yAxisID: 'y1',
                    showLine: false
                },
                {
                    label: 'Tendance V0 (10 sem.)',
                    data: trendV0Data,
                    borderColor: '#e74c3c',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [10, 5],
                    pointRadius: 0,
                    pointStyle: 'line',
                    yAxisID: 'y1',
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
                    position: 'left',
                    title: { display: true, text: 'F0 (N/Kg)' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: { display: true, text: 'V0 (m/s)' },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });

    // Calculer le nombre total de semaines disponibles
    const totalWeeks = Math.max(10, Math.ceil((Math.max(...chartGroupStats.dates) - Math.min(...chartGroupStats.dates)) / (7 * 24 * 60 * 60 * 1000)));

    // Mettre à jour le max du slider dynamiquement
    const weeksSlider = document.getElementById('weeks-group');
    const displayWeeks = Math.min(50, totalWeeks); // Augmenter le max à 50
    weeksSlider.max = displayWeeks;
    weeksSlider.value = displayWeeks;
    document.getElementById('weeks-group-value').textContent = displayWeeks.toString();
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

    // Prendre seulement les 10 dernières semaines pour la tendance
    const last10Dates = parsedDates.slice(-10);
    const last10Power = avgPower.slice(-10);

    // Calculer la ligne de tendance sur les 10 dernières semaines
    const trendPower = calculateLinearRegression(last10Dates, last10Power);

    // Créer un tableau avec null pour les dates hors des 10 dernières semaines
    const trendPowerData = parsedDates.map((_, i) =>
        i >= parsedDates.length - 10 ? trendPower.predictions[i - (parsedDates.length - 10)] : null
    );

    if (chartGroupPower) chartGroupPower.destroy();

    // Stocker les dates pour les curseurs d'échelle
    chartGroupPowerStats.dates = parsedDates.map(d => d.getTime());

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
                    label: 'Tendance (10 sem.)',
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
                            if (item.dataset.label.includes('Tendance')) {
                                return `${item.dataset.label}: ${item.parsed.y.toFixed(2)} W/Kg`;
                            }
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
    weeksSlider.value = displayWeeks;
    document.getElementById('weeks-group-power-value').textContent = displayWeeks.toString();
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

    // Prendre seulement les 10 dernières semaines pour la tendance
    const last10Dates = parsedDates.slice(-10);
    const last10Time = avgTime.slice(-10);

    // Calculer la ligne de tendance sur les 10 dernières semaines
    const trendTime = calculateLinearRegression(last10Dates, last10Time);

    // Créer un tableau avec null pour les dates hors des 10 dernières semaines
    const trendTimeData = parsedDates.map((_, i) =>
        i >= parsedDates.length - 10 ? trendTime.predictions[i - (parsedDates.length - 10)] : null
    );

    if (chartGroupTime) chartGroupTime.destroy();

    // Stocker les dates pour les curseurs d'échelle
    chartGroupTimeStats.dates = parsedDates.map(d => d.getTime());

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
                    label: 'Tendance (10 sem.)',
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
                            if (item.dataset.label.includes('Tendance')) {
                                return `${item.dataset.label}: ${item.parsed.y.toFixed(3)} s`;
                            }
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
    weeksSlider.value = displayWeeks;
    document.getElementById('weeks-group-time-value').textContent = displayWeeks.toString();
}

// Mettre à jour le tableau groupe
function updateGroupTable(selectedDate) {
    const thead = document.querySelector('#group-table thead');
    const tbody = document.querySelector('#group-table tbody');

    const dateData = allData.filter(row => row[COLUMNS.DATE] === selectedDate);

    if (dateData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6">Aucune donnée pour cette date</td></tr>';
        return;
    }

    thead.innerHTML = `
        <tr>
            <th>Athlète</th>
            <th>Temps 30m (s)</th>
            <th>F0 (N/Kg)</th>
            <th>V0 (m/s)</th>
            <th>P Max (W/Kg)</th>
            <th>RF Peak</th>
        </tr>
    `;

    const sortedData = [...dateData].sort((a, b) =>
        parseFloat(a[COLUMNS.TIME_30M]) - parseFloat(b[COLUMNS.TIME_30M])
    );

    tbody.innerHTML = sortedData.map((row, index) => `
        <tr>
            <td>${index === 0 ? '🥇 ' : index === 1 ? '🥈 ' : index === 2 ? '🥉 ' : ''}${row[COLUMNS.NAME]}</td>
            <td>${parseFloat(row[COLUMNS.TIME_30M]).toFixed(2)}</td>
            <td>${parseFloat(row[COLUMNS.F0_RELATIVE]).toFixed(2)}</td>
            <td>${parseFloat(row[COLUMNS.V0]).toFixed(2)}</td>
            <td>${parseFloat(row[COLUMNS.P_MAX_RELATIVE]).toFixed(2)}</td>
            <td>${parseFloat(row[COLUMNS.RF_PEAK]).toFixed(2)}</td>
        </tr>
    `).join('');
}
