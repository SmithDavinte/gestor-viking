import { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, updateProfile, onAuthStateChanged } from './firebase-config.js';

export let currentUser = null;

export function initAuth(onLoginSuccess) {
    // 1. Safe DOM Elements (Wait for function call which is inside DOMContentLoaded)
    const loginModal = document.getElementById('login-modal');
    const loginForm = document.getElementById('login-form');
    const userDisplay = document.getElementById('user-display');
    const appContainer = document.getElementById('app');

    // 2. Listen for Auth State Changes
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            console.log("Usuario logado:", user.email);
            if (loginModal) loginModal.style.display = 'none';
            if (appContainer) appContainer.classList.remove('blurred');
            updateUserHeader(user);
            if (onLoginSuccess) onLoginSuccess(user);
        } else {
            currentUser = null;
            console.log("Usuario deslogado");
            if (loginModal) loginModal.style.display = 'flex';
            if (appContainer) appContainer.classList.add('blurred');

            const jobsList = document.getElementById('jobs-list');
            const histList = document.getElementById('history-list');
            if (jobsList) jobsList.innerHTML = '';
            if (histList) histList.innerHTML = '';
        }
    });

    // 3. Handle Logout
    document.getElementById('btn-logout')?.addEventListener('click', () => {
        if (confirm("Deseja realmente sair?")) {
            signOut(auth);
            window.location.reload();
        }
    });

    // Toggle Logic is now handled by index.html inline script to prevent module loading race conditions.
}

// 2. Handle Login/Register via Global Function (Bypassing Form Submit)
window.handleLogin = async function () {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const isRegister = document.getElementById('is-register').checked;
    const errorMsg = document.getElementById('login-error');
    const btn = document.getElementById('btn-login-submit');

    if (!email || !password) {
        alert("Preencha email e senha.");
        return;
    }

    errorMsg.style.display = 'none';
    btn.disabled = true;
    const originalText = btn.textContent;
    btn.textContent = "Aguarde...";

    try {
        if (isRegister) {
            // Register
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await updateProfile(userCredential.user, {
                displayName: email.split('@')[0]
            });
        } else {
            // Login
            await signInWithEmailAndPassword(auth, email, password);
        }
    } catch (error) {
        console.error(error);
        errorMsg.textContent = translateError(error.code);
        errorMsg.style.display = 'block';
        btn.disabled = false;
        btn.textContent = originalText;
    }
};

function updateUserHeader(user) {
    if (!userDisplay) return;
    const name = user.displayName || user.email.split('@')[0];
    userDisplay.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
            <div style="text-align:right;">
                <p style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">OPERADOR</p>
                <p style="font-size:0.9rem; font-weight:700;">${name}</p>
            </div>
            <button id="btn-logout" class="icon-btn" style="width:36px; height:36px; border-color:var(--danger); color:var(--danger);">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            </button>
        </div>
    `;

    // Re-attach listener because we replaced innerHTML
    document.getElementById('btn-logout').addEventListener('click', () => {
        if (confirm("Sair do sistema?")) signOut(auth);
    });
}

function translateError(code) {
    switch (code) {
        case 'auth/invalid-email': return 'Email inválido.';
        case 'auth/user-disabled': return 'Usuário desativado.';
        case 'auth/user-not-found': return 'Usuário não encontrado.';
        case 'auth/wrong-password': return 'Senha incorreta.';
        case 'auth/email-already-in-use': return 'Email já está em uso.';
        case 'auth/weak-password': return 'Senha muito fraca (min 6 digitos).';
        default: return 'Erro ao acessar (' + code + ')';
    }
}
