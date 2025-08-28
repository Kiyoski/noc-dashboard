import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import { getFirestore, doc, onSnapshot, setDoc, writeBatch, collection, getDocs, arrayUnion, updateDoc, getDoc, arrayRemove } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

// --- CONFIGURAÇÃO ---
const userFirebaseConfig = {
    apiKey: "AIzaSyBbW6v00XhDIpcE7weG_reOBzTgsgXJXDk",
    authDomain: "avaliacaon1.firebaseapp.com",
    projectId: "avaliacaon1",
    storageBucket: "avaliacaon1.appspot.com",
    messagingSenderId: "18545955185",
    appId: "1:18545955185:web:f617bc54edca4fb65a26d0",
    measurementId: "G-VSNGL56W70"
};

const firebaseConfig = typeof __firebase_config !== 'undefined' && Object.keys(JSON.parse(__firebase_config)).length > 0 ? JSON.parse(__firebase_config) : userFirebaseConfig;
const appId = typeof __app_id !== 'undefined' ? __app_id : firebaseConfig.appId;

// --- ELEMENTOS DO DOM ---
const loginScreen = document.getElementById('login-screen');
const appScreen = document.getElementById('app-screen');
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const loginError = document.getElementById('login-error');
const userNameDisplay = document.getElementById('user-name-display');
const statusMessageEl = document.getElementById('status-message');
const sidebar = document.getElementById('sidebar');
const pageTitle = document.getElementById('page-title');

// Seções/Páginas da App
const pageSections = document.querySelectorAll('.page-section');
const homeScreen = document.getElementById('home-screen');

// Modais
const inputModal = document.getElementById('input-modal');
const modalTitle = document.getElementById('modal-title');
const confirmationModal = document.getElementById('confirmation-modal');

// --- VARIÁVEIS GLOBAIS ---
let app, db, auth;
let people = [];
let categories = [];
let fcrCategories = [];
let localScores = {};
let localFcrScores = {};
let modalContext = {};
let agentEvolutionChart, categoryEvolutionChart, fcrVsEscalonadoChart, fcrEscalonadoTrendChart;
let currentAnalystName = '';
let currentUserRole = '';
let confirmationResolve = null;

// --- CONFIGURAÇÃO GLOBAL DO CHART.JS PARA TEMA ESCURO ---
Chart.defaults.color = '#CBD5E1'; // Cor padrão para texto (slate-300)
Chart.defaults.borderColor = '#334155'; // Cor padrão para bordas/linhas (slate-700)


// --- NAVEGAÇÃO E UI ---
function navigateTo(pageId, title) {
    pageSections.forEach(section => section.classList.add('hidden'));
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.remove('hidden');
    }
    pageTitle.textContent = title;
    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageId) {
            item.classList.add('active');
        }
    });
}

function setupUIForRole(role) {
    sidebar.innerHTML = '';
    const homeIconsContainer = homeScreen.querySelector('.grid');
    homeIconsContainer.innerHTML = '';

    const menuItems = {
        home: { title: 'Início', icon: 'fa-home', roles: ['admin', 'viewer', 'input', 'n1'], page: 'home-screen' },
        dashboard: { title: 'Dashboard', icon: 'fa-chart-line', roles: ['admin', 'viewer'], page: 'viewer-content' },
        register: { title: 'Registros', icon: 'fa-plus-circle', roles: ['admin', 'input', 'n1'], page: 'register-page' },
        admin: { title: 'Admin', icon: 'fa-cogs', roles: ['admin'], page: 'admin-panel' }
    };

    const logo = document.createElement('h2');
    logo.className = 'text-2xl font-bold mb-8 text-center text-white';
    logo.textContent = 'NOC Dashboard';
    sidebar.appendChild(logo);

    for (const key in menuItems) {
        const item = menuItems[key];
        if (item.roles.includes(role)) {
            const menuItemEl = document.createElement('div');
            menuItemEl.className = 'sidebar-item';
            menuItemEl.dataset.page = item.page;
            menuItemEl.dataset.title = item.title;
            menuItemEl.innerHTML = `<i class="fas ${item.icon}"></i><span>${item.title}</span>`;
            menuItemEl.onclick = () => navigateTo(item.page, item.title);
            sidebar.appendChild(menuItemEl);

            if (key !== 'home') {
                const homeIconEl = document.createElement('div');
                homeIconEl.className = 'home-icon-card';
                homeIconEl.dataset.page = item.page;
                homeIconEl.dataset.title = item.title;
                homeIconEl.innerHTML = `
                    <i class="fas ${item.icon} text-4xl text-indigo-400 mb-4"></i>
                    <h3 class="text-xl font-bold text-white">${item.title}</h3>
                `;
                homeIconEl.onclick = () => navigateTo(item.page, item.title);
                homeIconsContainer.appendChild(homeIconEl);
            }
        }
    }

    const registerDoubtSection = document.getElementById('register-doubt-section');
    const registerFcrSection = document.getElementById('register-fcr-section');
    
    registerDoubtSection.classList.add('hidden');
    registerFcrSection.classList.add('hidden');

    if (role === 'admin' || role === 'input') registerDoubtSection.classList.remove('hidden');
    if (role === 'admin' || role === 'n1') registerFcrSection.classList.remove('hidden');
}

