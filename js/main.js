import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import { getFirestore, doc, onSnapshot, setDoc, writeBatch, collection, getDocs, arrayUnion, updateDoc, getDoc, arrayRemove, addDoc, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-storage.js";

// --- CONFIGURAÇÃO ---
const userFirebaseConfig = {
    apiKey: "AIzaSyBbW6v00XhDIpcE7weG_reOBzTgsgXJXDk",
    authDomain: "avaliacaon1.firebaseapp.com",
    projectId: "avaliacaon1",
    storageBucket: "avaliacaon1.firebasestorage.app",
    messagingSenderId: "18545955185",
    appId: "1:18545955185:web:f617bc54edca4fb65a26d0",
    measurementId: "G-VSNGL56W70"
};

const firebaseConfig = typeof __firebase_config !== 'undefined' && Object.keys(JSON.parse(__firebase_config)).length > 0 ? JSON.parse(__firebase_config) : userFirebaseConfig;
const appId = typeof __app_id !== 'undefined' ? __app_id : firebaseConfig.appId;

// --- ELEMENTOS DO DOM ---
const loadingOverlay = document.getElementById('loading-overlay');
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
let app, db, auth, storage;
let people = []; 
let categories = [];
let fcrCategories = []; 
let allUsers = []; 
let localScores = {};
let localFcrScores = {};
let localReports = [];
let localOMOrders = [];
let localOMOrdersHistoric = [];
let localOMOrdersScheduled = [];
let localNotifications = [];
let modalContext = {};
let agentEvolutionChart, categoryEvolutionChart, fcrVsEscalonadoChart, fcrEscalonadoTrendChart, omReasonChart;
let currentAnalystName = '';
let currentUserId = ''; 
let currentUserRole = '';
let confirmationResolve = null;
let slaTimer = null;

// --- CONFIGURAÇÃO GLOBAL DO CHART.JS PARA TEMA ESCURO ---
Chart.defaults.color = '#CBD5E1'; 
Chart.defaults.borderColor = '#334155';


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

    sidebar.classList.add('-translate-x-full');
    document.getElementById('mobile-menu-overlay').classList.add('hidden');
}

function setupUIForRole(role) {
    sidebar.innerHTML = '';
    const homeIconsContainer = homeScreen.querySelector('.grid');
    homeIconsContainer.innerHTML = '';

    const menuItems = {
        home: { title: 'Início', icon: 'fa-home', roles: ['admin', 'viewer', 'input', 'n1'], page: 'home-screen' },
        n1Dashboard: { title: 'Meus FCRs', icon: 'fa-user-check', roles: ['n1'], page: 'n1-dashboard-page' },
        dashboard: { title: 'Dashboard Geral', icon: 'fa-chart-line', roles: ['admin', 'viewer'], page: 'viewer-content' },
        om: { title: 'O&M', icon: 'fa-truck', roles: ['admin', 'viewer', 'input', 'n1'], page: 'om-page' },
        approveFcr: { title: 'Aprovar FCRs', icon: 'fa-tasks', roles: ['admin'], page: 'approve-fcr-page'},
        register: { title: 'Registros', icon: 'fa-plus-circle', roles: ['admin', 'input', 'n1'], page: 'register-page' },
        reports: { title: 'Reports', icon: 'fa-file-alt', roles: ['admin', 'viewer', 'input', 'n1'], page: 'reports-page' },
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

function showOMSubPage(subpageId) {
    document.querySelectorAll('.om-subpage').forEach(section => section.classList.add('hidden'));
    document.getElementById(subpageId).classList.remove('hidden');

    document.querySelectorAll('.om-subpage-btn').forEach(btn => {
        btn.classList.remove('border-b-2', 'border-indigo-500', 'text-white');
        btn.classList.add('text-slate-400');
        if (btn.dataset.omSubpage === subpageId) {
            btn.classList.add('border-b-2', 'border-indigo-500', 'text-white');
            btn.classList.remove('text-slate-400');
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

function updateActiveFilterDisplay(startDateStr, endDateStr) {
    const indicator = document.getElementById('active-filter-indicator');
    if (startDateStr && endDateStr) {
        const start = new Date(startDateStr + 'T00:00:00');
        const end = new Date(endDateStr + 'T00:00:00');
        const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
        indicator.textContent = `Filtro de data ativo: ${start.toLocaleDateString('pt-BR', options)} até ${end.toLocaleDateString('pt-BR', options)}`;
    } else {
        indicator.textContent = '';
    }
}

// --- INICIALIZAÇÃO ---
async function main() {
    try {
        if (!firebaseConfig || !firebaseConfig.apiKey) throw new Error("Configuração do Firebase ausente.");
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        storage = getStorage(app);
        
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                const userData = await fetchUserData(user.uid);
                if(userData && userData.role) {
                    currentAnalystName = userData.name || user.email;
                    currentUserRole = userData.role;
                    currentUserId = user.uid; 
                    userNameDisplay.textContent = currentAnalystName;
                    
                    await loadAllUsers(); 
                    await loadConfigData();
                    setupReportModal();
                    setupUIForRole(currentUserRole);

                    const today = new Date();
                    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
                    document.getElementById('end-date-filter').valueAsDate = today;
                    document.getElementById('start-date-filter').valueAsDate = firstDayOfMonth;
                    
                    setupFirestoreListener(); 
                    startSlaTimer(); 
                    
                    navigateTo('home-screen', 'Início');
                    showSubPage('summary-page');
                    showOMSubPage('om-active-section');

                    loginScreen.classList.add('hidden');
                    appScreen.classList.remove('hidden');
                    loadingOverlay.classList.add('hidden');
                } else {
                    loginError.textContent = 'Usuário sem permissão. Contate o admin.';
                    await signOut(auth);
                    loadingOverlay.classList.add('hidden');
                }
            } else {
                loginScreen.classList.remove('hidden');
                appScreen.classList.add('hidden');
                loadingOverlay.classList.add('hidden');
            }
        });
    } catch (e) {
        console.error("ERRO FATAL:", e);
        loginError.textContent = `Erro fatal: ${e.message}`;
        loadingOverlay.classList.add('hidden');
    }
}

// --- LÓGICA DE AUTENTICAÇÃO E DADOS ---
async function fetchUserData(uid) {
    const userDocRef = doc(db, "users", uid);
    const userDoc = await getDoc(userDocRef);
    return userDoc.exists() ? userDoc.data() : null;
}

async function loadAllUsers() {
    if (currentUserRole !== 'admin') return;
    const usersCollection = collection(db, "users");
    const usersSnapshot = await getDocs(usersCollection);
    allUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
    populateAgentChartFilter();
    createTotalsGrid();
    if (currentUserRole === 'admin') {
        renderUserAssociationPanel();
    }
}

function setupFirestoreListener() {
    // Scores
    const scoresCollectionRef = collection(db, `/artifacts/${appId}/public/data/scores`);
    onSnapshot(scoresCollectionRef, (querySnapshot) => {
        localScores = {};
        querySnapshot.forEach((doc) => { localScores[doc.id] = doc.data(); });
        filterAndRenderAll();
    }, (error) => console.error("Erro no listener de escalonamento:", error));

    // FCRs
    const fcrCollectionRef = collection(db, `/artifacts/${appId}/public/data/fcr_scores`);
    onSnapshot(fcrCollectionRef, (querySnapshot) => {
        localFcrScores = {};
        querySnapshot.forEach((doc) => { localFcrScores[doc.id] = doc.data(); });
        filterAndRenderAll();
        if (currentUserRole === 'admin') renderFcrApprovalPanel();
        if (currentUserRole === 'n1') renderMyFcrDashboard();
    }, (error) => console.error("Erro no listener de FCR:", error));

    // Reports
    const reportsCollectionRef = collection(db, `/artifacts/${appId}/public/data/reports`);
    onSnapshot(query(reportsCollectionRef), (querySnapshot) => {
        localReports = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data && data.date) {
                localReports.push({ id: doc.id, ...data });
            }
        });
        localReports.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        renderReportsDashboard();
        filterAndRenderAll(); 
    }, (error) => console.error("Erro no listener de reports:", error));

    // O&M - Em Andamento
    const omActiveRef = query(collection(db, `/artifacts/${appId}/public/data/o_and_m_orders`), where("status", "==", "em_andamento"));
    onSnapshot(omActiveRef, (querySnapshot) => {
        localOMOrders = [];
        querySnapshot.forEach((doc) => {
            localOMOrders.push({ id: doc.id, ...doc.data() });
        });
        localOMOrders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        renderActiveOMOrders(localOMOrders);
    }, (error) => console.error("Erro no listener de O&M (Ativas):", error));

    // O&M - Agendadas
    const omScheduledRef = query(collection(db, `/artifacts/${appId}/public/data/o_and_m_orders`), where("status", "==", "agendada"), orderBy("scheduledFor", "asc"));
    onSnapshot(omScheduledRef, (querySnapshot) => {
        localOMOrdersScheduled = [];
        querySnapshot.forEach((doc) => {
            localOMOrdersScheduled.push({ id: doc.id, ...doc.data() });
        });
        renderScheduledOMOrders(localOMOrdersScheduled);
    }, (error) => console.error("Erro no listener de O&M (Agendadas):", error));

    // O&M - Histórico
    const omHistoricRef = query(collection(db, `/artifacts/${appId}/public/data/o_and_m_orders`), where("status", "==", "concluido"), orderBy("completedAt", "desc"), limit(100));
    onSnapshot(omHistoricRef, (querySnapshot) => {
        localOMOrdersHistoric = [];
        querySnapshot.forEach((doc) => {
            localOMOrdersHistoric.push({ id: doc.id, ...doc.data() });
        });
        filterAndRenderOMHistory();
        renderOMMetrics();
    }, (error) => console.error("Erro no listener de O&M (Histórico):", error));

    // Notificações
    const notificationsRef = query(collection(db, `/artifacts/${appId}/public/data/notifications`), orderBy("createdAt", "desc"), limit(20));
    onSnapshot(notificationsRef, (querySnapshot) => {
        localNotifications = [];
        querySnapshot.forEach((doc) => {
            localNotifications.push({ id: doc.id, ...doc.data() });
        });
        renderNotifications(localNotifications);
    }, (error) => console.error("Erro no listener de Notificações:", error));
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
        const protocolEntry = { 
            protocol, 
            date, 
            analystName: currentAnalystName,
            status: 'pendente' 
        };
        await setDoc(fcrScoreRef, { [category]: arrayUnion(protocolEntry) }, { merge: true });
        showStatusMessage(`Protocolo FCR ${protocol} adicionado para ${person}!`, 'success');
    } catch (e) {
        showStatusMessage(`Erro ao salvar FCR: ${e.message}`, 'error');
    }
}

