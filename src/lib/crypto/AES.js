// AES Implementation
class AES {
    constructor(keySize = 128) {
        this.keySize = keySize;
        this.Nk = keySize / 32;  // Number of 32-bit words in the key
        this.Nr = this.Nk + 6;   // Number of rounds
        this.Nb = 4;             // Number of columns in state (always 4 for AES)
    }

    // S-box and inverse S-box
    static SBOX = [
        0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
        0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
        0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
        0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
        0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
        0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
        0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
        0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
        0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
        0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
        0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
        0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
        0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
        0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
        0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
        0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
    ];

    static INV_SBOX = [
        0x52, 0x09, 0x6a, 0xd5, 0x30, 0x36, 0xa5, 0x38, 0xbf, 0x40, 0xa3, 0x9e, 0x81, 0xf3, 0xd7, 0xfb,
        0x7c, 0xe3, 0x39, 0x82, 0x9b, 0x2f, 0xff, 0x87, 0x34, 0x8e, 0x43, 0x44, 0xc4, 0xde, 0xe9, 0xcb,
        0x54, 0x7b, 0x94, 0x32, 0xa6, 0xc2, 0x23, 0x3d, 0xee, 0x4c, 0x95, 0x0b, 0x42, 0xfa, 0xc3, 0x4e,
        0x08, 0x2e, 0xa1, 0x66, 0x28, 0xd9, 0x24, 0xb2, 0x76, 0x5b, 0xa2, 0x49, 0x6d, 0x8b, 0xd1, 0x25,
        0x72, 0xf8, 0xf6, 0x64, 0x86, 0x68, 0x98, 0x16, 0xd4, 0xa4, 0x5c, 0xcc, 0x5d, 0x65, 0xb6, 0x92,
        0x6c, 0x70, 0x48, 0x50, 0xfd, 0xed, 0xb9, 0xda, 0x5e, 0x15, 0x46, 0x57, 0xa7, 0x8d, 0x9d, 0x84,
        0x90, 0xd8, 0xab, 0x00, 0x8c, 0xbc, 0xd3, 0x0a, 0xf7, 0xe4, 0x58, 0x05, 0xb8, 0xb3, 0x45, 0x06,
        0xd0, 0x2c, 0x1e, 0x8f, 0xca, 0x3f, 0x0f, 0x02, 0xc1, 0xaf, 0xbd, 0x03, 0x01, 0x13, 0x8a, 0x6b,
        0x3a, 0x91, 0x11, 0x41, 0x4f, 0x67, 0xdc, 0xea, 0x97, 0xf2, 0xcf, 0xce, 0xf0, 0xb4, 0xe6, 0x73,
        0x96, 0xac, 0x74, 0x22, 0xe7, 0xad, 0x35, 0x85, 0xe2, 0xf9, 0x37, 0xe8, 0x1c, 0x75, 0xdf, 0x6e,
        0x47, 0xf1, 0x1a, 0x71, 0x1d, 0x29, 0xc5, 0x89, 0x6f, 0xb7, 0x62, 0x0e, 0xaa, 0x18, 0xbe, 0x1b,
        0xfc, 0x56, 0x3e, 0x4b, 0xc6, 0xd2, 0x79, 0x20, 0x9a, 0xdb, 0xc0, 0xfe, 0x78, 0xcd, 0x5a, 0xf4,
        0x1f, 0xdd, 0xa8, 0x33, 0x88, 0x07, 0xc7, 0x31, 0xb1, 0x12, 0x10, 0x59, 0x27, 0x80, 0xec, 0x5f,
        0x60, 0x51, 0x7f, 0xa9, 0x19, 0xb5, 0x4a, 0x0d, 0x2d, 0xe5, 0x7a, 0x9f, 0x93, 0xc9, 0x9c, 0xef,
        0xa0, 0xe0, 0x3b, 0x4d, 0xae, 0x2a, 0xf5, 0xb0, 0xc8, 0xeb, 0xbb, 0x3c, 0x83, 0x53, 0x99, 0x61,
        0x17, 0x2b, 0x04, 0x7e, 0xba, 0x77, 0xd6, 0x26, 0xe1, 0x69, 0x14, 0x63, 0x55, 0x21, 0x0c, 0x7d
    ];