function showSubPage(subpageId) {
    document.querySelectorAll('.subpage-section').forEach(section => section.classList.add('hidden'));
    document.getElementById(subpageId).classList.remove('hidden');

    document.querySelectorAll('.subpage-btn').forEach(btn => {
        btn.classList.remove('bg-indigo-600', 'text-white');
        btn.classList.add('bg-slate-600', 'text-slate-200');
        if (btn.dataset.subpage === subpageId) {
            btn.classList.remove('bg-slate-600', 'text-slate-200');
            btn.classList.add('bg-indigo-600', 'text-white');
        }
    });
}

// --- FUNÇÕES DE UTILIDADE ---
function showStatusMessage(message, type) {
    statusMessageEl.textContent = message;
    statusMessageEl.className = 'mt-4 p-3 rounded-lg text-center font-medium h-12';
    if (type === 'success') {
        statusMessageEl.classList.add('bg-green-900', 'text-green-200', 'border', 'border-green-700');
    } else if (type === 'error') {
        statusMessageEl.classList.add('bg-red-900', 'text-red-200', 'border', 'border-red-700');
    } else {
        statusMessageEl.classList.add('bg-blue-900', 'text-blue-200', 'border', 'border-blue-700');
    }
    setTimeout(() => {
        statusMessageEl.textContent = '';
        statusMessageEl.className = 'mt-4 p-3 rounded-lg text-center font-medium h-12';
    }, 5000);
}

function showConfirmationModal(title, text) {
    return new Promise((resolve) => {
        confirmationResolve = resolve;
        document.getElementById('confirmation-modal-title').textContent = title;
        document.getElementById('confirmation-modal-text').textContent = text;
        confirmationModal.classList.remove('hidden');
    });
}

// --- INICIALIZAÇÃO ---
async function main() {
    try {
        if (!firebaseConfig || !firebaseConfig.apiKey) throw new Error("Configuração do Firebase ausente.");
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                const userData = await fetchUserData(user.uid);
                if(userData && userData.role) {
                    currentAnalystName = userData.name || user.email;
                    currentUserRole = userData.role;
                    userNameDisplay.textContent = currentAnalystName;
                    
                    await loadConfigData();
                    setupUIForRole(currentUserRole);
                    setupFirestoreListener();
                    
                    navigateTo('home-screen', 'Início');
                    showSubPage('summary-page');

                    loginScreen.classList.add('hidden');
                    appScreen.classList.remove('hidden');
                } else {
                    loginError.textContent = 'Usuário sem permissão. Contate o admin.';
                    await signOut(auth);
                }
            } else {
                loginScreen.classList.remove('hidden');
                appScreen.classList.add('hidden');
            }
        });
    } catch (e) {
        console.error("ERRO FATAL:", e);
        loginError.textContent = `Erro fatal: ${e.message}`;
    }
}

// --- LÓGICA DE AUTENTICAÇÃO E DADOS ---
async function fetchUserData(uid) {
    const userDocRef = doc(db, "users", uid);
    const userDoc = await getDoc(userDocRef);
    return userDoc.exists() ? userDoc.data() : null;
}

async function loadConfigData() {
    const configRef = doc(db, `/artifacts/${appId}/public/data/config/settings`);
    const configSnap = await getDoc(configRef);
    if (configSnap.exists()) {
        const configData = configSnap.data();
        people = configData.people || [];
        categories = (configData.categories || []).sort((a, b) => b.weight - a.weight);
        fcrCategories = configData.fcrCategories || [];
    } else {
        showStatusMessage('Configuração não encontrada.', 'error');
        people = [];
        categories = [];
        fcrCategories = [];
    }
    populateSelectors();
    createTotalsGrid();
}

