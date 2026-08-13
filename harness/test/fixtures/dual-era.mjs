// A server that answers BOTH handshakes, from one tool registration.
//
// This is the parity fixture: the same process, the same tools, reached once through
// server/discover and once through initialize. Any difference in measured tokens between the two
// runs would be the client stack, not the server — which is exactly what the parity test asserts
// must not happen.
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { fromJsonSchema } from '@modelcontextprotocol/server';

const SEARCH_SCHEMA = {
  type: 'object',
  properties: {
    query: { type: 'string', description: 'The text to search for.' },
    limit: { type: 'integer', description: 'Maximum number of results to return.' },
  },
  required: ['query'],
};

const FETCH_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Identifier of the document to fetch.' },
  },
  required: ['id'],
};

serveStdio(() => {
  const server = new McpServer({ name: 'probe-fixture-dual', version: '1.0.0' }, { capabilities: { tools: {} } });
  server.registerTool(
    'search_documents',
    { description: 'Search the document corpus and return matching records.', inputSchema: fromJsonSchema(SEARCH_SCHEMA) },
    async () => ({ content: [{ type: 'text', text: 'ok' }] }),
  );
  server.registerTool(
    'fetch_document',
    { description: 'Fetch a single document by identifier.', inputSchema: fromJsonSchema(FETCH_SCHEMA) },
    async () => ({ content: [{ type: 'text', text: 'ok' }] }),
  );
  return server;
});