    // Rcon values for key expansion
    static RCON = [0x00, 0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

    // Helper functions

    /**
     * Plaintext to bytes, as UTF-8.
     *
     * charCodeAt was used here, which truncates every code point to its low
     * byte: any character above U+00FF was silently corrupted, so a student
     * name or course title outside Latin-1 did not survive a round trip.
     */
    static stringToBytes(str) {
        return new TextEncoder().encode(str);
    }

    static bytesToString(bytes) {
        return new TextDecoder().decode(new Uint8Array(bytes));
    }

    static bytesToBase64(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    static base64ToBytes(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    static padBytes(bytes) {
        const padLength = 16 - (bytes.length % 16);
        const paddedBytes = new Uint8Array(bytes.length + padLength);
        paddedBytes.set(bytes);
        paddedBytes.fill(padLength, bytes.length);
        return paddedBytes;
    }

    /**
     * Strip PKCS#7 padding, rejecting anything that is not valid padding.
     *
     * The length byte was previously trusted outright, so decryption under the
     * wrong key returned a silently truncated string — or, when the final byte
     * exceeded the buffer length, an empty one — instead of failing. Callers
     * had no way to distinguish that from a successful decryption of empty
     * data.
     */
    static unpadBytes(bytes) {
        const padLength = bytes[bytes.length - 1];

        if (padLength < 1 || padLength > 16 || padLength > bytes.length) {
            throw new Error('Invalid AES padding: wrong key or corrupt data');
        }

        for (let i = bytes.length - padLength; i < bytes.length; i++) {
            if (bytes[i] !== padLength) {
                throw new Error('Invalid AES padding: wrong key or corrupt data');
            }
        }

        return bytes.slice(0, bytes.length - padLength);
    }

    /**
     * Key material as the exact number of bytes the cipher needs.
     *
     * A 32-character hex string is decoded to 16 bytes. keyExpansion used to
     * take one byte per *character* and read only the first 16 of them, so such
     * a key contributed 16 ASCII hex digits — 64 bits of entropy for a cipher
     * advertised as 128-bit. Raw bytes and non-hex strings of the right length
     * are also accepted; anything else is rejected rather than truncated.
     *
     * Must match sixvault-api/app/utils/crypto/AES.js exactly: the two encrypt
     * and decrypt each other's data.
     */
    keyBytes(key) {
        const required = this.Nk * 4;

        let bytes;
        if (key instanceof Uint8Array) {
            bytes = key;
        } else if (typeof key === 'string') {
            if (key.length === required * 2 && /^[0-9a-fA-F]+$/.test(key)) {
                bytes = new Uint8Array(required);
                for (let i = 0; i < required; i++) {
                    bytes[i] = parseInt(key.substr(i * 2, 2), 16);
                }
            } else {
                bytes = AES.stringToBytes(key);
            }
        } else {
            throw new TypeError('AES key must be a hex string, a string, or raw bytes');
        }

        if (bytes.length !== required) {
            throw new Error(
                `AES-${this.keySize} requires a ${required}-byte key; received ${bytes.length} bytes`
            );
        }

        return bytes;
    }

    // Key expansion
    keyExpansion(key) {
        const keyWords = new Array(this.Nb * (this.Nr + 1));
        const keyBytes = this.keyBytes(key);

        // Copy initial key
        for (let i = 0; i < this.Nk; i++) {
            keyWords[i] = (keyBytes[4 * i] << 24) |
                         (keyBytes[4 * i + 1] << 16) |
                         (keyBytes[4 * i + 2] << 8) |
                         keyBytes[4 * i + 3];
        }

        // Generate remaining words
        for (let i = this.Nk; i < this.Nb * (this.Nr + 1); i++) {
            let temp = keyWords[i - 1];
            if (i % this.Nk === 0) {
                temp = this.subWord(this.rotWord(temp)) ^ AES.RCON[i / this.Nk];
            } else if (this.Nk > 6 && i % this.Nk === 4) {
                temp = this.subWord(temp);
            }
            keyWords[i] = keyWords[i - this.Nk] ^ temp;
        }

        return keyWords;
    }

    rotWord(word) {
        return ((word << 8) | (word >>> 24)) >>> 0;
    }

    subWord(word) {
        let result = 0;
        for (let i = 0; i < 4; i++) {
            const byte = (word >>> (24 - i * 8)) & 0xff;
            result |= AES.SBOX[byte] << (24 - i * 8);
        }
        return result;
    }

    // AES transformations
    subBytes(state) {
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                state[i][j] = AES.SBOX[state[i][j]];
            }
        }
    }

    invSubBytes(state) {
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                state[i][j] = AES.INV_SBOX[state[i][j]];
            }
        }
    }

    shiftRows(state) {
        for (let i = 1; i < 4; i++) {
            const row = state[i].slice();
            for (let j = 0; j < 4; j++) {
                state[i][j] = row[(j + i) % 4];
            }
        }
    }

    invShiftRows(state) {
        for (let i = 1; i < 4; i++) {
            const row = state[i].slice();
            for (let j = 0; j < 4; j++) {
                state[i][j] = row[(j - i + 4) % 4];
            }
        }
    }

    mixColumns(state) {
        for (let i = 0; i < 4; i++) {
            const s0 = state[0][i];
            const s1 = state[1][i];
            const s2 = state[2][i];
            const s3 = state[3][i];

            state[0][i] = this.gmul(0x02, s0) ^ this.gmul(0x03, s1) ^ s2 ^ s3;
            state[1][i] = s0 ^ this.gmul(0x02, s1) ^ this.gmul(0x03, s2) ^ s3;
            state[2][i] = s0 ^ s1 ^ this.gmul(0x02, s2) ^ this.gmul(0x03, s3);
            state[3][i] = this.gmul(0x03, s0) ^ s1 ^ s2 ^ this.gmul(0x02, s3);
        }
    }

    invMixColumns(state) {
        for (let i = 0; i < 4; i++) {
            const s0 = state[0][i];
            const s1 = state[1][i];
            const s2 = state[2][i];
            const s3 = state[3][i];

            state[0][i] = this.gmul(0x0e, s0) ^ this.gmul(0x0b, s1) ^ this.gmul(0x0d, s2) ^ this.gmul(0x09, s3);
            state[1][i] = this.gmul(0x09, s0) ^ this.gmul(0x0e, s1) ^ this.gmul(0x0b, s2) ^ this.gmul(0x0d, s3);
            state[2][i] = this.gmul(0x0d, s0) ^ this.gmul(0x09, s1) ^ this.gmul(0x0e, s2) ^ this.gmul(0x0b, s3);
            state[3][i] = this.gmul(0x0b, s0) ^ this.gmul(0x0d, s1) ^ this.gmul(0x09, s2) ^ this.gmul(0x0e, s3);
        }
    }

    gmul(a, b) {
        let p = 0;
        for (let i = 0; i < 8; i++) {
            if (b & 1) p ^= a;
            const hiBitSet = a & 0x80;
            a = (a << 1) & 0xff;
            if (hiBitSet) a ^= 0x1b;
            b >>= 1;
        }
        return p;
    }

    addRoundKey(state, roundKey) {
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                state[i][j] ^= (roundKey[i] >>> (24 - j * 8)) & 0xff;
            }
        }
    }

    // Main encryption and decryption functions
    encrypt(plaintext, key) {
        const keySchedule = this.keyExpansion(key);
        const bytes = AES.stringToBytes(plaintext);
        const paddedBytes = AES.padBytes(bytes);
        const blocks = Math.ceil(paddedBytes.length / 16);
        const ciphertext = new Uint8Array(paddedBytes.length);

        for (let block = 0; block < blocks; block++) {
            const state = Array(4).fill().map(() => Array(4).fill(0));
            
            // Convert block to state
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 4; j++) {
                    state[i][j] = paddedBytes[block * 16 + i + 4 * j];
                }
            }

            // Initial round
            this.addRoundKey(state, keySchedule.slice(0, 4));

            // Main rounds
            for (let round = 1; round < this.Nr; round++) {
                this.subBytes(state);
                this.shiftRows(state);
                this.mixColumns(state);
                this.addRoundKey(state, keySchedule.slice(round * 4, (round + 1) * 4));
            }

            // Final round
            this.subBytes(state);
            this.shiftRows(state);
            this.addRoundKey(state, keySchedule.slice(this.Nr * 4));

            // Convert state back to bytes
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 4; j++) {
                    ciphertext[block * 16 + i + 4 * j] = state[i][j];
                }
            }
        }

        return AES.bytesToBase64(ciphertext);
    }

    decrypt(ciphertext, key) {
        const keySchedule = this.keyExpansion(key);
        const bytes = AES.base64ToBytes(ciphertext);

        if (bytes.length === 0 || bytes.length % 16 !== 0) {
            throw new Error(
                'Invalid AES ciphertext: length is not a multiple of the block size'
            );
        }

        const blocks = bytes.length / 16;
        const plaintext = new Uint8Array(bytes.length);

        for (let block = 0; block < blocks; block++) {
            const state = Array(4).fill().map(() => Array(4).fill(0));
            
            // Convert block to state
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 4; j++) {
                    state[i][j] = bytes[block * 16 + i + 4 * j];
                }
            }

            // Initial round
            this.addRoundKey(state, keySchedule.slice(this.Nr * 4));

            // Main rounds
            for (let round = this.Nr - 1; round > 0; round--) {
                this.invShiftRows(state);
                this.invSubBytes(state);
                this.addRoundKey(state, keySchedule.slice(round * 4, (round + 1) * 4));
                this.invMixColumns(state);
            }

            // Final round
            this.invShiftRows(state);
            this.invSubBytes(state);
            this.addRoundKey(state, keySchedule.slice(0, 4));

            // Convert state back to bytes
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 4; j++) {
                    plaintext[block * 16 + i + 4 * j] = state[i][j];
                }
            }
        }

        return AES.bytesToString(AES.unpadBytes(plaintext));
    }
}

// Export the AES class
export default AES;
