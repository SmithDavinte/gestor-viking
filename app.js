// App Logic - Uses (db, auth, JOBS_COLLECTION) globals

// State
let jobs = [];
let currentUser = null; // Local copy for app logic
let editingJobId = null; // Track which job is being edited
const TIPOS = ["ROUBO/FURTO", "RECUPERAÇÃO", "VERIFICAÇÃO", "ALARME", "ANTENA", "APOIO", "VARREDURA"];

// DOM Elements
const entryForm = document.getElementById('entry-form');
const tipoChipsContainer = document.getElementById('tipo-chips');
const tipoInput = document.getElementById('tipo_acionamento');
const themeToggle = document.getElementById('theme-toggle');
const jobsListEl = document.getElementById('jobs-list');
const historyListEl = document.getElementById('history-list');
const badgeCount = document.getElementById('badge-count');
const loginModal = document.getElementById('login-modal');
const appContainer = document.getElementById('app');
const userDisplay = document.getElementById('user-display');

// Init
document.addEventListener('DOMContentLoaded', () => {
    // Force Persistence LOCAL
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => {
            console.log("Auth Persistence set to LOCAL");
        })
        .catch((error) => {
            console.error("Error setting persistence", error);
        });

    initTheme();
    setupForm();
    renderChips();
    setupNav();
    resetFormTime();
    setupEditListeners();
    setupPaymentToggle(); // Init Payment Toggle

    // Global Auth Listener
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            console.log("App: Usuario logado:", user.email);
            if (loginModal) loginModal.style.display = 'none';
            if (appContainer) appContainer.classList.remove('blurred');
            updateUserHeader(user);
            setupRealtimeListener(user);
            loadSettings(user); // Load Settings on Login
        } else {
            currentUser = null;
            console.log("App: Usuario deslogado");
            if (loginModal) loginModal.style.display = 'flex';
            if (appContainer) appContainer.classList.add('blurred');
            if (jobsListEl) jobsListEl.innerHTML = '';
            if (historyListEl) historyListEl.innerHTML = '';
        }
    });

    // Force Uppercase on Placa
    const placaInput = document.getElementById('placa');
    if (placaInput) {
        placaInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
        });
    }

    const searchHistoryInput = document.getElementById('search-history-placa');
    if (searchHistoryInput) {
        searchHistoryInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
            renderHistory();
        });
    }


    const historyStatusChips = document.querySelectorAll('#history-status-chips .chip');
    if (historyStatusChips.length > 0) {
        historyStatusChips.forEach(chip => {
            chip.addEventListener('click', () => {
                historyStatusChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                renderHistory();
            });
        });
    }

    const filterEmpresaInput = document.getElementById('filter-history-empresa');
    if (filterEmpresaInput) {
        filterEmpresaInput.addEventListener('change', renderHistory);
    }

    document.getElementById('btn-back-home')?.addEventListener('click', () => {
        document.querySelector('[data-target="form-view"]').click();
    });

    // Logout Handler
    document.getElementById('btn-logout')?.addEventListener('click', () => {
        if (confirm("Deseja realmente sair?")) {
            auth.signOut().then(() => window.location.reload());
        }
    });

    // PWA Install Logic
    let deferredPrompt;
    const installBtn = document.getElementById('btn-install-app');

    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = e;
        // Update UI to notify the user they can add to home screen
        if (installBtn) {
            installBtn.style.display = 'block';

            installBtn.addEventListener('click', () => {
                // hide our user interface that shows our A2HS button
                installBtn.style.display = 'none';
                // Show the prompt
                deferredPrompt.prompt();
                // Wait for the user to respond to the prompt
                deferredPrompt.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') {
                        console.log('User accepted the A2HS prompt');
                    } else {
                        console.log('User dismissed the A2HS prompt');
                    }
                    deferredPrompt = null;
                });
            });
        }
    });

    window.addEventListener('appinstalled', (evt) => {
        console.log('a2hs installed');
    });
});

let unsubscribe = null;

function setupRealtimeListener(user) {
    if (unsubscribe) unsubscribe();

    // Query using Globals
    // db.collection().where().orderBy().onSnapshot()

    unsubscribe = db.collection(JOBS_COLLECTION)
        .where("uid", "==", user.uid)
        // .orderBy("created_at", "desc") // Removed to avoid Index requirement
        .onSnapshot((snapshot) => {
            jobs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Client-side Sort
            jobs.sort((a, b) => {
                const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                return (dateB || 0) - (dateA || 0); // Descending
            });

            updateCounter();
            renderActiveJobs();
            renderHistory();
            renderTrash();

            // Diagnostic
            if (historyListEl && jobs.length > 0) {
                const debugDiv = document.createElement('div');
                debugDiv.style = "padding: 5px; font-size: 10px; color: gray; text-align: center; border-top: 1px solid var(--border); margin-top: 10px;";
                debugDiv.innerText = `[Debug Sync] Total: ${jobs.length} | Ativos: ${jobs.filter(j => j.status === 'ATIVO').length} | Finalizados: ${jobs.filter(j => j.status === 'FINALIZADO' || j.status === 'CANCELADO').length}`;
                historyListEl.appendChild(debugDiv);
            }

            console.log("Data synced!", jobs.length);
        }, (error) => { // Catch errors visibly
            console.error("Error getting documents: ", error);
            if (jobsListEl) jobsListEl.innerHTML = `<p style="color:red; text-align:center; padding:20px;">Erro ao buscar dados: ${error.message}</p>`;
            if (historyListEl) historyListEl.innerHTML = `<p style="color:red; text-align:center; padding:20px;">Erro no Banco de Dados: ${error.message}</p>`;
        });
}

