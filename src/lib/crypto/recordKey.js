import keccak from './SHA3Keccak.js';

/**
 * Derive a record's AES key from the advisor's passphrase.
 *
 * The specification requires the encryption key to be asked for when encryption
 * is performed. The server previously generated it with a CSPRNG, so nobody was
 * ever asked for anything.
 *
 * A single passphrase is requested once per submission, and each record gets its
 * own key derived from it:
 *
 *     recordKey = SHA3-256(passphrase || nim || kode) truncated to 128 bits
 *
 * Deriving rather than reusing the passphrase directly matters: the rest of the
 * design depends on per-record key independence, because each key is Shamir-split
 * and RSA-wrapped separately. Reusing one key across records would mean
 * recovering any single record's key recovered them all.
 *
 * The passphrase itself is never transmitted — only the derived per-record keys,
 * which the server needs anyway in order to wrap and split them. Because the
 * derivation is deterministic, the advisor can re-derive any record's key later
 * from the same passphrase.
 */

// The same unit separator the signature payload uses: keeps the three inputs
// unambiguously delimited so different triples cannot derive the same key.
const SEP = '\x1f';

export const deriveRecordKey = (passphrase, nim, kode) => {
  const input = `${passphrase}${SEP}${nim}${SEP}${kode}`;
  const bytes = Array.from(new TextEncoder().encode(input));

  // keccak returns 64 hex characters; the first 32 are the 128-bit AES key.
  return keccak(bytes, 256).slice(0, 32);
};

export default deriveRecordKey;
