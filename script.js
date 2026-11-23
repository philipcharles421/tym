import { supabase } from './utils.js';

const messageInput = document.getElementById('messageInput');
const addImageBtn = document.getElementById('addImageBtn');
const imageInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');
const previewImg = document.getElementById('previewImg');
const removeImageBtn = document.getElementById('removeImageBtn');
const sendBtn = document.getElementById('sendBtn');
const charCount = document.getElementById('charCount');
const fileName = document.getElementById('fileName');
const successMessage = document.getElementById('successMessage');
const recipientAvatarElement = document.getElementById('recipientAvatar');
const recipientAvatarFallbackElement = document.getElementById('recipientAvatarFallback');
const toast = document.getElementById('toast');

let selectedFile = null;
let recipientProfile = null;
let recipientDisplayName = 'AnonymousUser';

const RATE_LIMIT_MS = 30_000; // 30 seconds between sends
const RATE_LIMIT_KEY = 'tym_last_send';

function getRateLimitStatus() {
    const last = parseInt(localStorage.getItem(RATE_LIMIT_KEY) || '0', 10);
    const elapsed = Date.now() - last;
    if (elapsed < RATE_LIMIT_MS) {
        return { allowed: false, remaining: Math.ceil((RATE_LIMIT_MS - elapsed) / 1000) };
    }
    return { allowed: true, remaining: 0 };
}

function markMessageSent() {
    localStorage.setItem(RATE_LIMIT_KEY, String(Date.now()));
}

function showToast(message, type = 'success') {
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast';
    if (type === 'error') toast.classList.add('error');
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3500);
}

function getDefaultAvatarUrl() {
    return './assets/default-avatar.svg';
}

function applyRecipientAvatar() {
    if (!recipientAvatarElement || !recipientAvatarFallbackElement) return;
    const avatarSrc = recipientProfile?.avatar_url || getDefaultAvatarUrl(recipientProfile?.username || recipientDisplayName);
    if (avatarSrc) {
        recipientAvatarElement.src = avatarSrc;
        recipientAvatarElement.classList.remove('hidden');
        recipientAvatarFallbackElement.classList.add('hidden');
    } else {
        recipientAvatarElement.classList.add('hidden');
        recipientAvatarFallbackElement.classList.remove('hidden');
    }
}

function setPageLoading(isLoading) {
    if (sendBtn) sendBtn.disabled = isLoading;
    const usernameEl = document.querySelector('.username');
    const statusEl = document.querySelector('.status');
    const sendSpan = sendBtn?.querySelector('span:first-child');

    if (isLoading) {
        if (usernameEl) usernameEl.textContent = 'Loading...';
        if (statusEl) statusEl.textContent = 'Please wait...';
        if (sendSpan) sendSpan.textContent = 'Loading...';
    } else {
        if (sendSpan) sendSpan.textContent = 'Send Message →';
    }
}

function redirectToLandingPage() {
    window.location.href = './landing.html';
}

async function initializeRecipient() {
    const urlParams = new URLSearchParams(window.location.search);
    const username = urlParams.get('to');

    if (!username) {
        window.location.href = './landing.html';
        return;
    }

    setPageLoading(true);

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .single();

    setPageLoading(false);

    if (error || !profile) {
        showToast('User not found.', 'error');
        setTimeout(redirectToLandingPage, 2500);
        return;
    }

    recipientProfile = profile;
    recipientDisplayName = profile.display_name || profile.username || recipientDisplayName;

    const usernameEl = document.querySelector('.username');
    const statusEl = document.querySelector('.status');

    if (usernameEl) usernameEl.textContent = `@${recipientDisplayName}`;
    if (statusEl) statusEl.textContent = `Send an anonymous message to ${recipientDisplayName}`;

    applyRecipientAvatar();
}

window.addEventListener('load', initializeRecipient);

messageInput.addEventListener('input', () => {
    const len = messageInput.value.length;
    charCount.textContent = len;

    const charCountDiv = charCount.parentElement;
    charCountDiv.classList.remove('warn', 'danger');
    if (len >= 480) {
        charCountDiv.classList.add('danger');
    } else if (len >= 400) {
        charCountDiv.classList.add('warn');
    }
});

addImageBtn.addEventListener('click', () => imageInput.click());

imageInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('Please select a valid image file.', 'error');
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        showToast('Image must be less than 5MB.', 'error');
        return;
    }

    selectedFile = file;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
        previewImg.src = loadEvent.target.result;
        imagePreview.classList.remove('hidden');
        fileName.textContent = `📎 ${file.name}`;
    };
    reader.readAsDataURL(file);
});

removeImageBtn.addEventListener('click', () => {
    selectedFile = null;
    imageInput.value = '';
    imagePreview.classList.add('hidden');
    previewImg.src = '';
    fileName.textContent = '';
});

sendBtn.addEventListener('click', handleSendMessage);
messageInput.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        handleSendMessage();
    }
});

async function handleSendMessage() {
    const message = messageInput.value.trim();

    if (!message) {
        showToast('Please write a message first.', 'error');
        messageInput.focus();
        return;
    }

    if (message.length < 3) {
        showToast('Message must be at least 3 characters long.', 'error');
        messageInput.focus();
        return;
    }

    if (!recipientProfile?.id) {
        showToast('User not found. Please refresh the page.', 'error');
        return;
    }

    const { allowed, remaining } = getRateLimitStatus();
    if (!allowed) {
        showToast(`Please wait ${remaining}s before sending another message.`, 'error');
        return;
    }

    sendBtn.disabled = true;
    const sendSpan = sendBtn.querySelector('span:first-child');
    if (sendSpan) sendSpan.textContent = 'Sending...';

    let imageUrl = null;

    try {
        if (selectedFile) {
            const ext = (selectedFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
            const uniqueFileName = `${crypto.randomUUID()}.${ext}`;

            const { error: uploadError } = await supabase.storage
                .from('message-images')
                .upload(uniqueFileName, selectedFile);

            if (uploadError) {
                showToast(`Failed to upload image: ${uploadError.message}`, 'error');
                sendBtn.disabled = false;
                if (sendSpan) sendSpan.textContent = 'Send Message';
                return;
            }

            const { data: urlData } = supabase.storage
                .from('message-images')
                .getPublicUrl(uniqueFileName);

            imageUrl = urlData?.publicUrl || null;
        }

        const { error } = await supabase
            .from('messages')
            .insert([{ recipient_id: recipientProfile.id, content: message, image_url: imageUrl }]);

        sendBtn.disabled = false;
        if (sendSpan) sendSpan.textContent = 'Send Message';

        if (error) {
            showToast(`Failed to send message: ${error.message}`, 'error');
            return;
        }

        markMessageSent();
        showSuccessAnimation();
        resetForm();
    } catch (err) {
        showToast(`An error occurred: ${err.message}`, 'error');
        sendBtn.disabled = false;
        if (sendSpan) sendSpan.textContent = 'Send Message';
    }
}

function resetForm() {
    messageInput.value = '';
    charCount.textContent = '0';
    charCount.parentElement.classList.remove('warn', 'danger');
    selectedFile = null;
    imageInput.value = '';
    imagePreview.classList.add('hidden');
    previewImg.src = '';
    fileName.textContent = '';
}

function showSuccessAnimation() {
    successMessage.classList.remove('hidden');
    createConfetti();
}

function closeSuccess() {
    successMessage.classList.add('hidden');
}

function createConfetti() {
    const confettiCount = 30;
    const confettiContainer = document.createElement('div');
    confettiContainer.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999';
    document.body.appendChild(confettiContainer);

    const colors = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#00f2fe'];
    for (let i = 0; i < confettiCount; i += 1) {
        const confetti = document.createElement('div');
        const size = Math.random() * 8 + 4;
        const duration = Math.random() * 2 + 2;
        const delay = Math.random() * 0.5;
        const startX = Math.random() * window.innerWidth;

        confetti.style.cssText = `position:fixed;width:${size}px;height:${size}px;background:${colors[Math.floor(Math.random() * 5)]};left:${startX}px;top:-10px;border-radius:50%`;
        confettiContainer.appendChild(confetti);

        const animation = confetti.animate(
            [
                { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
                { transform: `translate(${(Math.random() - 0.5) * 200}px, ${window.innerHeight + 20}px) rotate(${Math.random() * 360}deg)`, opacity: 0 }
            ],
            { duration: duration * 1000, delay: delay * 1000, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }
        );

        animation.onfinish = () => confetti.remove();
    }

    setTimeout(() => confettiContainer.remove(), 4000);
}

window.closeSuccess = closeSuccess;
