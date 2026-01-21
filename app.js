// App Logic - Uses (db, auth, JOBS_COLLECTION) globals

// State
let jobs = [];
let currentUser = null; // Local copy for app logic
let editingJobId = null; // Track which job is being edited
const TIPOS = ["ROUBO/FURTO", "RECUPERAÇÃO", "VERIFICAÇÃO", "ALARME", "ANTENA", "APOIO"];

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
    initTheme();
    setupForm();
    renderChips();
    setupNav();
    resetFormTime();
    setupEditListeners(); // Init Preview Listeners

    // Global Auth Listener
    auth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            console.log("App: Usuario logado:", user.email);
            if (loginModal) loginModal.style.display = 'none';
            if (appContainer) appContainer.classList.remove('blurred');
            updateUserHeader(user);
            setupRealtimeListener(user);
        } else {
            currentUser = null;
            console.log("App: Usuario deslogado");
            if (loginModal) loginModal.style.display = 'flex';
            if (appContainer) appContainer.classList.add('blurred');
            if (jobsListEl) jobsListEl.innerHTML = '';
            if (historyListEl) historyListEl.innerHTML = '';
        }
    });

    document.getElementById('btn-back-home')?.addEventListener('click', () => {
        document.querySelector('[data-target="form-view"]').click();
    });

    // Logout Handler
    document.getElementById('btn-logout')?.addEventListener('click', () => {
        if (confirm("Deseja realmente sair?")) {
            auth.signOut().then(() => window.location.reload());
        }
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
                const dateA = new Date(a.created_at || 0);
                const dateB = new Date(b.created_at || 0);
                return dateB - dateA; // Descending
            });

            updateCounter();
            renderActiveJobs();
            renderHistory();
            console.log("Data synced!", jobs.length);
        }, (error) => { // Catch errors visibly
            console.error("Error getting documents: ", error);
            if (jobsListEl) jobsListEl.innerHTML = `<p style="color:red; text-align:center; padding:20px;">Erro ao buscar dados: ${error.message}</p>`;
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

function setupForm() {
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
                km_inicial: parseFloat(document.getElementById('km_inicial').value) || null, // Optional
                obs: document.getElementById('obs').value
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
                alert("Serviço atualizado com sucesso!");
                window.cancelEdit();

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
        const card = document.createElement('div');
        card.className = 'job-card';
        card.innerHTML = `
            <div class="job-header">
                <span class="job-title">${job.empresa || 'Sem Empresa'}</span>
                <span class="job-badge" style="background: var(--primary); color: white;">${job.tipo}</span>
            </div>
            <div class="job-details">
                <p><strong>Placa:</strong> ${job.placa || '---'} | ${job.modelo || '---'}</p>
                <p><strong>Início:</strong> ${formatDate(job.data_inicio)} às ${job.hora_inicio}</p>
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
    });
}

function calculateValue(job) {
    if (job.status === 'CANCELADO') return 0;

    let basePrice = 150.00;
    const empresa = (job.empresa || '').toUpperCase();
    const tipo = (job.tipo || '').toUpperCase();
    const totalHoras = parseFloat(job.total_horas) || 0;
    const km = parseFloat(job.km_rodado) || 0;

    if (empresa.includes("RVS")) {
        if (tipo.includes("ROUBO") || tipo.includes("FURTO")) basePrice = 200.00;
        else if (tipo.includes("VERIFICA")) basePrice = 100.00;
    }

    let extraHourCost = 0;
    if (totalHoras > 3) {
        extraHourCost = (totalHoras - 3) * 30;
    }

    let extraKmCost = 0;
    if (km > 50) {
        extraKmCost = (km - 50) * 1.00;
    }

    job.custo_hora_extra = extraHourCost.toFixed(2);
    job.custo_km_extra = extraKmCost.toFixed(2);

    return Math.max(basePrice + extraHourCost + extraKmCost, basePrice + extraKmCost);
}

function renderHistory() {
    if (!historyListEl) return;

    historyListEl.innerHTML = '';
    const finishedJobs = jobs.filter(j => j.status === 'FINALIZADO' || j.status === 'CANCELADO');

    if (finishedJobs.length === 0) {
        historyListEl.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);"><p>Nenhum histórico disponível.</p></div>';
        return;
    }

    finishedJobs.forEach(job => {
        const isPaid = job.pagamento === 'PAGO';
        const isCancelled = job.status === 'CANCELADO';

        const valorServico = parseFloat(job.valor_final || 0);
        const custosExtras = parseFloat(job.custos || 0);
        const totalReceber = valorServico + custosExtras;
        const kmExtra = parseFloat(job.custo_km_extra || 0);

        const card = document.createElement('div');
        card.className = 'job-card';
        if (isCancelled) card.style.opacity = '0.75';

        card.innerHTML = `
            <div class="job-header">
                <span class="job-title">${job.empresa}</span>
                <span class="job-badge" style="background: ${isCancelled ? 'var(--text-muted)' : (isPaid ? 'var(--success)' : 'var(--warning)')}; color: white">
                    ${isCancelled ? 'CANCELADO' : job.pagamento}
                </span>
            </div>
            <div class="job-details">
                <p><strong>Placa:</strong> ${job.placa} | ${job.modelo}</p>
                <div class="job-stats-box">
                    <p style="display:flex; justify-content:space-between;"><span>Tempo (${job.total_horas}h):</span> <span>${parseFloat(job.custo_hora_extra) > 0 ? '+ R$ ' + job.custo_hora_extra : '-'}</span></p>
                    <p style="display:flex; justify-content:space-between;"><span>KM (${job.km_rodado || 0}):</span> <span>${kmExtra > 0 ? '+ R$ ' + kmExtra.toFixed(2) : '-'}</span></p>
                    <p style="display:flex; justify-content:space-between;"><span>Serviço Base:</span> <span>R$ ${(valorServico - kmExtra - parseFloat(job.custo_hora_extra)).toFixed(2)}</span></p>
                    
                    <div style="border-top:1px solid var(--border); margin-top:8px; padding-top:8px;">
                         ${custosExtras > 0 ? `<p style="display:flex; justify-content:space-between; color:var(--danger)"><span>+ Gastos:</span> <span>R$ ${custosExtras.toFixed(2)}</span></p>` : ''}
                        <p style="display:flex; justify-content:space-between; font-weight:800; font-size:1.1em; color:var(--primary);"><span>TOTAL:</span> <span>R$ ${totalReceber.toFixed(2)}</span></p>
                    </div>
                </div>
                <p><small>${formatDate(job.data_inicio)} ${job.hora_inicio} - ${job.hora_fim}</small></p>
                ${job.obs ? `<p style="margin-top:4px; font-style:italic; font-size:0.85em; opacity:0.8;">"${job.obs}"</p>` : ''}
            </div>
            <div style="margin-top:12px; display:flex; gap:10px; flex-wrap:wrap;">
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
    });
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    return `${parts[2]}/${parts[1]}`;
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

        if (isCancelled) alert("Cancelado com sucesso.");
        else alert("Serviço finalizado e salvo na nuvem!");

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
    if (confirm('Apagar este registro DEFINITIVAMENTE do banco de dados?')) {
        try {
            // Compat Syntax
            await db.collection(JOBS_COLLECTION).doc(id).delete();
        } catch (e) {
            alert("Erro ao apagar: " + e.message);
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

    // Handle Chips
    tipoInput.value = job.tipo;
    renderChips(); // Update visual state

    document.getElementById('data_inicio').value = job.data_inicio;
    document.getElementById('hora_inicio').value = job.hora_inicio;
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
