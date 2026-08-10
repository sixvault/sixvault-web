import { browserCrypto as crypto, Buffer } from './browserCrypto.js';
import keccak from './SHA3Keccak.js';

// Modular exponentiation: (base^exp) % mod
function modPow(base, exp, mod) {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = (result * base) % mod;
    }
    base = (base * base) % mod;
    exp /= 2n;
  }
  return result;
}

// Generate a random BigInt in range [min, max]
function randomBigIntBetween(min, max) {
  const range = max - min + 1n;
  const byteLength = Math.ceil(range.toString(2).length / 8);
  let rnd;
  do {
    const bytes = crypto.randomBytes(byteLength);
    rnd = BigInt('0x' + bytes.toString('hex'));
  } while (rnd >= range);
  return rnd + min;
}

// Miller-Rabin probabilistic primality test
function isProbablyPrime(n, k = 5) {
  if (n < 2n) return false;
  if (n === 2n || n === 3n) return true;
  if (n % 2n === 0n) return false;

  let d = n - 1n;
  let r = 0n;
  while (d % 2n === 0n) {
    d /= 2n;
    r += 1n;
  }

  for (let i = 0; i < k; i++) {
    const a = randomBigIntBetween(2n, n - 2n);
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;

    let continueLoop = false;
    for (let j = 0n; j < r - 1n; j++) {
      x = modPow(x, 2n, n);
      if (x === n - 1n) {
        continueLoop = true;
        break;
      }
    }
    if (!continueLoop) return false;
  }

  return true;
}

// Generate a random BigInt with the specified number of bits
function randomBigInt(bits) {
  const bytes = Math.ceil(bits / 8);
  const buf = crypto.randomBytes(bytes);
  buf.data[0] |= 0b10000000; // Set top bit to ensure bit length
  buf.data[buf.data.length - 1] |= 1; // Ensure odd number
  return BigInt('0x' + buf.toString('hex'));
}

// Generate a cryptographically secure prime number
async function generatePrime(bits = 512) {
  let prime;
  do {
    prime = randomBigInt(bits);
  } while (!isProbablyPrime(prime));
  return prime;
}

function longToBytes(n) {
  if (n === 0n) return Buffer.from([0]);
  let hex = n.toString(16);
  if (hex.length % 2) hex = '0' + hex; // pad to even length
  return Buffer.from(hex, 'hex');
}

function bytesToLong(buf) {
  return BigInt('0x' + buf.toString('hex'));
}

function bytesToBase64(buf) {
  return buf.toString('base64');
}

function base64ToBytes(base64) {
  return Buffer.from(base64, 'base64');
}

function modInverse(a, m) {
  let m0 = m, t, q;
  let x0 = 0n, x1 = 1n;
  if (m === 1n) return 0n;
  while (a > 1n) {
    q = a / m;
    t = m;
    m = a % m;
    a = t;
    t = x0;
    x0 = x1 - q * x0;
    x1 = t;
  }
  if (x1 < 0n) x1 += m0;
  return x1;
}

// Generate RSA key pair
async function generateKeyPair(bits = 1024) {
  const p = await generatePrime(bits / 2);
  const q = await generatePrime(bits / 2);
  const n = p * q;
  const phi = (p - 1n) * (q - 1n);
  const e = 65537n; // Common public exponent
  const d = modInverse(e, phi);

  const keyPair = {
    publicKey: { 
      e: bytesToBase64(longToBytes(e)),
      n: bytesToBase64(longToBytes(n))
    },
    privateKey: { 
      d: bytesToBase64(longToBytes(d)),
      n: bytesToBase64(longToBytes(n))
    }
  };

  return {
    publicKey: Buffer.from(JSON.stringify(keyPair.publicKey)).toString('base64'),
    privateKey: Buffer.from(JSON.stringify(keyPair.privateKey)).toString('base64')
  };
}

// --- password-derived keys ------------------------------------------------
//
// The keypair *is* the credential and the decryption capability, and it is
// derived from the password alone, so the strength of the derivation is the
// strength of the whole scheme. Three things were wrong:
//
//   - generateSeededPrime ignored its `bits` argument. It hashed the seed once
//     with SHA-256 and used that digest as the candidate, so every prime was
//     256 bits and every modulus ~512 bits no matter that callers asked for
//     2048.
//   - There was no stretching, so the cost of guessing a key equalled the cost
//     of hashing a password guess.
//   - There was no salt, so two users with the same password got the same
//     keypair — and therefore each could log in as the other — and one
//     precomputed table would cover every user.
//
// Everything here is built on the project's own SHA-3, so no primitive is
// imported.

