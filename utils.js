import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://hyvymincmtmcnvglgofh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5dnltaW5jbXRtY252Z2xnb2ZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MDgwNjQsImV4cCI6MjA4OTI4NDA2NH0.SRDHk4Yc5tL-TxP7cTVezvSj9WVQp_jo0GAa_90Hbzs';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const ACCOUNTS_KEY = 'tym_accounts_v1';
const SESSION_KEYS = {
    userId: 'tym_user_id',
    linkId: 'tym_linkId',
    displayName: 'tym_display_name',
    username: 'tym_username'
};
const REMEMBER_USERNAME_KEY = 'tym_remember_username';

function getStorage() {
    try {
        return globalThis.localStorage || null;
    } catch {
        return null;
    }
}

function safeParseJSON(value, fallback) {
    if (typeof value !== 'string' || value.trim() === '') {
        return fallback;
    }

    try {
        const parsed = JSON.parse(value);
        return parsed ?? fallback;
    } catch {
        return fallback;
    }
}

function safeStringifyJSON(value, fallback = '[]') {
    try {
        return JSON.stringify(value);
    } catch {
        return fallback;
    }
}

function normalizeToLookupString(value) {
    return String(value || '').trim().toLowerCase();
}

function getMessagesKey(userId) {
    return `tym_received_messages_${String(userId || '')}`;
}

function getAvatarKey(userId) {
    return `tym_user_avatar_${String(userId || '')}`;
}

function readArray(key) {
    const storage = getStorage();
    if (!storage) {
        return [];
    }

    const parsed = safeParseJSON(storage.getItem(key), []);
    return Array.isArray(parsed) ? parsed : [];
}

function writeJSON(key, value, fallback = '[]') {
    const storage = getStorage();
    if (!storage) {
        return;
    }

    storage.setItem(key, safeStringifyJSON(value, fallback));
}

export function getAllAccounts() {
    return readArray(ACCOUNTS_KEY);
}

export function saveAccount(accountObj) {
    if (!accountObj || typeof accountObj !== 'object') {
        return null;
    }

    const accounts = getAllAccounts();
    const incomingId = String(accountObj.id || '');
    const incomingUsername = normalizeToLookupString(accountObj.username || accountObj.displayName);
    const incomingLinkId = normalizeToLookupString(accountObj.linkId);

    const index = accounts.findIndex((item) => {
        const sameId = incomingId && String(item?.id || '') === incomingId;
        const sameUsername = incomingUsername && normalizeToLookupString(item?.username || item?.displayName) === incomingUsername;
        const sameLinkId = incomingLinkId && normalizeToLookupString(item?.linkId) === incomingLinkId;
        return sameId || sameUsername || sameLinkId;
    });

    if (index >= 0) {
        accounts[index] = accountObj;
    } else {
        accounts.push(accountObj);
    }

    writeJSON(ACCOUNTS_KEY, accounts);
    return accountObj;
}

export function findAccountByUsername(username) {
    const target = normalizeToLookupString(username);
    if (!target) {
        return null;
    }

    const account = getAllAccounts().find((item) => {
        const candidate = normalizeToLookupString(item?.username || item?.displayName);
        return candidate === target;
    });

    return account || null;
}

export function findAccountByLinkId(linkId) {
    const target = normalizeToLookupString(linkId);
    if (!target) {
        return null;
    }

    const account = getAllAccounts().find((item) => normalizeToLookupString(item?.linkId) === target);
    return account || null;
}

export function startSession(accountObj) {
    const storage = getStorage();
    if (!storage || !accountObj) {
        return;
    }

    storage.setItem(SESSION_KEYS.userId, String(accountObj.id || ''));
    storage.setItem(SESSION_KEYS.linkId, String(accountObj.linkId || ''));
    storage.setItem(SESSION_KEYS.displayName, String(accountObj.displayName || ''));
    storage.setItem(SESSION_KEYS.username, String(accountObj.username || accountObj.linkId || ''));
}

export function clearSession() {
    const storage = getStorage();
    if (!storage) {
        return;
    }

    storage.removeItem(SESSION_KEYS.userId);
    storage.removeItem(SESSION_KEYS.linkId);
    storage.removeItem(SESSION_KEYS.displayName);
    storage.removeItem(SESSION_KEYS.username);
}

export function getCurrentSession() {
    const storage = getStorage();
    if (!storage) {
        return null;
    }

    const id = storage.getItem(SESSION_KEYS.userId);
    if (!id) {
        return null;
    }

    return {
        id,
        linkId: storage.getItem(SESSION_KEYS.linkId) || '',
        displayName: storage.getItem(SESSION_KEYS.displayName) || '',
        username: storage.getItem(SESSION_KEYS.username) || ''
    };
}

export function setRememberedUsername(username) {
    const storage = getStorage();
    if (!storage) {
        return;
    }

    const value = String(username || '').trim();
    if (!value) {
        storage.removeItem(REMEMBER_USERNAME_KEY);
        return;
    }

    storage.setItem(REMEMBER_USERNAME_KEY, value);
}

export function getRememberedUsername() {
    const storage = getStorage();
    if (!storage) {
        return null;
    }

    return storage.getItem(REMEMBER_USERNAME_KEY);
}

export function getUserMessages(userId) {
    if (!userId) {
        return [];
    }

    return readArray(getMessagesKey(userId));
}

export function saveMessage(userId, messageObj) {
    if (!userId) {
        return null;
    }

    const messages = getUserMessages(userId);
    messages.push(messageObj);
    writeJSON(getMessagesKey(userId), messages);
    return messageObj;
}

export function getUserAvatar(userId) {
    if (!userId) {
        return null;
    }

    const storage = getStorage();
    if (!storage) {
        return null;
    }

    return storage.getItem(getAvatarKey(userId));
}

export function saveUserAvatar(userId, base64String) {
    if (!userId) {
        return;
    }

    const storage = getStorage();
    if (!storage) {
        return;
    }

    storage.setItem(getAvatarKey(userId), String(base64String || ''));
}
