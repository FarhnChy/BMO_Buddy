import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const folder of ['api','lib','public']) {
  for (const file of readdirSync(folder).filter(f => /\.(m?js)$/.test(f))) {
    const result = spawnSync(process.execPath, ['--check',`${folder}/${file}`], { stdio:'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
if (/BMO Fridge Buddy[^<]*Online/.test(readFileSync('public/index.html','utf8'))) throw new Error('Unexpected Online heading.');
console.log('Vercel app syntax and page checks passed.');
