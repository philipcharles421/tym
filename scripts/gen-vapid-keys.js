// Generates a VAPID key pair for Web Push, using only Node's built-in crypto
// (no dependencies). Run with: node scripts/gen-vapid-keys.js
//
// VAPID_PUBLIC_KEY goes into utils.js (subscribeToPush) - it is not secret.
// VAPID_PRIVATE_KEY must only ever be set as a Supabase Edge Function secret,
// never committed or placed in client-side code.

const crypto = require('crypto');

function b64url(buf) {
    return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

const pubJwk = publicKey.export({ format: 'jwk' });
const privJwk = privateKey.export({ format: 'jwk' });

const x = Buffer.from(pubJwk.x, 'base64url');
const y = Buffer.from(pubJwk.y, 'base64url');
const rawPublic = Buffer.concat([Buffer.from([0x04]), x, y]);
const d = Buffer.from(privJwk.d, 'base64url');

console.log('VAPID_PUBLIC_KEY=' + b64url(rawPublic));
console.log('VAPID_PRIVATE_KEY=' + b64url(d));
