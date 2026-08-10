/**
 * Unwrap the token envelope the server returns from register, login and refresh.
 *
 * Every one of those endpoints returns the two JWTs AES-encrypted under a fresh
 * key, itself RSA-encrypted to the caller's public key. Unwrapping was
 * open-coded in AuthContext and, in the API layer's 401 retry, not done at all —
 * that path read `access_token` off the envelope root, where it does not exist,
 * and would have stored ciphertext even if it had. One implementation, so the
 * two cannot disagree.
 */

import AES from './AES';
import { decrypt as rsaDecrypt } from './RSA';

/**
 * @param {{access_token: string, refresh_token: string, encrypted_token_key: string}} data
 * @param {string} rsaPrivateKey
 * @returns {{access_token: string, refresh_token: string}} plaintext JWTs
 * @throws if the envelope is incomplete or does not decrypt
 */
export const unwrapTokenEnvelope = (data, rsaPrivateKey) => {
  if (!rsaPrivateKey) {
    throw new Error('No private key available to unwrap the token envelope');
  }

  if (!data?.encrypted_token_key || !data?.access_token || !data?.refresh_token) {
    throw new Error('Token envelope is incomplete');
  }

  const tokenKey = rsaDecrypt(data.encrypted_token_key, rsaPrivateKey);
  const aes = new AES();

  return {
    access_token: aes.decrypt(data.access_token, tokenKey),
    refresh_token: aes.decrypt(data.refresh_token, tokenKey)
  };
};

/**
 * Structural check that a string looks like a JWT.
 *
 * Used as a sanity check after unwrapping: a wrong key yields bytes that are not
 * a JWT, and storing those would produce confusing 401s later rather than a
 * clear failure here.
 */
export const isValidJWT = (token) => {
  try {
    if (!token || typeof token !== 'string') return false;

    const parts = token.split('.');
    if (parts.length !== 3) return false;

    const base64Url = (segment) =>
      JSON.parse(atob(segment.replace(/-/g, '+').replace(/_/g, '/')));

    const header = base64Url(parts[0]);
    const payload = base64Url(parts[1]);

    return Boolean(header && payload && header.typ && payload.exp);
  } catch {
    return false;
  }
};