function setupFirestoreListener() {
    const collectionRef = collection(db, `/artifacts/${appId}/public/data/scores`);
    const fcrCollectionRef = collection(db, `/artifacts/${appId}/public/data/fcr_scores`);

    onSnapshot(collectionRef, (querySnapshot) => {
        localScores = {};
        querySnapshot.forEach((doc) => { localScores[doc.id] = doc.data(); });
        filterAndRenderAll();
    }, (error) => console.error("Erro no listener de escalonamento:", error));

    onSnapshot(fcrCollectionRef, (querySnapshot) => {
        localFcrScores = {};
        querySnapshot.forEach((doc) => { localFcrScores[doc.id] = doc.data(); });
        filterAndRenderAll();
    }, (error) => console.error("Erro no listener de FCR:", error));
}

async function addProtocolToDB(person, category, protocol) {
    const docPath = `/artifacts/${appId}/public/data/scores/${person}`;
    const scoreRef = doc(db, docPath);
    try {
        const today = new Date();
        const date = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
        const protocolEntry = { protocol, date, analystName: currentAnalystName };
        await setDoc(scoreRef, { [category]: arrayUnion(protocolEntry) }, { merge: true });
        showStatusMessage(`Protocolo ${protocol} adicionado para ${person}!`, 'success');
    } catch (e) {
        showStatusMessage(`Erro ao salvar: ${e.message}`, 'error');
    }
}

async function addFcrProtocolToDB(person, category, protocol) {
    const docPath = `/artifacts/${appId}/public/data/fcr_scores/${person}`;
    const fcrScoreRef = doc(db, docPath);
    try {
        const today = new Date();
        const date = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;
        const protocolEntry = { protocol, date, analystName: currentAnalystName };
        await setDoc(fcrScoreRef, { [category]: arrayUnion(protocolEntry) }, { merge: true });
        showStatusMessage(`Protocolo FCR ${protocol} adicionado para ${person}!`, 'success');
    } catch (e) {
        showStatusMessage(`Erro ao salvar FCR: ${e.message}`, 'error');
    }
}

// --- FILTRAGEM, CÁLCULOS E RENDERIZAÇÃO ---
function filterAndRenderAll() {
    const period = document.getElementById('time-filter').value;
    const filteredScores = filterScoresByPeriod(localScores, period);
    const filteredFcrScores = filterScoresByPeriod(localFcrScores, period);
    const weights = calculateAllWeights(filteredScores);
    updateTotals(filteredScores, filteredFcrScores);
    renderIndividualDashboard(filteredScores, weights);
    renderWeightRanking(weights);
    renderAgentEvolutionChart(localScores);
    renderCategoryEvolutionChart(localScores);
    renderFcrVsEscalonadoChart(filteredScores, filteredFcrScores);
    renderFcrEscalonadoTrendChart(localScores, localFcrScores);
}

function filterScoresByPeriod(scores, period) {
    if (period === 'always') return scores;
    const now = new Date();
    let startDate = new Date();
    switch (period) {
        case 'today': startDate.setDate(now.getDate()); break;
        case '3days': startDate.setDate(now.getDate() - 3); break;
        case '7days': startDate.setDate(now.getDate() - 7); break;
        case '14days': startDate.setDate(now.getDate() - 14); break;
        case '1month': startDate.setMonth(now.getMonth() - 1); break;
        case '3months': startDate.setMonth(now.getMonth() - 3); break;
        case '1year': startDate.setFullYear(now.getFullYear() - 1); break;
        case '2years': startDate.setFullYear(now.getFullYear() - 2); break;
    }
    startDate.setHours(0, 0, 0, 0);
    const filtered = {};
    for (const person in scores) {
        filtered[person] = {};
        for (const category in scores[person]) {
            const categoryData = scores[person][category];
            if (Array.isArray(categoryData)) {
                filtered[person][category] = categoryData.filter(entry => {
                    if (entry && typeof entry === 'object' && entry.date) {
                        const [day, month, year] = entry.date.split('/');
                        const entryDate = new Date(year, month - 1, day);
                        return entryDate >= startDate;
                    }
                    return false;
                });
            }
        }
    }
    return filtered;
}

function calculateAllWeights(filteredScores) {
    const personWeights = {};
    people.forEach(person => {
        let totalWeight = 0;
        const personData = filteredScores[person] || {};
        categories.forEach(category => {
            const protocols = personData[category.name] || [];
            totalWeight += protocols.length * category.weight;
        });
        personWeights[person] = totalWeight;
    });
    return personWeights;
}