// Trial division before Miller-Rabin. Composite candidates are the common case
// during a prime search and almost all of them have a small factor, so this is
// what keeps a 2048-bit derivation to tens of milliseconds.
const SMALL_PRIMES = (() => {
  const limit = 4096;
  const sieve = new Uint8Array(limit);
  const primes = [];
  for (let i = 2; i < limit; i++) {
    if (!sieve[i]) {
      primes.push(BigInt(i));
      for (let j = i * i; j < limit; j += i) sieve[j] = 1;
    }
  }
  return primes;
})();

// Fixed Miller-Rabin bases. The random-base test used elsewhere in this file is
// fine for generating a fresh key, but not here: a composite that passed on one
// run and failed on another would yield a different keypair for the same
// password, locking the user out of their own records.
const MR_BASES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];

function isDeterministicallyPrime(n) {
  for (const p of SMALL_PRIMES) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }

  let d = n - 1n;
  let r = 0n;
  while (d % 2n === 0n) {
    d /= 2n;
    r += 1n;
  }

  for (const a of MR_BASES) {
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;

    let witnessed = false;
    for (let i = 0n; i < r - 1n; i++) {
      x = (x * x) % n;
      if (x === n - 1n) {
        witnessed = true;
        break;
      }
    }
    if (!witnessed) return false;
  }

  return true;
}

// Iterations of SHA-3 applied to the password before anything else. Deliberately
// slow: this is the only thing standing between a leaked public key and the
// private key that matches it. Raising it invalidates every existing keypair.
const STRETCH_ITERATIONS = 10000;

/**
 * Stretch a password into a seed digest, salted with the user's id.
 *
 * @param {string} password
 * @param {string} salt  the user's nim_nip
 * @returns {string} hex digest
 */
function stretchSeed(password, salt) {
  const digest = (text) => keccak(Array.from(new TextEncoder().encode(text)), 256);

  let h = digest(`sixvault|v2|${salt}|${password}`);
  for (let i = 0; i < STRETCH_ITERATIONS; i++) {
    // The counter is included so the chain cannot fall into a short cycle.
    h = digest(`${h}|${i}`);
  }
  return h;
}

/**
 * Expand a seed digest into a candidate of exactly `bits` bits.
 *
 * Counter-mode: as many digest blocks as the requested width needs, rather than
 * the single 256-bit digest that silently capped the key size.
 */
