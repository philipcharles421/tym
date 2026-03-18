import { supabase } from './utils.js';

let currentUserSession = null;
let messages = [];
let isRenderingShareImage = false;
let messagesRealtimeChannel = null;

// Safe DOM Element Selection
const messagesContainer = document.getElementById('messagesContainer');
const zeroState = document.getElementById('zeroState');
const shareModal = document.getElementById('shareModal');
const modalBackdrop = document.getElementById('modalBackdrop');
const modalClose = document.getElementById('modalClose');
const captureArea = document.getElementById('captureArea');
const captureText = document.getElementById('captureText');
const captureImage = document.getElementById('captureImage');
const downloadBtn = document.getElementById('downloadBtn');
const shareBtn = document.getElementById('shareBtn');
const toast = document.getElementById('toast');

const userNameElement = document.getElementById('userName');
const avatarImageElement = document.querySelector('.avatar-image');
const profileTrigger = document.getElementById('profileTrigger');
const profileDropdown = document.getElementById('profileDropdown');
const logoutBtn = document.getElementById('logoutBtn');

function getDefaultAvatarUrl(displayName) {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayName || 'User')}`;
}

function showToast(message, isError = false) {
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast';
    if (isError) toast.classList.add('error');
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2500);
}

// Initialization
window.addEventListener('load', () => {
    initializeInbox();
});

window.addEventListener('beforeunload', () => {
    cleanupMessagesRealtimeSubscription();
});

async function initializeInbox() {
    try {
        console.log("=== INBOX AUTH DEBUG ===");
        console.log("1. Requesting Supabase session...");
        await cleanupMessagesRealtimeSubscription();
        
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        const session = sessionData?.session;

        if (sessionError) {
            console.error("❌ SESSION ERROR:", {
                code: sessionError.code,
                message: sessionError.message,
                status: sessionError.status
            });
            console.error("NOT REDIRECTING - Waiting for further console messages...");
            return;
        }

        if (!session) {
            console.error("❌ NO SESSION: User is not authenticated");
            console.log("Next step: Clear browser storage and re-authenticate via signup/login");
            console.error("NOT REDIRECTING - Freezing on inbox page for debugging...");
            return;
        }

        console.log("✓ SESSION FOUND for user:", session.user.id);
        currentUserSession = session;

        console.log("2. Fetching user profile from Supabase...");
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id);

        if (profileError) {
            console.error("❌ PROFILE QUERY ERROR:", {
                code: profileError.code,
                message: profileError.message,
                details: profileError.details,
                hint: profileError.hint
            });
            console.error("NOT REDIRECTING - Inspect Supabase profiles table.");
            return;
        }

        if (!profile || profile.length === 0) {
            console.error("❌ PROFILE NOT FOUND: User ID", session.user.id, "has no profile row.");
            console.error("Action: Check your Supabase trigger on auth.users INSERT");
            console.error("NOT REDIRECTING - Freezing for debugging...");
            return;
        }

        const userProfile = profile[0];
        console.log("✓ PROFILE FOUND:", {
            id: userProfile.id,
            username: userProfile.username,
            display_name: userProfile.display_name
        });

        // Update Nav UI (all safe checks)
        if (userNameElement) {
            userNameElement.textContent = userProfile.display_name || userProfile.username || 'User';
        }

        if (avatarImageElement) {
            avatarImageElement.src = userProfile.avatar_url || getDefaultAvatarUrl(userProfile.display_name || userProfile.username);
        }

        console.log("3. Setting up UI handlers...");
        setupProfileDropdown();
        setupModalHandlers();
        
        console.log("4. Loading messages...");
        await loadMessages();

        console.log("5. Subscribing to realtime messages...");
        setupMessagesRealtimeSubscription();

        console.log("=== INBOX READY ===");

    } catch (err) {
        console.error("❌ INBOX INITIALIZATION CRASH:", {
            name: err.name,
            message: err.message,
            stack: err.stack
        });
        console.error("NOT REDIRECTING - Freezing page for manual inspection...");
    }
}

function setupMessagesRealtimeSubscription() {
    if (!currentUserSession?.user?.id) {
        console.warn('Realtime subscription skipped: missing current user id');
        return;
    }

    const recipientId = currentUserSession.user.id;
    const channelName = `inbox-messages-${recipientId}`;

    messagesRealtimeChannel = supabase
        .channel(channelName)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `recipient_id=eq.${recipientId}`
            },
            (payload) => {
                const incomingMessage = payload?.new;
                if (!incomingMessage?.id) {
                    return;
                }

                const alreadyExists = messages.some((item) => item.id === incomingMessage.id);
                if (alreadyExists) {
                    return;
                }

                messages.unshift(incomingMessage);
                renderMessages();
                animateNewestMessageCard();
                showToast('New anonymous message received');
            }
        )
        .subscribe((status) => {
            console.log('Realtime status:', status);
        });
}

async function cleanupMessagesRealtimeSubscription() {
    if (!messagesRealtimeChannel) {
        return;
    }

    try {
        await supabase.removeChannel(messagesRealtimeChannel);
    } catch (error) {
        console.warn('Failed to cleanup realtime subscription:', error);
    }

    messagesRealtimeChannel = null;
}

// Data Fetching
async function loadMessages() {
    try {
        if (!messagesContainer || !zeroState) {
            console.warn("⚠ Missing messagesContainer or zeroState DOM elements");
            return;
        }

        if (!currentUserSession) {
            console.error("❌ CANNOT LOAD MESSAGES: currentUserSession is null. Auth check failed above.");
            return;
        }

        console.log("Fetching messages for user:", currentUserSession.user.id);
        messagesContainer.innerHTML = '<p style="text-align:center; color:#888;">Loading messages...</p>';
        zeroState.classList.add('hidden');

        const { data: fetchedMessages, error: messagesError } = await supabase
            .from('messages')
            .select('*')
            .eq('recipient_id', currentUserSession.user.id)
            .order('created_at', { ascending: false });

        if (messagesError) {
            console.error("❌ MESSAGES QUERY ERROR:", {
                code: messagesError.code,
                message: messagesError.message,
                details: messagesError.details
            });
            throw messagesError;
        }

        messages = fetchedMessages || [];
        console.log(`✓ Loaded ${messages.length} messages`);
        renderMessages();
        
    } catch (error) {
        console.error("❌ Error loading messages:", error);
        showToast('Failed to load messages', true);
        if (messagesContainer) messagesContainer.innerHTML = '';
    }
}

// Rendering
function renderMessages() {
    if (!messagesContainer || !zeroState) return;
    
    messagesContainer.innerHTML = '';

    if (messages.length === 0) {
        zeroState.classList.remove('hidden');
        return;
    }

    messages.forEach((message, index) => {
        const card = document.createElement('article');
        card.className = 'message-card';

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
            card.appendChild(image);
        }

        // Actions
        const actionsWrap = document.createElement('div');
        actionsWrap.className = 'card-actions';
        
        const shareButton = document.createElement('button');
        shareButton.className = 'btn-share';
        shareButton.type = 'button';
        shareButton.innerHTML = 'Share Response';
        shareButton.addEventListener('click', () => openShareModal(index));

        actionsWrap.appendChild(shareButton);
        card.appendChild(actionsWrap);

        messagesContainer.appendChild(card);
    });
}

function animateNewestMessageCard() {
    if (!messagesContainer) {
        return;
    }

    const newestCard = messagesContainer.firstElementChild;
    if (!newestCard) {
        return;
    }

    newestCard.animate(
        [
            { opacity: 0, transform: 'translateY(-8px)' },
            { opacity: 1, transform: 'translateY(0)' }
        ],
        {
            duration: 250,
            easing: 'ease-out'
        }
    );
}

// Utility
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

// Nav Handlers
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

// Modal Handlers
function setupModalHandlers() {
    if (modalBackdrop) modalBackdrop.addEventListener('click', closeShareModal);
    if (modalClose) modalClose.addEventListener('click', closeShareModal);
    
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async () => {
            try {
                const imageBlob = await captureShareImageBlob();
                if (!imageBlob) {
                    showToast('Could not generate image', true);
                    return;
                }

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
                console.error('Download failed:', error);
                showToast('Download failed', true);
            }
        });
    }
    
    if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
            try {
                const imageBlob = await captureShareImageBlob();
                if (!imageBlob) {
                    showToast('Could not generate image', true);
                    return;
                }

                const file = new File([imageBlob], `tym-response-${Date.now()}.png`, { type: 'image/png' });

                if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: 'TYM Response',
                        text: 'Sharing a response from TYM',
                        files: [file]
                    });
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
                if (error?.name === 'AbortError') {
                    return;
                }
                console.error('Share failed:', error);
                showToast('Share failed', true);
            }
        });
    }
}

async function captureShareImageBlob() {
    if (!captureArea) {
        throw new Error('Missing capture area');
    }

    if (isRenderingShareImage) {
        return null;
    }

    if (typeof html2canvas !== 'function') {
        throw new Error('html2canvas is not available');
    }

    isRenderingShareImage = true;
    if (downloadBtn) downloadBtn.disabled = true;
    if (shareBtn) shareBtn.disabled = true;

    try {
        const canvas = await html2canvas(captureArea, {
            backgroundColor: null,
            useCORS: true,
            scale: Math.min(2, window.devicePixelRatio || 1)
        });

        const blob = await new Promise((resolve) => {
            canvas.toBlob((result) => resolve(result), 'image/png', 1);
        });

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
    
    if (captureImage) {
        if (message.image_url) {
            captureImage.src = message.image_url;
            captureImage.classList.remove('hidden');
        } else {
            captureImage.classList.add('hidden');
            captureImage.src = '';
        }
    }

    shareModal.classList.remove('hidden');
    shareModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function closeShareModal() {
    if (!shareModal) return;
    shareModal.classList.add('hidden');
    shareModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}