function populateSelectors() {
    const personOptions = '<option value="">-- Selecione Pessoa --</option>' + people.map(item => `<option value="${item}">${item}</option>`).join('');
    ['person-selector', 'register-person-selector', 'register-fcr-person-selector', 'remove-person-selector', 'fcr-vs-escalation-selector'].forEach(id => {
        document.getElementById(id).innerHTML = personOptions;
    });
    
    const categoryOptions = '<option value="">-- Selecione Categoria --</option>' + categories.map(cat => `<option value="${cat.name}">${cat.name}</option>`).join('');
    ['register-category-selector', 'remove-category-selector', 'category-chart-selector'].forEach(id => {
        document.getElementById(id).innerHTML = categoryOptions;
    });

    const fcrCategoryOptions = '<option value="">-- Selecione Categoria --</option>' + fcrCategories.map(cat => `<option value="${cat.name}">${cat.name}</option>`).join('');
    ['register-fcr-category-selector', 'remove-fcr-category-selector'].forEach(id => {
        document.getElementById(id).innerHTML = fcrCategoryOptions;
    });
}

function createTotalsGrid() {
    const totalsGrid = document.getElementById('totals-grid');
    totalsGrid.innerHTML = '';
    categories.forEach(category => {
        const card = document.createElement('div');
        card.className = 'category-card p-3 rounded-lg shadow border border-slate-700';
        card.onclick = () => openProtocolsModal(category.name);
        card.innerHTML = `<p class="text-sm font-medium uppercase text-slate-400">${category.name} (Peso ${category.weight})</p><p id="total-${category.name}" class="text-2xl font-bold text-indigo-400 mt-1">0</p>`;
        totalsGrid.appendChild(card);
    });
}

function updateTotals(filteredScores, filteredFcrScores) {
    let maxScore = -1;
    let leadingCategories = [];
    categories.forEach(category => {
        let categoryTotal = people.reduce((sum, person) => sum + (filteredScores[person]?.[category.name]?.length || 0), 0);
        const totalSpan = document.getElementById(`total-${category.name}`);
        if (totalSpan) totalSpan.textContent = categoryTotal;

        if (categoryTotal > maxScore) {
            maxScore = categoryTotal;
            leadingCategories = [category.name];
        } else if (categoryTotal > 0 && categoryTotal === maxScore) {
            leadingCategories.push(category.name);
        }
    });
    document.getElementById('leading-category').textContent = maxScore > 0 ? leadingCategories.join(', ') : 'Nenhum';
    let totalEscalonamentos = Object.values(filteredScores).reduce((sum, personData) => sum + Object.values(personData).reduce((s, catProtocols) => s + catProtocols.length, 0), 0);
    let totalFCR = Object.values(filteredFcrScores).reduce((sum, personData) => sum + Object.values(personData).reduce((s, catProtocols) => s + catProtocols.length, 0), 0);
    document.getElementById('total-protocols-value').textContent = totalEscalonamentos + totalFCR;
}

function renderIndividualDashboard(filteredScores, weights) {
    const selectedPerson = document.getElementById('person-selector').value;
    const dashboard = document.getElementById('individual-dashboard');
    if (!selectedPerson) {
        dashboard.innerHTML = `<p class="text-center text-slate-400">Selecione uma pessoa.</p>`;
        return;
    }
    const totalWeight = weights[selectedPerson] || 0;
    let html = `<div class="p-3 rounded-lg bg-indigo-900/50 text-center"><h4 class="font-bold text-lg text-indigo-200">Pontuação Total (Peso): ${totalWeight}</h4></div>`;
    const personScores = categories.map(category => ({
        name: category.name,
        score: (filteredScores[selectedPerson]?.[category.name] || []).length
    })).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
    if (personScores.length > 0) {
        personScores.forEach((item) => {
            html += `<div class="flex justify-between items-center p-2 rounded-md bg-slate-700/50"><span class="capitalize">${item.name.toLowerCase()}</span><span class="text-xl font-bold">${item.score}</span></div>`;
        });
    } else {
        html += `<p class="text-center text-slate-400 mt-2">Nenhum ponto no período.</p>`;
    }
    dashboard.innerHTML = html;
}

function renderWeightRanking(weights) {
    const rankingList = document.getElementById('weight-ranking-list');
    const sortedPeople = Object.entries(weights).sort(([, a], [, b]) => b - a);
    if (sortedPeople.length === 0) {
        rankingList.innerHTML = `<p class="text-center text-slate-400">Nenhum dado para exibir o ranking.</p>`;
        return;
    }
    const colorClasses = ['bg-yellow-400/20 border-yellow-400', 'bg-slate-400/20 border-slate-400', 'bg-yellow-600/20 border-yellow-600'];
    rankingList.innerHTML = sortedPeople.map(([person, weight], index) => {
        const colorClass = index < 3 ? colorClasses[index] : 'bg-slate-700/50 border-slate-700';
        return `
            <div class="flex items-center justify-between p-3 rounded-md border ${colorClass}">
                <div class="flex items-center"><span class="font-bold text-lg w-8">${index + 1}.</span><span class="font-semibold">${person}</span></div>
                <span class="text-xl font-bold text-indigo-400">${weight}</span>
            </div>`;
    }).join('');
}

