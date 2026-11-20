import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import type {
  AiQueryOp,
  BridgeErrorCode,
  BridgeHello,
  BridgeMessage,
  BridgeRequest,
  TabSummary,
} from './bridge/protocol.js';
import { parseBridgeMessage, serializeBridgeMessage, timingSafeEqual } from './bridge/protocol.js';
import { helloMac, proofMac, PROTOCOL_VERSION, randomNonce } from './bridge/handshake.js';

const ALLOWED_ORIGIN_PREFIXES = ['chrome-extension://', 'moz-extension://'];

export interface ExtensionHubOptions {
  port: number;
  token: string;
}

interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const TAB_BYE_GRACE_MS = 2000;

export class ExtensionHub {
  readonly tabs = new Map<number, TabSummary>();
  private readonly tabByeGrace = new Map<number, ReturnType<typeof setTimeout>>();
  onTabsChanged?: () => void;
  private wss: WebSocketServer | null = null;
  private socket: WebSocket | null = null;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly tabQueues = new Map<number, Promise<void>>();
  private readonly options: ExtensionHubOptions;
  private verified = false;
  private expectHelloMac: string | null = null;

  constructor(options: ExtensionHubOptions) {
    this.options = options;
  }

  start(): void {
    if (this.wss) return;
    this.wss = new WebSocketServer({ host: '127.0.0.1', port: this.options.port });
    this.wss.on('connection', (ws, req) => {
      const origin = req.headers.origin ?? '';
      if (!ALLOWED_ORIGIN_PREFIXES.some((p) => origin.startsWith(p))) {
        ws.close(4003, 'origin');
        return;
      }
      if (this.socket) {
        ws.close(4008, 'busy');
        return;
      }
      this.socket = ws;
      ws.on('message', (data) => {
        void this.onMessage(String(data));
      });
      ws.on('close', () => {
        if (this.socket === ws) {
          this.socket = null;
          this.verified = false;
          this.expectHelloMac = null;
          this.tabs.clear();
          this.failAllPending('internal', 'Extension disconnected');
          this.onTabsChanged?.();
        }
      });
    });
    console.error(`Kernline bridge listening on 127.0.0.1:${this.options.port}`);
  }

