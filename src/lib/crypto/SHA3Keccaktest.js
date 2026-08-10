/**
 * SHA3-256 conformance.
 *
 * Checks the hand-written Keccak against published digests and against Node's
 * own sha3-256 across every input length that exercises a different padding
 * case. The sweep is the part that matters: the padding bug this guards
 * against only appeared when the input ended one byte short of a block.
 *
 *   node --experimental-vm-modules src/lib/crypto/SHA3Keccaktest.js
 */

import crypto from 'crypto';
import keccak from './SHA3Keccak.js';

let passed = 0;
let failed = 0;

const check = (name, ok, detail = '') => {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const bytes = (s) => Array.from(new TextEncoder().encode(s));
const RATE_256 = 136; // 200 - 2 * 32

console.log('\n== published digests ==');

// NIST FIPS 202 / standard SHA3-256 test vectors.
const VECTORS = [
  ['', 'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a'],
  ['abc', '3a985da74fe225b2045c172d6bd390bd855f086e3e9d525b46bfe24511431532'],
  [
    'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
    '41c0dba2a9d6240849100376a8235e2c82e1b9998a999e21db32dd97496d3376',
  ],
];

for (const [input, expected] of VECTORS) {
  const label = input === '' ? '(empty string)' : `"${input.slice(0, 24)}${input.length > 24 ? '…' : ''}"`;
  check(`SHA3-256 of ${label}`, keccak(bytes(input), 256) === expected);
}

console.log('\n== padding boundaries ==');

// One byte either side of a block boundary, and the exact boundary itself. The
// length ≡ rate - 1 case is where the pad head and tail must share a byte.
for (const n of [RATE_256 - 2, RATE_256 - 1, RATE_256, RATE_256 + 1, 2 * RATE_256 - 1, 2 * RATE_256]) {
  const input = 'a'.repeat(n);
  const expected = crypto.createHash('sha3-256').update(input).digest('hex');
  let actual;
  try {
    actual = keccak(bytes(input), 256);
  } catch (err) {
    actual = `threw ${err.message}`;
  }
  check(`length ${n} (${n % RATE_256} mod rate)`, actual === expected, actual);
}

console.log('\n== exhaustive sweep, 0..400 bytes ==');

let mismatches = 0;
let threw = 0;
for (let n = 0; n <= 400; n++) {
  const input = 'a'.repeat(n);
  const expected = crypto.createHash('sha3-256').update(input).digest('hex');
  try {
    if (keccak(bytes(input), 256) !== expected) mismatches++;
  } catch {
    threw++;
  }
}
check('no length in 0..400 threw', threw === 0, `${threw} threw`);
check('every length in 0..400 matches Node sha3-256', mismatches === 0, `${mismatches} mismatched`);

console.log('\n== other digest sizes ==');

for (const size of [224, 256, 384, 512]) {
  const input = 'sixvault';
  const expected = crypto.createHash(`sha3-${size}`).update(input).digest('hex');
  check(`SHA3-${size}`, keccak(bytes(input), size) === expected);
}

console.log('\n== properties ==');

const a = keccak(bytes('transcript payload'), 256);
check('deterministic', a === keccak(bytes('transcript payload'), 256));
check('one flipped character changes the digest', a !== keccak(bytes('transcript payloae'), 256));
check('output is 64 lowercase hex characters', /^[0-9a-f]{64}$/.test(a));

console.log(`\nSHA3Keccak: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