// --- GRÁFICOS ---
function renderAgentEvolutionChart(scores) {
    const ctx = document.getElementById('agent-evolution-chart').getContext('2d');
    if (!ctx) return;
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    const labels = Array.from({ length: 12 }, (_, i) => {
        const date = new Date(twelveMonthsAgo.getFullYear(), twelveMonthsAgo.getMonth() + i, 1);
        return date.toLocaleString('default', { month: 'short', year: '2-digit' });
    });
    const datasets = people.map((person, index) => {
        const data = new Array(12).fill(0);
        const personScores = scores[person] || {};
        for (const category in personScores) {
            if (Array.isArray(personScores[category])) {
                personScores[category].forEach(entry => {
                    if (entry && entry.date) {
                        const [day, month, year] = entry.date.split('/');
                        const entryDate = new Date(year, month - 1, day);
                        if (entryDate >= twelveMonthsAgo) {
                            const monthIndex = (entryDate.getFullYear() - twelveMonthsAgo.getFullYear()) * 12 + entryDate.getMonth() - twelveMonthsAgo.getMonth();
                            if (monthIndex >= 0 && monthIndex < 12) data[monthIndex]++;
                        }
                    }
                });
            }
        }
        const colors = ['#818CF8', '#4ADE80', '#FBBF24', '#F87171', '#A78BFA', '#60A5FA'];
        return { label: person, data, borderColor: colors[index % colors.length], tension: 0.1 };
    });
    if (agentEvolutionChart) agentEvolutionChart.destroy();
    agentEvolutionChart = new Chart(ctx, { type: 'line', data: { labels, datasets } });
}

function renderCategoryEvolutionChart(scores) {
    const selectedCategory = document.getElementById('category-chart-selector').value;
    const ctx = document.getElementById('category-evolution-chart').getContext('2d');
    if (!ctx) return;
    if (categoryEvolutionChart) categoryEvolutionChart.destroy();
    if (!selectedCategory) return;
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    const labels = Array.from({ length: 12 }, (_, i) => {
        const date = new Date(twelveMonthsAgo.getFullYear(), twelveMonthsAgo.getMonth() + i, 1);
        return date.toLocaleString('default', { month: 'short', year: '2-digit' });
    });
    const data = new Array(12).fill(0);
    people.forEach(person => {
        const categoryScores = scores[person]?.[selectedCategory];
        if (Array.isArray(categoryScores)) {
            categoryScores.forEach(entry => {
                if (entry && entry.date) {
                    const [day, month, year] = entry.date.split('/');
                    const entryDate = new Date(year, month - 1, day);
                    if (entryDate >= twelveMonthsAgo) {
                        const monthIndex = (entryDate.getFullYear() - twelveMonthsAgo.getFullYear()) * 12 + entryDate.getMonth() - twelveMonthsAgo.getMonth();
                        if (monthIndex >= 0 && monthIndex < 12) data[monthIndex]++;
                    }
                }
            });
        }
    });
    const dataset = { label: `Dúvidas em ${selectedCategory}`, data, borderColor: '#4ADE80', tension: 0.1 };
    categoryEvolutionChart = new Chart(ctx, { type: 'line', data: { labels, datasets: [dataset] } });
}

function renderFcrVsEscalonadoChart(filteredEscalonamentos, filteredFCR) {
    const selectedPerson = document.getElementById('fcr-vs-escalation-selector').value;
    const ctx = document.getElementById('fcr-vs-escalonado-chart').getContext('2d');
    if (!ctx) return;
    if (fcrVsEscalonadoChart) fcrVsEscalonadoChart.destroy();
    if (!selectedPerson) return;
    const escalonamentosCount = Object.values(filteredEscalonamentos[selectedPerson] || {}).reduce((sum, cat) => sum + cat.length, 0);
    const fcrCount = Object.values(filteredFCR[selectedPerson] || {}).reduce((sum, cat) => sum + cat.length, 0);
    const data = {
        labels: ['Escalonados', 'FCR'],
        datasets: [{
            label: `Protocolos de ${selectedPerson}`,
            data: [escalonamentosCount, fcrCount],
            backgroundColor: ['#F87171', '#4ADE80'],
            borderColor: '#1E293B',
            hoverOffset: 4
        }]
    };
    const options = {
        responsive: true,
        plugins: {
            legend: { position: 'top' },
            tooltip: {
                callbacks: {
                    label: function(tooltipItem) {
                        const value = tooltipItem.raw;
                        const total = tooltipItem.dataset.data.reduce((sum, current) => sum + current, 0);
                        const percentage = total > 0 ? ((value / total) * 100).toFixed(2) : 0;
                        return `${tooltipItem.label}: ${value} (${percentage}%)`;
                    }
                }
            }
        }
    };
    fcrVsEscalonadoChart = new Chart(ctx, { type: 'doughnut', data, options });
}