function updateUserHeader(user) {
    if (!userDisplay) return;
    const name = user.displayName || user.email.split('@')[0];
    userDisplay.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
            <div style="text-align:right;">
                <p style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">OPERADOR</p>
                <p style="font-size:0.9rem; font-weight:700;">${name}</p>
            </div>
            <button id="btn-logout-header" class="icon-btn" style="width:36px; height:36px; border-color:var(--danger); color:var(--danger);">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            </button>
        </div>
    `;
    document.getElementById('btn-logout-header').addEventListener('click', () => {
        if (confirm("Sair do sistema?")) auth.signOut().then(() => window.location.reload());
    });
}

function initTheme() {
    const isDark = localStorage.getItem('theme') === 'dark' ||
        (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) document.body.setAttribute('data-theme', 'dark');

    themeToggle.addEventListener('click', () => {
        const current = document.body.getAttribute('data-theme');
        const newTheme = current === 'dark' ? 'light' : 'dark';
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
    });
}

function resetFormTime() {
    const now = new Date();
    document.getElementById('data_inicio').valueAsDate = now;
    document.getElementById('hora_inicio').value = now.toTimeString().slice(0, 5);
}

function renderChips() {
    tipoChipsContainer.innerHTML = '';
    TIPOS.forEach(tipo => {
        const chip = document.createElement('div');
        chip.className = `chip ${tipo === tipoInput.value ? 'active' : ''}`;
        chip.textContent = tipo;
        chip.onclick = () => {
            document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            tipoInput.value = tipo;
            updateEditPreview(); // Trigger preview update
        };
        tipoChipsContainer.appendChild(chip);
    });
}

// Pricing Logic
let pricingConfig = {}; // Will be loaded from Firestore
let userProfile = {}; // For PIX key and other profile data

// User Defined Defaults
const STANDARD_DEFAULTS = {
    "ROUBO/FURTO": 150,
    "RECUPERAÇÃO": 150,
    "VERIFICAÇÃO": 100,
    "ALARME": 50,
    "ANTENA": 100,
    "APOIO": 150,
    "VARREDURA": 200,
    "default": 150
};

// Initial Companies with Standard Defaults
const DEFAULT_PRICING = {
    "RVS": { ...STANDARD_DEFAULTS, "ROUBO/FURTO": 200, "VERIFICAÇÃO": 100 }
};

function loadSettings(user) {
    db.collection('users').doc(user.uid).collection('settings').doc('pricing').get()
        .then((doc) => {
            if (doc.exists) {
                pricingConfig = doc.data();
                console.log("Settings loaded", pricingConfig);
            } else {
                pricingConfig = JSON.parse(JSON.stringify(DEFAULT_PRICING));
                console.log("Using default settings");
            }
            renderSettings();
            renderCompanyOptions(); // Update datalist
        }).catch((error) => {
            console.error("Error loading settings:", error);
            pricingConfig = JSON.parse(JSON.stringify(DEFAULT_PRICING));
            renderSettings();
            renderCompanyOptions();
        });

    db.collection('users').doc(user.uid).collection('settings').doc('profile').get()
        .then((doc) => {
            if (doc.exists) {
                userProfile = doc.data();
                const pixInput = document.getElementById('settings-pix-key');
                if (pixInput && userProfile.pix_key) pixInput.value = userProfile.pix_key;
            }
        });
}

function renderCompanyOptions() {
    const list = document.getElementById('empresas-list');
    if (!list) return;
    list.innerHTML = '';
    const companies = Object.keys(pricingConfig).sort();
    companies.forEach(company => {
        const opt = document.createElement('option');
        opt.value = company;
        list.appendChild(opt);
    });
}

window.promptAddCompany = function () {
    const name = prompt("Nome da Nova Empresa:");
    if (name && name.trim().length > 0) {
        addCompany(name.trim());
    }
}

function addCompany(name) {
    if (pricingConfig[name]) {
        alert("Empresa já existe!");
        return;
    }
    // Init with Standard Defaults
    pricingConfig[name] = { ...STANDARD_DEFAULTS };
    renderSettings();
    // Scroll to bottom
    setTimeout(() => {
        const output = document.getElementById('pricing-forms');
        if (output.lastElementChild) output.lastElementChild.scrollIntoView({ behavior: "smooth" });
    }, 100);
}

window.deleteCompany = function (name) {
    if (confirm(`Tem certeza que deseja remover ${name}?`)) {
        delete pricingConfig[name];
        renderSettings();
    }
}

window.saveSettings = function () {
    if (!currentUser) return;
    const btn = document.getElementById('btn-save-settings');
    const status = document.getElementById('settings-status');

    btn.disabled = true;
    btn.textContent = "Salvando...";

    // Scrape Data from DOM to capture edits
    const container = document.getElementById('pricing-forms');
    const companyDivs = container.querySelectorAll('.company-card');

    // We rebuild pricingConfig from the UI to capture value changes
    // But we keep the keys from the UI iteration
    const newConfig = {};

    companyDivs.forEach(div => {
        const company = div.dataset.company;
        newConfig[company] = {};

        // Default
        const defInput = document.getElementById(`price-${company}-default`);
        if (defInput) newConfig[company]['default'] = parseFloat(defInput.value) || 0;

        // Vencimento
        const vencInput = document.getElementById(`price-${company}-vencimento`);
        if (vencInput) newConfig[company]['vencimento'] = vencInput.value;

        // Extra Costs (KM / Hour)
        const kmInput = document.getElementById(`price-${company}-extra-km`);
        const hourInput = document.getElementById(`price-${company}-extra-hour`);

        if (kmInput) newConfig[company]['extra_km'] = parseFloat(kmInput.value); // Allow 0 if explicitly set
        if (hourInput) newConfig[company]['extra_hour'] = parseFloat(hourInput.value);

        // Types
        TIPOS.forEach(tipo => {
            const tInput = document.getElementById(`price-${company}-${tipo}`);
            if (tInput) {
                const val = parseFloat(tInput.value);
                if (!isNaN(val)) newConfig[company][tipo] = val;
            }
        });
    });

    // Check if newConfig is empty (shouldn't happen if UI matches, but just in case fallback to state if UI empty)
    if (Object.keys(newConfig).length === 0 && Object.keys(pricingConfig).length > 0) {
        // Warning: this might mean UI didn't render? Better trust the process but check.
    }

    const pixInput = document.getElementById('settings-pix-key');
    const pixKey = pixInput ? pixInput.value.trim() : '';

    const p1 = db.collection('users').doc(currentUser.uid).collection('settings').doc('pricing').set(newConfig);
    const p2 = db.collection('users').doc(currentUser.uid).collection('settings').doc('profile').set({ pix_key: pixKey });

    Promise.all([p1, p2])
        .then(async () => {
            pricingConfig = newConfig;
            userProfile.pix_key = pixKey;
            status.textContent = "Atualizando histórico...";
            
            const updatePromises = [];
            for (const job of jobs) {
                if (job.status === 'FINALIZADO' || job.status === 'ATIVO') {
                    const tempJob = { ...job };
                    const newVal = calculateValue(tempJob).toFixed(2);
                    
                    if (newVal !== job.valor_final || tempJob.custo_hora_extra !== job.custo_hora_extra || tempJob.custo_km_extra !== job.custo_km_extra) {
                        updatePromises.push(
                            db.collection(JOBS_COLLECTION).doc(job.id).update({
                                valor_final: newVal,
                                custo_hora_extra: tempJob.custo_hora_extra,
                                custo_km_extra: tempJob.custo_km_extra
                            })
                        );
                    }
                }
            }
            
            if (updatePromises.length > 0) {
                await Promise.all(updatePromises);
            }

            renderCompanyOptions(); // Update datalist with new set
            status.textContent = "Configurações e Histórico salvos!";
            status.style.color = "var(--success)";
            setTimeout(() => status.textContent = "", 3000);
        })
        .catch((err) => {
            console.error(err);
            status.textContent = "Erro ao salvar.";
            status.style.color = "var(--danger)";
        })
        .finally(() => {
            btn.disabled = false;
            btn.textContent = "💾 SALVAR CONFIGURAÇÕES";
        });
};

function renderSettings() {
    const container = document.getElementById('pricing-forms');
    if (!container) return;

    container.innerHTML = '';
    const companies = Object.keys(pricingConfig).sort();

    if (companies.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--text-muted)">Nenhuma empresa configurada.</p>';
    }

    companies.forEach(company => {
        const wrapper = document.createElement('div');
        wrapper.className = 'job-card company-card'; // Add identifier class
        wrapper.dataset.company = company;
        wrapper.style.marginBottom = '12px';
        wrapper.style.position = 'relative';

        let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); padding-bottom:8px; margin-bottom:12px;">
            <h4 style="margin:0;">${company}</h4>
            <button class="btn-secondary" style="padding:4px 8px; font-size:0.8rem; color:var(--danger); border-color:var(--danger);" onclick="window.deleteCompany('${company}')">🗑️</button>
        </div>`;

        // Default input
        const currentDefault = (pricingConfig[company] && pricingConfig[company]['default']) ? pricingConfig[company]['default'] : 0;
        const currentVencimento = (pricingConfig[company] && pricingConfig[company]['vencimento']) ? pricingConfig[company]['vencimento'] : '30DIAS';

        // Extra Costs Defaults
        const currentExtraKm = (pricingConfig[company] && pricingConfig[company]['extra_km'] !== undefined) ? pricingConfig[company]['extra_km'] : 1.00;
        const currentExtraHour = (pricingConfig[company] && pricingConfig[company]['extra_hour'] !== undefined) ? pricingConfig[company]['extra_hour'] : 30.00;

        html += `
        <div class="input-group" style="margin-bottom:8px;">
            <label>Regra de Vencimento</label>
            <select id="price-${company}-vencimento">
                <option value="30DIAS" ${currentVencimento === '30DIAS' ? 'selected' : ''}>Padrão (30 Dias)</option>
                <option value="SEXTA" ${currentVencimento === 'SEXTA' ? 'selected' : ''}>Toda Sexta-feira</option>
            </select>
        </div>
        <div class="input-group" style="margin-bottom:8px;">
            <label>Valor Padrão (Base)</label>
            <input type="number" id="price-${company}-default" value="${currentDefault}" placeholder="0.00">
        </div>
        
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-bottom:12px; background:var(--bg-color); padding:8px; border-radius:6px; border:1px dashed var(--border);">
            <div class="input-group">
                <label style="font-size:0.75rem;">KM Extra (R$/km)</label>
                <input type="number" id="price-${company}-extra-km" value="${currentExtraKm}" step="0.10">
            </div>
             <div class="input-group">
                <label style="font-size:0.75rem;">Hora Extra (R$/h)</label>
                <input type="number" id="price-${company}-extra-hour" value="${currentExtraHour}" step="1.00">
            </div>
        </div>
        `;

        // Per Type inputs
        html += `<div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">`;
        TIPOS.forEach(tipo => {
            const currentVal = (pricingConfig[company] && pricingConfig[company][tipo]) ? pricingConfig[company][tipo] : '';
            html += `
            <div class="input-group">
                <label style="font-size:0.8rem;">${tipo}</label>
                <input type="number" id="price-${company}-${tipo}" value="${currentVal}" placeholder="Padrão">
            </div>`;
        });
        html += `</div>`;

        wrapper.innerHTML = html;
        container.appendChild(wrapper);
    });
}


