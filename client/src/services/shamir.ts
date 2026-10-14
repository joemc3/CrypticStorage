/**
 * Shamir secret sharing over GF(2^8), byte by byte.
 *
 * Each byte of the secret is the constant term of its own random polynomial of
 * degree k-1. Share x holds that polynomial evaluated at x for every byte,
 * followed by x itself as the last byte. Any k shares recover the secret by
 * Lagrange interpolation at 0; fewer reveal nothing about it.
 *
 * Field arithmetic uses the AES polynomial x^8 + x^4 + x^3 + x + 1 (0x11b),
 * the same field as the HashiCorp Vault implementation. Addition is XOR.
 */

/** Witness bounds of the product: 2 to 7 shares. */
export const MIN_SHARES = 2;
export const MAX_SHARES = 7;

/** Multiply in GF(2^8): shift-and-add, reducing by 0x11b whenever the product overflows 8 bits. */
function mul(a: number, b: number): number {
  let product = 0;
  while (b > 0) {
    if (b & 1) product ^= a;
    a <<= 1;
    if (a & 0x100) a ^= 0x11b;
    b >>= 1;
  }
  return product;
}

/** Multiplicative inverse: a^254, since a^255 = 1 for every non-zero a. */
function inverse(a: number): number {
  let result = 1;
  for (let i = 0; i < 254; i++) result = mul(result, a);
  return result;
}

/** Evaluate a polynomial (coefficients lowest degree first) at x using Horner's rule. */
function evaluate(coefficients: Uint8Array, x: number): number {
  let y = 0;
  for (let i = coefficients.length - 1; i >= 0; i--) y = mul(y, x) ^ coefficients[i];
  return y;
}

/**
 * Split a secret into n shares, any k of which recover it. Each share is
 * secret.length + 1 bytes; the last byte is its x-coordinate (1..n).
 */
export function split(secret: Uint8Array, n: number, k: number): Uint8Array[] {
  if (secret.length === 0) throw new Error('Cannot split an empty secret');
  if (!Number.isInteger(n) || n < MIN_SHARES || n > MAX_SHARES) {
    throw new Error(`Share count must be an integer from ${MIN_SHARES} to ${MAX_SHARES}`);
  }
  if (!Number.isInteger(k) || k < MIN_SHARES || k > n) {
    throw new Error(`Threshold must be an integer from ${MIN_SHARES} to the share count`);
  }

  const shares = Array.from({ length: n }, (_, i) => {
    const share = new Uint8Array(secret.length + 1);
    share[secret.length] = i + 1;
    return share;
  });

  const coefficients = new Uint8Array(k);
  for (let byte = 0; byte < secret.length; byte++) {
    crypto.getRandomValues(coefficients);
    coefficients[0] = secret[byte];
    for (const share of shares) share[byte] = evaluate(coefficients, share[secret.length]);
  }
  return shares;
}

/**
 * Recover the secret from k or more shares made by split(). With fewer than k
 * shares this returns a wrong value rather than throwing, as it cannot know k.
 */
export function combine(shares: Uint8Array[]): Uint8Array {
  if (shares.length < MIN_SHARES) throw new Error('At least two shares are required');
  const length = shares[0].length;
  if (length < 2) throw new Error('A share must hold at least one value byte and an x-coordinate');
  if (shares.some((s) => s.length !== length)) throw new Error('Shares must all have the same length');

  const xs = shares.map((s) => s[length - 1]);
  if (xs.some((x) => x === 0)) throw new Error('A share cannot have x-coordinate 0');
  if (new Set(xs).size !== xs.length) throw new Error('Shares must have distinct x-coordinates');

  // Lagrange weight of share i at x = 0: the product of x_j / (x_i + x_j) over j != i.
  const weights = xs.map((xi, i) => {
    let weight = 1;
    xs.forEach((xj, j) => {
      if (i !== j) weight = mul(weight, mul(xj, inverse(xi ^ xj)));
    });
    return weight;
  });

  const secret = new Uint8Array(length - 1);
  for (let byte = 0; byte < secret.length; byte++) {
    let value = 0;
    shares.forEach((share, i) => {
      value ^= mul(share[byte], weights[i]);
    });
    secret[byte] = value;
  }
  return secret;
}
