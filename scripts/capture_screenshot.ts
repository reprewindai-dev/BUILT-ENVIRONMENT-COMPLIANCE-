import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const PORT = 3089;
const server = spawn('npx', ['tsx', 'server.ts'], {
  env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test', JWT_SECRET: 'zape-sovereign-secret-2026' },
  shell: true
});

async function main() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/ledger`);
      if (res.ok) break;
    } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`Server is running on ${PORT}`);

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const outPng = path.resolve('docs', 'screenshots', 'sovereign_commons_cockpit.png');
  const targetUrl = `http://127.0.0.1:${PORT}/?tab=sovereign_commons`;

  console.log(`Waiting 2.5s for frontend to mount and query telemetry...`);
  await new Promise((r) => setTimeout(r, 2500));

  console.log('Capturing screenshot with Edge headless...');
  const edge = spawn(edgePath, [
    '--headless',
    '--disable-gpu',
    '--window-size=1440,1100',
    `--screenshot=${outPng}`,
    targetUrl
  ]);

  edge.on('close', (code) => {
    console.log(`Edge screenshot process exited with code ${code}`);
    if (server.pid) {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(server.pid), '/t', '/f']);
      } else {
        server.kill();
      }
    }
    if (fs.existsSync(outPng)) {
      console.log(`SUCCESS: Captured screenshot at ${outPng} (${fs.statSync(outPng).size} bytes)`);
      process.exit(0);
    } else {
      console.error('Screenshot file was not generated.');
      process.exit(1);
    }
  });
}
main();
