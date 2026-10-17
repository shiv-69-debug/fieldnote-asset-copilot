import { createApp } from '../server.js';
delete process.env.GEMINI_API_KEY;
delete process.env.OPENAI_API_KEY;
const { server } = createApp({ database: ':memory:' });
server.listen(3199, '127.0.0.1');