function expandToCandidate(seedHex, label, bits) {
  const byteLength = Math.ceil(bits / 8);
  let hex = '';
  for (let counter = 0; hex.length / 2 < byteLength; counter++) {
    hex += keccak(
      Array.from(new TextEncoder().encode(`${seedHex}|${label}|${counter}`)),
      256
    );
  }

  const bytes = new Uint8Array(byteLength);
  for (let i = 0; i < byteLength; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }

  // Top two bits set so that p * q is always exactly `bits * 2` wide, and the
  // low bit set so the search starts on an odd number.
  bytes[0] |= 0b11000000;
  bytes[byteLength - 1] |= 1;

  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

/**
 * The first probable prime at or above `candidate`, stepping by two.
 *
 * Searching upward preserves the candidate's bit length. The previous code
 * re-hashed on every miss, which is both slower and why the requested size was
 * never honoured.
 */
function nextPrimeFrom(candidate) {
  let value = candidate;
  while (!isDeterministicallyPrime(value)) value += 2n;
  return value;
}

// Generate a deterministic prime number from a stretched seed
function generateSeededPrime(seedHex, label, bits) {
  return nextPrimeFrom(expandToCandidate(seedHex, label, bits));
}

/**
 * Derive an RSA keypair deterministically from a password.
 *
 * @param {string} password
 * @param {number} bits    modulus size; honoured, unlike before
 * @param {string} salt    the user's nim_nip. Required: without it, identical
 *                         passwords across users produce identical keypairs.
 */
async function generateKeyPairFromSeed(password, bits = 2048, salt) {
  if (typeof salt !== 'string' || salt.length === 0) {
    throw new Error(
      'generateKeyPairFromSeed requires a salt (the user\'s nim_nip)'
    );
  }

  const seed = stretchSeed(password, salt);

  const p = generateSeededPrime(seed, 'p', bits / 2);
  let q = generateSeededPrime(seed, 'q', bits / 2);

  // Astronomically unlikely, but p === q would make the modulus a perfect
  // square and the key trivially factorable.
  let attempt = 0;
  while (q === p) {
    attempt += 1;
    q = generateSeededPrime(seed, `q${attempt}`, bits / 2);
  }

  const n = p * q;
  const phi = (p - 1n) * (q - 1n);
  const e = 65537n; // Common public exponent
  const d = modInverse(e, phi);

  const keyPair = {
    publicKey: { 
      e: bytesToBase64(longToBytes(e)),
      n: bytesToBase64(longToBytes(n))
    },
    privateKey: { 
      d: bytesToBase64(longToBytes(d)),
      n: bytesToBase64(longToBytes(n))
    }
  };

  return {
    publicKey: Buffer.from(JSON.stringify(keyPair.publicKey)).toString('base64'),
    privateKey: Buffer.from(JSON.stringify(keyPair.privateKey)).toString('base64')
  };
}

// RSA Encryption
function encrypt(message, publicKeyBase64) {
  const publicKey = JSON.parse(Buffer.from(publicKeyBase64, 'base64').toString());
  const e = bytesToLong(base64ToBytes(publicKey.e));
  const n = bytesToLong(base64ToBytes(publicKey.n));
  const messageBigInt = bytesToLong(Buffer.from(message));
  const encrypted = modPow(messageBigInt, e, n);
  return bytesToBase64(longToBytes(encrypted));
}

// RSA Decryption
function decrypt(encryptedMessage, privateKeyBase64) {
  const privateKey = JSON.parse(Buffer.from(privateKeyBase64, 'base64').toString());
  const d = bytesToLong(base64ToBytes(privateKey.d));
  const n = bytesToLong(base64ToBytes(privateKey.n));
  const encryptedBigInt = bytesToLong(base64ToBytes(encryptedMessage));
  const decrypted = modPow(encryptedBigInt, d, n);
  return longToBytes(decrypted).toString();
}

// RSA Signing
function sign(message, privateKeyBase64) {
  const privateKey = JSON.parse(Buffer.from(privateKeyBase64, 'base64').toString());
  const d = bytesToLong(base64ToBytes(privateKey.d));
  const n = bytesToLong(base64ToBytes(privateKey.n));
  const messageBuffer = Buffer.from(message, 'utf8');
  const messageBytes = Array.from(messageBuffer.data);
  const hashHex = keccak(messageBytes, 256);
  const messageHash = Buffer.from(hashHex, 'hex');
  const messageBigInt = bytesToLong(messageHash);
  const signature = modPow(messageBigInt, d, n);
  return longToBytes(signature).toString('hex');
}

// RSA Verification
function verify(message, signature, publicKeyBase64) {
  const publicKey = JSON.parse(Buffer.from(publicKeyBase64, 'base64').toString());
  const e = bytesToLong(base64ToBytes(publicKey.e));
  const n = bytesToLong(base64ToBytes(publicKey.n));
  const messageBuffer = Buffer.from(message, 'utf8');
  const messageBytes = Array.from(messageBuffer.data);
  const hashHex = keccak(messageBytes, 256);
  const messageHash = Buffer.from(hashHex, 'hex');
  const signatureBigInt = bytesToLong(Buffer.from(signature, 'hex'));
  const decryptedSignature = modPow(signatureBigInt, e, n);
  return decryptedSignature === bytesToLong(messageHash);
}

/**
 * The pre-v2 derivation: a single SHA-256 digest as the prime candidate, no
 * salt, no stretching, and a hash chain for the candidate search — hence a
 * ~512-bit modulus whatever `bits` said.
 *
 * Retained only so a user whose account predates the change can prove ownership
 * once and be re-keyed; see rekeyIfLegacy in AuthContext. Nothing else may call
 * it, and it should be deleted once no legacy accounts remain.
 */
async function generateKeyPairFromSeedLegacy(seed) {
  const legacyPrime = async (chainSeed) => {
    const digest = async (text) => {
      const hasher = crypto.createHash('sha256');
      hasher.update(text);
      const hash = await hasher.digest();
      const buf = Buffer.from(hash.toString('hex'), 'hex');
      buf.data[0] |= 0b10000000;
      buf.data[buf.data.length - 1] |= 1;
      return BigInt('0x' + buf.toString('hex'));
    };

    let prime = await digest(chainSeed);
    while (!isProbablyPrime(prime)) {
      prime = await digest(prime.toString());
    }
    return prime;
  };

  const p = await legacyPrime(seed);
  const q = await legacyPrime(seed + p.toString());

  const n = p * q;
  const phi = (p - 1n) * (q - 1n);
  const e = 65537n;
  const d = modInverse(e, phi);

  return {
    publicKey: Buffer.from(
      JSON.stringify({ e: bytesToBase64(longToBytes(e)), n: bytesToBase64(longToBytes(n)) })
    ).toString('base64'),
    privateKey: Buffer.from(
      JSON.stringify({ d: bytesToBase64(longToBytes(d)), n: bytesToBase64(longToBytes(n)) })
    ).toString('base64')
  };
}

export {
  generateKeyPair,
  generateKeyPairFromSeed,
  generateKeyPairFromSeedLegacy,
  encrypt,
  decrypt,
  sign,
  verify
};
