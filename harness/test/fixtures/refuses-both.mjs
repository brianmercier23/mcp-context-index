// A process that speaks JSON-RPC and answers neither handshake: every request gets
// -32601 Method not found. Hand-rolled rather than built on either SDK, because neither SDK will
// produce this shape — which is the point. It is the fixture for the no_handshake_response
// failure class: alive, on the wire, and unusable by a client of either era.
import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin });

rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.id === undefined || msg.id === null) return; // notification: nothing to answer
  process.stdout.write(
    JSON.stringify({
      jsonrpc: '2.0',
      id: msg.id,
      error: { code: -32601, message: `Method not found: ${msg.method}` },
    }) + '\n',
  );
});
