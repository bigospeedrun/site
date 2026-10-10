import { defineConfig } from 'astro/config';
import agentPages from './src/integrations/agent-pages.ts';
import chatbot from './src/integrations/chatbot.ts';
export default defineConfig({ site: 'https://bigospeedrun.com', output: 'static', integrations: [chatbot(), agentPages()], devToolbar: { enabled: false } });
