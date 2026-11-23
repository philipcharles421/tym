import { supabase } from './utils.js';

const signupForm = document.getElementById('signupForm');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const togglePasswordBtn = document.getElementById('togglePassword');
const previewUsername = document.getElementById('previewUsername');
const submitBtn = document.getElementById('submitBtn');
const errorMessage = document.getElementById('errorMessage');
const errorText = document.getElementById('errorText');
const suggestionChips = document.getElementById('suggestionChips');

function sanitizeDisplayName(value) {
    return value.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
}

function buildLinkBase(displayName) {
    return displayName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '') || 'user';
}

function generateUniqueLink(displayName) {
    return buildLinkBase(displayName);
}

function getExistingUsernames(accounts) {
    return new Set(
        accounts
            .map((account) => (account.username || account.displayName || account.linkId || '').toLowerCase())
            .filter(Boolean)
    );
}

function suggestAvailableUsernames(baseUsername, accounts, maxSuggestions = 3) {
    const suggestions = [];
    const usedUsernames = getExistingUsernames(accounts);
    const base = buildLinkBase(baseUsername);

    let counter = 1;
    while (suggestions.length < maxSuggestions && counter <= 9999) {
        const candidate = `${base}${counter}`;
        if (!usedUsernames.has(candidate)) {
            suggestions.push(candidate);
            usedUsernames.add(candidate);
        }
        counter += 1;
    }

    return suggestions;
}

function showError(message) {
    if (!errorMessage || !errorText) {
        return;
    }
    errorText.textContent = message;
    errorMessage.classList.remove('hidden');
}

function hideError() {
    if (!errorMessage || !errorText) return;
    errorText.textContent = '';
    errorMessage.classList.add('hidden');
}

function renderSuggestionChips(suggestions) {
    if (!suggestionChips) return;
    suggestionChips.innerHTML = '';

    if (!suggestions.length) {
        suggestionChips.classList.add('hidden');
        return;
    }

    const label = document.createElement('p');
    label.className = 'chips-label';
    label.textContent = 'Try one of these:';
    suggestionChips.appendChild(label);

    const row = document.createElement('div');
    row.className = 'chips-row';

    suggestions.forEach((name) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'chip';
        chip.textContent = name;
        chip.setAttribute('aria-label', `Use username ${name}`);
        chip.addEventListener('click', () => {
            usernameInput.value = name;
            previewUsername.textContent = name;
            hideError();
            clearSuggestionChips();
            usernameInput.focus();
        });
        row.appendChild(chip);
    });

    suggestionChips.appendChild(row);
    suggestionChips.classList.remove('hidden');
}

function clearSuggestionChips() {
    if (!suggestionChips) return;
    suggestionChips.innerHTML = '';
    suggestionChips.classList.add('hidden');
}

usernameInput.addEventListener('input', (event) => {
    const sanitized = sanitizeDisplayName(event.target.value);

    if (sanitized !== event.target.value) {
        usernameInput.value = sanitized;
    }

    previewUsername.textContent = sanitized.trim()
        ? generateUniqueLink(sanitized)
        : 'username';

    // Clear suggestions when the user is typing again
    clearSuggestionChips();
    hideError();
});

togglePasswordBtn.addEventListener('click', (event) => {
    event.preventDefault();
    const isPassword = passwordInput.getAttribute('type') === 'password';
    passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
    togglePasswordBtn.textContent = isPassword ? '🙈' : '👁️';
});

signupForm.addEventListener('submit', handleSignup);

function handleSignup(event) {
    return handleSignupAsync(event);
}

async function handleSignupAsync(event) {
    event.preventDefault();
    hideError();
    clearSuggestionChips();

    const chosenUsername = usernameInput.value.trim().toLowerCase();
    const userPassword = passwordInput.value;

    if (!chosenUsername) {
        showError('Please enter a username.');
        usernameInput.focus();
        return;
    }

    if (chosenUsername.length < 3) {
        showError('Username must be at least 3 characters.');
        usernameInput.focus();
        return;
    }

    if (!/^[a-z0-9_]+$/.test(chosenUsername)) {
        showError('Username can only contain letters, numbers, and underscores.');
        usernameInput.focus();
        return;
    }

    if (!userPassword || userPassword.length < 8) {
        showError('Password must be at least 8 characters.');
        passwordInput.focus();
        return;
    }

    const { data, error } = await supabase
        .from('profiles')
        .select('username')
        .eq('username', chosenUsername);

    if (error) {
        showError(error.message || 'Failed to validate username. Please try again.');
        usernameInput.focus();
        return;
    }

    if (Array.isArray(data) && data.length > 0) {
        const { data: allProfiles, error: allProfilesError } = await supabase
            .from('profiles')
            .select('username');

        const accounts = allProfilesError
            ? []
            : (allProfiles || []).map((profile) => ({ username: profile.username }));

        const suggestions = suggestAvailableUsernames(chosenUsername, accounts, 3);

        showError('This username is already taken.');
        renderSuggestionChips(suggestions);
        usernameInput.focus();
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating Account...';

    const dummyEmail = `${chosenUsername}@tym-local.com`;
    const { error: signUpError } = await supabase.auth.signUp({
        email: dummyEmail,
        password: userPassword,
        options: {
            data: {
                username: chosenUsername,
                display_name: chosenUsername
            }
        }
    });

    if (signUpError) {
        showError(signUpError.message || 'Failed to create account. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create My Account';
        return;
    }

    window.location.href = './dashboard.html';
}

window.addEventListener('load', () => {
    setTimeout(() => usernameInput.focus(), 300);
});

passwordInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        submitBtn.click();
    }
});
