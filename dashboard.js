import { supabase, updateAppBadge, subscribeToPush } from './utils.js';

const profileTrigger = document.getElementById('profileTrigger');
const profileDropdown = document.getElementById('profileDropdown');
const changeAvatarBtn = document.getElementById('changeAvatarBtn');
const changePasswordBtn = document.getElementById('changePasswordBtn');
const logoutBtn = document.getElementById('logoutBtn');
const toast = document.getElementById('toast');
const userNameElement = document.getElementById('userName');
const avatarImageElement = document.querySelector('.avatar-image');
const avatarFileInput = document.getElementById('avatarFileInput');
const avatarPickerModal = document.getElementById('avatarPickerModal');
const avatarPickerOverlay = document.getElementById('avatarPickerOverlay');
const avatarPickerClose = document.getElementById('avatarPickerClose');
const avatarPickerPreviewImg = document.getElementById('avatarPickerPreviewImg');
const avatarPresetGrid = document.getElementById('avatarPresetGrid');
const avatarUploadTrigger = document.getElementById('avatarUploadTrigger');
const avatarCropModal = document.getElementById('avatarCropModal');
const avatarModalOverlay = document.getElementById('avatarModalOverlay');
const avatarModalClose = document.getElementById('avatarModalClose');
const avatarCropImage = document.getElementById('avatarCropImage');
const avatarCancelBtn = document.getElementById('avatarCancelBtn');
const avatarConfirmBtn = document.getElementById('avatarConfirmBtn');
const changePasswordModal = document.getElementById('changePasswordModal');
const passwordModalOverlay = document.getElementById('passwordModalOverlay');
const passwordModalClose = document.getElementById('passwordModalClose');
const changePasswordForm = document.getElementById('changePasswordForm');
const newPasswordInput = document.getElementById('newPassword');
const confirmPasswordInput = document.getElementById('confirmPassword');
const toggleNewPassword = document.getElementById('toggleNewPassword');
const toggleConfirmPassword = document.getElementById('toggleConfirmPassword');
const matchIndicator = document.getElementById('matchIndicator');
const passwordErrorMessage = document.getElementById('passwordErrorMessage');
const passwordCancelBtn = document.getElementById('passwordCancelBtn');
const passwordUpdateBtn = document.getElementById('passwordUpdateBtn');
const userLinkDisplay = document.getElementById('userLinkDisplay');
const copyLinkInline = document.getElementById('copyLinkInline');

let cropper = null;
let currentUserProfile = null;
let dashboardMessagesChannel = null;

const PRESET_AVATARS = [
    { name: 'Ghost', url: './assets/avatars/ghost.svg' },
    { name: 'Fox', url: './assets/avatars/fox.svg' },
    { name: 'Cat', url: './assets/avatars/cat.svg' },
    { name: 'Panda', url: './assets/avatars/panda.svg' },
    { name: 'Robot', url: './assets/avatars/robot.svg' },
    { name: 'Owl', url: './assets/avatars/owl.svg' },
    { name: 'Bear', url: './assets/avatars/bear.svg' },
    { name: 'Alien', url: './assets/avatars/alien.svg' }
];

function getUserLink(username) {
    const origin = window.location.origin;
    const basePath = window.location.pathname.replace(/dashboard\.html$/, '');
    if (!origin || origin === 'null') {
        return `${basePath}index.html?to=${encodeURIComponent(username)}`;
    }
    return `${origin}${basePath}index.html?to=${encodeURIComponent(username)}`;
}

function getDefaultAvatarUrl() {
    return './assets/default-avatar.svg';
}

function showToast(message, type = 'success') {
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast';
    if (type === 'error') toast.classList.add('error');
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2500);
}

async function initializeDashboard() {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
        window.location.href = './login.html';
        return;
    }

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

    if (profileError || !profile) {
        window.location.href = './login.html';
        return;
    }

    currentUserProfile = profile;

    if (userNameElement) {
        userNameElement.textContent = profile.display_name || profile.username;
    }

    const avatarUrl = profile.avatar_url || getDefaultAvatarUrl(profile.display_name || profile.username);
    setAvatarImage(avatarUrl);

    const link = getUserLink(profile.username);
    if (userLinkDisplay) {
        userLinkDisplay.textContent = link;
    }
    if (copyLinkInline) {
        copyLinkInline.dataset.link = link;
    }

    setupEventListeners();
    await refreshUnreadBadge();
    setupMessagesBadgeSubscription(profile.id);
    setupPushNotifications(profile.id);
}

