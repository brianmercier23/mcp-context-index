// A server that has migrated to the 2026-07-28 stateless core and no longer answers initialize.
//
// This is the server the harness could not measure before 0.1.4, and would have recorded as a
// server-side connect failure — blaming a server for having followed the specification. The test
// asserts it is measured, not blamed.
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { fromJsonSchema } from '@modelcontextprotocol/server';

serveStdio(
  () => {
    const server = new McpServer({ name: 'probe-fixture-modern', version: '1.0.0' }, { capabilities: { tools: {} } });
    server.registerTool(
      'ping_service',
      {
        description: 'Check whether the upstream service is reachable.',
        inputSchema: fromJsonSchema({
          type: 'object',
          properties: { host: { type: 'string', description: 'Hostname to check.' } },
          required: ['host'],
        }),
      },
      async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    );
    return server;
  },
  { legacy: 'reject' },
);