function renderFcrEscalonadoTrendChart(scores, fcrScores) {
    const ctx = document.getElementById('fcr-escalonado-trend-chart').getContext('2d');
    if (!ctx) return;
    if (fcrEscalonadoTrendChart) fcrEscalonadoTrendChart.destroy();
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    const labels = Array.from({ length: 12 }, (_, i) => {
        const date = new Date(twelveMonthsAgo.getFullYear(), twelveMonthsAgo.getMonth() + i, 1);
        return date.toLocaleString('default', { month: 'short', year: '2-digit' });
    });
    const trendData = {};
    labels.forEach((_, i) => {
        const date = new Date(twelveMonthsAgo.getFullYear(), twelveMonthsAgo.getMonth() + i, 1);
        trendData[`${date.getFullYear()}-${date.getMonth()}`] = { escalonados: 0, fcr: 0 };
    });
    const processScores = (scoreData, type) => {
        Object.values(scoreData).forEach(personData => {
            Object.values(personData).forEach(categoryData => {
                if (Array.isArray(categoryData)) {
                    categoryData.forEach(entry => {
                        if (entry && entry.date) {
                            const [day, month, year] = entry.date.split('/');
                            const entryDate = new Date(year, month - 1, day);
                            if (entryDate >= twelveMonthsAgo) {
                                const monthKey = `${entryDate.getFullYear()}-${entryDate.getMonth()}`;
                                if (trendData[monthKey]) trendData[monthKey][type]++;
                            }
                        }
                    });
                }
            });
        });
    };
    processScores(scores, 'escalonados');
    processScores(fcrScores, 'fcr');
    const escalonadosData = Object.values(trendData).map(item => item.escalonados);
    const fcrData = Object.values(trendData).map(item => item.fcr);
    const data = {
        labels,
        datasets: [
            { label: 'Escalonados', data: escalonadosData, borderColor: '#F87171', tension: 0.1, fill: false },
            { label: 'FCR', data: fcrData, borderColor: '#4ADE80', tension: 0.1, fill: false }
        ]
    };
    fcrEscalonadoTrendChart = new Chart(ctx, { type: 'line', data, options: { responsive: true } });
}

// --- LÓGICA DOS MODAIS ---
function openInputModal(person, category, type) {
    if (!person || !category) {
        showStatusMessage('Selecione uma pessoa e uma categoria.', 'error');
        return;
    }
    modalContext = { person, category, type };
    modalTitle.textContent = type === 'escalation' ? 'Registrar Escalonamento' : 'Registrar FCR';
    document.getElementById('reference-number').value = '';
    document.getElementById('modal-error').textContent = '';
    inputModal.classList.remove('hidden');
}

