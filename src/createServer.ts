import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { ExtensionHub } from './extensionHub.js';
import { SERVER_INSTRUCTIONS } from './env.js';
import type { BridgeErrorCode } from './bridge/protocol.js';

const tabIdSchema = z
  .number()
  .int()
  .optional()
  .describe('Browser tab id from kernline_list_tabs; omit when exactly one tab is connected');

function toolError(error: BridgeErrorCode, message?: string) {
  const payload = { error, message };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

function toolOk(data: unknown) {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const structured =
    data !== null && typeof data === 'object' && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : { value: data };
  return {
    content: [{ type: 'text' as const, text }],
    structuredContent: structured,
  };
}

export function createKernlineMcpServer(hub: ExtensionHub): McpServer {
  const server = new McpServer(
    {
      name: 'kernline',
      version: '0.1.0',
    },
    { instructions: SERVER_INSTRUCTIONS },
  );

  hub.onTabsChanged = () => server.sendResourceListChanged();

  server.registerTool(
    'kernline_list_tabs',
    {
      description: 'List browser tabs where Kernline is open and connected to the local bridge',
      annotations: { readOnlyHint: true },
    },
    async () => toolOk({ tabs: hub.listTabs() }),
  );

  server.registerTool(
    'kernline_page_summary',
    {
      description: 'Viewport, frames, and blocked stylesheet origins for an inspected tab',
      inputSchema: z.object({ tabId: tabIdSchema }),
      annotations: { readOnlyHint: true },
    },
    async ({ tabId }) => {
      const resolved = hub.resolveTabId(tabId);
      if ('error' in resolved) return toolError(resolved.error);
      const result = await hub.query(resolved.tabId, 'page_summary', undefined, 15_000);
      if (!result.ok) return toolError(result.error, result.message);
      return toolOk(result.data);
    },
  );

  server.registerTool(
    'kernline_inspect',
    {
      description:
        'Computed style snapshot, cleaned CSS, and Tailwind classes for the pinned element or a CSS selector',
      inputSchema: z.object({
        tabId: tabIdSchema,
        selector: z.string().optional().describe('CSS selector; default is the pinned element'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ tabId, selector }) => {
      const resolved = hub.resolveTabId(tabId);
      if ('error' in resolved) return toolError(resolved.error);
      const result = await hub.query(
        resolved.tabId,
        'inspect',
        selector ? { selector } : undefined,
        20_000,
      );
      if (!result.ok) return toolError(result.error, result.message);
      return toolOk(result.data);
    },
  );

  server.registerTool(
    'kernline_copy_for_ai',
    {
      description:
        'Pro: copy-for-AI bundle (HTML, computed CSS, tokens, sizes, states) for the pinned element',
      inputSchema: z.object({ tabId: tabIdSchema }),
      annotations: { readOnlyHint: true },
    },
    async ({ tabId }) => {
      const resolved = hub.resolveTabId(tabId);
      if ('error' in resolved) return toolError(resolved.error);
      const result = await hub.query(resolved.tabId, 'copy_for_ai', undefined, 25_000);
      if (!result.ok) return toolError(result.error, result.message);
      return toolOk(result.data);
    },
  );

  server.registerTool(
    'kernline_component_capture',
    {
      description: 'Pro: component tree capture as html, react, or vue with Tailwind classes',
      inputSchema: z.object({
        tabId: tabIdSchema,
        format: z.enum(['html', 'react', 'vue']).default('html'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ tabId, format }) => {
      const resolved = hub.resolveTabId(tabId);
      if ('error' in resolved) return toolError(resolved.error);
      const result = await hub.query(resolved.tabId, 'component_capture', { format }, 30_000);
      if (!result.ok) return toolError(result.error, result.message);
      return toolOk(result.data);
    },
  );

  server.registerTool(
    'kernline_page_tokens',
    {
      description:
        'Pro: scan page design tokens (css variables, tailwind v3/v4, json, or AI context)',
      inputSchema: z.object({
        tabId: tabIdSchema,
        format: z.enum(['css', 'v3', 'v4', 'json', 'config', 'tokens']).default('css'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ tabId, format }) => {
      const resolved = hub.resolveTabId(tabId);
      if ('error' in resolved) return toolError(resolved.error);
      const result = await hub.query(
        resolved.tabId,
        'page_tokens',
        { format },
        format === 'css' ? 120_000 : 90_000,
      );
      if (!result.ok) return toolError(result.error, result.message);
      return toolOk(result.data);
    },
  );

  server.registerTool(
    'kernline_assets',
    {
      description: 'List page assets discovered by Kernline (images, SVG, fonts, favicons)',
      inputSchema: z.object({ tabId: tabIdSchema }),
      annotations: { readOnlyHint: true },
    },
    async ({ tabId }) => {
      const resolved = hub.resolveTabId(tabId);
      if ('error' in resolved) return toolError(resolved.error);
      const result = await hub.query(resolved.tabId, 'assets', undefined, 20_000);
      if (!result.ok) return toolError(result.error, result.message);
      return toolOk(result.data);
    },
  );

  server.registerTool(
    'kernline_asset',
    {
      description: 'Fetch one asset by id from kernline_assets (inline SVG or text, size-capped)',
      inputSchema: z.object({
        tabId: tabIdSchema,
        id: z.string().describe('Asset id from kernline_assets'),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ tabId, id }) => {
      const resolved = hub.resolveTabId(tabId);
      if ('error' in resolved) return toolError(resolved.error);
      const result = await hub.query(resolved.tabId, 'asset', { id }, 25_000);
      if (!result.ok) return toolError(result.error, result.message);
      return toolOk(result.data);
    },
  );

  server.registerTool(
    'kernline_element_image',
    {
      description:
        'PNG screenshot crop of the pinned element or selector (requires Kernline open on tab)',
      inputSchema: z.object({
        tabId: tabIdSchema,
        selector: z.string().optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ tabId, selector }) => {
      const resolved = hub.resolveTabId(tabId);
      if ('error' in resolved) return toolError(resolved.error);
      const result = await hub.query(
        resolved.tabId,
        'element_image',
        selector ? { selector } : undefined,
        30_000,
      );
      if (!result.ok) return toolError(result.error, result.message);
      const data = result.data as { base64: string; mimeType: string };
      return {
        content: [
          { type: 'text', text: 'Element screenshot attached.' },
          { type: 'image', data: data.base64, mimeType: data.mimeType },
        ],
        structuredContent: { mimeType: data.mimeType, byteLength: data.base64.length },
      };
    },
  );

  server.registerTool(
    'kernline_pin',
    {
      description:
        'Scroll a selector into view and pin it in Kernline so the user sees what was selected',
      inputSchema: z.object({
        tabId: tabIdSchema,
        selector: z.string().describe('CSS selector to pin'),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ tabId, selector }) => {
      const resolved = hub.resolveTabId(tabId);
      if ('error' in resolved) return toolError(resolved.error);
      const result = await hub.query(resolved.tabId, 'pin', { selector }, 15_000);
      if (!result.ok) return toolError(result.error, result.message);
      return toolOk(result.data);
    },
  );

  server.registerResource(
    'tabs',
    'kernline://tabs',
    { mimeType: 'application/json', description: 'Connected Kernline tabs' },
    async () => ({
      contents: [
        {
          uri: 'kernline://tabs',
          mimeType: 'application/json',
          text: JSON.stringify({ tabs: hub.listTabs() }, null, 2),
        },
      ],
    }),
  );

  const selectionTemplate = new ResourceTemplate('kernline://tab/{tabId}/selection', {
    list: undefined,
  });
  server.registerResource(
    'tab-selection',
    selectionTemplate,
    { mimeType: 'application/json' },
    async (_uri, { tabId }) => {
      const id = Number.parseInt(String(tabId), 10);
      const result = await hub.query(id, 'inspect', undefined, 20_000);
      if (!result.ok) throw new Error(result.error);
      return {
        contents: [
          {
            uri: `kernline://tab/${id}/selection`,
            mimeType: 'application/json',
            text: JSON.stringify(result.data, null, 2),
          },
        ],
      };
    },
  );

  const copyTemplate = new ResourceTemplate('kernline://tab/{tabId}/copy-for-ai', {
    list: undefined,
  });
  server.registerResource(
    'tab-copy-for-ai',
    copyTemplate,
    { mimeType: 'text/plain' },
    async (_uri, { tabId }) => {
      const id = Number.parseInt(String(tabId), 10);
      const result = await hub.query(id, 'copy_for_ai', undefined, 25_000);
      if (!result.ok) throw new Error(result.error);
      const bundle =
        typeof result.data === 'object' && result.data && 'bundle' in result.data
          ? String((result.data as { bundle: string }).bundle)
          : JSON.stringify(result.data);
      return {
        contents: [
          { uri: `kernline://tab/${id}/copy-for-ai`, mimeType: 'text/plain', text: bundle },
        ],
      };
    },
  );

  const tokensTemplate = new ResourceTemplate('kernline://tab/{tabId}/tokens', { list: undefined });
  server.registerResource(
    'tab-tokens',
    tokensTemplate,
    { mimeType: 'text/plain' },
    async (_uri, { tabId }) => {
      const id = Number.parseInt(String(tabId), 10);
      const result = await hub.query(id, 'page_tokens', { format: 'css' }, 120_000);
      if (!result.ok) throw new Error(result.error);
      const text =
        typeof result.data === 'object' && result.data && 'text' in result.data
          ? String((result.data as { text: string }).text)
          : JSON.stringify(result.data);
      return {
        contents: [{ uri: `kernline://tab/${id}/tokens`, mimeType: 'text/plain', text }],
      };
    },
  );

  const assetsTemplate = new ResourceTemplate('kernline://tab/{tabId}/assets', { list: undefined });
  server.registerResource(
    'tab-assets',
    assetsTemplate,
    { mimeType: 'application/json' },
    async (_uri, { tabId }) => {
      const id = Number.parseInt(String(tabId), 10);
      const result = await hub.query(id, 'assets', undefined, 20_000);
      if (!result.ok) throw new Error(result.error);
      return {
        contents: [
          {
            uri: `kernline://tab/${id}/assets`,
            mimeType: 'application/json',
            text: JSON.stringify(result.data, null, 2),
          },
        ],
      };
    },
  );

  server.registerPrompt(
    'rebuild-selection',
    {
      description: 'Rebuild the pinned Kernline selection using only the copy-for-AI bundle',
      argsSchema: { tabId: tabIdSchema },
    },
    async ({ tabId }) => {
      const resolved = hub.resolveTabId(tabId);
      if ('error' in resolved) {
        return {
          messages: [
            {
              role: 'user' as const,
              content: {
                type: 'text' as const,
                text: `Cannot rebuild: ${resolved.error}. Open Kernline on the target tab first.`,
              },
            },
          ],
        };
      }
      const result = await hub.query(resolved.tabId, 'copy_for_ai', undefined, 25_000);
      const body =
        result.ok && typeof result.data === 'object' && result.data && 'bundle' in result.data
          ? String((result.data as { bundle: string }).bundle)
          : JSON.stringify(result);
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Rebuild this UI using ONLY the Kernline bundle below. Do not invent styles.\n\n${body}`,
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    'capture-component',
    {
      description: 'Capture a component as html, react, or vue via Kernline',
      argsSchema: {
        tabId: tabIdSchema,
        format: z.enum(['html', 'react', 'vue']).default('html'),
      },
    },
    async ({ tabId, format }) => {
      const resolved = hub.resolveTabId(tabId);
      if ('error' in resolved) {
        return {
          messages: [
            {
              role: 'user' as const,
              content: { type: 'text' as const, text: `Capture failed: ${resolved.error}` },
            },
          ],
        };
      }
      const result = await hub.query(resolved.tabId, 'component_capture', { format }, 30_000);
      const body =
        result.ok && typeof result.data === 'object' && result.data && 'bundle' in result.data
          ? String((result.data as { bundle: string }).bundle)
          : JSON.stringify(result);
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Implement or refine this component using ONLY the capture below.\n\n${body}`,
            },
          },
        ],
      };
    },
  );

  server.registerPrompt(
    'extract-theme',
    {
      description: 'Extract page design tokens from the open Kernline tab',
      argsSchema: {
        tabId: tabIdSchema,
        format: z.enum(['config', 'tokens']).default('config'),
      },
    },
    async ({ tabId, format }) => {
      const resolved = hub.resolveTabId(tabId);
      if ('error' in resolved) {
        return {
          messages: [
            {
              role: 'user' as const,
              content: { type: 'text' as const, text: `Theme extract failed: ${resolved.error}` },
            },
          ],
        };
      }
      const result = await hub.query(
        resolved.tabId,
        'page_tokens',
        { format: format === 'config' ? 'config' : 'tokens' },
        120_000,
      );
      const body =
        result.ok && typeof result.data === 'object' && result.data && 'text' in result.data
          ? String((result.data as { text: string }).text)
          : JSON.stringify(result);
      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: `Use these sampled design tokens as the theme source.\n\n${body}`,
            },
          },
        ],
      };
    },
  );

  return server;
}

export async function runStdioServer(hub: ExtensionHub): Promise<void> {
  const server = createKernlineMcpServer(hub);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
