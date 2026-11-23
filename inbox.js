import { supabase } from './utils.js';

let currentUserSession = null;
let currentUserProfile = null;
let messages = [];
let isRenderingShareImage = false;
let messagesRealtimeChannel = null;

const messagesContainer = document.getElementById('messagesContainer');
const zeroState = document.getElementById('zeroState');
const shareModal = document.getElementById('shareModal');
const modalBackdrop = document.getElementById('modalBackdrop');
const modalClose = document.getElementById('modalClose');
const captureArea = document.getElementById('captureArea');
const captureText = document.getElementById('captureText');
const captureImage = document.getElementById('captureImage');
const captureBody = document.getElementById('captureBody');
const captureUsernameEl = document.getElementById('captureUsername');
const downloadBtn = document.getElementById('downloadBtn');
const shareBtn = document.getElementById('shareBtn');
const toast = document.getElementById('toast');
const userNameElement = document.getElementById('userName');
const avatarImageElement = document.querySelector('.avatar-image');
const profileTrigger = document.getElementById('profileTrigger');
const profileDropdown = document.getElementById('profileDropdown');
const logoutBtn = document.getElementById('logoutBtn');
const lightbox = document.getElementById('lightbox');
const lightboxImage = document.getElementById('lightboxImage');
const lightboxClose = document.getElementById('lightboxClose');
const lightboxBackdrop = document.getElementById('lightboxBackdrop');

function getDefaultAvatarUrl() {
    return './assets/default-avatar.svg';
}

function showToast(message, isError = false) {
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast';
    if (isError) toast.classList.add('error');
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2500);
}

window.addEventListener('load', () => {
    initializeInbox();
});

window.addEventListener('beforeunload', () => {
    cleanupMessagesRealtimeSubscription();
});

async function initializeInbox() {
    try {
        await cleanupMessagesRealtimeSubscription();

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        const session = sessionData?.session;

        if (sessionError || !session) {
            window.location.href = './login.html';
            return;
        }

        currentUserSession = session;

        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id);

        if (profileError || !profile || profile.length === 0) {
            window.location.href = './login.html';
            return;
        }

        const userProfile = profile[0];
        currentUserProfile = userProfile;

        if (userNameElement) {
            userNameElement.textContent = userProfile.display_name || userProfile.username || 'User';
        }

        if (avatarImageElement) {
            avatarImageElement.src = userProfile.avatar_url || getDefaultAvatarUrl(userProfile.display_name || userProfile.username);
        }

        setupProfileDropdown();
        setupModalHandlers();
        setupLightbox();
        await loadMessages();
        setupMessagesRealtimeSubscription();
        await setupNotifications();

    } catch (err) {
        showToast('Something went wrong. Please refresh.', true);
    }
}

// ─── Notifications (#14) ──────────────────────────────────────────────────────

async function setupNotifications() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        // Ask after a short delay so it doesn't feel intrusive on first load
        setTimeout(async () => {
            await Notification.requestPermission();
        }, 4000);
    }
}

function sendBrowserNotification(message) {
    if (Notification.permission !== 'granted') return;
    if (document.visibilityState === 'visible') return; // in-app toast is enough when tab is active
    new Notification('TYM – New Anonymous Message', {
        body: message.content ? `"${message.content.slice(0, 60)}${message.content.length > 60 ? '…' : ''}"` : 'You received a new anonymous message!',
        icon: './assets/tym-logo.png'
    });
}

// ─── Realtime ─────────────────────────────────────────────────────────────────

function setupMessagesRealtimeSubscription() {
    if (!currentUserSession?.user?.id) return;

    const recipientId = currentUserSession.user.id;
    const channelName = `inbox-messages-${recipientId}`;

    messagesRealtimeChannel = supabase
        .channel(channelName)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `recipient_id=eq.${recipientId}`
        }, (payload) => {
            const incomingMessage = payload?.new;
            if (!incomingMessage?.id) return;
            if (messages.some((item) => item.id === incomingMessage.id)) return;

            messages.unshift(incomingMessage);
            renderMessages();
            animateNewestMessageCard();
            showToast('New anonymous message received!');
            sendBrowserNotification(incomingMessage);
        })
        .subscribe();
}

async function cleanupMessagesRealtimeSubscription() {
    if (!messagesRealtimeChannel) return;
    try {
        await supabase.removeChannel(messagesRealtimeChannel);
    } catch (_) {}
    messagesRealtimeChannel = null;
}

// ─── Data Fetching ────────────────────────────────────────────────────────────