function openProtocolsModal(categoryName) {
    document.getElementById('protocols-modal-title').textContent = `Protocolos de ${categoryName}`;
    const filterSelect = document.getElementById('protocol-analyst-filter');
    const allProtocols = [];
    const analystNames = new Set(['Todos']);
    people.forEach(person => {
        const protocols = localScores[person]?.[categoryName] || [];
        protocols.forEach(p => {
            if (p && p.analystName) {
                allProtocols.push({ ...p, person });
                analystNames.add(p.analystName);
            }
        });
    });
    filterSelect.innerHTML = [...analystNames].map(name => `<option value="${name}">${name}</option>`).join('');
    const renderList = () => {
        const selectedAnalyst = filterSelect.value;
        const content = document.getElementById('protocols-modal-content');
        const filteredProtocols = selectedAnalyst === 'Todos' ? allProtocols : allProtocols.filter(p => p.analystName === selectedAnalyst);
        const groupedByPerson = filteredProtocols.reduce((acc, p) => {
            if (!acc[p.person]) acc[p.person] = [];
            acc[p.person].push(p);
            return acc;
        }, {});
        if (Object.keys(groupedByPerson).length === 0) {
            content.innerHTML = `<p class="text-center text-slate-400">Nenhum protocolo encontrado.</p>`;
            return;
        }
        content.innerHTML = Object.entries(groupedByPerson).map(([person, protocolList]) => {
            const items = protocolList.map(p => `<li>${p.protocol} - <span class="text-slate-400">${p.date} por ${p.analystName}</span></li>`).join('');
            return `<div class="p-3 rounded-lg bg-slate-700/50"><h4 class="font-bold text-white">${person}</h4><ul class="list-disc list-inside">${items}</ul></div>`;
        }).join('');
    };
    filterSelect.onchange = renderList;
    renderList();
    document.getElementById('protocols-modal').classList.remove('hidden');
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
    loginButton.addEventListener('click', async () => {
        try {
            loginError.textContent = '';
            await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
        } catch (error) {
            loginError.textContent = "Email ou senha inválidos.";
        }
    });

    logoutButton.addEventListener('click', () => signOut(auth));
    
    document.getElementById('add-doubt-button').addEventListener('click', () => openInputModal(document.getElementById('register-person-selector').value, document.getElementById('register-category-selector').value, 'escalation'));
    document.getElementById('add-fcr-button').addEventListener('click', () => openInputModal(document.getElementById('register-fcr-person-selector').value, document.getElementById('register-fcr-category-selector').value, 'fcr'));
    
    document.getElementById('modal-submit-btn').addEventListener('click', () => {
        const protocol = document.getElementById('reference-number').value;
        if (!/^\d{5,}$/.test(protocol)) {
            document.getElementById('modal-error').textContent = 'Mínimo 5 dígitos.';
            return;
        }
        const { person, category, type } = modalContext;
        if (type === 'escalation') addProtocolToDB(person, category, protocol);
        else if (type === 'fcr') addFcrProtocolToDB(person, category, protocol);
        inputModal.classList.add('hidden');
    });

    document.getElementById('modal-cancel-btn').addEventListener('click', () => inputModal.classList.add('hidden'));
    document.getElementById('protocols-modal-close-btn').addEventListener('click', () => document.getElementById('protocols-modal').classList.add('hidden'));
    document.getElementById('person-selector').addEventListener('change', filterAndRenderAll);
    document.getElementById('time-filter').addEventListener('change', filterAndRenderAll);
    document.getElementById('category-chart-selector').addEventListener('change', () => renderCategoryEvolutionChart(localScores));
    document.getElementById('fcr-vs-escalation-selector').addEventListener('change', filterAndRenderAll);

    document.querySelectorAll('.subpage-btn').forEach(btn => {
        btn.addEventListener('click', () => showSubPage(btn.dataset.subpage));
    });

    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', () => {
            header.classList.toggle('active');
            header.nextElementSibling.classList.toggle('open');
        });
    });
    
    document.getElementById('confirmation-modal-cancel-btn').addEventListener('click', () => {
        confirmationModal.classList.add('hidden');
        if (confirmationResolve) confirmationResolve(false);
    });
    document.getElementById('confirmation-modal-confirm-btn').addEventListener('click', () => {
        confirmationModal.classList.add('hidden');
        if (confirmationResolve) confirmationResolve(true);
    });

    // Admin Panel Listeners
    document.getElementById('add-user-button').addEventListener('click', async () => {
        const email = document.getElementById('new-user-email').value;
        const name = document.getElementById('new-user-name').value;
        const password = document.getElementById('new-user-password').value;
        const role = document.getElementById('new-user-role').value;
        if (!email || !password || !name) {
            showStatusMessage('Preencha todos os campos.', 'error');
            return;
        }
        const tempAppName = 'user-creation-app';
        let tempApp;
        try {
            tempApp = initializeApp(firebaseConfig, tempAppName);
            const tempAuth = getAuth(tempApp);
            const userCredential = await createUserWithEmailAndPassword(tempAuth, email, password);
            await setDoc(doc(db, "users", userCredential.user.uid), { role, name });
            showStatusMessage(`Usuário ${name} criado!`, 'success');
        } catch (error) {
            showStatusMessage(`Erro: ${error.message}`, 'error');
        } finally {
            if (tempApp) await deleteApp(tempApp);
        }
    });
    
    async function updateConfigList(field, value, action = 'add') {
        const configRef = doc(db, `/artifacts/${appId}/public/data/config/settings`);
        const operation = action === 'add' ? arrayUnion(value) : arrayRemove(value);
        try {
            await updateDoc(configRef, { [field]: operation });
            showStatusMessage(`Item ${action === 'add' ? 'adicionado' : 'removido'}!`, 'success');
            loadConfigData();
        } catch (error) {
            showStatusMessage(`Erro ao atualizar: ${error.message}`, 'error');
        }
    }

    document.getElementById('add-person-button').addEventListener('click', () => {
        const newPersonInput = document.getElementById('new-person');
        if (newPersonInput.value) {
            updateConfigList('people', newPersonInput.value, 'add');
            newPersonInput.value = '';
        }
    });

    document.getElementById('remove-person-button').addEventListener('click', async () => {
        const personToRemove = document.getElementById('remove-person-selector').value;
        if (personToRemove && await showConfirmationModal('Remover Pessoa', `Deseja remover ${personToRemove}?`)) {
            updateConfigList('people', personToRemove, 'remove');
        }
    });

    document.getElementById('add-category-button').addEventListener('click', () => {
        const newCategoryInput = document.getElementById('new-category');
        const newCategoryWeight = document.getElementById('new-category-weight').value;
        if (newCategoryInput.value) {
            const newCategory = { name: newCategoryInput.value, weight: parseInt(newCategoryWeight, 10) };
            updateConfigList('categories', newCategory, 'add');
            newCategoryInput.value = '';
        }
    });

    document.getElementById('remove-category-button').addEventListener('click', async () => {
        const categoryNameToRemove = document.getElementById('remove-category-selector').value;
        const categoryToRemove = categories.find(c => c.name === categoryNameToRemove);
        if (categoryToRemove && await showConfirmationModal('Remover Categoria', `Deseja remover ${categoryNameToRemove}?`)) {
            updateConfigList('categories', categoryToRemove, 'remove');
        }
    });

    document.getElementById('add-fcr-category-button').addEventListener('click', () => {
        const newFcrCategoryInput = document.getElementById('new-fcr-category');
        if (newFcrCategoryInput.value) {
            updateConfigList('fcrCategories', { name: newFcrCategoryInput.value, weight: 1 }, 'add');
            newFcrCategoryInput.value = '';
        }
    });

    document.getElementById('remove-fcr-category-button').addEventListener('click', async () => {
        const categoryNameToRemove = document.getElementById('remove-fcr-category-selector').value;
        const categoryToRemove = fcrCategories.find(c => c.name === categoryNameToRemove);
        if (categoryToRemove && await showConfirmationModal('Remover Categoria FCR', `Deseja remover ${categoryNameToRemove}?`)) {
            updateConfigList('fcrCategories', categoryToRemove, 'remove');
        }
    });
    
    document.getElementById('clear-categories-button').addEventListener('click', async () => {
        if (await showConfirmationModal('Limpar Categorias', "Limpar TODAS as categorias de escalonamento? A ação não pode ser desfeita.")) {
            const configRef = doc(db, `/artifacts/${appId}/public/data/config/settings`);
            await updateDoc(configRef, { categories: [] });
            showStatusMessage('Categorias de escalonamento limpas!', 'success');
            loadConfigData();
        }
    });

    document.getElementById('clear-fcr-categories-button').addEventListener('click', async () => {
        if (await showConfirmationModal('Limpar Categorias FCR', "Limpar TODAS as categorias FCR? A ação não pode ser desfeita.")) {
            const configRef = doc(db, `/artifacts/${appId}/public/data/config/settings`);
            await updateDoc(configRef, { fcrCategories: [] });
            showStatusMessage('Categorias FCR limpas!', 'success');
            loadConfigData();
        }
    });

    document.getElementById('new-category-weight').addEventListener('input', (e) => {
        document.getElementById('new-category-weight-label').textContent = e.target.value;
    });

    document.getElementById('reset-button').addEventListener('click', async () => {
        if (await showConfirmationModal('Resetar Pontos', "Resetar TODOS os pontos? A ação não pode ser desfeita.")) {
            showStatusMessage('Resetando dados...', 'info');
            const batch = writeBatch(db);
            const scoresCollection = collection(db, `/artifacts/${appId}/public/data/scores`);
            const fcrScoresCollection = collection(db, `/artifacts/${appId}/public/data/fcr_scores`);
            const [escalonamentoSnapshot, fcrSnapshot] = await Promise.all([getDocs(scoresCollection), getDocs(fcrScoresCollection)]);
            escalonamentoSnapshot.forEach(doc => batch.delete(doc.ref));
            fcrSnapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            showStatusMessage('Todos os pontos foram resetados!', 'success');
        }
    });
}

// --- INICIAR APLICAÇÃO ---
setupEventListeners();
main();