function calculateDueDate() {
    const inputPrazo = document.getElementById('prazo_pagamento');
    const rPrazo = document.querySelector('input[name="pagamento"][value="PRAZO"]');
    if (rPrazo && rPrazo.checked) {
        const empresaName = document.getElementById('empresa').value;
        const config = pricingConfig[empresaName] || {};
        const d = new Date();
        
        if (config.vencimento === 'SEXTA') {
            const day = d.getDay();
            // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
            const diff = (5 - day + 7) % 7;
            d.setDate(d.getDate() + (diff === 0 ? 7 : diff));
        } else {
            d.setDate(d.getDate() + 30);
        }
        inputPrazo.value = d.toISOString().split('T')[0];
    }
}

function setupPaymentToggle() {
    const radios = document.getElementsByName('pagamento');
    const divPrazo = document.getElementById('div-prazo');
    const inputPrazo = document.getElementById('prazo_pagamento');

    radios.forEach(r => {
        r.addEventListener('change', () => {
            if (r.value === 'PRAZO') {
                divPrazo.style.display = 'block';
                // Only calculate if not manually filled or if the user explicitly switches
                if (!inputPrazo.value) {
                    calculateDueDate();
                } else {
                    // Update it to match the current rules if user clicked explicitly
                    calculateDueDate();
                }
            } else {
                divPrazo.style.display = 'none';
                inputPrazo.value = '';
            }
        });
    });

    const empresaInput = document.getElementById('empresa');
    if (empresaInput) {
        empresaInput.addEventListener('change', () => {
            const rPrazo = document.querySelector('input[name="pagamento"][value="PRAZO"]');
            if (rPrazo && rPrazo.checked && divPrazo.style.display !== 'none') {
                calculateDueDate();
            }
        });
    }
}

function setupForm() {
    // Attempt load if already authenticated (mostly for reformats)
    if (currentUser && Object.keys(pricingConfig).length === 0) {
        loadSettings(currentUser);
    }

    entryForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentUser) {
            alert("Você precisa estar logado.");
            return;
        }

        const btn = document.getElementById('btn-submit-job');
        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = editingJobId ? "Atualizando..." : "Salvando...";

        try {
            // Common Data
            const jobData = {
                empresa: document.getElementById('empresa').value,
                pagamento: document.querySelector('input[name="pagamento"]:checked').value,
                tipo: tipoInput.value,
                data_inicio: document.getElementById('data_inicio').value,
                hora_inicio: document.getElementById('hora_inicio').value,
                placa: document.getElementById('placa').value.toUpperCase(),
                modelo: document.getElementById('modelo').value,
                custos: parseFloat(document.getElementById('custos').value) || 0,
                km_inicial: parseFloat(document.getElementById('km_inicial').value) || null,
                obs: document.getElementById('obs').value,
                prazo_pagamento: document.getElementById('prazo_pagamento').value || null // Deadline
            };

            if (editingJobId) {
                // UPDATE LOGIC
                // Check if we need to update calculations (if it was finished)
                const dataFim = document.getElementById('data_fim').value;
                const horaFim = document.getElementById('hora_fim').value;
                const kmFinal = parseFloat(document.getElementById('km_final').value) || 0;

                if (dataFim && horaFim) {
                    // Recalculate
                    const start = new Date(`${jobData.data_inicio}T${jobData.hora_inicio}`);
                    const end = new Date(`${dataFim}T${horaFim}`); // Allows explicit date setting

                    let diffMs = end - start;
                    if (diffMs < 0) diffMs = 0; // Prevent negative
                    const diffHrs = diffMs / (1000 * 60 * 60);

                    jobData.data_fim = dataFim;
                    jobData.hora_fim = horaFim;
                    jobData.total_horas = diffHrs.toFixed(2);
                    jobData.km_rodado = kmFinal;

                    // Recalculate Financials
                    const tempJob = { ...jobData }; // Helper object
                    jobData.valor_final = calculateValue(tempJob).toFixed(2);
                    jobData.custo_hora_extra = tempJob.custo_hora_extra;
                    jobData.custo_km_extra = tempJob.custo_km_extra;
                }

                // Compat Update
                await db.collection(JOBS_COLLECTION).doc(editingJobId).update(jobData);
                // alert("Serviço atualizado com sucesso!"); // REMOVED
                window.cancelEdit();
                document.querySelector('[data-target="active-jobs-view"]').click();

            } else {
                // CREATE LOGIC
                jobData.uid = currentUser.uid;
                jobData.email = currentUser.email;
                jobData.status = 'ATIVO';
                jobData.created_at = new Date().toISOString();

                // Compat Add
                await db.collection(JOBS_COLLECTION).add(jobData);

                entryForm.reset();
                resetFormTime();
                renderChips();
                document.getElementById('custos').value = '';
                document.querySelector('[data-target="active-jobs-view"]').click();
            }

        } catch (error) {
            console.error("Error saving document: ", error);
            alert("Erro ao salvar: " + error.message);
        } finally {
            btn.disabled = false;
            // Only reset text if not editing (because cancelEdit handles reset)
            if (!editingJobId) btn.textContent = originalText;
        }
    });
}

function updateCounter() {
    const activeCount = jobs.filter(j => j.status === 'ATIVO').length;
    if (badgeCount) {
        badgeCount.textContent = activeCount;
        badgeCount.style.display = activeCount > 0 ? 'inline-block' : 'none';
    }
}

function renderActiveJobs() {
    jobsListEl.innerHTML = '';
    const activeJobs = jobs.filter(j => j.status === 'ATIVO');

    if (activeJobs.length === 0) {
        jobsListEl.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);"><p>Nenhum serviço em andamento.</p></div>';
        return;
    }

    activeJobs.forEach(job => {
        try {
            const card = document.createElement('div');
            card.className = 'job-card';
            card.innerHTML = `
                <div class="job-header">
                    <span class="job-title">${job.empresa || 'Sem Empresa'}</span>
                    <span class="job-badge" style="background: var(--primary); color: white;">${job.tipo || ''}</span>
                </div>
                <div class="job-details">
                    <p><strong>Placa:</strong> ${job.placa || '---'} | ${job.modelo || '---'}</p>
                    <p><strong>Início:</strong> ${formatDate(job.data_inicio)} às ${job.hora_inicio || ''}</p>
                    ${job.obs ? `<p class="mt-2 text-sm italic opacity-75">"${job.obs}"</p>` : ''}
                    
                    <div style="margin-top:16px;">
                        <label style="font-size:0.8rem; font-weight:600; color:var(--text-muted); text-transform:uppercase;">
                            ${job.km_inicial ? `KM Final (Início: ${job.km_inicial})` : 'KM Total na Chegada'}
                        </label>
                        <input type="number" id="km-${job.id}" placeholder="${job.km_inicial ? 'Odômetro Chegada' : 'KM Rodados'}" style="margin-top:4px;" value="${job.km_rodado || ''}">
                    </div>
                </div>
                <div style="display:flex; gap:12px; margin-top:16px; flex-wrap:wrap;">
                    <button class="btn-primary" style="margin-top:0; flex:1; background:var(--text-muted); padding:10px;" onclick="window.editJob('${job.id}')">
                        ✏️
                    </button>
                    <button class="btn-primary" style="margin-top:0; flex:2; background:var(--success);" onclick="window.finishJob('${job.id}')">
                        FINALIZAR
                    </button>
                    <button class="btn-secondary" style="margin-top:0; width:auto; border-color:var(--danger); color:var(--danger);" onclick="window.deleteJob('${job.id}')">
                        🗑️
                    </button>
                </div>
            `;
            jobsListEl.appendChild(card);
        } catch (e) {
            console.error("Erro ao renderizar registro ativo", e);
        }
    });
}

