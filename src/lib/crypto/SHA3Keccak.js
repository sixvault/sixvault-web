function keccakF1600(state) {
  const RC = [
    0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an,
    0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
    0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an,
    0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
    0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n,
    0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
    0x000000000000800an, 0x800000008000000an, 0x8000000080008081n,
    0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n
  ];

  const r = [
    [0, 36, 3, 41, 18],
    [1, 44, 10, 45, 2],
    [62, 6, 43, 15, 61],
    [28, 55, 25, 21, 56],
    [27, 20, 39, 8, 14]
  ];

  const rotl = (x, n) => ((x << BigInt(n)) | (x >> BigInt(64 - n))) & 0xFFFFFFFFFFFFFFFFn;

  for (let round = 0; round < 24; round++) {
    // θ
    const C = Array(5).fill(0n);
    for (let x = 0; x < 5; x++) {
      C[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }

    const D = Array(5);
    for (let x = 0; x < 5; x++) {
      D[x] = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1);
    }

    for (let i = 0; i < 25; i++) {
      state[i] ^= D[i % 5];
    }

    // ρ and π
    const B = Array(25).fill(0n);
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        const i = x + 5 * y;
        const j = y % 5 + 5 * ((2 * x + 3 * y) % 5);
        B[j] = rotl(state[i], r[x][y]);
      }
    }

    // χ
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const i = x + 5 * y;
        state[i] = B[i] ^ ((~B[(x + 1) % 5 + 5 * y]) & B[(x + 2) % 5 + 5 * y]);
      }
    }

    // ι
    state[0] ^= RC[round];
  }
}

// pad10*1 with the SHA-3 domain separator (0x06 head, 0x80 tail). The result is
// always a whole number of blocks: an input already on a block boundary gets a
// full block of padding.
function keccakPad(rate, inputBytes) {
  const padLen = rate - (inputBytes.length % rate);
  const padded = [...inputBytes];

  // With one byte of room the head and tail have to share it. Emitting both
  // bytes here overran the block, leaving a padded length that was not a
  // multiple of the rate, and the absorb loop then read past the end.
  if (padLen === 1) {
    padded.push(0x86);
    return padded;
  }

  padded.push(0x06);
  for (let i = 1; i < padLen - 1; i++) padded.push(0x00);
  padded.push(0x80);

  return padded;
}

function keccak(input, outputLength = 256) {
  const rate = 200 - 2 * (outputLength / 8);
  const state = Array(25).fill(0n);
  const padded = keccakPad(rate, Array.from(input));

  for (let i = 0; i < padded.length; i += rate) {
    for (let j = 0; j < rate; j++) {
      const byte = BigInt(padded[i + j]);
      const idx = Math.floor(j / 8);
      state[idx] ^= byte << (BigInt(j % 8) * 8n);
    }
    keccakF1600(state);
  }

  const hash = [];
  let outBytes = outputLength / 8;
  let offset = 0;
  while (outBytes > 0) {
    for (let i = 0; i < rate / 8 && outBytes > 0; i++) {
      let lane = state[i];
      for (let j = 0; j < 8 && outBytes > 0; j++) {
        hash.push(Number((lane >> (BigInt(j) * 8n)) & 0xFFn));
        outBytes--;
      }
    }
    if (outBytes > 0) keccakF1600(state);
  }

  return hash.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default keccak;