function setupPushNotifications(userId) {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'default') {
        setTimeout(async () => {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                subscribeToPush(userId);
            }
        }, 4000);
    } else if (Notification.permission === 'granted') {
        subscribeToPush(userId);
    }
}

async function refreshUnreadBadge() {
    if (!currentUserProfile?.id) return;

    const { count, error } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', currentUserProfile.id)
        .eq('read', false);

    if (!error) updateAppBadge(count || 0);
}

function setupMessagesBadgeSubscription(recipientId) {
    dashboardMessagesChannel = supabase
        .channel(`dashboard-badge-${recipientId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `recipient_id=eq.${recipientId}`
        }, () => {
            refreshUnreadBadge();
        })
        .subscribe();
}

async function cleanupMessagesBadgeSubscription() {
    if (!dashboardMessagesChannel) return;
    try {
        await supabase.removeChannel(dashboardMessagesChannel);
    } catch (_) {}
    dashboardMessagesChannel = null;
}

function setAvatarImage(url) {
    if (avatarImageElement) avatarImageElement.src = url;
}

function setupEventListeners() {
    profileTrigger?.addEventListener('click', toggleProfileDropdown);

    document.addEventListener('click', (event) => {
        if (!event.target.closest('.profile-section')) {
            closeProfileDropdown();
        }
    });

    changeAvatarBtn?.addEventListener('click', handleChangeAvatar);
    changePasswordBtn?.addEventListener('click', handleChangePassword);
    logoutBtn?.addEventListener('click', handleLogout);
    avatarFileInput?.addEventListener('change', handleAvatarFileSelect);
    avatarPickerOverlay?.addEventListener('click', closeAvatarPickerModal);
    avatarPickerClose?.addEventListener('click', closeAvatarPickerModal);
    avatarUploadTrigger?.addEventListener('click', () => {
        closeAvatarPickerModal();
        avatarFileInput?.click();
    });
    avatarModalOverlay?.addEventListener('click', closeAvatarModal);
    avatarModalClose?.addEventListener('click', closeAvatarModal);
    avatarCancelBtn?.addEventListener('click', closeAvatarModal);
    avatarConfirmBtn?.addEventListener('click', handleConfirmAvatar);
    passwordModalOverlay?.addEventListener('click', closePasswordModal);
    passwordModalClose?.addEventListener('click', closePasswordModal);
    passwordCancelBtn?.addEventListener('click', closePasswordModal);
    changePasswordForm?.addEventListener('submit', handlePasswordSubmit);
    newPasswordInput?.addEventListener('input', validatePasswordMatch);
    confirmPasswordInput?.addEventListener('input', validatePasswordMatch);
    toggleNewPassword?.addEventListener('click', (event) => {
        event.preventDefault();
        togglePasswordVisibility(newPasswordInput, toggleNewPassword);
    });
    toggleConfirmPassword?.addEventListener('click', (event) => {
        event.preventDefault();
        togglePasswordVisibility(confirmPasswordInput, toggleConfirmPassword);
    });

    copyLinkInline?.addEventListener('click', () => {
        copyLinkToClipboard();
    });
}

function toggleProfileDropdown() {
    const isHidden = profileDropdown.classList.contains('hidden');
    if (isHidden) {
        profileDropdown.classList.remove('hidden');
        profileTrigger.classList.add('active');
    } else {
        closeProfileDropdown();
    }
}

function closeProfileDropdown() {
    profileDropdown?.classList.add('hidden');
    profileTrigger?.classList.remove('active');
}

function handleChangeAvatar() {
    closeProfileDropdown();
    openAvatarPickerModal();
}

function renderAvatarPresets() {
    if (!avatarPresetGrid) return;
    avatarPresetGrid.innerHTML = '';

    PRESET_AVATARS.forEach((preset) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'avatar-preset-item';
        item.setAttribute('aria-label', `Use ${preset.name} avatar`);
        if (currentUserProfile?.avatar_url === preset.url) {
            item.classList.add('selected');
        }

        const img = document.createElement('img');
        img.src = preset.url;
        img.alt = preset.name;
        item.appendChild(img);

        item.addEventListener('click', () => selectPresetAvatar(preset.url));
        avatarPresetGrid.appendChild(item);
    });
}

function openAvatarPickerModal() {
    if (!avatarPickerModal) return;
    if (avatarPickerPreviewImg) {
        avatarPickerPreviewImg.src = currentUserProfile?.avatar_url || getDefaultAvatarUrl();
    }
    renderAvatarPresets();
    avatarPickerModal.classList.remove('hidden');
    avatarPickerModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function closeAvatarPickerModal() {
    if (!avatarPickerModal) return;
    avatarPickerModal.classList.add('hidden');
    avatarPickerModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

async function selectPresetAvatar(presetUrl) {
    if (!currentUserProfile?.id) {
        showToast('User profile not found', 'error');
        return;
    }

    if (currentUserProfile.avatar_url === presetUrl) {
        closeAvatarPickerModal();
        return;
    }

    const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: presetUrl })
        .eq('id', currentUserProfile.id);

    if (error) {
        showToast(`Failed to update avatar: ${error.message}`, 'error');
        return;
    }

    currentUserProfile.avatar_url = presetUrl;
    setAvatarImage(presetUrl);
    showToast('Avatar updated successfully');
    closeAvatarPickerModal();
}

function handleAvatarFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.match('image/(png|jpeg)')) {
        showToast('Please select a PNG or JPEG image', 'error');
        avatarFileInput.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
        avatarCropImage.src = loadEvent.target.result;
        openAvatarModal();

        avatarCropImage.onload = () => {
            if (cropper) cropper.destroy();

            if (window.Cropper) {
                cropper = new Cropper(avatarCropImage, {
                    aspectRatio: 1,
                    viewMode: 1,
                    autoCropArea: 0.8,
                    responsive: true
                });
            }
        };
    };
    reader.readAsDataURL(file);
}

function openAvatarModal() {
    avatarCropModal.classList.remove('hidden');
    avatarCropModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function closeAvatarModal() {
    avatarCropModal.classList.add('hidden');
    avatarCropModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (cropper) {
        cropper.destroy();
        cropper = null;
    }
    avatarFileInput.value = '';
}

function handleConfirmAvatar() {
    if (!cropper) {
        showToast('Image cropper not ready.', 'error');
        return;
    }

    const canvas = cropper.getCroppedCanvas({
        maxWidth: 512,
        maxHeight: 512,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high'
    });

    canvas.toBlob(async (blob) => {
        if (!blob) {
            showToast('Failed to process image', 'error');
            return;
        }

        try {
            if (!currentUserProfile?.id) {
                showToast('User profile not found', 'error');
                return;
            }

            avatarConfirmBtn.disabled = true;
            showToast('Uploading avatar...');

            const filePath = `${currentUserProfile.id}/avatar.jpg`;

            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, blob, { upsert: true });

            if (uploadError) {
                showToast(`Upload failed: ${uploadError.message}`, 'error');
                avatarConfirmBtn.disabled = false;
                return;
            }

            const { data: urlData } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);

            const publicUrl = urlData?.publicUrl;

            if (!publicUrl) {
                showToast('Failed to get public URL', 'error');
                avatarConfirmBtn.disabled = false;
                return;
            }

            const { error: updateError } = await supabase
                .from('profiles')
                .update({ avatar_url: publicUrl })
                .eq('id', currentUserProfile.id);

            if (updateError) {
                showToast(`Profile update failed: ${updateError.message}`, 'error');
                avatarConfirmBtn.disabled = false;
                return;
            }

            currentUserProfile.avatar_url = publicUrl;
            setAvatarImage(publicUrl);
            showToast('Avatar updated successfully');
            closeAvatarModal();
            avatarConfirmBtn.disabled = false;
        } catch (error) {
            showToast(`Error: ${error.message}`, 'error');
            avatarConfirmBtn.disabled = false;
        }
    }, 'image/jpeg', 0.9);
}

function handleChangePassword() {
    closeProfileDropdown();
    openPasswordModal();
}

function openPasswordModal() {
    changePasswordModal.classList.remove('hidden');
    changePasswordModal.setAttribute('aria-hidden', 'false');
    passwordUpdateBtn.disabled = true;
    document.body.style.overflow = 'hidden';
    setTimeout(() => newPasswordInput?.focus(), 100);
}

function closePasswordModal() {
    changePasswordModal.classList.add('hidden');
    changePasswordModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    changePasswordForm.reset();
    hidePasswordError();
    if (matchIndicator) {
        matchIndicator.textContent = '';
        matchIndicator.className = 'match-indicator hidden';
    }
    passwordUpdateBtn.disabled = true;
}

function togglePasswordVisibility(input, toggleButton) {
    const isPassword = input.getAttribute('type') === 'password';
    input.setAttribute('type', isPassword ? 'text' : 'password');
    toggleButton.textContent = isPassword ? '🙈' : '👁️';
}

function validatePasswordMatch() {
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (matchIndicator) matchIndicator.classList.remove('hidden');

    if (!newPassword || !confirmPassword) {
        if (matchIndicator) {
            matchIndicator.textContent = 'Enter both fields';
            matchIndicator.className = 'match-indicator';
        }
        passwordUpdateBtn.disabled = true;
        return;
    }

    if (newPassword.length < 6) {
        if (matchIndicator) {
            matchIndicator.textContent = 'Minimum 6 characters';
            matchIndicator.className = 'match-indicator mismatch';
        }
        passwordUpdateBtn.disabled = true;
        return;
    }

    if (newPassword !== confirmPassword) {
        if (matchIndicator) {
            matchIndicator.textContent = '✗ Passwords do not match';
            matchIndicator.className = 'match-indicator mismatch';
        }
        passwordUpdateBtn.disabled = true;
        return;
    }

    if (matchIndicator) {
        matchIndicator.textContent = '✓ Passwords match';
        matchIndicator.className = 'match-indicator matched';
    }
    passwordUpdateBtn.disabled = false;
}

function showPasswordError(message) {
    if (passwordErrorMessage) {
        passwordErrorMessage.textContent = message;
        passwordErrorMessage.classList.remove('hidden');
    }
}

function hidePasswordError() {
    if (passwordErrorMessage) {
        passwordErrorMessage.textContent = '';
        passwordErrorMessage.classList.add('hidden');
    }
}

async function handlePasswordSubmit(event) {
    event.preventDefault();
    hidePasswordError();

    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (newPassword.length < 6) {
        showPasswordError('Password must be at least 6 characters');
        return;
    }

    if (newPassword !== confirmPassword) {
        showPasswordError('Passwords do not match');
        return;
    }

    passwordUpdateBtn.disabled = true;
    passwordUpdateBtn.textContent = 'Updating...';

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    passwordUpdateBtn.textContent = 'Update Password';

    if (error) {
        showPasswordError(error.message || 'Failed to update password. Please try again.');
        passwordUpdateBtn.disabled = false;
        return;
    }

    showToast('Password updated successfully!');
    closePasswordModal();
}

async function handleLogout() {
    updateAppBadge(0);
    await cleanupMessagesBadgeSubscription();
    await supabase.auth.signOut();
    window.location.href = './landing.html';
}

function shareOn(platform) {
    if (!currentUserProfile) {
        showToast('Please log in again.', 'error');
        return;
    }

    const userLink = getUserLink(currentUserProfile.username);
    const shareText = `Send "${currentUserProfile.username}" an anonymous message on Talk your mind - TYM\n${userLink}`;
    let shareUrl = '';

    switch (platform) {
        case 'whatsapp':
            shareUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
            break;
        case 'twitter':
            shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
            break;
        case 'facebook':
            shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(userLink)}&quote=${encodeURIComponent(shareText)}`;
            break;
        case 'instagram':
        case 'snapchat':
        default:
            copyLinkToClipboard();
            showToast('Link copied! Paste it into your app.');
            return;
    }

    window.open(shareUrl, '_blank', 'noopener,noreferrer');
}

function copyLinkToClipboard() {
    if (!currentUserProfile) {
        showToast('Please log in again.', 'error');
        return;
    }

    const userLink = getUserLink(currentUserProfile.username);
    navigator.clipboard.writeText(userLink)
        .then(() => showToast('Link copied to clipboard!'))
        .catch(() => showToast('Failed to copy link', 'error'));
}

window.shareOn = shareOn;
window.copyLinkToClipboard = copyLinkToClipboard;

window.addEventListener('load', initializeDashboard);
window.addEventListener('beforeunload', () => {
    cleanupMessagesBadgeSubscription();
});