function calculateValue(job) {
    if (job.status === 'CANCELADO') return 0;

    const empresa = job.empresa || "";
    const tipo = (job.tipo || '').toUpperCase();
    const totalHoras = parseFloat(job.total_horas) || 0;
    const km = parseFloat(job.km_rodado) || 0;

    let basePrice = 0;
    let extraKmPrice = 1.00; // Legacy default
    let extraHourPrice = 30.00; // Legacy default

    // Dynamic Price Lookup
    if (pricingConfig && pricingConfig[empresa]) {
        // Base Price
        if (pricingConfig[empresa][tipo]) {
            basePrice = pricingConfig[empresa][tipo];
        } else if (pricingConfig[empresa]['default']) {
            basePrice = pricingConfig[empresa]['default'];
        }

        // Extra Costs Config
        if (pricingConfig[empresa]['extra_km'] !== undefined) extraKmPrice = pricingConfig[empresa]['extra_km'];
        if (pricingConfig[empresa]['extra_hour'] !== undefined) extraHourPrice = pricingConfig[empresa]['extra_hour'];
    }

    // Fallback if no config or 0
    if (basePrice === 0) {
        basePrice = 150.00; // Final default
    }

    let extraHourCost = 0;
    if (totalHoras > 3) {
        extraHourCost = (totalHoras - 3) * extraHourPrice;
    }

    let extraKmCost = 0;
    if (km > 50) {
        extraKmCost = (km - 50) * extraKmPrice;
    }

    job.custo_hora_extra = extraHourCost.toFixed(2);
    job.custo_km_extra = extraKmCost.toFixed(2);

    return Math.max(basePrice + extraHourCost + extraKmCost, basePrice + extraKmCost);
}

// Batch Selection State
let selectedJobs = new Set();

function renderHistory() {
    if (!historyListEl) return;

    historyListEl.innerHTML = '';
    const searchPlaca = (document.getElementById('search-history-placa')?.value || '').trim().toUpperCase();
    const filterStatus = document.querySelector('#history-status-chips .chip.active')?.dataset.status || 'TODOS';
    const filterEmpresaInput = document.getElementById('filter-history-empresa');
    const filterEmpresa = filterEmpresaInput?.value || '';
    
    let finishedJobs = jobs.filter(j => j.status === 'FINALIZADO' || j.status === 'CANCELADO');

    // Populate Empresa Dropdown
    const uniqueEmpresas = [...new Set(finishedJobs.map(j => j.empresa).filter(Boolean))].sort();
    if (filterEmpresaInput && filterEmpresaInput.options.length <= 1 && uniqueEmpresas.length > 0) {
        const currentSelection = filterEmpresaInput.value;
        filterEmpresaInput.innerHTML = '<option value="">Todas as Empresas</option>';
        uniqueEmpresas.forEach(emp => {
            const opt = document.createElement('option');
            opt.value = emp;
            opt.textContent = emp;
            filterEmpresaInput.appendChild(opt);
        });
        filterEmpresaInput.value = currentSelection;
    }

    const nowStr = new Date().toISOString().split('T')[0];
    let totalSum = 0;

    finishedJobs = finishedJobs.filter(job => {
        const isPaid = job.pagamento === 'PAGO';
        const isCancelled = job.status === 'CANCELADO';
        
        let isOverdue = false;
        if (job.pagamento === 'PRAZO' && job.prazo_pagamento && !isPaid && !isCancelled) {
            if (nowStr > job.prazo_pagamento) isOverdue = true;
        }
        
        // Cache these so we don't recalculate when sorting
        job._isOverdue = isOverdue;
        job._isPaid = isPaid;
        job._isCancelled = isCancelled;

        if (searchPlaca && !(job.placa || '').toUpperCase().includes(searchPlaca)) return false;
        if (filterEmpresa && job.empresa !== filterEmpresa) return false;

        let keep = true;
        if (filterStatus === 'PENDENTES') {
            keep = !isPaid && !isCancelled;
        } else if (filterStatus === 'ATRASADOS') {
            keep = isOverdue && !isCancelled;
        } else if (filterStatus === 'PAGOS') {
            keep = isPaid && !isCancelled;
        }

        if (keep && !isPaid && !isCancelled) {
            const valorServico = parseFloat(job.valor_final || 0);
            const custosExtras = parseFloat(job.custos || 0);
            totalSum += (valorServico + custosExtras);
        }

        return keep;
    });

    const summaryBox = document.getElementById('history-summary');
    const summaryTotal = document.getElementById('history-summary-total');
    if (summaryBox && summaryTotal) {
        if (filterStatus === 'PENDENTES' || filterStatus === 'ATRASADOS') {
            summaryBox.style.display = 'block';
            summaryTotal.textContent = `R$ ${totalSum.toFixed(2)}`;
        } else {
            summaryBox.style.display = 'none';
        }
    }

    if (finishedJobs.length === 0) {
        historyListEl.innerHTML = `<div style="text-align:center; padding:40px; color:var(--text-muted);"><p>Nenhum serviço encontrado para este filtro.</p></div>`;
        updateBulkActionBar();
        return;
    }

    // Sort: Overdue first, then by date desc
    finishedJobs.sort((a, b) => {
        if (a._isOverdue && !b._isOverdue) return -1;
        if (!a._isOverdue && b._isOverdue) return 1;

        // Default sort by date desc
        const defaultDateA = new Date(0).getTime();
        const dateA = (a.data_inicio && a.hora_inicio) ? new Date(a.data_inicio + 'T' + a.hora_inicio).getTime() : defaultDateA;
        const dateB = (b.data_inicio && b.hora_inicio) ? new Date(b.data_inicio + 'T' + b.hora_inicio).getTime() : defaultDateA;

        return (dateB || defaultDateA) - (dateA || defaultDateA);
    });

    finishedJobs.forEach(job => {
        try {
            const isPaid = job._isPaid;
            const isCancelled = job._isCancelled;
            const isOverdue = job._isOverdue;

            // Check if selected
            const isSelected = selectedJobs.has(job.id);

            const valorServico = parseFloat(job.valor_final || 0);
            const custosExtras = parseFloat(job.custos || 0);
            const totalReceber = valorServico + custosExtras;
            const kmExtra = parseFloat(job.custo_km_extra || 0);

            const card = document.createElement('div');
            card.className = 'job-card';
            if (isCancelled) card.style.opacity = '0.75';

            // RED HIGHLIGHT FOR OVERDUE
            if (isOverdue) {
                card.style.border = "2px solid var(--danger)";
                card.style.backgroundColor = "rgba(255, 77, 77, 0.05)";
            }

            // Highlight if selected
            if (isSelected) {
                card.style.borderColor = "var(--primary)";
                card.style.backgroundColor = "rgba(0, 150, 255, 0.1)";
            }

            const msgButton = isOverdue ? `
                <button class="btn-primary" style="flex:1; background:var(--warning); color:black; padding:10px;" onclick="window.generateCollectionMessage('${job.id}')">
                    📲 COBRAR
                </button>` : '';

            card.innerHTML = `
                <div class="job-header" style="display:flex; align-items:center; gap:10px;">
                    <input type="checkbox" class="job-checkbox" ${isSelected ? 'checked' : ''} onchange="window.toggleSelection('${job.id}')" style="transform:scale(1.5); cursor:pointer;">
                    <div style="flex:1; display:flex; justify-content:space-between; align-items:center;">
                        <span class="job-title">${job.empresa || ''}</span>
                        <span class="job-badge" style="background: ${isCancelled ? 'var(--text-muted)' : (isPaid ? 'var(--success)' : (isOverdue ? 'var(--danger)' : 'var(--warning)'))}; color: white">
                            ${isCancelled ? 'CANCELADO' : (isOverdue ? 'EM ATRASO' : job.pagamento)}
                        </span>
                    </div>
                </div>
                ${isOverdue ? `<p style="color:var(--danger); font-weight:700; font-size:0.85rem; margin-top:4px;">Venceu em: ${formatDate(job.prazo_pagamento)}</p>` : ''}
                <div class="job-details" style="margin-left:28px;"> <!-- Indent slightly for checkbox -->
                    <p><strong>Placa:</strong> ${job.placa || ''} | ${job.modelo || ''}</p>
                    <div class="job-stats-box">
                        <p style="display:flex; justify-content:space-between;"><span>Tempo (${formatDuration(parseFloat(job.total_horas || 0))}):</span> <span>${parseFloat(job.custo_hora_extra || 0) > 0 ? '+ R$ ' + (job.custo_hora_extra || '0') : '-'}</span></p>
                        <p style="display:flex; justify-content:space-between;"><span>KM (${job.km_rodado || 0}):</span> <span>${kmExtra > 0 ? '+ R$ ' + kmExtra.toFixed(2) : '-'}</span></p>
                        <p style="display:flex; justify-content:space-between;"><span>Serviço Base:</span> <span>R$ ${(valorServico - kmExtra - parseFloat(job.custo_hora_extra || 0)).toFixed(2)}</span></p>
                        
                        <div style="border-top:1px solid var(--border); margin-top:8px; padding-top:8px;">
                             ${custosExtras > 0 ? `<p style="display:flex; justify-content:space-between; color:var(--danger)"><span>+ Gastos:</span> <span>R$ ${custosExtras.toFixed(2)}</span></p>` : ''}
                            <p style="display:flex; justify-content:space-between; font-weight:800; font-size:1.1em; color:var(--primary);"><span>TOTAL:</span> <span>R$ ${totalReceber.toFixed(2)}</span></p>
                        </div>
                    </div>
                    <p><small>${formatDate(job.data_inicio)} ${job.hora_inicio || ''} - ${job.hora_fim || ''}</small></p>
                    ${job.obs ? `<p style="margin-top:4px; font-style:italic; font-size:0.85em; opacity:0.8;">"${job.obs}"</p>` : ''}
                </div>
                <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap; margin-left:28px;">
                    ${msgButton}
                    <button class="btn-primary" style="flex:1; background:var(--info); padding:10px;" onclick="window.generateOccurrenceReport('${job.id}')">
                        📋 RELATÓRIO
                    </button>
                    <button class="btn-primary" style="flex:1; background:var(--text-muted); padding:10px;" onclick="window.editJob('${job.id}')">
                        ✏️ EDITAR
                    </button>
                    ${!isCancelled ? `<button class="btn-secondary" style="padding:10px; flex:1;" onclick="window.togglePayment('${job.id}')">
                        ${isPaid ? 'Marcar Pendente' : 'Marcar PAGO'}
                    </button>` : ''}
                    <button class="btn-secondary" style="padding:10px; width:auto; border-color:var(--danger); color:var(--danger);" onclick="window.deleteJob('${job.id}')">
                        🗑️
                    </button>
                </div>
            `;

            historyListEl.appendChild(card);
        } catch (e) {
            console.error("Erro ao renderizar registro de historico", e);
        }
    });

    updateBulkActionBar();
}

