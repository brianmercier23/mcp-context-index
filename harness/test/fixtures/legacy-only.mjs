// A 2025-era server on @modelcontextprotocol/sdk: answers initialize, has never heard of
// server/discover. This is what every server in dev-tooling-v1 was on 2026-08-13.
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const server = new Server({ name: 'probe-fixture-legacy', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search_documents',
      description: 'Search the document corpus and return matching records.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The text to search for.' },
          limit: { type: 'integer', description: 'Maximum number of results to return.' },
        },
        required: ['query'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async () => ({ content: [{ type: 'text', text: 'ok' }] }));

await server.connect(new StdioServerTransport());