  stop(): void {
    this.wss?.close();
    this.wss = null;
    this.socket?.close();
    this.socket = null;
    this.tabs.clear();
    this.failAllPending('bridge_disabled', 'Bridge stopped');
  }

  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === 1;
  }

  listTabs(): TabSummary[] {
    return [...this.tabs.values()].sort((a, b) => a.tabId - b.tabId);
  }

  resolveTabId(tabId?: number): { tabId: number } | { error: BridgeErrorCode } {
    if (tabId !== undefined) {
      if (!this.tabs.has(tabId)) return { error: 'not_mounted' };
      return { tabId };
    }
    const list = this.listTabs();
    if (list.length === 0) return { error: 'not_mounted' };
    if (list.length > 1) return { error: 'ambiguous_tab' };
    return { tabId: list[0]!.tabId };
  }

  async query(
    tabId: number,
    op: AiQueryOp,
    args: Record<string, unknown> | undefined,
    timeoutMs: number,
  ): Promise<
    { ok: true; data: unknown } | { ok: false; error: BridgeErrorCode; message?: string }
  > {
    if (!this.isConnected()) {
      return { ok: false, error: 'bridge_disabled', message: 'Extension not connected' };
    }
    if (!this.tabs.has(tabId)) {
      return { ok: false, error: 'not_mounted' };
    }
    const run = async (): Promise<
      { ok: true; data: unknown } | { ok: false; error: BridgeErrorCode; message?: string }
    > => {
      const id = crypto.randomUUID();
      const req: BridgeRequest = { type: 'request', id, tabId, op, args };
      try {
        const data = await this.sendRequest(req, timeoutMs);
        if (isBridgeErrorPayload(data)) {
          return { ok: false, error: data.error, message: data.message };
        }
        return { ok: true, data };
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'internal';
        if (msg === 'timeout') return { ok: false, error: 'timeout' };
        return { ok: false, error: 'internal', message: msg };
      }
    };
    const chain = this.tabQueues.get(tabId) ?? Promise.resolve();
    const next = chain.then(run, run);
    this.tabQueues.set(
      tabId,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }

  private sendRequest(req: BridgeRequest, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.readyState !== 1) {
        reject(new Error('bridge_disabled'));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(req.id);
        reject(new Error('timeout'));
      }, timeoutMs);
      this.pending.set(req.id, { resolve, reject, timer });
      this.socket.send(serializeBridgeMessage(req));
    });
  }

  private failAllPending(error: BridgeErrorCode, message: string): void {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error(message));
      this.pending.delete(id);
    }
  }

  private async onMessage(raw: string): Promise<void> {
    const msg = parseBridgeMessage(raw);
    if (!msg || !this.socket) return;

    if (msg.type === 'challenge') {
      if (msg.protocol !== PROTOCOL_VERSION) {
        this.socket.close(4001, 'update the extension');
        return;
      }
      const nonce2 = randomNonce();
      const mac = await proofMac(this.options.token, msg.nonce);
      this.expectHelloMac = await helloMac(this.options.token, nonce2);
      this.verified = false;
      this.socket.send(serializeBridgeMessage({ type: 'proof', mac, nonce2 }));
      return;
    }
    if (msg.type === 'hello') {
      if (typeof msg.token === 'string' && msg.token.length > 0) {
        this.socket.close(4001, 'update the extension');
        return;
      }
      if (!this.verified) {
        if (!msg.mac || !this.expectHelloMac || !timingSafeEqual(msg.mac, this.expectHelloMac)) {
          this.socket.close(4001, 'verify');
          return;
        }
        this.verified = true;
      }
      this.registerTab(msg);
      return;
    }
    if (!this.verified) return;
    if (msg.type === 'bye') {
      if (!this.tabs.has(msg.tabId)) return;
      const prev = this.tabByeGrace.get(msg.tabId);
      if (prev) clearTimeout(prev);
      const timer = setTimeout(() => {
        this.tabByeGrace.delete(msg.tabId);
        this.tabs.delete(msg.tabId);
        this.onTabsChanged?.();
      }, TAB_BYE_GRACE_MS);
      this.tabByeGrace.set(msg.tabId, timer);
      return;
    }
    if (msg.type === 'tab_update') {
      if (!this.tabs.has(msg.tabId)) return;
      this.tabs.set(msg.tabId, {
        tabId: msg.tabId,
        url: msg.url,
        title: msg.title,
        pinnedSelector: msg.pinnedSelector,
      });
      this.onTabsChanged?.();
      return;
    }
    if (msg.type === 'response') {
      const p = this.pending.get(msg.id);
      if (!p) return;
      clearTimeout(p.timer);
      this.pending.delete(msg.id);
      if (!msg.ok) {
        p.resolve({ error: msg.error ?? 'internal', message: msg.message });
        return;
      }
      p.resolve(msg.data);
    }
  }

  private registerTab(hello: BridgeHello): void {
    const grace = this.tabByeGrace.get(hello.tabId);
    if (grace) {
      clearTimeout(grace);
      this.tabByeGrace.delete(hello.tabId);
    }
    this.tabs.set(hello.tabId, {
      tabId: hello.tabId,
      url: hello.url,
      title: hello.title,
      pinnedSelector: hello.pinnedSelector,
    });
    this.onTabsChanged?.();
  }
}

function isBridgeErrorPayload(
  value: unknown,
): value is { error: BridgeErrorCode; message?: string } {
  if (typeof value !== 'object' || value === null) return false;
  const error = (value as { error?: unknown }).error;
  return typeof error === 'string';
}

export type { BridgeMessage };
