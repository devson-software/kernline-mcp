# @kernline/mcp

Local MCP server for the [Kernline](https://kernline.dev) browser extension. It lets Cursor, Claude Desktop and other MCP clients read inspection output (CSS, Tailwind, design tokens, Copy for AI bundles) from tabs where the Kernline panel is open.

Public source for this package is the read-only mirror [devson-software/kernline-mcp](https://github.com/devson-software/kernline-mcp). Kernline copies this folder there on push. Do not edit the mirror.

Everything stays on your computer. The server listens on `127.0.0.1` only, accepts connections from the Kernline extension only, and proves itself with a pairing token before any data is shared. Kernline never receives page content on its servers. Your AI app may send what it reads to its own model provider.

## Setup

1. In Kernline, open **Settings**, go to **MCP server**, tick **Enable MCP server**, then click **Copy token**.
2. Add the server to your MCP client with that token.

### Cursor (`~/.cursor/mcp.json`)

```json
{
  "mcpServers": {
    "kernline": {
      "command": "npx",
      "args": ["-y", "@kernline/mcp"],
      "env": { "KERNLINE_BRIDGE_TOKEN": "paste-your-token" }
    }
  }
}
```

### Claude Desktop (`claude_desktop_config.json`)

Use the same `kernline` block under `mcpServers`.

3. Open the Kernline panel on a tab, then ask your AI app to use the Kernline tools.

## Options

- `KERNLINE_BRIDGE_TOKEN` (required) is the pairing token from Kernline settings.
- `KERNLINE_BRIDGE_PORT` (optional, default `47321`) must match the port in Kernline settings.

Requires Node.js 18 or newer. Pro tools (Copy for AI, page tokens) need a Kernline Pro licence in the extension.

## License

MIT, made by [Devson Software](https://www.devson.co.za) in South Africa. The Kernline browser extension itself is not open source.