async function loadMessages() {
    if (!messagesContainer || !zeroState) return;
    if (!currentUserSession) return;

    messagesContainer.innerHTML = renderSkeleton();
    zeroState.classList.add('hidden');

    const { data: fetchedMessages, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('recipient_id', currentUserSession.user.id)
        .order('created_at', { ascending: false });

    if (messagesError) {
        showToast('Failed to load messages', true);
        messagesContainer.innerHTML = '';
        return;
    }

    messages = fetchedMessages || [];
    renderMessages();
}

function renderSkeleton() {
    const item = `
        <div class="message-card skeleton-card" aria-hidden="true">
            <div class="skeleton-line short"></div>
            <div class="skeleton-line"></div>
            <div class="skeleton-line medium"></div>
        </div>`;
    return item + item + item;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderMessages() {
    if (!messagesContainer || !zeroState) return;

    messagesContainer.innerHTML = '';

    if (messages.length === 0) {
        zeroState.classList.remove('hidden');
        return;
    }

    zeroState.classList.add('hidden');

    messages.forEach((message, index) => {
        const card = document.createElement('article');
        card.className = 'message-card';
        card.dataset.id = message.id;

        // Header
        const header = document.createElement('div');
        header.className = 'card-header';

        const left = document.createElement('div');
        left.className = 'left';

        const label = document.createElement('div');
        label.className = 'anon-label';
        label.textContent = 'Anonymous';

        const time = document.createElement('div');
        time.className = 'time-ago';
        time.textContent = timeAgo(message.created_at);
        time.setAttribute('title', new Date(message.created_at).toLocaleString());

        left.appendChild(label);
        left.appendChild(time);
        header.appendChild(left);
        card.appendChild(header);

        // Content
        const text = document.createElement('div');
        text.className = 'message-text';
        text.textContent = message.content;
        card.appendChild(text);

        // Optional Image
        if (message.image_url) {
            const image = document.createElement('img');
            image.className = 'message-image';
            image.src = message.image_url;
            image.alt = 'Attached photo';
            image.loading = 'lazy';
            image.setAttribute('role', 'button');
            image.setAttribute('tabindex', '0');
            image.setAttribute('aria-label', 'View full size image');
            image.addEventListener('click', () => openLightbox(message.image_url));
            image.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') openLightbox(message.image_url); });
            card.appendChild(image);
        }

        // Actions
        const actionsWrap = document.createElement('div');
        actionsWrap.className = 'card-actions';

        const shareButton = document.createElement('button');
        shareButton.className = 'btn-share';
        shareButton.type = 'button';
        shareButton.textContent = 'Share Response';
        shareButton.setAttribute('aria-label', 'Share this message as an image');
        shareButton.addEventListener('click', () => openShareModal(index));

        const deleteButton = document.createElement('button');
        deleteButton.className = 'btn-delete';
        deleteButton.type = 'button';
        deleteButton.textContent = 'Delete';
        deleteButton.setAttribute('aria-label', 'Delete this message');
        deleteButton.addEventListener('click', () => handleDeleteClick(deleteButton, message.id, card));

        actionsWrap.appendChild(shareButton);
        actionsWrap.appendChild(deleteButton);
        card.appendChild(actionsWrap);

        messagesContainer.appendChild(card);
    });
}

function animateNewestMessageCard() {
    if (!messagesContainer) return;
    const newestCard = messagesContainer.firstElementChild;
    if (!newestCard) return;
    newestCard.animate(
        [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'translateY(0)' }],
        { duration: 250, easing: 'ease-out' }
    );
}

// ─── Delete (two-tap confirm) ─────────────────────────────────────────────────

function handleDeleteClick(button, messageId, cardElement) {
    if (button.dataset.confirming === 'true') {
        deleteMessage(messageId, cardElement);
    } else {
        button.dataset.confirming = 'true';
        button.textContent = 'Sure?';
        button.classList.add('confirming');
        setTimeout(() => {
            if (button.dataset.confirming === 'true') {
                button.dataset.confirming = 'false';
                button.textContent = 'Delete';
                button.classList.remove('confirming');
            }
        }, 3000);
    }
}

async function deleteMessage(id, cardElement) {
    const { error } = await supabase.from('messages').delete().eq('id', id);

    if (error) {
        showToast('Failed to delete message', true);
        return;
    }

    messages = messages.filter((m) => m.id !== id);

    cardElement.animate(
        [{ opacity: 1, transform: 'scaleY(1)' }, { opacity: 0, transform: 'scaleY(0)', height: '0', padding: '0', margin: '0' }],
        { duration: 200, easing: 'ease-out' }
    ).onfinish = () => {
        cardElement.remove();
        if (messages.length === 0 && zeroState) {
            zeroState.classList.remove('hidden');
        }
    };

    showToast('Message deleted');
}

// ─── Lightbox (#6) ────────────────────────────────────────────────────────────

function setupLightbox() {
    if (!lightbox) return;
    lightboxClose?.addEventListener('click', closeLightbox);
    lightboxBackdrop?.addEventListener('click', closeLightbox);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !lightbox.classList.contains('hidden')) closeLightbox();
    });
}

