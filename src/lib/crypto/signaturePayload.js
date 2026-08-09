/**
 * Canonical serialisation of a student's academic records for signing.
 *
 * This is the exact byte string that gets hashed with SHA3-256 and signed with
 * the program head's RSA key. Signing and verification must produce identical
 * bytes, so there is one implementation and every caller goes through it.
 *
 * The backend has a wire-compatible copy at
 * sixvault-api/app/utils/crypto/signaturePayload.js. The two must stay in step
 * or server-side verification will reject valid signatures.
 *
 * Covered fields: course code, course name, credits and grade for every record,
 * plus the student's id and name. The digest previously covered only
 * {kode, nilai}, so a course name or a credit value could be altered without
 * invalidating the signature — exactly what the signature exists to prevent.
 */

// ASCII unit and record separators. Control characters are used so that no
// course code, course name, credit value or grade can contain them: a separator
// that could appear inside a value would let two different record sets
// serialise to the same bytes.
export const FIELD_SEP = '\x1f';
export const RECORD_SEP = '\x1e';

const clean = (value) =>
  String(value ?? '')
    .split(FIELD_SEP)
    .join('')
    .split(RECORD_SEP)
    .join('');

/**
 * @param {string} nim          student id
 * @param {string} studentName  student's full name
 * @param {Array<{kode:string,nama:string,sks:string|number,nilai:string}>} records
 * @returns {string} the payload to hash and sign
 */
export const buildSignaturePayload = (nim, studentName, records) => {
  // Sorted by course code so the digest does not depend on the order records
  // happen to arrive in. Concatenation follows the specification's own example,
  // SHA3('II301' + 'Aljabar' + '3' + 'AB' + ...).
  const rows = [...(records ?? [])]
    .sort((a, b) => String(a.kode).localeCompare(String(b.kode)))
    .map((record) =>
      [record.kode, record.nama, record.sks, record.nilai]
        .map(clean)
        .join(FIELD_SEP)
    );

  return [clean(nim), clean(studentName), ...rows].join(RECORD_SEP);
};
