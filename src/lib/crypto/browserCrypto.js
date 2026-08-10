/**
 * Browser-compatible crypto utilities for Sixvault
 * Provides crypto functions that work in browser environment
 */

/**
 * Generate random bytes using Web Crypto API or fallback
 * @param {number} size - Number of bytes to generate
 * @returns {Uint8Array} Random bytes
 */
export function randomBytes(size) {
  // globalThis.crypto covers both the browser and Node, where these modules are
  // also exercised by the crypto tests.
  const source = globalThis.crypto;

  if (!source || typeof source.getRandomValues !== 'function') {
    // This used to fall back to Math.random(), which is not a cryptographic
    // generator: it is seeded from a small state, its output is predictable from
    // a handful of samples, and it was being used to produce RSA primes. Failing
    // loudly is the only safe response — silently degraded key material is worse
    // than no key material.
    throw new Error(
      'No cryptographic random source available (Web Crypto getRandomValues is required)'
    );
  }

  const bytes = new Uint8Array(size);
  source.getRandomValues(bytes);
  return bytes;
}

/**
 * Create SHA-256 hash of input string
 * @param {string} input - Input string to hash
 * @returns {Promise<Uint8Array>} Hash digest
 */
export async function sha256(input) {
  const subtle = globalThis.crypto?.subtle;

  if (!subtle) {
    // There was a hand-rolled 32-bit fallback here that emitted a console
    // warning and carried on. It had roughly no collision resistance and was
    // feeding key derivation, so a browser without Web Crypto silently produced
    // guessable keys. Refuse instead.
    throw new Error(
      'No cryptographic hash available (Web Crypto subtle.digest is required)'
    );
  }

  const data = new TextEncoder().encode(input);
  return new Uint8Array(await subtle.digest('SHA-256', data));
}

/**
 * Browser-compatible Buffer-like class
 */
export class BrowserBuffer {
  constructor(data) {
    if (typeof data === 'number') {
      this.data = new Uint8Array(data);
    } else if (typeof data === 'string') {
      this.data = new TextEncoder().encode(data);
    } else if (data instanceof Uint8Array || data instanceof Array) {
      this.data = new Uint8Array(data);
    } else {
      this.data = new Uint8Array(0);
    }
    this.length = this.data.length;
  }

  static from(data, encoding = 'utf8') {
    if (encoding === 'hex') {
      const bytes = new Uint8Array(data.length / 2);
      for (let i = 0; i < data.length; i += 2) {
        bytes[i / 2] = parseInt(data.substr(i, 2), 16);
      }
      return new BrowserBuffer(bytes);
    } else if (encoding === 'base64') {
      const binaryString = atob(data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return new BrowserBuffer(bytes);
    } else {
      return new BrowserBuffer(data);
    }
  }

  toString(encoding = 'utf8') {
    if (encoding === 'hex') {
      return Array.from(this.data)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    } else if (encoding === 'base64') {
      const binaryString = String.fromCharCode(...this.data);
      return btoa(binaryString);
    } else {
      return new TextDecoder().decode(this.data);
    }
  }

  slice(start, end) {
    return new BrowserBuffer(this.data.slice(start, end));
  }
}

/**
 * Browser crypto interface that mimics Node.js crypto module
 */
export const browserCrypto = {
  randomBytes: (size) => new BrowserBuffer(randomBytes(size)),
  
  createHash: (algorithm) => ({
    update: function(data) {
      this._data = (this._data || '') + data;
      return this;
    },
    digest: async function() {
      if (algorithm === 'sha256') {
        const hash = await sha256(this._data);
        return new BrowserBuffer(hash);
      }
      throw new Error(`Unsupported hash algorithm: ${algorithm}`);
    }
  })
};

// Export Buffer for compatibility
export const Buffer = BrowserBuffer; 