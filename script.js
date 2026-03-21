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

let selectedFile = null;
let recipientProfile = null;
let recipientDisplayName = 'AnonymousUser';

function getDefaultAvatarUrl(username) {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(username || 'user')}`;
}

function applyRecipientAvatar() {
    if (!recipientAvatarElement || !recipientAvatarFallbackElement) {
        return;
    }

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

function redirectToLandingPage() {
    window.location.href = './index.html';
}

async function initializeRecipient() {
    const urlParams = new URLSearchParams(window.location.search);
    const username = urlParams.get('to');

    if (!username) {
        return;
    }

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .single();

    if (error || !profile) {
        alert('User not found');
        redirectToLandingPage();
        return;
    }

    recipientProfile = profile;
    recipientDisplayName = profile.display_name || profile.username || recipientDisplayName;

    const usernameElement = document.querySelector('.username');
    const statusElement = document.querySelector('.status');

    if (usernameElement) {
        usernameElement.textContent = `@${recipientDisplayName}`;
    }

    if (statusElement && recipientDisplayName) {
        statusElement.textContent = `Send an anonymous message to ${recipientDisplayName}`;
    }

    applyRecipientAvatar();
}

window.addEventListener('load', initializeRecipient);

messageInput.addEventListener('input', () => {
    charCount.textContent = messageInput.value.length;
});

addImageBtn.addEventListener('click', () => {
    imageInput.click();
});

imageInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file.');
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        alert('Image must be less than 5MB.');
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
        alert('Please write a message.');
        messageInput.focus();
        return;
    }

    if (message.length < 3) {
        alert('Message must be at least 3 characters long.');
        messageInput.focus();
        return;
    }

    if (!recipientProfile?.id) {
        alert('User not found');
        redirectToLandingPage();
        return;
    }

    sendBtn.disabled = true;

    let imageUrl = null;

    try {
        if (selectedFile) {
            const uniqueFileName = `${Date.now()}-${selectedFile.name}`;
            console.log('Uploading image:', uniqueFileName);
            console.log('File size:', selectedFile.size, 'bytes');
            console.log('File type:', selectedFile.type);

            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('message-images')
                .upload(uniqueFileName, selectedFile);

            if (uploadError) {
                console.error('❌ Image upload error:', {
                    message: uploadError.message,
                    status: uploadError.status,
                    statusCode: uploadError.statusCode
                });
                alert(`Failed to upload image: ${uploadError.message}`);
                sendBtn.disabled = false;
                return;
            }

            console.log('✓ Image uploaded successfully');
            
            const { data: urlData } = supabase.storage
                .from('message-images')
                .getPublicUrl(uniqueFileName);
            
            imageUrl = urlData?.publicUrl;
            console.log('Image public URL:', imageUrl);

            if (!imageUrl) {
                console.error('Failed to get public URL for uploaded image');
            }
        }

        console.log('Inserting message with image_url:', imageUrl);
        const { error } = await supabase
            .from('messages')
            .insert([
                {
                    recipient_id: recipientProfile.id,
                    content: message,
                    image_url: imageUrl
                }
            ]);

        sendBtn.disabled = false;

        if (error) {
            console.error('❌ Error sending message:', {
                message: error.message,
                details: error.details,
                hint: error.hint
            });
            alert(`Failed to send message: ${error.message}`);
            return;
        }

        console.log('✓ Message sent successfully');
        showSuccessAnimation();
        resetForm();
    } catch (error) {
        console.error('❌ Error processing message:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        alert(`An error occurred: ${error.message}`);
        sendBtn.disabled = false;
    }
}

function resetForm() {
    messageInput.value = '';
    charCount.textContent = '0';
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
    confettiContainer.style.position = 'fixed';
    confettiContainer.style.top = '0';
    confettiContainer.style.left = '0';
    confettiContainer.style.width = '100%';
    confettiContainer.style.height = '100%';
    confettiContainer.style.pointerEvents = 'none';
    confettiContainer.style.zIndex = '999';
    document.body.appendChild(confettiContainer);

    for (let i = 0; i < confettiCount; i += 1) {
        const confetti = document.createElement('div');
        const size = Math.random() * 8 + 4;
        const duration = Math.random() * 2 + 2;
        const delay = Math.random() * 0.5;
        const startX = Math.random() * window.innerWidth;

        confetti.style.position = 'fixed';
        confetti.style.width = `${size}px`;
        confetti.style.height = `${size}px`;
        confetti.style.background = ['#667eea', '#764ba2', '#f093fb', '#4facfe', '#00f2fe'][Math.floor(Math.random() * 5)];
        confetti.style.left = `${startX}px`;
        confetti.style.top = '-10px';
        confetti.style.borderRadius = '50%';

        confettiContainer.appendChild(confetti);

        const animation = confetti.animate([
            { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
            { transform: `translate(${(Math.random() - 0.5) * 200}px, ${window.innerHeight + 20}px) rotate(${Math.random() * 360}deg)`, opacity: 0 }
        ], {
            duration: duration * 1000,
            delay: delay * 1000,
            easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        });

        animation.onfinish = () => confetti.remove();
    }

    setTimeout(() => confettiContainer.remove(), 4000);
}

window.closeSuccess = closeSuccess;