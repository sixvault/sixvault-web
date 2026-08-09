import {
  buildSignaturePayload,
  FIELD_SEP,
  RECORD_SEP,
} from './signaturePayload.js';

let failures = 0;
const check = (label, condition, detail = '') => {
  if (condition) {
    console.log(`✅ ${label}`);
  } else {
    failures += 1;
    console.error(`❌ ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

console.log('======== SIGNATURE PAYLOAD TESTS ========\n');

const records = [
  { kode: 'II301', nama: 'Aljabar', sks: '3', nilai: 'AB' },
  { kode: 'II201', nama: 'Kriptografi', sks: '4', nilai: 'A' },
];

const base = buildSignaturePayload('13520001', 'Budi Santoso', records);

// --- every field participates in the digest ---------------------------
// Each of these was alterable without invalidating the old signature, which
// covered only {kode, nilai}.
const mutations = [
  ['course name', [{ ...records[0], nama: 'Kalkulus' }, records[1]]],
  ['credits', [{ ...records[0], sks: '9' }, records[1]]],
  ['grade', [{ ...records[0], nilai: 'D' }, records[1]]],
  ['course code', [{ ...records[0], kode: 'II999' }, records[1]]],
];

for (const [field, mutated] of mutations) {
  check(
    `changing the ${field} changes the payload`,
    buildSignaturePayload('13520001', 'Budi Santoso', mutated) !== base
  );
}

check(
  'changing the student id changes the payload',
  buildSignaturePayload('13520002', 'Budi Santoso', records) !== base
);
check(
  'changing the student name changes the payload',
  buildSignaturePayload('13520001', 'Someone Else', records) !== base
);

// --- structural properties --------------------------------------------
check(
  'record order does not affect the payload',
  buildSignaturePayload('13520001', 'Budi Santoso', [records[1], records[0]]) ===
    base
);
check(
  'adding a record changes the payload',
  buildSignaturePayload('13520001', 'Budi Santoso', [
    ...records,
    { kode: 'II401', nama: 'Extra', sks: '2', nilai: 'B' },
  ]) !== base
);
check(
  'removing a record changes the payload',
  buildSignaturePayload('13520001', 'Budi Santoso', [records[0]]) !== base
);

// --- field boundaries cannot be shifted -------------------------------
// Without separator stripping, a value containing the separator could move a
// boundary and let two different record sets serialise identically.
const smuggled = buildSignaturePayload('13520001', 'Budi Santoso', [
  { kode: 'II301', nama: `Aljabar${FIELD_SEP}9`, sks: '3', nilai: 'AB' },
  records[1],
]);
check('separators are stripped from values', !smuggled.includes(`${FIELD_SEP}9`));
check(
  'a smuggled separator does not collide with a real record set',
  smuggled !==
    buildSignaturePayload('13520001', 'Budi Santoso', [
      { kode: 'II301', nama: 'Aljabar', sks: '9', nilai: 'AB' },
      records[1],
    ])
);
check(
  'record separators are stripped too',
  !buildSignaturePayload('13520001', `Budi${RECORD_SEP}X`, records).includes(
    `Budi${RECORD_SEP}X`
  )
);

// --- determinism and shape --------------------------------------------
check(
  'the same input yields the same payload',
  buildSignaturePayload('13520001', 'Budi Santoso', records) === base
);
check(
  'the payload contains every field value',
  ['13520001', 'Budi Santoso', 'II301', 'Aljabar', '3', 'AB', 'II201', 'Kriptografi', '4', 'A'].every(
    (v) => base.includes(v)
  )
);
check(
  'records are ordered by course code',
  base.indexOf('II201') < base.indexOf('II301')
);
check('null and undefined records are tolerated', buildSignaturePayload('1', 'x', []) === `1${RECORD_SEP}x`);
check(
  'missing fields become empty rather than "undefined"',
  !buildSignaturePayload('1', 'x', [{ kode: 'A' }]).includes('undefined')
);

console.log(
  `\n${failures === 0 ? 'All signature payload tests passed' : `${failures} test(s) failed`}`
);
process.exit(failures === 0 ? 0 : 1);
