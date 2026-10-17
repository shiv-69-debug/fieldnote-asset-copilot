import { createApp } from '../server.js';
import { defaultData, releasedData } from '../src/store.js';

const { server } = createApp({
  roots: [defaultData, releasedData],
  allowRevisions: true,
  today: '2027-01-15',
});
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.ASSET_PORT || 3100);
server.listen(port, host, () => console.log(`Fieldnote final dataset: http://${host}:${port}`));
