import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createChatHandler} from '../src/lib/chat-handler.ts';
import type {ChatKnowledge} from '../src/lib/chat-knowledge.ts';

// Vercel bundles this public, generated file through includeFiles. Secrets are
// read here at runtime; this entry point is never imported by the browser.
const handler = createChatHandler({
  apiKey: process.env.ANTHROPIC_API_KEY,
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  knowledge: async () => JSON.parse(await readFile(join(process.cwd(), 'dist/chat-knowledge.json'), 'utf8')) as ChatKnowledge,
});
export default {fetch: handler};
