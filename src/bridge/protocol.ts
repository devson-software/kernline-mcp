/** DOM-free bridge messages between the local MCP process and the extension. */

export const BRIDGE_DEFAULT_PORT = 47321;
export const MAX_BRIDGE_PAYLOAD_BYTES = 2_000_000;

export const BRIDGE_ERROR_CODES = [
  'bridge_disabled',
  'not_mounted',
  'messaging_failed',
  'ambiguous_tab',
  'no_selection',
  'not_found',
  'upgrade_required',
  'too_large',
  'tab_not_visible',
  'invalid_token',
  'timeout',
  'unknown_op',
  'internal',
] as const;

export type BridgeErrorCode = (typeof BRIDGE_ERROR_CODES)[number];

export type AiQueryOp =
  | 'ping'
  | 'page_summary'
  | 'inspect'
  | 'copy_for_ai'
  | 'component_capture'
  | 'page_tokens'
  | 'assets'
  | 'asset'
  | 'pin'
  | 'element_image_rect'
  | 'element_image';

export interface BridgeChallenge {
  type: 'challenge';
  nonce: string;
  protocol: number;
}

export interface BridgeProof {
  type: 'proof';
  mac: string;
  nonce2: string;
}

export interface BridgeHello {
  type: 'hello';
  tabId: number;
  url: string;
  title: string;
  pinnedSelector?: string;
  /** First hello of a verified session. Later tabs omit it. */
  mac?: string;
  protocol?: number;
  /** Present only on protocol v1. The server rejects these. */
  token?: string;
}

export interface BridgeBye {
  type: 'bye';
  tabId: number;
}

export interface BridgeTabUpdate {
  type: 'tab_update';
  tabId: number;
  url: string;
  title: string;
  pinnedSelector?: string;
}

export interface BridgeRequest {
  type: 'request';
  id: string;
  tabId: number;
  op: AiQueryOp;
  args?: Record<string, unknown>;
}

export interface BridgeResponse {
  type: 'response';
  id: string;
  ok: boolean;
  data?: unknown;
  error?: BridgeErrorCode;
  message?: string;
}

export type BridgeMessage =
  | BridgeChallenge
  | BridgeProof
  | BridgeHello
  | BridgeBye
  | BridgeTabUpdate
  | BridgeRequest
  | BridgeResponse;

export interface TabSummary {
  tabId: number;
  url: string;
  title: string;
  pinnedSelector?: string;
}

export interface AiErrorPayload {
  error: BridgeErrorCode;
  message?: string;
}

export function isBridgeErrorPayload(value: unknown): value is AiErrorPayload {
  if (typeof value !== 'object' || value === null) return false;
  const e = (value as AiErrorPayload).error;
  return typeof e === 'string' && (BRIDGE_ERROR_CODES as readonly string[]).includes(e);
}

export function parseBridgeMessage(raw: string): BridgeMessage | null {
  if (raw.length > MAX_BRIDGE_PAYLOAD_BYTES) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const t = (parsed as { type?: unknown }).type;
  if (t === 'challenge') {
    const m = parsed as BridgeChallenge;
    if (typeof m.nonce !== 'string' || typeof m.protocol !== 'number') return null;
    return m;
  }
  if (t === 'proof') {
    const m = parsed as BridgeProof;
    if (typeof m.mac !== 'string' || typeof m.nonce2 !== 'string') return null;
    return m;
  }
  if (t === 'hello') {
    const m = parsed as BridgeHello;
    if (typeof m.tabId !== 'number' || typeof m.url !== 'string' || typeof m.title !== 'string') {
      return null;
    }
    return m;
  }
  if (t === 'bye' && typeof (parsed as BridgeBye).tabId === 'number') {
    return parsed as BridgeBye;
  }
  if (t === 'tab_update') {
    const m = parsed as BridgeTabUpdate;
    if (typeof m.tabId !== 'number' || typeof m.url !== 'string' || typeof m.title !== 'string') {
      return null;
    }
    return m;
  }
  if (t === 'request') {
    const m = parsed as BridgeRequest;
    if (typeof m.id !== 'string' || typeof m.tabId !== 'number' || typeof m.op !== 'string') {
      return null;
    }
    return m;
  }
  if (t === 'response') {
    const m = parsed as BridgeResponse;
    if (typeof m.id !== 'string' || typeof m.ok !== 'boolean') return null;
    return m;
  }
  return null;
}

export function serializeBridgeMessage(msg: BridgeMessage): string {
  const s = JSON.stringify(msg);
  if (s.length > MAX_BRIDGE_PAYLOAD_BYTES) {
    throw new Error('too_large');
  }
  return s;
}

/** Constant-time string compare (same length only). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