// --- FILTRAGEM, CÁLCULOS E RENDERIZAÇÃO ---
function filterAndRenderAll() {
    const startDate = document.getElementById('start-date-filter').value;
    const endDate = document.getElementById('end-date-filter').value;

    updateActiveFilterDisplay(startDate, endDate);

    const filteredScores = filterScoresByPeriod(localScores, startDate, endDate);
    const filteredFcrScores = filterScoresByPeriod(localFcrScores, startDate, endDate);
    const filteredReports = filterReportsByPeriod(localReports, startDate, endDate);
    const filteredOMs = filterOMsByPeriod(localOMOrdersHistoric, startDate, endDate);
    
    const weights = calculateAllWeights(filteredScores);
    updateTotals(filteredScores, filteredFcrScores, filteredOMs);
    renderIndividualDashboard(filteredScores, weights);
    renderWeightRanking(weights);
    renderAgentEvolutionChart(localScores);
    renderCategoryEvolutionChart(localScores);
    renderFcrVsEscalonadoChart(filteredScores, filteredFcrScores, filteredReports, filteredOMs);
    renderFcrEscalonadoTrendChart(localScores, localFcrScores);
    renderOMMetrics(false); // Renderiza com filtro global
}

function filterScoresByPeriod(scores, startDateStr, endDateStr) {
    if (!startDateStr || !endDateStr) return scores;

    const startNum = parseInt(startDateStr.replace(/-/g, ''), 10);
    const endNum = parseInt(endDateStr.replace(/-/g, ''), 10);

    const filtered = {};
    for (const person in scores) {
        filtered[person] = {};
        for (const category in scores[person]) {
            const categoryData = scores[person][category];
            if (Array.isArray(categoryData)) {
                filtered[person][category] = categoryData.filter(entry => {
                    if (entry && typeof entry === 'object' && entry.date) {
                        const [day, month, year] = entry.date.split('/');
                        const entryNum = parseInt(`${year}${month}${day}`, 10);
                        return entryNum >= startNum && entryNum <= endNum;
                    }
                    return false;
                });
            }
        }
    }
    return filtered;
}

function filterReportsByPeriod(reports, startDateStr, endDateStr) {
    if (!startDateStr || !endDateStr) return reports;

    const startNum = parseInt(startDateStr.replace(/-/g, ''), 10);
    const endNum = parseInt(endDateStr.replace(/-/g, ''), 10);

    return reports.filter(report => {
        if (report && report.date) {
            const [day, month, year] = report.date.split('/');
            const entryNum = parseInt(`${year}${month}${day}`, 10);
            return entryNum >= startNum && entryNum <= endNum;
        }
        return false;
    });
}

function filterOMsByPeriod(orders, startDateStr, endDateStr) {
    if (!startDateStr || !endDateStr) return orders;

    const startNum = parseInt(startDateStr.replace(/-/g, ''), 10);
    const endNum = parseInt(endDateStr.replace(/-/g, ''), 10);

    return orders.filter(order => {
        if (order && order.completedAt) {
            const completedDateStr = order.manualCompletedAt ? order.manualCompletedAt.substring(0, 10) : order.completedAt.substring(0, 10);
            const entryNum = parseInt(completedDateStr.replace(/-/g, ''), 10);
            return entryNum >= startNum && entryNum <= endNum;
        }
        return false;
    });
}


function calculateAllWeights(filteredScores) {
    const personWeights = {};
    people.forEach(personObj => {
        const personName = personObj.name;
        let totalWeight = 0;
        const personData = filteredScores[personName] || {};
        categories.forEach(category => {
            const protocols = personData[category.name] || [];
            totalWeight += protocols.length * category.weight;
        });
        personWeights[personName] = totalWeight;
    });
    return personWeights;
}