function openLightbox(src) {
    if (!lightbox || !lightboxImage) return;
    lightboxImage.src = src;
    lightbox.classList.remove('hidden');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    lightboxClose?.focus();
}

function closeLightbox() {
    if (!lightbox) return;
    lightbox.classList.add('hidden');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function timeAgo(dateString) {
    const now = new Date();
    const then = new Date(dateString);
    const seconds = Math.floor((now - then) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    return `${days}d ago`;
}

// ─── Nav Handlers ─────────────────────────────────────────────────────────────

function setupProfileDropdown() {
    if (!profileTrigger || !profileDropdown) return;

    profileTrigger.addEventListener('click', (event) => {
        event.stopPropagation();
        const isHidden = profileDropdown.classList.contains('hidden');
        if (isHidden) {
            profileDropdown.classList.remove('hidden');
            profileTrigger.classList.add('active');
        } else {
            profileDropdown.classList.add('hidden');
            profileTrigger.classList.remove('active');
        }
    });

    document.addEventListener('click', (event) => {
        if (!event.target.closest('.profile-section')) {
            profileDropdown.classList.add('hidden');
            profileTrigger.classList.remove('active');
        }
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            await cleanupMessagesRealtimeSubscription();
            await supabase.auth.signOut();
            window.location.href = './landing.html';
        });
    }
}

// ─── Share Modal ──────────────────────────────────────────────────────────────

function setupModalHandlers() {
    if (modalBackdrop) modalBackdrop.addEventListener('click', closeShareModal);
    if (modalClose) modalClose.addEventListener('click', closeShareModal);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && shareModal && !shareModal.classList.contains('hidden')) closeShareModal();
    });

    if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
            try {
                const imageBlob = await captureShareImageBlob();
                if (!imageBlob) { showToast('Could not generate image', true); return; }
                const objectUrl = URL.createObjectURL(imageBlob);
                const a = document.createElement('a');
                a.href = objectUrl;
                a.download = `tym-response-${Date.now()}.png`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(objectUrl);
                showToast('Image downloaded');
            } catch (error) {
                showToast('Download failed', true);
            }
        });
    }

    if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
            try {
                const imageBlob = await captureShareImageBlob();
                if (!imageBlob) { showToast('Could not generate image', true); return; }
                const file = new File([imageBlob], `tym-response-${Date.now()}.png`, { type: 'image/png' });
                if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({ title: 'TYM Response', text: 'Sharing a response from TYM', files: [file] });
                    showToast('Shared successfully');
                    return;
                }
                const objectUrl = URL.createObjectURL(imageBlob);
                const a = document.createElement('a');
                a.href = objectUrl;
                a.download = file.name;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(objectUrl);
                showToast('Share unavailable. Downloaded instead.');
            } catch (error) {
                if (error?.name === 'AbortError') return;
                showToast('Share failed', true);
            }
        });
    }
}

async function captureShareImageBlob() {
    if (!captureArea) throw new Error('Missing capture area');
    if (isRenderingShareImage) return null;
    if (typeof html2canvas !== 'function') throw new Error('html2canvas is not available');

    isRenderingShareImage = true;
    if (downloadBtn) downloadBtn.disabled = true;
    if (shareBtn) shareBtn.disabled = true;

    try {
        const canvas = await html2canvas(captureArea, {
            backgroundColor: null,
            useCORS: true,
            scale: Math.min(2, window.devicePixelRatio || 1)
        });
        const blob = await new Promise((resolve) => { canvas.toBlob((result) => resolve(result), 'image/png', 1); });
        return blob;
    } finally {
        isRenderingShareImage = false;
        if (downloadBtn) downloadBtn.disabled = false;
        if (shareBtn) shareBtn.disabled = false;
    }
}

function openShareModal(index) {
    if (!shareModal || !captureText) return;
    const message = messages[index];
    captureText.textContent = message.content;

    if (captureUsernameEl && currentUserProfile) {
        captureUsernameEl.textContent = '@' + (currentUserProfile.username || 'you');
    }

    if (captureImage && captureBody) {
        if (message.image_url) {
            captureImage.src = message.image_url;
            captureImage.classList.remove('hidden');
            captureBody.classList.add('has-image');
        } else {
            captureImage.classList.add('hidden');
            captureImage.src = '';
            captureBody.classList.remove('has-image');
        }
    }

    shareModal.classList.remove('hidden');
    shareModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    modalClose?.focus();
}

function closeShareModal() {
    if (!shareModal) return;
    shareModal.classList.add('hidden');
    shareModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}
