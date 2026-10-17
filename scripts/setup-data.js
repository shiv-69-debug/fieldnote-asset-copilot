import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const project = path.resolve(import.meta.dirname, '..');
const destination = path.join(project, 'data');
if (existsSync(path.join(destination, 'sample-data'))) console.log('Dataset already available at asset-copilot/data/sample-data.');
else {
  if (existsSync(destination)) throw Error('data/ exists without sample-data; choose a different DATASET_PATHS location.');
  execFileSync('git', ['clone', '--depth', '1', 'https://github.com/FlytBaseAILabs/flytbase-ahc-swe-asset-intelligence-dataset.git', destination], { cwd: project, stdio: 'inherit' });
  console.log('Dataset ready. Start the app with npm start.');
}