function populateSelectors() {
    const personOptions = '<option value="">-- Selecione Pessoa --</option>' + people.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
    ['person-selector', 'register-person-selector', 'register-fcr-person-selector', 'remove-person-selector', 'fcr-vs-escalation-selector', 'om-person-selector'].forEach(id => {
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

function updateTotals(filteredScores, filteredFcrScores, filteredOMs) {
    let maxScore = -1;
    let leadingCategories = [];
    categories.forEach(category => {
        let categoryTotal = people.reduce((sum, personObj) => sum + (filteredScores[personObj.name]?.[category.name]?.length || 0), 0);
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
    let totalFCR = 0;
    Object.values(filteredFcrScores).forEach(personData => {
        Object.values(personData).forEach(categoryProtocols => {
            if (Array.isArray(categoryProtocols)) {
                totalFCR += categoryProtocols.filter(p => p.status === 'aprovado').length;
            }
        });
    });
    document.getElementById('total-protocols-value').textContent = totalEscalonamentos + totalFCR + filteredOMs.length;
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
function populateAgentChartFilter() {
    const container = document.getElementById('agent-chart-filter-container');
    container.innerHTML = '';
    people.forEach(person => {
        const personName = person.name;
        const div = document.createElement('div');
        div.className = 'flex items-center';
        const checkboxId = `agent-filter-${personName.replace(/\s+/g, '-')}`;
        div.innerHTML = `
            <input id="${checkboxId}" type="checkbox" value="${personName}" class="agent-chart-filter-cb h-4 w-4 bg-slate-600 border-slate-500 text-indigo-600 rounded focus:ring-indigo-500">
            <label for="${checkboxId}" class="ml-2 block text-sm text-slate-300">${personName}</label>
        `;
        container.appendChild(div);
    });
    
    document.querySelectorAll('.agent-chart-filter-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            renderAgentEvolutionChart(localScores);
            renderFcrEscalonadoTrendChart(localScores, localFcrScores);
        });
    });
}


function renderAgentEvolutionChart(scores) {
    const ctx = document.getElementById('agent-evolution-chart').getContext('2d');
    if (!ctx) return;

    const selectedAgents = Array.from(document.querySelectorAll('.agent-chart-filter-cb:checked')).map(cb => cb.value);
    const peopleToRender = selectedAgents.length > 0 ? people.filter(p => selectedAgents.includes(p.name)) : people;

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
    twelveMonthsAgo.setDate(1);
    const labels = Array.from({ length: 12 }, (_, i) => {
        const date = new Date(twelveMonthsAgo.getFullYear(), twelveMonthsAgo.getMonth() + i, 1);
        return date.toLocaleString('default', { month: 'short', year: '2-digit' });
    });
    
    const datasets = peopleToRender.map((personObj, index) => {
        const personName = personObj.name;
        const data = new Array(12).fill(0);
        const personScores = scores[personName] || {};
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
        return { label: personName, data, borderColor: colors[index % colors.length], tension: 0.1 };
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
    people.forEach(personObj => {
        const categoryScores = scores[personObj.name]?.[selectedCategory];
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

function renderFcrVsEscalonadoChart(filteredEscalonamentos, filteredFCR, filteredReports, filteredOMs) {
    const selectedPerson = document.getElementById('fcr-vs-escalation-selector').value;
    const ctx = document.getElementById('fcr-vs-escalonado-chart').getContext('2d');
    if (!ctx) return;
    if (fcrVsEscalonadoChart) fcrVsEscalonadoChart.destroy();
    if (!selectedPerson) return;
    
    const escalonamentosCount = Object.values(filteredEscalonamentos[selectedPerson] || {}).reduce((sum, cat) => sum + cat.length, 0);
    
    let fcrCount = 0;
    const personFcrData = filteredFCR[selectedPerson] || {};
    Object.values(personFcrData).forEach(categoryProtocols => {
        if(Array.isArray(categoryProtocols)) {
            fcrCount += categoryProtocols.filter(p => p.status === 'aprovado').length;
        }
    });

    const reportsCount = filteredReports.filter(r => r.personName === selectedPerson).length;
    const omCount = filteredOMs.filter(o => o.personName === selectedPerson).length;

    const data = {
        labels: ['Escalonados', 'FCR (Aprovados)', 'Reports', 'O.S. Concluídas'],
        datasets: [{
            label: `Registros de ${selectedPerson}`,
            data: [escalonamentosCount, fcrCount, reportsCount, omCount],
            backgroundColor: ['#F87171', '#4ADE80', '#60A5FA', '#FBBF24'],
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

    const selectedAgents = Array.from(document.querySelectorAll('.agent-chart-filter-cb:checked')).map(cb => cb.value);
    const peopleToRender = selectedAgents.length > 0 ? people.filter(p => selectedAgents.includes(p.name)) : people;

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

    const processScores = (scoreData, type, peopleList) => {
        peopleList.forEach(personObj => {
            const personData = scoreData[personObj.name] || {};
            Object.values(personData).forEach(categoryData => {
                if (Array.isArray(categoryData)) {
                    categoryData.forEach(entry => {
                        if (type === 'fcr' && entry.status !== 'aprovado') return;
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

    processScores(scores, 'escalonados', peopleToRender);
    processScores(fcrScores, 'fcr', peopleToRender);

    const escalonadosData = Object.values(trendData).map(item => item.escalonados);
    const fcrData = Object.values(trendData).map(item => item.fcr);
    const data = {
        labels,
        datasets: [
            { label: 'Escalonados', data: escalonadosData, borderColor: '#F87171', tension: 0.1, fill: false },
            { label: 'FCR (Aprovados)', data: fcrData, borderColor: '#4ADE80', tension: 0.1, fill: false }
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
    people.forEach(personObj => {
        const protocols = localScores[personObj.name]?.[categoryName] || [];
        protocols.forEach(p => {
            if (p && p.analystName) {
                allProtocols.push({ ...p, person: personObj.name });
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

// --- FUNÇÕES DO PAINEL DE ADMIN ---
function renderFcrApprovalPanel() {
    const approvalList = document.getElementById('fcr-approval-list-page');
    if (!approvalList) return;
    approvalList.innerHTML = '';
    const pendingFcrs = [];

    for (const personName in localFcrScores) {
        for (const categoryName in localFcrScores[personName]) {
            const protocols = localFcrScores[personName][categoryName];
            if (Array.isArray(protocols)) {
                protocols.forEach((protocol, index) => {
                    if (protocol.status === 'pendente') {
                        pendingFcrs.push({ personName, categoryName, protocol, index });
                    }
                });
            }
        }
    }

    if (pendingFcrs.length === 0) {
        approvalList.innerHTML = '<p class="text-center text-slate-400 p-4">Nenhum FCR pendente.</p>';
        return;
    }

    pendingFcrs.forEach(fcr => {
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between p-3 rounded-md bg-slate-700/50';
        item.innerHTML = `
            <div>
                <p class="font-bold text-white">${fcr.protocol.protocol} - ${fcr.personName}</p>
                <p class="text-sm text-slate-400">${fcr.categoryName} por ${fcr.protocol.analystName} em ${fcr.protocol.date}</p>
            </div>
            <div class="flex gap-2">
                <button class="approve-fcr-btn bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded-lg text-sm">Aprovar</button>
                <button class="decline-fcr-btn bg-red-600 hover:bg-red-700 text-white font-bold py-1 px-3 rounded-lg text-sm">Declinar</button>
            </div>
        `;
        item.querySelector('.approve-fcr-btn').addEventListener('click', () => updateFcrStatus(fcr, 'aprovado'));
        item.querySelector('.decline-fcr-btn').addEventListener('click', () => updateFcrStatus(fcr, 'declinado'));
        approvalList.appendChild(item);
    });
}

async function updateFcrStatus(fcr, newStatus) {
    const docRef = doc(db, `/artifacts/${appId}/public/data/fcr_scores/${fcr.personName}`);
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            const protocols = data[fcr.categoryName];
            const protocolIndex = protocols.findIndex(p => p.protocol === fcr.protocol.protocol && p.date === fcr.protocol.date);

            if (protocolIndex !== -1) {
                protocols[protocolIndex].status = newStatus;
                await updateDoc(docRef, { [fcr.categoryName]: protocols });
                showStatusMessage(`FCR ${fcr.protocol.protocol} foi ${newStatus}!`, 'success');
            }
        }
    } catch (error) {
        showStatusMessage(`Erro ao atualizar FCR: ${error.message}`, 'error');
    }
}

function renderUserAssociationPanel() {
    const userSelector = document.getElementById('associate-user-selector');
    const personSelector = document.getElementById('associate-person-selector');

    const n1Users = allUsers.filter(u => u.role === 'n1');
    userSelector.innerHTML = '<option value="">-- Selecione um Usuário N1 --</option>' + 
        n1Users.map(u => `<option value="${u.id}">${u.name}</option>`).join('');

    const unassociatedPeople = people.filter(p => !p.associatedUserId);
    personSelector.innerHTML = '<option value="">-- Selecione uma Pessoa --</option>' +
        unassociatedPeople.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
}

async function associateUserToPerson() {
    const userId = document.getElementById('associate-user-selector').value;
    const personName = document.getElementById('associate-person-selector').value;

    if (!userId || !personName) {
        showStatusMessage('Selecione um usuário e uma pessoa.', 'error');
        return;
    }

    const configRef = doc(db, `/artifacts/${appId}/public/data/config/settings`);
    const updatedPeople = people.map(p => {
        if (p.name === personName) {
            return { ...p, associatedUserId: userId };
        }
        return p;
    });

    try {
        await updateDoc(configRef, { people: updatedPeople });
        showStatusMessage('Usuário associado com sucesso!', 'success');
        await loadConfigData(); 
    } catch (error) {
        showStatusMessage(`Erro ao associar: ${error.message}`, 'error');
    }
}

function setupReportModal() {
    const personSelector = document.getElementById('report-person-selector');
    personSelector.innerHTML = '<option value="">-- Selecione uma Pessoa --</option>' + people.map(p => `<option value="${p.name}">${p.name}</option>`).join('');

    const impactSelector = document.getElementById('report-impact-selector');
    const impacts = [
        { value: 'nulo', label: 'Nulo', color: 'bg-gray-500' },
        { value: 'baixo', label: 'Baixo', color: 'bg-green-500' },
        { value: 'medio', label: 'Médio', color: 'bg-yellow-500' },
        { value: 'alto', label: 'Alto', color: 'bg-red-500' }
    ];
    impactSelector.innerHTML = impacts.map(impact => `
        <div>
            <input type="radio" name="impact" id="impact-${impact.value}" value="${impact.value}" class="hidden peer">
            <label for="impact-${impact.value}" class="px-3 py-1 rounded-full text-sm font-semibold cursor-pointer border-2 border-slate-600 peer-checked:border-transparent peer-checked:text-white ${impact.color}">
                ${impact.label}
            </label>
        </div>
    `).join('');
}

async function saveReport() {
    const content = document.getElementById('report-new-content').value;
    const personName = document.getElementById('report-person-selector').value;
    const impactInput = document.querySelector('input[name="impact"]:checked');
    const protocoloAssociado = document.getElementById('report-protocolo-associado').value;

    if (!content.trim() || !personName || !impactInput) {
        showStatusMessage('Preencha todos os campos do report.', 'error');
        return;
    }
    const impact = impactInput.value;
    
    const fileInput = document.getElementById('report-image-upload');
    const file = fileInput.files[0];
    let imageUrl = "";

    showStatusMessage('Salvando report...', 'info');

    if (file) {
        try {
            const storageRef = ref(storage, `reports/${appId}/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(storageRef, file);
            imageUrl = await getDownloadURL(snapshot.ref);
        } catch (error) {
            showStatusMessage(`Erro no upload da imagem: ${error.message}`, 'error');
            return;
        }
    }
    
    const reportsCollection = collection(db, `/artifacts/${appId}/public/data/reports`);
    const today = new Date();
    const date = `${today.getDate().toString().padStart(2, '0')}/${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getFullYear()}`;

    try {
        await addDoc(reportsCollection, {
            content,
            personName,
            impact,
            protocoloAssociado: protocoloAssociado || "",
            authorName: currentAnalystName,
            authorId: currentUserId,
            date,
            imageUrl: imageUrl
        });
        showStatusMessage('Report salvo com sucesso!', 'success');
        document.getElementById('register-report-modal').classList.add('hidden');
        document.getElementById('report-new-content').value = '';
        document.getElementById('report-person-selector').value = '';
        document.getElementById('report-protocolo-associado').value = '';
        impactInput.checked = false;
        fileInput.value = '';
    } catch (error) {
        showStatusMessage(`Erro ao salvar report: ${error.message}`, 'error');
    }
}

async function updateReport(reportId) {
    const reportRef = doc(db, `/artifacts/${appId}/public/data/reports`, reportId);
    
    const updatedData = {
        content: document.getElementById('report-new-content').value,
        personName: document.getElementById('report-person-selector').value,
        impact: document.querySelector('input[name="impact"]:checked').value,
        protocoloAssociado: document.getElementById('report-protocolo-associado').value || "",
    };

    try {
        await updateDoc(reportRef, updatedData);
        showStatusMessage('Report atualizado com sucesso!', 'success');
        document.getElementById('register-report-modal').classList.add('hidden');
        delete document.getElementById('report-modal-submit-btn').dataset.editingId;
    } catch (error) {
        showStatusMessage(`Erro ao atualizar: ${error.message}`, 'error');
    }
}


function openReportEditModal(report) {
    document.getElementById('report-person-selector').value = report.personName;
    const impactInput = document.querySelector(`input[name="impact"][value="${report.impact}"]`);
    if(impactInput) impactInput.checked = true;
    document.getElementById('report-new-content').value = report.content;
    document.getElementById('report-protocolo-associado').value = report.protocoloAssociado || '';
    
    document.querySelector('#register-report-modal h3').textContent = 'Editar Report';
    const submitBtn = document.getElementById('report-modal-submit-btn');
    submitBtn.textContent = 'Salvar Alterações';
    
    submitBtn.dataset.editingId = report.id;
    
    document.getElementById('report-image-upload').parentElement.classList.add('hidden');

    document.getElementById('register-report-modal').classList.remove('hidden');
}

// --- FUNÇÕES DE RENDERIZAÇÃO DE DASHBOARDS ---

function renderMyFcrDashboard() {
    const container = document.getElementById('n1-fcr-summary');
    if (!container) return;

    const associatedPerson = people.find(p => p.associatedUserId === currentUserId);
    if (!associatedPerson) {
        container.innerHTML = '<p class="text-center text-slate-400 p-4">Seu usuário não está associado a uma pessoa avaliada. Fale com o administrador.</p>';
        return;
    }
    const personName = associatedPerson.name;

    const approvedFcrsByCategory = {};
    const personFcrData = localFcrScores[personName] || {};
    for (const categoryName in personFcrData) {
        const protocols = personFcrData[categoryName];
        if (Array.isArray(protocols)) {
            const approved = protocols.filter(p => p.status === 'aprovado');
            if (approved.length > 0) {
                approvedFcrsByCategory[categoryName] = approved;
            }
        }
    }

    if (Object.keys(approvedFcrsByCategory).length === 0) {
        container.innerHTML = '<p class="text-center text-slate-400 p-4">Você ainda não possui FCRs aprovados.</p>';
        return;
    }

    container.innerHTML = Object.entries(approvedFcrsByCategory).map(([categoryName, protocols]) => {
        const protocolList = protocols.map(p => `<li class="text-slate-300">${p.protocol} - <span class="text-slate-400 text-sm">Registrado por ${p.analystName} em ${p.date}</span></li>`).join('');
        return `
            <div class="p-4 rounded-lg bg-slate-800 border border-slate-700">
                <h3 class="font-bold text-lg text-indigo-400">${categoryName} <span class="text-base font-medium text-white">(${protocols.length})</span></h3>
                <ul class="list-disc list-inside mt-2 space-y-1">${protocolList}</ul>
            </div>
        `;
    }).join('');
}

function getImpactColor(impact) {
    switch (impact) {
        case 'alto': return 'bg-red-500 text-white';
        case 'medio': return 'bg-yellow-500 text-slate-900';
        case 'baixo': return 'bg-green-500 text-white';
        case 'nulo': return 'bg-gray-500 text-white';
        default: return 'bg-slate-600 text-slate-200';
    }
}

function renderReportsDashboard() {
    const container = document.getElementById('reports-list');
    if (!container) return;

    if (localReports.length === 0) {
        container.innerHTML = '<p class="text-center text-slate-400 p-4">Nenhum report registrado.</p>';
        return;
    }

    container.innerHTML = localReports.map(report => {
        const contentHtml = report.content.replace(/\n/g, '<br>');
        
        const adminButtons = currentUserRole === 'admin' ? `
            <div class="flex gap-2">
                <button class="edit-report-btn text-sm text-blue-400 hover:text-blue-300"><i class="fas fa-edit mr-1"></i>Editar</button>
            </div>
        ` : '';

        const imageHtml = report.imageUrl ? `
            <div class="mt-4">
                <a href="${report.imageUrl}" target="_blank" rel="noopener noreferrer">
                    <img src="${report.imageUrl}" alt="Imagem do Report" class="max-w-xs rounded-lg border border-slate-600 hover:opacity-80 transition-opacity">
                </a>
            </div>
        ` : '';

        const protocoloHtml = report.protocoloAssociado ? `<p class="text-sm text-slate-400 mt-2">Protocolo: <span class="font-semibold text-slate-200">${report.protocoloAssociado}</span></p>` : '';

        return `
            <div class="p-4 rounded-lg bg-slate-800 border border-slate-700 report-card" data-report='${JSON.stringify(report)}'>
                <div class="flex justify-between items-start mb-2">
                    <p class="text-sm text-slate-400">Associado a: <span class="font-semibold text-slate-200">${report.personName || 'N/A'}</span></p>
                    <span class="text-xs font-bold uppercase px-2 py-1 rounded-full ${getImpactColor(report.impact)}">${report.impact || 'Sem Impacto'}</span>
                </div>
                <p class="text-slate-300 mt-2">${contentHtml}</p>
                ${protocoloHtml}
                ${imageHtml}
                <div class="flex justify-between items-center mt-3">
                    <p class="text-xs text-slate-500">Registrado por ${report.authorName} em ${report.date}</p>
                    ${adminButtons}
                </div>
            </div>
        `;
    }).join('');
}

// --- Funções de O&M ---

function renderActiveOMOrders(orders) {
    const container = document.getElementById('om-active-list');
    if (!container) return;

    if (orders.length === 0) {
        container.innerHTML = '<p class="text-center text-slate-400 p-4 md:col-span-2 lg:col-span-3">Nenhuma Ordem de Serviço em andamento.</p>';
        return;
    }

    container.innerHTML = orders.map(order => {
        const createdAt = new Date(order.createdAt);
        const formattedDate = `${createdAt.toLocaleDateString('pt-BR')} às ${createdAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

        let appropriationHtml = '';
        if (order.appropriatedBy) {
            let releaseBtn = '';
            if (order.appropriatedById === currentUserId) {
                releaseBtn = `<button class="release-om-btn text-xs text-red-400 hover:text-red-300 ml-2">(Liberar)</button>`;
            }
            appropriationHtml = `
                <div class="mt-3 p-2 bg-slate-700/50 rounded-md text-center">
                    <p class="text-sm font-semibold text-amber-400">
                        <i class="fas fa-user-check mr-2"></i>Em tratativa por: ${order.appropriatedBy} ${releaseBtn}
                    </p>
                </div>
            `;
        } else {
            appropriationHtml = `
                <div class="mt-3">
                    <button class="appropriate-om-btn w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-2 px-3 rounded-lg text-sm">
                        <i class="fas fa-hand-paper mr-1"></i> Apropriar-se
                    </button>
                </div>
            `;
        }

        return `
            <div class="om-card bg-slate-800 border-2 rounded-lg p-4 flex flex-col justify-between" data-order-id="${order.id}" data-created-at="${order.createdAt}" data-appropriated-at="${order.appropriatedAt || ''}">
                <div>
                    <div class="flex justify-between items-start">
                        <h4 class="font-bold text-lg text-indigo-400">${order.motivo}</h4>
                        <div id="sla-30min-warning-${order.id}" class="hidden items-center text-red-400 animate-pulse">
                            <i class="fas fa-exclamation-triangle mr-2"></i>
                            <span class="font-bold text-sm">SLA 30min</span>
                        </div>
                    </div>
                    <p class="text-sm text-slate-300 font-semibold">${order.cliente}</p>
                    <p class="text-xs text-slate-400">${order.endereco}</p>
                    <hr class="my-2 border-slate-600">
                    <p class="text-sm"><span class="font-semibold">PROTOCOLO NOC:</span> ${order.protocoloNoc}</p>
                    <p class="text-sm"><span class="font-semibold">PROTOCOLO OEM:</span> ${order.protocoloOem}</p>
                    ${appropriationHtml}
                </div>
                <div class="mt-4 flex justify-between items-center">
                    <p class="text-xs text-slate-500">Aberto por ${order.createdBy}<br>em ${formattedDate}</p>
                    <button class="complete-om-btn bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-3 rounded-lg text-sm">
                        <i class="fas fa-check-circle mr-1"></i> Marcar como Concluída
                    </button>
                </div>
            </div>
        `;
    }).join('');
    updateSlaStatus();
}

function renderScheduledOMOrders(orders) {
    const container = document.getElementById('om-scheduled-list');
    if (!container) return;

    if (orders.length === 0) {
        container.innerHTML = '<p class="text-center text-slate-400 p-4 md:col-span-2 lg:col-span-3">Nenhuma Ordem de Serviço agendada.</p>';
        return;
    }

    container.innerHTML = orders.map(order => {
        const scheduledDate = new Date(order.scheduledFor + 'T00:00:00').toLocaleDateString('pt-BR');

        return `
            <div class="bg-slate-800 border border-slate-700 rounded-lg p-4 flex flex-col justify-between" data-order-id="${order.id}">
                <div>
                    <div class="flex justify-between items-start">
                        <h4 class="font-bold text-lg text-indigo-400">${order.motivo}</h4>
                        <span class="text-sm font-semibold bg-cyan-600 text-white px-2 py-1 rounded-md">Agendada</span>
                    </div>
                    <p class="text-sm text-slate-300 font-semibold">${order.cliente}</p>
                     <p class="text-sm text-slate-400 font-semibold mt-1">Para: ${scheduledDate}</p>
                    <hr class="my-2 border-slate-600">
                    <p class="text-sm"><span class="font-semibold">PROTOCOLO NOC:</span> ${order.protocoloNoc}</p>
                </div>
                <div class="mt-4 flex justify-between items-center">
                    <p class="text-xs text-slate-500">Criado por ${order.createdBy}</p>
                    <button class="start-om-btn bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-lg text-sm">
                        <i class="fas fa-play-circle mr-1"></i> Iniciar Agora
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function saveOMOrder() {
    const form = document.getElementById('om-form');
    const isScheduled = form.querySelector('#om-schedule-checkbox').checked;
    const scheduledDate = form.querySelector('#om-schedule-date').value;

    if (isScheduled && !scheduledDate) {
        showStatusMessage('Selecione uma data para o agendamento.', 'error');
        return;
    }

    const data = {
        personName: form.querySelector('#om-person-selector').value,
        motivo: form.querySelector('#om-motivo').value.trim(),
        cliente: form.querySelector('#om-cliente').value.trim(),
        endereco: form.querySelector('#om-endereco').value.trim(),
        localizacao: form.querySelector('#om-localizacao').value.trim(),
        data: form.querySelector('#om-data').value,
        horario: form.querySelector('#om-horario').value,
        porta: form.querySelector('#om-porta').value.trim(),
        protocoloNoc: form.querySelector('#om-protocolo-noc').value.trim(),
        protocoloOem: form.querySelector('#om-protocolo-oem').value.trim(),
        obs: form.querySelector('#om-obs').value.trim(),
    };

    if (!data.motivo || !data.cliente || !data.protocoloNoc || !data.personName) {
        showStatusMessage('Preencha os campos Pessoa, Motivo, Cliente e Protocolo NOC.', 'error');
        return;
    }

    const newOrder = {
        ...data,
        status: isScheduled ? 'agendada' : 'em_andamento',
        scheduledFor: isScheduled ? scheduledDate : null,
        createdAt: new Date().toISOString(),
        createdBy: currentAnalystName,
        completedAt: null,
        completedBy: null,
        manualCompletedAt: null,
        appropriatedBy: null,
        appropriatedById: null,
        appropriatedAt: null
    };
    
    try {
        const collectionRef = collection(db, `/artifacts/${appId}/public/data/o_and_m_orders`);
        await addDoc(collectionRef, newOrder);
        document.getElementById('om-modal').classList.add('hidden');
        openOMCopyModal(newOrder);
    } catch (error) {
        showStatusMessage(`Erro ao registrar O.S.: ${error.message}`, 'error');
    }
}

async function startOMOrder(orderId) {
    const confirmed = await showConfirmationModal(
        'Iniciar Ordem de Serviço',
        'Deseja iniciar esta O.S. agora? Ela será movida para a lista "Em Andamento" e o SLA começará a contar.'
    );

    if(confirmed) {
        const orderRef = doc(db, `/artifacts/${appId}/public/data/o_and_m_orders`, orderId);
        try {
            await updateDoc(orderRef, {
                status: 'em_andamento',
                createdAt: new Date().toISOString(),
                scheduledFor: null
            });
            showStatusMessage('O.S. iniciada com sucesso!', 'success');
        } catch (error) {
             showStatusMessage(`Erro ao iniciar O.S.: ${error.message}`, 'error');
        }
    }
}

function openCompleteOMModal(orderId) {
    const modal = document.getElementById('complete-om-modal');
    const confirmBtn = document.getElementById('complete-om-modal-confirm-btn');
    const dateInput = document.getElementById('om-complete-date');
    const timeInput = document.getElementById('om-complete-time');

    const now = new Date();
    dateInput.value = now.toISOString().split('T')[0];
    timeInput.value = now.toTimeString().split(' ')[0].substring(0, 5);
    
    confirmBtn.dataset.orderId = orderId;
    modal.classList.remove('hidden');
}

async function completeOMOrder() {
    const orderId = document.getElementById('complete-om-modal-confirm-btn').dataset.orderId;
    const dateValue = document.getElementById('om-complete-date').value;
    const timeValue = document.getElementById('om-complete-time').value;

    if (!dateValue || !timeValue) {
        showStatusMessage('Por favor, preencha a data e a hora da conclusão.', 'error');
        return;
    }

    const manualTimestamp = new Date(`${dateValue}T${timeValue}`).toISOString();

    const orderRef = doc(db, `/artifacts/${appId}/public/data/o_and_m_orders`, orderId);
    try {
        await updateDoc(orderRef, {
            status: 'concluido',
            completedAt: new Date().toISOString(),
            manualCompletedAt: manualTimestamp,
            completedBy: currentAnalystName
        });
        showStatusMessage('Ordem de Serviço concluída com sucesso!', 'success');
        document.getElementById('complete-om-modal').classList.add('hidden');
    } catch (error) {
        showStatusMessage(`Erro ao concluir O.S.: ${error.message}`, 'error');
    }
}

async function appropriateOMOrder(orderId) {
    const confirmed = await showConfirmationModal(
        'Apropriar-se da O.S.',
        'Você tem certeza? Esta ação registrará que você está tratando esta atividade e iniciará um SLA pessoal de 30 minutos.'
    );
    if (confirmed) {
        const orderRef = doc(db, `/artifacts/${appId}/public/data/o_and_m_orders`, orderId);
        try {
            await updateDoc(orderRef, {
                appropriatedBy: currentAnalystName,
                appropriatedById: currentUserId,
                appropriatedAt: new Date().toISOString()
            });
            showStatusMessage('Você se apropriou da O.S.!', 'success');
        } catch (error) {
            showStatusMessage(`Erro ao apropriar-se: ${error.message}`, 'error');
        }
    }
}

async function releaseOMOrder(orderId) {
    const confirmed = await showConfirmationModal(
        'Liberar O.S.',
        'Tem certeza que deseja liberar esta atividade? Ela voltará para a fila geral.'
    );
    if (confirmed) {
        const orderRef = doc(db, `/artifacts/${appId}/public/data/o_and_m_orders`, orderId);
        try {
            await updateDoc(orderRef, {
                appropriatedBy: null,
                appropriatedById: null,
                appropriatedAt: null
            });
            showStatusMessage('O.S. liberada com sucesso!', 'success');
        } catch (error) {
            showStatusMessage(`Erro ao liberar O.S.: ${error.message}`, 'error');
        }
    }
}


function openOMCopyModal(order) {
    const dateFormatted = order.data ? new Date(order.data + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A';
    const text = `
Solicitação de deslocamento:

Motivo: ${order.motivo}
Cliente: ${order.cliente}
Endereço: ${order.endereco}
Localização: ${order.localizacao}
DATA: ${dateFormatted}
PORTA: ${order.porta}
HORÁRIO: ${order.horario}
PROTOCOLO NOC: ${order.protocoloNoc}
PROTOCOLO OEM: ${order.protocoloOem}
OBS: ${order.obs}
    `.trim();
    
    const textArea = document.getElementById('om-copy-textarea');
    textArea.value = text;
    document.getElementById('om-copy-modal').classList.remove('hidden');
}

function copyOMText() {
    const textArea = document.getElementById('om-copy-textarea');
    textArea.select();
    textArea.setSelectionRange(0, 99999); 
    
    try {
        document.execCommand('copy');
        const copyBtn = document.getElementById('om-copy-btn');
        copyBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Copiado!';
        setTimeout(() => {
            copyBtn.innerHTML = '<i class="fas fa-copy mr-2"></i>Copiar Texto';
        }, 2000);
    } catch (err) {
        showStatusMessage('Erro ao copiar texto.', 'error');
    }
}

function startSlaTimer() {
    if (slaTimer) clearInterval(slaTimer); 
    slaTimer = setInterval(updateSlaStatus, 60000);
}

function updateSlaStatus() {
    const now = new Date();
    localOMOrders.forEach(order => {
        const card = document.querySelector(`.om-card[data-order-id="${order.id}"]`);
        if (!card) return;

        const createdAt = new Date(order.createdAt);
        const diffInMinutes = (now.getTime() - createdAt.getTime()) / 60000;

        card.classList.remove('border-green-500', 'border-yellow-500', 'border-red-500');

        if (diffInMinutes > 240) {
            card.classList.add('border-red-500');
            createSlaNotification(order, 'SLA_4_HORAS');
        } else if (diffInMinutes > 120) {
            card.classList.add('border-yellow-500');
        } else {
            card.classList.add('border-green-500');
        }

        if (order.appropriatedAt) {
            const appropriatedAt = new Date(order.appropriatedAt);
            const diffAppropriatedMinutes = (now.getTime() - appropriatedAt.getTime()) / 60000;
            const warningEl = document.getElementById(`sla-30min-warning-${order.id}`);
            if (warningEl) {
                if (diffAppropriatedMinutes > 30) {
                    warningEl.classList.remove('hidden');
                    warningEl.classList.add('flex');
                    createSlaNotification(order, 'SLA_30_MIN');
                } else {
                    warningEl.classList.add('hidden');
                    warningEl.classList.remove('flex');
                }
            }
        }
    });
}

async function createSlaNotification(order, type) {
    const notificationsRef = collection(db, `/artifacts/${appId}/public/data/notifications`);
    const q = query(notificationsRef, where("orderId", "==", order.id), where("type", "==", type));
    
    try {
        const existingNotif = await getDocs(q);
        if (existingNotif.empty) {
            const message = type === 'SLA_30_MIN' 
                ? `SLA de 30min estourado para a O.S. "${order.motivo}" (Cliente: ${order.cliente}).`
                : `SLA de 4h estourado para a O.S. "${order.motivo}" (Cliente: ${order.cliente}).`;

            await addDoc(notificationsRef, {
                message,
                orderId: order.id,
                type,
                createdAt: new Date().toISOString(),
                readBy: []
            });
        }
    } catch (error) {
        console.error("Erro ao criar notificação:", error);
    }
}

// Funções de Histórico e Métricas de O&M
function filterAndRenderOMHistory() {
    const searchTerm = document.getElementById('om-search-input').value.toLowerCase();
    const dateFilter = document.getElementById('om-history-date-filter').value;
    
    let filteredOrders = localOMOrdersHistoric;

    if (searchTerm) {
        filteredOrders = filteredOrders.filter(order => 
            order.motivo.toLowerCase().includes(searchTerm) ||
            order.cliente.toLowerCase().includes(searchTerm) ||
            order.protocoloNoc.toLowerCase().includes(searchTerm) ||
            (order.protocoloOem && order.protocoloOem.toLowerCase().includes(searchTerm))
        );
    }

    if (dateFilter) {
        const filterDate = new Date(dateFilter + "T00:00:00").toLocaleDateString('pt-BR');
        filteredOrders = filteredOrders.filter(order => {
             const orderDate = new Date(order.createdAt).toLocaleDateString('pt-BR');
             return orderDate === filterDate;
        });
    }
    
    renderHistoricOMOrders(filteredOrders);
}

function renderHistoricOMOrders(orders) {
    const container = document.getElementById('om-historic-list');
    if (!container) return;

    if (orders.length === 0) {
        container.innerHTML = '<p class="text-center text-slate-400 p-4">Nenhum registro encontrado para os filtros selecionados.</p>';
        return;
    }

    container.innerHTML = orders.map(order => {
        const createdAt = new Date(order.createdAt);
        const completedAt = new Date(order.completedAt);
        const durationMs = completedAt.getTime() - createdAt.getTime();
        const durationHours = Math.floor(durationMs / 3600000);
        const durationMinutes = Math.round((durationMs % 3600000) / 60000);
        
        return `
            <div class="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <div class="flex justify-between items-start">
                    <div>
                        <h4 class="font-bold text-lg text-indigo-400">${order.motivo}</h4>
                        <p class="text-sm text-slate-300 font-semibold">${order.cliente}</p>
                    </div>
                    <div class="text-right">
                         <p class="text-sm font-bold text-green-400">Concluída</p>
                         <p class="text-xs text-slate-400">em ${completedAt.toLocaleDateString('pt-BR')}</p>
                    </div>
                </div>
                <hr class="my-2 border-slate-600">
                <p class="text-sm"><span class="font-semibold">PROTOCOLO NOC:</span> ${order.protocoloNoc}</p>
                 <div class="text-xs text-slate-500 mt-3 flex justify-between">
                    <span>Aberto por: ${order.createdBy}</span>
                    <span>Fechado por: ${order.completedBy}</span>
                    <span>Duração: ${durationHours}h ${durationMinutes}m</span>
                </div>
            </div>
        `;
    }).join('');
}


function renderOMMetrics(useDedicatedFilter = true) {
    let startDateStr, endDateStr;

    if (useDedicatedFilter) {
        startDateStr = document.getElementById('om-metrics-start-date').value;
        endDateStr = document.getElementById('om-metrics-end-date').value;
    } else {
        startDateStr = document.getElementById('start-date-filter').value;
        endDateStr = document.getElementById('end-date-filter').value;
    }

    let ordersInPeriod = localOMOrdersHistoric;
    if (startDateStr && endDateStr) {
        const startNum = parseInt(startDateStr.replace(/-/g, ''), 10);
        const endNum = parseInt(endDateStr.replace(/-/g, ''), 10);

        ordersInPeriod = localOMOrdersHistoric.filter(order => {
            if (!order.completedAt) return false;
            const completedDateStr = (order.manualCompletedAt || order.completedAt).substring(0, 10);
            const completedNum = parseInt(completedDateStr.replace(/-/g, ''), 10);
            return completedNum >= startNum && completedNum <= endNum;
        });
    }

    // KPI 1: Total Concluídas
    document.getElementById('om-total-concluidas').textContent = ordersInPeriod.length;

    // KPI 2: Tempo Médio de Conclusão
    if (ordersInPeriod.length > 0) {
        const totalDurationMs = ordersInPeriod.reduce((sum, order) => {
            const duration = new Date(order.manualCompletedAt || order.completedAt).getTime() - new Date(order.createdAt).getTime();
            return sum + duration;
        }, 0);
        const avgMs = totalDurationMs / ordersInPeriod.length;
        const avgHours = Math.floor(avgMs / 3600000);
        const avgMinutes = Math.round((avgMs % 3600000) / 60000);
        document.getElementById('om-avg-time').textContent = `${avgHours}h ${avgMinutes}m`;
    } else {
        document.getElementById('om-avg-time').textContent = '0h 0m';
    }

    // Novos KPIs de SLA
    const sla30minDelays = ordersInPeriod.filter(o => o.appropriatedAt && (new Date(o.manualCompletedAt || o.completedAt).getTime() - new Date(o.appropriatedAt).getTime()) > 30 * 60 * 1000).length;
    const sla4hDelays = ordersInPeriod.filter(o => (new Date(o.manualCompletedAt || o.completedAt).getTime() - new Date(o.createdAt).getTime()) > 4 * 60 * 60 * 1000).length;
    document.getElementById('om-sla-30min-delays').textContent = sla30minDelays;
    document.getElementById('om-sla-4h-delays').textContent = sla4hDelays;


    // Gráfico: O.S. por Motivo
    const reasonCounts = ordersInPeriod.reduce((acc, order) => {
        acc[order.motivo] = (acc[order.motivo] || 0) + 1;
        return acc;
    }, {});
    
    const sortedReasons = Object.entries(reasonCounts).sort(([,a],[,b]) => b-a);
    const labels = sortedReasons.map(item => item[0]);
    const data = sortedReasons.map(item => item[1]);

    const ctx = document.getElementById('om-reason-chart').getContext('2d');
    if(omReasonChart) omReasonChart.destroy();
    omReasonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Nº de Ordens de Serviço',
                data: data,
                backgroundColor: '#4f46e5',
                borderColor: '#818CF8',
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: { legend: { display: false } }
        }
    });
}

function renderNotifications(notifications) {
    const listEl = document.getElementById('notification-list');
    const indicatorEl = document.getElementById('notification-indicator');
    
    const unreadCount = notifications.filter(n => !n.readBy.includes(currentUserId)).length;

    if (unreadCount > 0) {
        indicatorEl.classList.remove('hidden');
    } else {
        indicatorEl.classList.add('hidden');
    }

    if (notifications.length === 0) {
        listEl.innerHTML = '<p class="p-4 text-center text-sm text-slate-400">Nenhuma notificação.</p>';
        return;
    }

    listEl.innerHTML = notifications.map(n => {
        const isRead = n.readBy.includes(currentUserId);
        const createdAt = new Date(n.createdAt);
        const timeAgo = Math.round((new Date() - createdAt) / 60000); // in minutes
        
        return `
            <div class="notification-item p-3 border-b border-slate-700 cursor-pointer ${isRead ? 'opacity-60' : 'bg-indigo-900/50'}" data-id="${n.id}" data-order-id="${n.orderId}">
                <p class="text-sm text-white">${n.message}</p>
                <p class="text-xs text-slate-400 mt-1">${timeAgo} minutos atrás</p>
            </div>
        `;
    }).join('');
}

async function markNotificationAsRead(notificationId) {
    const notifRef = doc(db, `/artifacts/${appId}/public/data/notifications`, notificationId);
    try {
        await updateDoc(notifRef, {
            readBy: arrayUnion(currentUserId)
        });
    } catch (error) {
        console.error("Erro ao marcar notificação como lida:", error);
    }
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
    document.getElementById('custom-time-filter-btn').addEventListener('click', filterAndRenderAll);
    document.getElementById('category-chart-selector').addEventListener('change', () => renderCategoryEvolutionChart(localScores));
    document.getElementById('fcr-vs-escalation-selector').addEventListener('change', filterAndRenderAll);

    document.querySelectorAll('.subpage-btn').forEach(btn => {
        btn.addEventListener('click', () => showSubPage(btn.dataset.subpage));
    });

    document.querySelectorAll('.om-subpage-btn').forEach(btn => {
        btn.addEventListener('click', () => showOMSubPage(btn.dataset.omSubpage));
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

    document.getElementById('open-register-report-modal-btn').addEventListener('click', () => {
        document.querySelector('#register-report-modal h3').textContent = 'Registrar Report de Operação';
        const submitBtn = document.getElementById('report-modal-submit-btn');
        submitBtn.textContent = 'Salvar Report';
        delete submitBtn.dataset.editingId;

        document.getElementById('report-new-content').value = '';
        document.getElementById('report-person-selector').value = '';
        document.getElementById('report-protocolo-associado').value = '';
        const checkedImpact = document.querySelector('input[name="impact"]:checked');
        if(checkedImpact) checkedImpact.checked = false;
        document.getElementById('report-image-upload').value = '';
        document.getElementById('report-image-upload').parentElement.classList.remove('hidden');

        document.getElementById('register-report-modal').classList.remove('hidden');
    });
    document.getElementById('report-modal-cancel-btn').addEventListener('click', () => {
        document.getElementById('register-report-modal').classList.add('hidden');
    });
    
    document.getElementById('report-modal-submit-btn').addEventListener('click', (e) => {
        const reportId = e.target.dataset.editingId;
        if (reportId) {
            updateReport(reportId);
        } else {
            saveReport();
        }
    });

    document.getElementById('reports-list').addEventListener('click', (e) => {
        const editButton = e.target.closest('.edit-report-btn');
        if (editButton) {
            const reportCard = e.target.closest('.report-card');
            const reportData = JSON.parse(reportCard.dataset.report);
            openReportEditModal(reportData);
        }
    });

    // O&M
    document.getElementById('open-om-modal-btn').addEventListener('click', () => {
        document.getElementById('om-form').reset();
        document.getElementById('om-schedule-date-container').classList.add('hidden');
        document.getElementById('om-modal').classList.remove('hidden');
    });
    document.getElementById('om-modal-cancel-btn').addEventListener('click', () => {
        document.getElementById('om-modal').classList.add('hidden');
    });
    document.getElementById('om-modal-submit-btn').addEventListener('click', saveOMOrder);
    document.getElementById('om-copy-btn').addEventListener('click', copyOMText);
    document.getElementById('om-copy-modal-close-btn').addEventListener('click', () => {
        document.getElementById('om-copy-modal').classList.add('hidden');
    });
    document.getElementById('om-schedule-checkbox').addEventListener('change', (e) => {
        document.getElementById('om-schedule-date-container').classList.toggle('hidden', !e.target.checked);
    });
    
    document.getElementById('om-active-list').addEventListener('click', (e) => {
        const completeButton = e.target.closest('.complete-om-btn');
        if (completeButton) {
            const card = e.target.closest('.om-card');
            const orderId = card.dataset.orderId;
            if (orderId) openCompleteOMModal(orderId);
        }

        const appropriateButton = e.target.closest('.appropriate-om-btn');
        if (appropriateButton) {
            const card = e.target.closest('.om-card');
            const orderId = card.dataset.orderId;
            if (orderId) appropriateOMOrder(orderId);
        }

        const releaseButton = e.target.closest('.release-om-btn');
        if (releaseButton) {
            const card = e.target.closest('.om-card');
            const orderId = card.dataset.orderId;
            if (orderId) releaseOMOrder(orderId);
        }
    });

    document.getElementById('complete-om-modal-cancel-btn').addEventListener('click', () => {
        document.getElementById('complete-om-modal').classList.add('hidden');
    });
    document.getElementById('complete-om-modal-confirm-btn').addEventListener('click', completeOMOrder);

    document.getElementById('om-scheduled-list').addEventListener('click', (e) => {
        const startButton = e.target.closest('.start-om-btn');
        if (startButton) {
            const card = e.target.closest('[data-order-id]');
            const orderId = card.dataset.orderId;
            if (orderId) {
                startOMOrder(orderId);
            }
        }
    });
    
    document.getElementById('om-search-input').addEventListener('input', filterAndRenderOMHistory);
    document.getElementById('om-history-date-filter').addEventListener('change', filterAndRenderOMHistory);
    document.getElementById('om-metrics-filter-btn').addEventListener('click', () => renderOMMetrics(true));


    // Mobile Menu
    document.getElementById('hamburger-btn').addEventListener('click', () => {
        sidebar.classList.toggle('-translate-x-full');
        document.getElementById('mobile-menu-overlay').classList.toggle('hidden');
    });
    document.getElementById('mobile-menu-overlay').addEventListener('click', () => {
        sidebar.classList.add('-translate-x-full');
        document.getElementById('mobile-menu-overlay').classList.add('hidden');
    });

    // Notificações
    document.getElementById('notification-bell').addEventListener('click', () => {
        document.getElementById('notification-panel').classList.toggle('hidden');
    });
    document.getElementById('notification-list').addEventListener('click', (e) => {
        const item = e.target.closest('.notification-item');
        if(item) {
            const notifId = item.dataset.id;
            const orderId = item.dataset.orderId;
            markNotificationAsRead(notifId);
            navigateTo('om-page', 'O&M');
            document.getElementById('notification-panel').classList.add('hidden');
        }
    });


    // Admin Panel
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
            await loadAllUsers(); 
            renderUserAssociationPanel(); 
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
            const newPerson = { name: newPersonInput.value, associatedUserId: null };
            updateConfigList('people', newPerson, 'add');
            newPersonInput.value = '';
        }
    });

    document.getElementById('remove-person-button').addEventListener('click', async () => {
        const personNameToRemove = document.getElementById('remove-person-selector').value;
        const personToRemove = people.find(p => p.name === personNameToRemove);
        if (personToRemove && await showConfirmationModal('Remover Pessoa', `Deseja remover ${personNameToRemove}?`)) {
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
        const newFcrCategoryWeight = document.getElementById('new-fcr-category-weight').value;
        if (newFcrCategoryInput.value) {
            const newCategory = { name: newFcrCategoryInput.value, weight: parseInt(newFcrCategoryWeight, 10) };
            updateConfigList('fcrCategories', newCategory, 'add');
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
        if (await showConfirmationModal('Limpar Categorias', "Limpar TODAS as categorias de escalonamento? Ação não pode ser desfeita.")) {
            const configRef = doc(db, `/artifacts/${appId}/public/data/config/settings`);
            await updateDoc(configRef, { categories: [] });
            showStatusMessage('Categorias de escalonamento limpas!', 'success');
            loadConfigData();
        }
    });

    document.getElementById('clear-fcr-categories-button').addEventListener('click', async () => {
        if (await showConfirmationModal('Limpar Categorias FCR', "Limpar TODAS as categorias FCR? Ação não pode ser desfeita.")) {
            const configRef = doc(db, `/artifacts/${appId}/public/data/config/settings`);
            await updateDoc(configRef, { fcrCategories: [] });
            showStatusMessage('Categorias FCR limpas!', 'success');
            loadConfigData();
        }
    });

    document.getElementById('new-category-weight').addEventListener('input', (e) => {
        document.getElementById('new-category-weight-label').textContent = e.target.value;
    });

    document.getElementById('new-fcr-category-weight').addEventListener('input', (e) => {
        document.getElementById('new-fcr-category-weight-label').textContent = e.target.value;
    });

    document.getElementById('reset-button').addEventListener('click', async () => {
        if (await showConfirmationModal('Resetar Pontos', "Resetar TODOS os pontos? Ação não pode ser desfeita.")) {
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

    document.getElementById('associate-button').addEventListener('click', associateUserToPerson);
}

// --- INICIAR APLICAÇÃO ---
setupEventListeners();
main();

