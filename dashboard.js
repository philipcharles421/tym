import {
    supabase
} from './utils.js';

const profileTrigger = document.getElementById('profileTrigger');
const profileDropdown = document.getElementById('profileDropdown');
const changeAvatarBtn = document.getElementById('changeAvatarBtn');
const changePasswordBtn = document.getElementById('changePasswordBtn');
const logoutBtn = document.getElementById('logoutBtn');
const toast = document.getElementById('toast');
const userNameElement = document.getElementById('userName');
const avatarImageElement = document.querySelector('.avatar-image');
const avatarFileInput = document.getElementById('avatarFileInput');
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

let cropper = null;
let currentUserProfile = null;

function getUserLink(username) {
    return `${window.location.origin}${window.location.pathname.replace('dashboard.html', 'index.html')}?to=${encodeURIComponent(username)}`;
}

function getDefaultAvatarUrl(displayName) {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(displayName || 'user')}`;
}

function showToast(message, type = 'success') {
    if (!toast) {
        return;
    }

    toast.textContent = message;
    toast.className = 'toast';
    if (type === 'error') {
        toast.classList.add('error');
    }
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 2500);
}

  async function initializeDashboard() {
    console.log("1. Checking session...");
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
        console.error("No session found in Supabase Auth!", sessionError);
        // window.location.href = './login.html'; // Disabled so we don't loop
        return;
    }

    console.log("2. Session found! User ID:", session.user.id);
    console.log("3. Fetching profile from database...");

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();

    if (profileError || !profile) {
        console.error("4. MISSING PROFILE ERROR: The user logged in, but their profile is missing from the database table!", profileError);
        // window.location.href = './login.html'; // Disabled so we don't loop
        return;
    }

    console.log("5. Profile loaded successfully!", profile);
    currentUserProfile = profile;

    if (userNameElement) {
        userNameElement.textContent = profile.display_name || profile.username;
    }

    const avatarUrl = profile.avatar_url || getDefaultAvatarUrl(profile.display_name || profile.username);
    setAvatarImage(avatarUrl);
    setupEventListeners();
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
    avatarFileInput?.click();
}

function handleAvatarFileSelect(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

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
            if (cropper) {
                cropper.destroy();
            }

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
            console.error('Failed to create blob from canvas');
            showToast('Failed to process image', 'error');
            return;
        }

        try {
            if (!currentUserProfile?.id) {
                console.error('User profile not found');
                showToast('User profile not found', 'error');
                return;
            }

            avatarConfirmBtn.disabled = true;
            console.log('Starting avatar upload for user:', currentUserProfile.id);
            showToast('Uploading avatar...');

            const filePath = `${currentUserProfile.id}/avatar.jpg`;
            console.log('Avatar file path:', filePath);
            console.log('Blob size:', blob.size, 'bytes');

            const { data, error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, blob, { upsert: true });

            if (uploadError) {
                console.error('❌ Avatar upload error:', {
                    message: uploadError.message,
                    status: uploadError.status,
                    statusCode: uploadError.statusCode,
                    error: uploadError.error
                });
                showToast(`Upload failed: ${uploadError.message}`, 'error');
                avatarConfirmBtn.disabled = false;
                return;
            }

            console.log('✓ Avatar uploaded successfully');
            
            const { data: urlData } = supabase.storage
                .from('avatars')
                .getPublicUrl(filePath);
            
            const publicUrl = urlData?.publicUrl;
            console.log('Public URL:', publicUrl);

            if (!publicUrl) {
                console.error('Failed to get public URL');
                showToast('Failed to get public URL', 'error');
                avatarConfirmBtn.disabled = false;
                return;
            }

            const { error: updateError } = await supabase
                .from('profiles')
                .update({ avatar_url: publicUrl })
                .eq('id', currentUserProfile.id);

            if (updateError) {
                console.error('❌ Profile update error:', {
                    message: updateError.message,
                    details: updateError.details,
                    hint: updateError.hint
                });
                showToast(`Profile update failed: ${updateError.message}`, 'error');
                avatarConfirmBtn.disabled = false;
                return;
            }

            console.log('✓ Profile updated successfully');
            currentUserProfile.avatar_url = publicUrl;
            setAvatarImage(publicUrl);
            showToast('Avatar updated successfully');
            closeAvatarModal();
            avatarConfirmBtn.disabled = false;
        } catch (error) {
            console.error('❌ Avatar update error:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
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
}

function closePasswordModal() {
    changePasswordModal.classList.add('hidden');
    changePasswordModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    changePasswordForm.reset();
    hidePasswordError();
    matchIndicator.classList.add('hidden');
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

    matchIndicator.classList.remove('hidden');

    if (!newPassword || !confirmPassword) {
        matchIndicator.textContent = 'Enter both fields';
        passwordUpdateBtn.disabled = true;
        return;
    }

    if (newPassword.length < 6) {
        matchIndicator.textContent = 'Minimum 6 characters';
        passwordUpdateBtn.disabled = true;
        return;
    }

    if (newPassword !== confirmPassword) {
        matchIndicator.textContent = 'Passwords do not match';
        passwordUpdateBtn.disabled = true;
        return;
    }

    matchIndicator.textContent = 'Passwords match';
    passwordUpdateBtn.disabled = false;
}

function showPasswordError(message) {
    passwordErrorMessage.textContent = message;
    passwordErrorMessage.classList.remove('hidden');
}

function hidePasswordError() {
    passwordErrorMessage.textContent = '';
    passwordErrorMessage.classList.add('hidden');
}

function handlePasswordSubmit(event) {
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

    showToast('Password update will be implemented in Phase 4');
    passwordUpdateBtn.textContent = 'Update Password';
    closePasswordModal();
}

async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = './landing.html';
}

function shareOn(platform) {
    if (!currentUserProfile) {
        showToast('Please log in again.', 'error');
        return;
    }

    const userLink = getUserLink(currentUserProfile.username);
    const shareText = `Send "${currentUserProfile.username}" an anonymous message on Talk your mind- TYM\n${userLink}`;
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
            showToast('Link copied. Paste it into your app.');
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
        .then(() => showToast('Link copied to clipboard'))
        .catch(() => showToast('Failed to copy link', 'error'));
}

window.shareOn = shareOn;
window.copyLinkToClipboard = copyLinkToClipboard;

window.addEventListener('load', initializeDashboard);