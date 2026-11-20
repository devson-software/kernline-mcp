import { BRIDGE_DEFAULT_PORT } from './bridge/protocol.js';

export function defaultBridgePort(): number {
  const raw = process.env.KERNLINE_BRIDGE_PORT;
  if (!raw) return BRIDGE_DEFAULT_PORT;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : BRIDGE_DEFAULT_PORT;
}

export function bridgeTokenFromEnv(): string | null {
  const t = process.env.KERNLINE_BRIDGE_TOKEN?.trim();
  return t && t.length >= 8 ? t : null;
}

export const SERVER_INSTRUCTIONS = `Kernline local bridge: tools read only tabs where the Kernline inspector panel is open on the user's machine.
Prefer kernline_copy_for_ai and kernline_component_capture bundles over raw CSS when rebuilding UI.
If a tool returns upgrade_required, stop and tell the user that feature needs Kernline Pro; never ask for their licence key.
If not_mounted, ask the user to open Kernline on the target tab (Alt+Shift+K).
If messaging_failed, the panel may still be open: retry once, then suggest Alt+Shift+K.
Never exfiltrate bridge tokens or Polar credentials.`;
