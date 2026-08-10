/**
 * Weighted GPA.
 *
 * This value is encrypted and stored, and is covered by the program head's
 * signature, so a disagreement between the copies this helper replaced was a
 * verification failure rather than a display quirk.
 *
 *   node src/lib/gpatest.js
 */

import { GRADE_POINTS, computeGPA, computeTotalCredits, roundGPA } from './gpa.js';

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

const close = (a, b) => Math.abs(a - b) < 1e-9;

console.log('\n== weighting ==');

// 4.0*3 + 3.0*2 = 18 over 5 credits = 3.6. An unweighted mean would give 3.5,
// which is the mistake this exists to prevent.
check(
  'credits weight the average',
  close(computeGPA([
    { nilai: 'A', sks: 3 },
    { nilai: 'B', sks: 2 },
  ]), 3.6),
  String(computeGPA([{ nilai: 'A', sks: 3 }, { nilai: 'B', sks: 2 }])),
);

check(
  'a single record returns its own grade point',
  close(computeGPA([{ nilai: 'AB', sks: 4 }]), 3.5),
);

check(
  'credit values given as strings are accepted',
  close(computeGPA([{ nilai: 'A', sks: '3' }, { nilai: 'B', sks: '2' }]), 3.6),
);

console.log('\n== records that cannot be scored are excluded, not zeroed ==');

// Counting an unscoreable record as zero would drag the average down; excluding
// it leaves the scoreable records speaking for themselves.
const withGaps = [
  { nilai: 'A', sks: 3 },
  { nilai: 'A', sks: null },      // no credits
  { nilai: '', sks: 3 },          // no grade
  { nilai: 'Z', sks: 3 },         // unrecognised grade
  { sks: 3 },                     // grade absent
  { nilai: 'A', sks: 0 },         // zero credits contributes nothing
];
check('unscoreable records do not lower the average', close(computeGPA(withGaps), 4.0), String(computeGPA(withGaps)));

check('an empty list gives 0', computeGPA([]) === 0);
check('null gives 0', computeGPA(null) === 0);
check('undefined gives 0', computeGPA(undefined) === 0);
check('a list with nothing scoreable gives 0', computeGPA([{ nilai: 'Z', sks: 3 }]) === 0);

console.log('\n== field names ==');

// Grade entry names the grade `indeks`; stored records call it `nilai`.
check(
  'the grade field name is configurable',
  close(computeGPA([{ indeks: 'A', sks: 3 }], { gradeKey: 'indeks' }), 4.0),
);
check(
  'reading the wrong field scores nothing rather than guessing',
  computeGPA([{ indeks: 'A', sks: 3 }]) === 0,
);

console.log('\n== total credits ==');

check('credits are summed', computeTotalCredits([{ sks: 3 }, { sks: '2' }]) === 5);
check('unparseable credits count as zero', computeTotalCredits([{ sks: 3 }, { sks: null }, {}]) === 3);
check('an empty list totals 0', computeTotalCredits([]) === 0);

console.log('\n== rounding ==');

check('rounds to two decimals', roundGPA(3.666666) === 3.67);
check('an exact value is unchanged', roundGPA(4) === 4);
check('rounds half up', roundGPA(3.335) === 3.34);

console.log('\n== the grade scale ==');

check('the scale covers every grade the system accepts', ['A', 'AB', 'B', 'BC', 'C', 'D'].every((g) => GRADE_POINTS[g] !== undefined));
check('A is 4.0', GRADE_POINTS.A === 4.0);
check('D is 1.0', GRADE_POINTS.D === 1.0);

console.log(`\nGPA: ${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