window.toggleSelection = function (id) {
    if (selectedJobs.has(id)) {
        selectedJobs.delete(id);
    } else {
        selectedJobs.add(id);
    }
    renderHistory(); // Re-render to show highlight
}

function updateBulkActionBar() {
    const bar = document.getElementById('bulk-actions');
    const countEl = document.getElementById('bulk-count');

    if (!bar) return;

    if (selectedJobs.size > 0) {
        bar.style.display = 'flex';
        countEl.textContent = `${selectedJobs.size} selecionado(s)`;
    } else {
        bar.style.display = 'none';
    }
}

window.markSelectedAsPaid = async function () {
    if (selectedJobs.size === 0) return;
    if (!confirm(`Marcar ${selectedJobs.size} itens como PAGO?`)) return;

    const ids = Array.from(selectedJobs);
    try {
        const promises = ids.map(id => db.collection(JOBS_COLLECTION).doc(id).update({ pagamento: 'PAGO' }));
        await Promise.all(promises);

        selectedJobs.clear();
        renderHistory();
        alert("Itens atualizados para PAGO!");
    } catch (e) {
        alert("Erro ao atualizar em massa: " + e.message);
    }
}

window.deleteSelectedJobs = async function () {
    if (selectedJobs.size === 0) return;
    if (!confirm(`Mover ${selectedJobs.size} itens para a LIXEIRA?`)) return;

    const batch = db.batch(); // Firestore Batch
    // Wait, batch is for writes. update is nice.
    // If we have many, batch limit is 500.

    const ids = Array.from(selectedJobs);

    try {
        const promises = ids.map(id => db.collection(JOBS_COLLECTION).doc(id).update({ status: 'EXCLUIDO' }));
        await Promise.all(promises);

        selectedJobs.clear();
        renderHistory();
        renderTrash(); // Just in case
        alert("Itens movidos para a lixeira!");
    } catch (e) {
        alert("Erro ao excluir em massa: " + e.message);
    }
}

function formatDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return '';
    try {
        const parts = dateStr.split('-');
        if (parts.length >= 3) return `${parts[2]}/${parts[1]}`;
        return dateStr;
    } catch (e) {
        return '';
    }
}

function formatDuration(decimalHours) {
    if (isNaN(decimalHours) || decimalHours === null || decimalHours === undefined) return '0h 00m';
    try {
        const hrs = Math.floor(decimalHours);
        const mins = Math.round((decimalHours - hrs) * 60);
        return `${hrs}h ${mins.toString().padStart(2, '0')}m`;
    } catch (e) {
        return '0h 00m';
    }
}

function setupNav() {
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).style.display = 'block';
            window.scrollTo(0, 0);
        });
    });
}

// Global Actions (Logic unchanged, but safety check)
window.finishJob = async function (id) {
    if (!currentUser) return; // Safety
    try {
        const job = jobs.find(j => j.id === id);
        if (!job) { alert("Serviço não syncado ou não encontrado."); return; }

        const kmInput = document.getElementById(`km-${job.id}`);
        let kmVal = 0;
        let kmFinalVal = null;

        if (kmInput) {
            const rawVal = parseFloat(kmInput.value) || 0;
            if (job.km_inicial) {
                // If we have initial, input is Final KM
                kmFinalVal = rawVal;
                kmVal = rawVal - job.km_inicial;
                if (kmVal < 0) kmVal = 0; // Sanity check
            } else {
                // Otherwise input is Total KM
                kmVal = rawVal;
            }
        }

        const now = new Date();
        const start = new Date(`${job.data_inicio}T${job.hora_inicio}`);
        const end = now;
        let diffMs = end - start;
        if (diffMs < 0) diffMs = 0;
        const diffHrs = diffMs / (1000 * 60 * 60);
        const diffMins = diffMs / (1000 * 60);

        let updates = {
            km_rodado: kmVal,
            km_final: kmFinalVal, // Save final for reference
            data_fim: now.toISOString().split('T')[0], // Sets current date
            hora_fim: now.toTimeString().slice(0, 5),
            total_horas: diffHrs.toFixed(2)
        };

        let isCancelled = false;
        if (diffMins < 10) {
            if (confirm(`Atenção: Serviço durou apenas ${Math.round(diffMins)} minutos.\n\nFoi CANCELAMENTO (Sem custo)?\n[OK] = Sim, Cancelado (R$ 0)\n[Cancelar] = Não, foi Serviço (Cobrar Normal)`)) {
                isCancelled = true;
                updates.status = 'CANCELADO';
            } else {
                updates.status = 'FINALIZADO';
            }
        } else {
            if (!confirm(`Finalizar serviço da placa ${job.placa}?`)) return;
            updates.status = 'FINALIZADO';
        }

        const tempJob = { ...job, ...updates };
        updates.valor_final = calculateValue(tempJob).toFixed(2);
        updates.custo_hora_extra = tempJob.custo_hora_extra;
        updates.custo_km_extra = tempJob.custo_km_extra;

        // Compat Syntax: db.collection().doc().update()
        await db.collection(JOBS_COLLECTION).doc(id).update(updates);

        if (isCancelled) {
            // alert("Cancelado com sucesso."); // Removed user feedback to be faster
        } else {
            // alert("Serviço finalizado e salvo na nuvem!"); // Removed
        }

        // Redirect to History
        document.querySelector('[data-target="history-view"]').click();

    } catch (err) {
        console.error("Error finishing:", err);
        alert("Erro ao finalizar: " + err.message);
    }
};

