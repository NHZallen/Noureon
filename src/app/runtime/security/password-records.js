// The password of a local account (an account kept only on this device): a PBKDF2-SHA-256 record with a random salt. Records made by old
// versions hold a bare SHA-256 hash; they are still accepted and are upgraded the first time the right password is given.

const ITERATIONS = 210000;
const KDF = 'PBKDF2-SHA-256';

const bytesToHex = (bytes) => Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
const hexToBytes = (hex) => new Uint8Array((hex.match(/.{1,2}/g) || []).map(byte => parseInt(byte, 16)));

export const hashString = async (str) => {
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return bytesToHex(new Uint8Array(hashBuffer));
};

/** Compares two strings in a time that does not depend on where they differ. */
export const constantTimeEqual = (a, b) => {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
};

const derivePasswordHash = async (password, saltHex, iterations = ITERATIONS) => {
    const keyMaterial = await globalThis.crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await globalThis.crypto.subtle.deriveBits(
        { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations },
        keyMaterial,
        256
    );
    return bytesToHex(new Uint8Array(bits));
};

export const createPasswordRecord = async (username, password) => {
    const saltBytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(saltBytes);
    const passwordSalt = bytesToHex(saltBytes);
    const passwordHash = await derivePasswordHash(password, passwordSalt, ITERATIONS);
    return { username, passwordHash, passwordSalt, passwordIterations: ITERATIONS, passwordKdf: KDF };
};

export const verifyPasswordRecord = async (password, userRecord) => {
    if (userRecord?.passwordKdf === KDF && userRecord.passwordSalt) {
        const derivedHash = await derivePasswordHash(password, userRecord.passwordSalt, userRecord.passwordIterations || ITERATIONS);
        return constantTimeEqual(derivedHash, userRecord.passwordHash || '');
    }
    const legacyHash = await hashString(password);
    return constantTimeEqual(legacyHash, userRecord?.passwordHash || '');
};

/** An old record made again with PBKDF2 and saved under `userKey` with `setItem` (call only once the password was verified). */
export const upgradeLegacyPasswordRecord = async (password, userKey, userRecord, setItem) => {
    if (userRecord?.passwordKdf === KDF) return userRecord;
    const upgradedRecord = await createPasswordRecord(userRecord.username, password);
    await setItem(userKey, JSON.stringify(upgradedRecord));
    return upgradedRecord;
};
