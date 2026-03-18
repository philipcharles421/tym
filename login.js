import {
    supabase,
    setRememberedUsername,
    getRememberedUsername
} from './utils.js';

const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const togglePasswordBtn = document.getElementById('togglePassword');
const rememberMeCheckbox = document.getElementById('rememberMe');
const submitBtn = document.getElementById('submitBtn');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');

function showError(message) {
    errorText.textContent = message;
    errorMessage.classList.remove('hidden');
}

function hideError() {
    errorText.textContent = '';
    errorMessage.classList.add('hidden');
}

function setLoadingState(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.classList.toggle('loading', isLoading);

    const btnText = document.querySelector('.btn-text');
    const spinner = document.getElementById('btnSpinner');

    if (btnText) {
        btnText.textContent = isLoading ? 'Logging in...' : 'Log In';
    }

    if (spinner) {
        spinner.classList.toggle('hidden', !isLoading);
    }
}

function loadRememberedUsername() {
    const rememberedUsername = getRememberedUsername();
    if (!rememberedUsername || !rememberMeCheckbox) {
        return;
    }

    usernameInput.value = rememberedUsername;
    rememberMeCheckbox.checked = true;
}

function saveRememberedUsername(username) {
    if (!rememberMeCheckbox) {
        return;
    }

    if (rememberMeCheckbox.checked) {
        setRememberedUsername(username);
    } else {
        setRememberedUsername('');
    }
}

togglePasswordBtn.addEventListener('click', (event) => {
    event.preventDefault();
    const isPassword = passwordInput.getAttribute('type') === 'password';
    passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
    togglePasswordBtn.textContent = isPassword ? '🙈' : '👁️';
});

loginForm.addEventListener('submit', handleLogin);

function handleLogin(event) {
    return handleLoginAsync(event);
}

async function handleLoginAsync(event) {
    event.preventDefault();
    hideError();

    const username = usernameInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    if (!username) {
        showError('Please enter your username.');
        usernameInput.focus();
        return;
    }

    if (!/^[a-z0-9_]+$/.test(username)) {
        showError('Username can only contain letters, numbers, and underscores.');
        usernameInput.focus();
        return;
    }

    if (!password) {
        showError('Please enter your password.');
        passwordInput.focus();
        return;
    }

    setLoadingState(true);
    const dummyEmail = `${username}@tym-local.com`;

    const { error } = await supabase.auth.signInWithPassword({
        email: dummyEmail,
        password
    });

    if (error) {
        showError(error.message || 'Invalid username or password.');
        setLoadingState(false);
        return;
    }

    saveRememberedUsername(username);
    submitBtn.textContent = '✓ Logged In!';

    setTimeout(() => {
        window.location.href = './dashboard.html';
    }, 600);
}

window.addEventListener('load', () => {
    loadRememberedUsername();

    setTimeout(() => {
        if (!usernameInput.value) {
            usernameInput.focus();
        }
    }, 300);
});

if (rememberMeCheckbox) {
    rememberMeCheckbox.addEventListener('change', () => {
        if (!rememberMeCheckbox.checked) {
            setRememberedUsername('');
        }
    });
}