window.togglePayment = async function (id) {
    const job = jobs.find(j => j.id === id);
    if (!job) return;
    try {
        const newStatus = job.pagamento === 'PAGO' ? 'PENDENTE' : 'PAGO';
        // Compat Syntax
        await db.collection(JOBS_COLLECTION).doc(id).update({ pagamento: newStatus });
    } catch (e) {
        alert("Erro ao atualizar pagamento: " + e.message);
    }
};

window.deleteJob = async function (id) {
    if (confirm('Mover este item para a lixeira? (Ele não aparecerá mais no app, mas ficará salvo no banco)')) {
        try {
            await db.collection(JOBS_COLLECTION).doc(id).update({ status: 'EXCLUIDO' });
        } catch (e) {
            alert("Erro ao remover: " + e.message);
        }
    }
};

window.editJob = function (id) {
    const job = jobs.find(j => j.id === id);
    if (!job) return;

    editingJobId = id;
    const isFinished = job.status === 'FINALIZADO' || job.status === 'CANCELADO';

    // Populate Fields
    document.getElementById('empresa').value = job.empresa;
    // Handle Radio
    const radios = document.getElementsByName('pagamento');
    for (const r of radios) {
        if (r.value === job.pagamento) r.checked = true;
    }

    // Toggle Prazo Visibility based on loaded value
    const divPrazo = document.getElementById('div-prazo');
    if (job.pagamento === 'PRAZO') {
        divPrazo.style.display = 'block';
        document.getElementById('prazo_pagamento').value = job.prazo_pagamento || '';
    } else {
        divPrazo.style.display = 'none';
        document.getElementById('prazo_pagamento').value = '';
    }

    // Handle Chips
    tipoInput.value = job.tipo;
    renderChips(); // Update visual state

    document.getElementById('data_inicio').value = job.data_inicio;
    document.getElementById('data_inicio').removeAttribute('readonly');

    document.getElementById('hora_inicio').value = job.hora_inicio;
    document.getElementById('hora_inicio').removeAttribute('readonly');
    document.getElementById('placa').value = job.placa;
    document.getElementById('modelo').value = job.modelo;
    document.getElementById('custos').value = job.custos || '';
    document.getElementById('km_inicial').value = job.km_inicial || '';
    document.getElementById('obs').value = job.obs || '';

    // Toggle Edit Fields
    const editFields = document.getElementById('edit-fields');
    if (isFinished) {
        editFields.style.display = 'block';
        document.getElementById('data_fim').value = job.data_fim || '';
        document.getElementById('hora_fim').value = job.hora_fim || '';

        // Logic for KM Final vs Total
        const kmLabel = document.querySelector('label[for="km_final"]');
        const kmInput = document.getElementById('km_final');
        if (job.km_inicial) {
            kmLabel.textContent = `KM Final (Início: ${job.km_inicial})`;
            kmInput.placeholder = "Odômetro Final";
            // If creating from finished, km_rodado is total. We try to infer final.
            kmInput.value = job.km_final || (parseFloat(job.km_rodado) + parseFloat(job.km_inicial)) || '';
        } else {
            kmLabel.textContent = "KM Total Rodado";
            kmInput.placeholder = "Total KM";
            kmInput.value = job.km_rodado || '';
        }
    } else {
        editFields.style.display = 'none';
        document.getElementById('data_fim').value = '';
        document.getElementById('hora_fim').value = '';
        document.getElementById('km_final').value = '';
    }

    // Change Button Text
    const btn = document.getElementById('btn-submit-job');
    btn.textContent = "ATUALIZAR SERVIÇO";
    btn.classList.add('btn-warning');

    // Switch View
    document.querySelector('[data-target="form-view"]').click();
    window.scrollTo(0, 0);

    // Show Cancel Button (Dynamic creation)
    let cancelBtn = document.getElementById('btn-cancel-edit');
    if (!cancelBtn) {
        cancelBtn = document.createElement('button');
        cancelBtn.id = 'btn-cancel-edit';
        cancelBtn.type = 'button';
        cancelBtn.textContent = "CANCELAR EDIÇÃO";
        cancelBtn.className = "btn-secondary";
        cancelBtn.style.marginTop = "10px";
        cancelBtn.style.color = "var(--text-muted)";
        cancelBtn.style.borderColor = "var(--border)";
        cancelBtn.onclick = window.cancelEdit;
        entryForm.appendChild(cancelBtn);
    }
    cancelBtn.style.display = 'block';
};

window.cancelEdit = function () {
    editingJobId = null;
    entryForm.reset();
    resetFormTime();
    renderChips();
    document.getElementById('edit-fields').style.display = 'none';

    const btn = document.getElementById('btn-submit-job');
    btn.textContent = "INICIAR SERVIÇO";
    btn.classList.remove('btn-warning');

    const cancelBtn = document.getElementById('btn-cancel-edit');
    if (cancelBtn) cancelBtn.style.display = 'none';

    // Reset Prazo
    document.getElementById('div-prazo').style.display = 'none';
};

// LIVE PREVIEW LOGIC
function setupEditListeners() {
    const inputs = [
        'data_inicio', 'hora_inicio', 'data_fim', 'hora_fim',
        'km_final', 'custos', 'empresa', 'tipo_acionamento', 'placa', 'modelo'
    ];

    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updateEditPreview);
            el.addEventListener('change', updateEditPreview);
        }
    });
}

function updateEditPreview() {
    if (!editingJobId) return;

    const startD = document.getElementById('data_inicio').value;
    const startT = document.getElementById('hora_inicio').value;
    const endD = document.getElementById('data_fim').value;
    const endT = document.getElementById('hora_fim').value;
    const kmF = parseFloat(document.getElementById('km_final').value) || 0;
    const kmI = parseFloat(document.getElementById('km_inicial').value) || 0;

    if (!startD || !startT || !endD || !endT) {
        document.getElementById('edit-preview').style.display = 'none';
        return;
    }

    const start = new Date(`${startD}T${startT}`);
    const end = new Date(`${endD}T${endT}`);

    let diffMs = end - start;
    if (diffMs < 0) diffMs = 0;
    const diffHrs = diffMs / (1000 * 60 * 60);

    // Calculate effective KM
    let effectiveKm = kmF;
    if (kmI > 0) {
        effectiveKm = kmF - kmI;
        if (effectiveKm < 0) effectiveKm = 0;
    }

    const tempJob = {
        empresa: document.getElementById('empresa').value,
        tipo: tipoInput.value,
        total_horas: diffHrs.toFixed(2),
        km_rodado: effectiveKm,
        custos: parseFloat(document.getElementById('custos').value) || 0
    };

    const newVal = calculateValue(tempJob);

    const previewBox = document.getElementById('edit-preview');
    const previewText = document.getElementById('preview-val-text');
    previewBox.style.display = 'block';

    previewText.textContent = `R$ ${newVal.toFixed(2)}`;
    previewText.style.color = newVal === 0 ? 'var(--text-muted)' : 'var(--success)';
}

