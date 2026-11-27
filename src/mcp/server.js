import dotenv from 'dotenv';
dotenv.config({ quiet: true });

import readline from 'node:readline';
import { findUserByEmail } from '../data/users.js';
import { get_event, list_upcoming_events, list_event_registrations } from './tools.js';

const email = process.env.MCP_USER_EMAIL;
if (!email) {
  console.error('Error: MCP_USER_EMAIL environment variable is not set.');
  process.exit(1);
}

const user = await findUserByEmail(email);
if (!user) {
  console.error(`Error: User with email "${email}" not found.`);
  process.exit(1);
}

const tools = [
  {
    name: 'get_event',
    description: 'Return the title and description of one event by its id. Use it when asked what an event covers.',
    inputSchema: {
      type: 'object',
      properties: {
        event_id: { type: 'integer', description: 'The event id' }
      },
      required: ['event_id']
    }
  },
  {
    name: 'list_upcoming_events',
    description: 'Return a list with a title, date, time, location and number of free places for the upcoming events, soonest first. Use it when asked for upcoming events.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'list_event_registrations',
    description: 'Return the e-mail and sign-up date of every member registered for an event, by event id. Use it when asked who has signed up for an event.',
    inputSchema: {
      type: 'object',
      properties: {
        event_id: { type: 'integer', description: 'The event id' }
      },
      required: ['event_id']
    }
  }
];

const toolMap = {
  get_event,
  list_upcoming_events,
  list_event_registrations
};

function send(reply) {
  process.stdout.write(JSON.stringify(reply) + '\n');
}

async function handle(msg) {
  if (msg.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: msg.params?.protocolVersion || '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'club-events', version: '1.0.0' }
      }
    };
  }

  if (msg.method === 'notifications/initialized') {
    return null;
  }

  if (msg.method === 'tools/list') {
    return { jsonrpc: '2.0', id: msg.id, result: { tools } };
  }

  if (msg.method === 'tools/call') {
    const name = msg.params?.name;
    const args = msg.params?.arguments || {};
    const tool = toolMap[name];
    if (!tool) {
      return { jsonrpc: '2.0', id: msg.id, error: { code: -32602, message: 'Unknown tool: ' + name } };
    }
    const output = await tool(user.id, args);
    return {
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        content: output.content,
        isError: output.isError
      }
    };
  }

  if (msg.id !== undefined) {
    return { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found: ' + msg.method } };
  }

  return null;
}

const lines = readline.createInterface({ input: process.stdin });

lines.on('line', async (line) => {
  try {
    if (!line.trim()) return;
    const msg = JSON.parse(line);
    const reply = await handle(msg);
    if (reply) send(reply);
  } catch (err) {
    console.error('Error processing JSON-RPC message:', err);
  }
});
