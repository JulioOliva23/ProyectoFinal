#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { HttpTallerApi } from './api-client.js';
import { createTallerServer } from './server.js';

// Credentials come from the environment (.mcp.json expands them from the
// shell); never from the repository (GEN-11). Use a dedicated staff account
// for the agent so the four-eyes rule (AG-04) separates it from people.
function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    process.stderr.write(`taller-mcp: falta la variable de entorno ${name}\n`);
    process.exit(1);
  }
  return value;
}

const api = new HttpTallerApi({
  baseUrl: (process.env.TALLER_API_URL ?? 'http://localhost:3000/api/v1').replace(/\/$/, ''),
  username: requiredEnv('TALLER_AGENT_USERNAME'),
  password: requiredEnv('TALLER_AGENT_PASSWORD'),
});

// stdout belongs to the MCP protocol; diagnostics go to stderr only.
await createTallerServer(api).connect(new StdioServerTransport());
process.stderr.write('taller-mcp: listo (stdio)\n');
