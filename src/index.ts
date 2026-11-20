import { ExtensionHub } from './extensionHub.js';
import { bridgeTokenFromEnv, defaultBridgePort } from './env.js';
import { runStdioServer } from './createServer.js';

const token = bridgeTokenFromEnv();
if (!token) {
  console.error('Kernline MCP: set KERNLINE_BRIDGE_TOKEN (copy from Kernline settings).');
  process.exit(1);
}

const hub = new ExtensionHub({ port: defaultBridgePort(), token });
hub.start();

process.on('SIGINT', () => {
  hub.stop();
  process.exit(0);
});

await runStdioServer(hub);
console.error('Kernline MCP server running on stdio');