window.generateCollectionMessage = function (id) {
    const job = jobs.find(j => j.id === id);
    if (!job) return;

    const valorServico = parseFloat(job.valor_final || 0);
    const custosExtras = parseFloat(job.custos || 0);
    const total = (valorServico + custosExtras).toFixed(2);
    const vencimento = formatDate(job.prazo_pagamento);

    // Greeting based on time of day
    const hour = new Date().getHours();
    let greeting = 'Bom dia';
    if (hour >= 18) greeting = 'Boa noite';

    const durationStr = formatDuration(parseFloat(job.total_horas || 0));

    let msg = `${greeting}, tudo bem?
Passando para lembrar do pagamento referente ao serviço da placa *${job.placa}* (${job.modelo}).

📅 Data: ${formatDate(job.data_inicio)}
⏰ Horário: ${job.hora_inicio} às ${job.hora_fim} (${durationStr})
${custosExtras > 0 ? `\n💰 Serviço: R$ ${valorServico.toFixed(2)}\n📝 Custos Extras: R$ ${custosExtras.toFixed(2)}` : ''}
💲 *Valor Total: R$ ${total}*
⚠️ Vencimento: *${vencimento}*`;

    if (userProfile && userProfile.pix_key) {
        msg += `\n\n🔑 *Chave PIX:* ${userProfile.pix_key}`;
    }

    msg += `\n\nEstou à disposição caso precise de algo. Obrigado!`;

    try {
        const encodedMsg = encodeURIComponent(msg);
        window.open(`https://wa.me/?text=${encodedMsg}`, '_blank');
    } catch (err) {
        navigator.clipboard.writeText(msg);
        alert('Mensagem copiada para a área de transferência!');
    }
};

window.generateOccurrenceReport = function (id) {
    const job = jobs.find(j => j.id === id);
    if (!job) return;

    const durationStr = formatDuration(parseFloat(job.total_horas || 0));
    const valorServico = parseFloat(job.valor_final || 0);
    const custosExtras = parseFloat(job.custos || 0);
    const total = (valorServico + custosExtras).toFixed(2);

    // Greeting based on time of day
    const hour = new Date().getHours();
    let greeting = 'Bom dia';
    if (hour >= 18) greeting = 'Boa noite';

    let msg = `🧾 *RELATÓRIO DE OCORRÊNCIA*

📅 Data: ${formatDate(job.data_inicio)}
🚗 Veículo: *${job.modelo}*
🔢 Placa: *${job.placa}*
🔧 Tipo: ${job.tipo}
⏰ Horário: ${job.hora_inicio} às ${job.hora_fim} (${durationStr})

💰 Serviço: R$ ${valorServico.toFixed(2)}
${custosExtras > 0 ? `📝 Custos Extras: R$ ${custosExtras.toFixed(2)}\n` : ''}💲 *TOTAL: R$ ${total}*

📝 Observações:
${job.obs ? job.obs : 'Sem ocorrências adicionais.'}

-----------------------------------
Operador: ${currentUser ? (currentUser.displayName || currentUser.email.split('@')[0]) : 'Sistema'}
`;

    if (userProfile && userProfile.pix_key) {
        msg += `🔑 Chave PIX: ${userProfile.pix_key}\n`;
    }

    try {
        const encodedMsg = encodeURIComponent(msg);
        window.open(`https://wa.me/?text=${encodedMsg}`, '_blank');
    } catch (err) {
        navigator.clipboard.writeText(msg);
        alert('Relatório copiado para a área de transferência!');
    }
};

window.copyPix = function () {
    const key = document.getElementById('pix-key');
    if (!key) return;
    key.select();
    key.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(key.value).then(() => {
        alert("Chave PIX copiada! Obrigado pelo apoio! 👊");
    }).catch(err => {
        prompt("Copie a chave:", key.value);
    });
};

window.generateReport = function () {
    const monthInput = document.getElementById('report-month');
    if (!monthInput || !monthInput.value) {
        alert("Selecione um mês para gerar o relatório.");
        return;
    }

    const [year, month] = monthInput.value.split('-'); // YYYY-MM

    // Filter Jobs (Only Finished/Cancelled/Active?) - Usually history is Finished
    const reportJobs = jobs.filter(j => {
        // Use data_inicio for filtering
        if (!j.data_inicio) return false;
        const jobDate = j.data_inicio.split('-'); // YYYY-MM-DD
        return jobDate[0] === year && jobDate[1] === month && (j.status === 'FINALIZADO' || j.status === 'ATIVO' || j.status === 'CANCELADO');
    });

    if (reportJobs.length === 0) {
        alert("Nenhum serviço encontrado neste mês.");
        return;
    }

    // Sort by date
    reportJobs.sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));

    let totalRevenue = 0;
    let totalCount = reportJobs.length;
    let text = `📊 *RELATÓRIO MENSAL - ${month}/${year}*\n\n`;

    reportJobs.forEach(job => {
        const valor = parseFloat(job.valor_final || 0) + parseFloat(job.custos || 0);
        if (job.status !== 'CANCELADO') totalRevenue += valor;

        const dateParts = job.data_inicio.split('-');
        const dateBr = `${dateParts[2]}/${dateParts[1]}`;

        let icon = '✅';
        if (job.status === 'ATIVO') icon = '⏳';
        if (job.status === 'CANCELADO') icon = '🚫';

        text += `${icon} ${dateBr} - *${job.placa}* - ${job.empresa}\n`;
        text += `   R$ ${valor.toFixed(2)} (${job.status})\n`;
    });

    text += `\n-----------------------------------\n`;
    text += `📝 *Total Serviços:* ${totalCount}\n`;
    text += `💰 *Faturamento:* R$ ${totalRevenue.toFixed(2)}\n`;

    navigator.clipboard.writeText(text).then(() => {
        alert("Relatório copiado! Cole no WhatsApp ou Email.");
    }).catch(err => {
        console.error(err);
        prompt("Copie o relatório:", text);
    });
};

