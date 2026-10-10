import { defineConfig } from 'astro/config';
import chatbot from './src/integrations/chatbot.ts';
export default defineConfig({ site: 'https://bigospeedrun.com', output: 'static', integrations: [chatbot()], devToolbar: { enabled: false } });
