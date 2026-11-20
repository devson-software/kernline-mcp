/** Challenge-response MACs. The raw bridge token never goes on the wire. */

export const PROTOCOL_VERSION = 2;

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Server proves it knows the token: HMAC(token, nonce + "server"). */
export function proofMac(token: string, nonce: string): Promise<string> {
  return hmacSha256Hex(token, `${nonce}server`);
}

/** Extension proves it knows the token: HMAC(token, nonce2 + "ext"). */
export function helloMac(token: string, nonce2: string): Promise<string> {
  return hmacSha256Hex(token, `${nonce2}ext`);
}