window.exportToExcel = function() {
    const monthInput = document.getElementById('report-month');
    if (!monthInput || !monthInput.value) {
        alert("Selecione um mês para exportar.");
        return;
    }
    const [year, month] = monthInput.value.split('-');

    const reportJobs = jobs.filter(j => {
        if (!j.data_inicio) return false;
        const jobDate = j.data_inicio.split('-');
        return jobDate[0] === year && jobDate[1] === month && (j.status === 'FINALIZADO' || j.status === 'ATIVO' || j.status === 'CANCELADO');
    });

    if (reportJobs.length === 0) {
        alert("Nenhum serviço encontrado neste mês.");
        return;
    }

    reportJobs.sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));

    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Data,Placa,Modelo,Empresa,Tipo,Tempo,KM Extra,Valor Servico,Custos Extras,Total,Status,Pagamento\n";

    reportJobs.forEach(job => {
        const data = formatDate(job.data_inicio);
        const placa = job.placa || '';
        const modelo = job.modelo || '';
        const empresa = job.empresa || '';
        const tipo = job.tipo || '';
        const tempo = formatDuration(parseFloat(job.total_horas || 0));
        const kmExtra = parseFloat(job.custo_km_extra || 0).toFixed(2);
        const valorServico = parseFloat(job.valor_final || 0).toFixed(2);
        const custos = parseFloat(job.custos || 0).toFixed(2);
        const total = (parseFloat(valorServico) + parseFloat(custos)).toFixed(2);
        const status = job.status || '';
        const pag = job.pagamento || '';

        const row = `"${data}","${placa}","${modelo}","${empresa}","${tipo}","${tempo}","${kmExtra}","${valorServico}","${custos}","${total}","${status}","${pag}"`;
        csvContent += row + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Relatorio_${month}_${year}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

window.exportToPDF = function() {
    const monthInput = document.getElementById('report-month');
    if (!monthInput || !monthInput.value) {
        alert("Selecione um mês para exportar.");
        return;
    }
    const [year, month] = monthInput.value.split('-');

    const reportJobs = jobs.filter(j => {
        if (!j.data_inicio) return false;
        const jobDate = j.data_inicio.split('-');
        return jobDate[0] === year && jobDate[1] === month && (j.status === 'FINALIZADO' || j.status === 'ATIVO' || j.status === 'CANCELADO');
    });

    if (reportJobs.length === 0) {
        alert("Nenhum serviço encontrado neste mês.");
        return;
    }

    reportJobs.sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));

    let totalRevenue = 0;
    let html = `
        <html>
        <head>
            <title>Relatório Mensal - ${month}/${year}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
                h1 { text-align: center; color: #2c3e50; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                th { background-color: #f4f4f4; }
                .total { font-weight: bold; font-size: 1.2em; text-align: right; margin-top: 20px; }
                @media print {
                    @page { margin: 1cm; }
                }
            </style>
        </head>
        <body>
            <h1>Relatório de Serviços - ${month}/${year}</h1>
            <p><strong>Gerado em:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>
            <table>
                <thead>
                    <tr>
                        <th>Data</th>
                        <th>Placa</th>
                        <th>Empresa</th>
                        <th>Tipo</th>
                        <th>Valor (R$)</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
    `;

    reportJobs.forEach(job => {
        const valor = parseFloat(job.valor_final || 0) + parseFloat(job.custos || 0);
        if (job.status !== 'CANCELADO') totalRevenue += valor;
        const dataStr = formatDate(job.data_inicio);

        html += `
            <tr>
                <td>${dataStr}</td>
                <td>${job.placa || ''}</td>
                <td>${job.empresa || ''}</td>
                <td>${job.tipo || ''}</td>
                <td>${valor.toFixed(2)}</td>
                <td>${job.status}</td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
            <div class="total">Faturamento Total: R$ ${totalRevenue.toFixed(2)}</div>
        </body>
        </html>
    `;

    const printWin = window.open('', '_blank');
    printWin.document.write(html);
    printWin.document.close();
    printWin.focus();
    setTimeout(() => {
        printWin.print();
    }, 250);
};


window.deleteJob = async function (id) {
    if (!confirm("Mover este registro para a LIXEIRA? \n(Você poderá restaurá-lo depois)")) return;
    try {
        await db.collection(JOBS_COLLECTION).doc(id).update({ status: 'EXCLUIDO' });
        // alert("Movido para a lixeira."); // User sees UI update, maybe no alert needed or toast? keeping it simple
    } catch (e) {
        alert("Erro ao excluir: " + e.message);
    }
};


// Trash Selection State
let selectedTrashJobs = new Set();

function renderTrash() {
    const trashListEl = document.getElementById('trash-list');
    if (!trashListEl) return;

    trashListEl.innerHTML = '';
    const trashedJobs = jobs.filter(j => j.status === 'EXCLUIDO');

    if (trashedJobs.length === 0) {
        trashListEl.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);"><p>A lixeira está vazia.</p></div>';
        updateTrashBulkActionBar();
        return;
    }

    // Sort by most recent
    trashedJobs.sort((a, b) => {
        const defaultDate = new Date(0).getTime();
        const dateA = (a.data_inicio && a.hora_inicio) ? new Date(a.data_inicio + 'T' + a.hora_inicio).getTime() : defaultDate;
        const dateB = (b.data_inicio && b.hora_inicio) ? new Date(b.data_inicio + 'T' + b.hora_inicio).getTime() : defaultDate;
        return (dateB || defaultDate) - (dateA || defaultDate);
    });

    trashedJobs.forEach(job => {
        try {
            const isSelected = selectedTrashJobs.has(job.id);

            const card = document.createElement('div');
            card.className = 'job-card';
            card.style.opacity = '0.7';
            card.style.border = '1px solid var(--border)';

            if (isSelected) {
                card.style.borderColor = "var(--primary)";
                card.style.backgroundColor = "rgba(0, 150, 255, 0.1)";
            }

            card.innerHTML = `
                <div class="job-header" style="display:flex; align-items:center; gap:10px;">
                    <input type="checkbox" class="job-checkbox" ${isSelected ? 'checked' : ''} onchange="window.toggleTrashSelection('${job.id}')" style="transform:scale(1.5); cursor:pointer;">
                    <div style="flex:1; display:flex; justify-content:space-between; align-items:center;">
                        <span class="job-title" style="text-decoration:line-through;">${job.empresa || ''}</span>
                        <span class="job-badge" style="background:var(--text-muted);">EXCLUÍDO</span>
                    </div>
                </div>

                <div class="job-details" style="margin-left:28px;">
                    <p><strong>Placa:</strong> ${job.placa || ''} | Data: ${formatDate(job.data_inicio)}</p>
                    <div style="margin-top:12px; display:flex; gap:10px;">
                         <button class="btn-primary" style="flex:1; background:var(--success);" onclick="window.restoreJob('${job.id}')">
                            ♻️ RESTAURAR
                        </button>
                        <button class="btn-secondary" style="flex:1; border-color:var(--danger); color:var(--danger);" onclick="window.permanentDeleteJob('${job.id}')">
                            ❌ APAGAR
                        </button>
                    </div>
                </div>
            `;
            trashListEl.appendChild(card);
        } catch (e) {
            console.error("Erro ao renderizar registro na lixeira", e);
        }
    });

    updateTrashBulkActionBar();
}

window.toggleTrashSelection = function (id) {
    if (selectedTrashJobs.has(id)) {
        selectedTrashJobs.delete(id);
    } else {
        selectedTrashJobs.add(id);
    }
    renderTrash();
};

function updateTrashBulkActionBar() {
    const bar = document.getElementById('trash-bulk-actions');
    const countEl = document.getElementById('trash-bulk-count');

    if (!bar) return;

    if (selectedTrashJobs.size > 0) {
        bar.style.display = 'flex';
        countEl.textContent = `${selectedTrashJobs.size} sel.`;
    } else {
        bar.style.display = 'none';
    }
}

window.restoreSelectedTrash = async function () {
    if (selectedTrashJobs.size === 0) return;
    if (!confirm(`Restaurar ${selectedTrashJobs.size} itens para o Histórico?`)) return;

    const ids = Array.from(selectedTrashJobs);
    try {
        const promises = ids.map(id => db.collection(JOBS_COLLECTION).doc(id).update({ status: 'FINALIZADO' }));
        await Promise.all(promises);

        selectedTrashJobs.clear();
        renderTrash();
        renderHistory();
        alert("Itens restaurados!");
    } catch (e) {
        alert("Erro ao restaurar: " + e.message);
    }
};

window.forceUpdateSystem = async function () {
    if (!confirm("Isso vai limpar o cache e RECARREGAR o sistema para a versão mais recente.\n\nFique tranquilo: Suas ocorrências estão salvas na nuvem e NÃO serão apagadas.\n\nDeseja continuar?")) return;

    try {
        // Unregister SW
        if ('serviceWorker' in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                await registration.unregister();
            }
        }

        // Clear Caches
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
        }

        alert("Cache limpo! O sistema será reiniciado.");
        window.location.reload(true);
    } catch (e) {
        alert("Erro ao limpar cache: " + e.message);
        window.location.reload();
    }
};

window.deleteSelectedTrash = async function () {
    if (selectedTrashJobs.size === 0) return;
    if (!confirm(`⚠️ APAGAR DEFINITIVAMENTE ${selectedTrashJobs.size} itens?\n\nEssa ação não tem volta!`)) return;

    const ids = Array.from(selectedTrashJobs);
    try {
        const promises = ids.map(id => db.collection(JOBS_COLLECTION).doc(id).delete());
        await Promise.all(promises);

        selectedTrashJobs.clear();
        renderTrash();
        alert("Itens apagados para sempre.");
    } catch (e) {
        alert("Erro ao apagar: " + e.message);
    }
};


window.restoreJob = async function (id) {
    if (!confirm("Restaurar este serviço para o Histórico?")) return;
    try {
        // Default to finished, or maybe active? Assuming finished is safer.
        await db.collection(JOBS_COLLECTION).doc(id).update({ status: 'FINALIZADO' });
        alert("Restaurado com sucesso!");
    } catch (e) {
        alert("Erro ao restaurar: " + e.message);
    }
};

window.permanentDeleteJob = async function (id) {
    if (!confirm("⚠️ ATENÇÃO: Isso apagará o registro PARA SEMPRE. Não tem volta.\n\nTem certeza?")) return;
    try {
        await db.collection(JOBS_COLLECTION).doc(id).delete();
        alert("Apagado definitivamente.");
    } catch (e) {
        alert("Erro ao apagar: " + e.message);
    }
}
