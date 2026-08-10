/**
 * Grade points and the weighted GPA calculation.
 *
 * There were four copies of this arithmetic in Dashboard.jsx, differing in which
 * field name they read the grade from and in how they coerced credits, so they
 * could disagree about the same student. The GPA also gets encrypted and stored,
 * and is covered by the program head's signature, which makes any disagreement
 * between copies a verification failure rather than a cosmetic one.
 *
 * Defined at module scope rather than inside the component so its identity is
 * stable across renders.
 */

export const GRADE_POINTS = {
  A: 4.0,
  AB: 3.5,
  B: 3.0,
  BC: 2.5,
  C: 2.0,
  D: 1.0
};

/**
 * Credit-weighted GPA over the records that carry both a recognised grade and a
 * credit value. Records missing either are excluded rather than counted as zero,
 * which would drag the average down.
 *
 * @param {Array<object>} records
 * @param {{gradeKey?: string, creditsKey?: string}} [keys]
 *   Field names, because grade entry calls the grade `indeks` while stored
 *   records call it `nilai`.
 * @returns {number} the GPA, or 0 when nothing qualifies
 */
export const computeGPA = (records, { gradeKey = 'nilai', creditsKey = 'sks' } = {}) => {
  const valid = (records ?? []).filter((record) => {
    const credits = Number.parseInt(record?.[creditsKey], 10);
    return GRADE_POINTS[record?.[gradeKey]] !== undefined && Number.isFinite(credits) && credits > 0;
  });

  if (valid.length === 0) return 0;

  let totalPoints = 0;
  let totalCredits = 0;

  for (const record of valid) {
    const credits = Number.parseInt(record[creditsKey], 10);
    totalPoints += GRADE_POINTS[record[gradeKey]] * credits;
    totalCredits += credits;
  }

  return totalCredits > 0 ? totalPoints / totalCredits : 0;
};

/** Total credits over records with a usable credit value. */
export const computeTotalCredits = (records, { creditsKey = 'sks' } = {}) =>
  (records ?? []).reduce((sum, record) => {
    const credits = Number.parseInt(record?.[creditsKey], 10);
    return sum + (Number.isFinite(credits) ? credits : 0);
  }, 0);

/** GPA rounded to the two decimals the interface and the stored value both use. */
export const roundGPA = (gpa) => Math.round(gpa * 100) / 100;
