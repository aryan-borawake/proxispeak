// server/scripts/screens-v6.js — Person 1, v6
// Headless screenshots of this version's features, saved to docs/screens/ (25-…). Other people in the
// pictures are robots (robots.js): real Socket.io clients that sign in as demo employees.
//
// How to run it:
//   1. In server/:  npm run dev        (ADMIN_PASSWORD set, e.g. in .env)
//   2. In client/:  npm run dev        (Vite on http://localhost:5173; its development build lets this
//                                       script steer the world through window.__officeController)
//   3. From the repo root:  node server/scripts/screens-v6.js [step …]
//
// Each scene signs in fresh (a new join), because the server allows only the FIRST move after a join
// to jump; after that people must walk (the speed check, moveCheck.js).

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { EVENTS } from '../../shared/events.js';
import { launchChrome, pause } from './cdp.js';
import { connectRobot, jumpTo, signIn } from './robots.js';

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const SCREENS_DIR = fileURLToPath(new URL('../../docs/screens/', import.meta.url));
const tile = (tx, ty) => ({ x: tx * 32, y: ty * 32 - 8 }); // the avatar position standing on a tile
const shot = (page, name) => page.screenshot(`${SCREENS_DIR}${name}.png`);

function typeInto(page, selector, text) {
  return page.eval(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(text)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}
function clickText(page, text, tag = 'button') {
  return page.eval(`(() => {
    const element = [...document.querySelectorAll(${JSON.stringify(tag)})].find((el) => el.textContent.includes(${JSON.stringify(text)}));
    if (!element) throw new Error('no ${tag} with text: ' + ${JSON.stringify(text)});
    element.click();
  })()`);
}

/** Sign in as an employee, join the office, close the welcome card, and jump to a spot (the free first move). */
async function enterOffice(page, email, spot, { zoom = 1.5 } = {}) {
  await page.goto(`${CLIENT_URL}/#/signin`, 1200);
  await typeInto(page, 'input[type=email]', email);
  await clickText(page, 'Continue');
  await page.waitFor(`document.querySelector('.lobby-profile')`);
  await clickText(page, 'Join office');
  await page.waitFor(`document.querySelector('.welcome-card') && window.__officeController && window.__officeController()`, 12000);
  await pause(800);
  await clickText(page, 'Later');
  await page.eval(`window.__officeController().jumpTo(${spot.x}, ${spot.y}, 'up')`);
  await page.eval(`window.__officeController().setZoom(${zoom})`);
  await pause(1200);
}

/** Robots (pretend people) standing on the given tiles of floor-1. */
async function robotsAt(people) {
  const robots = [];
  for (const { email, at } of people) {
    const robot = await connectRobot(email, { token: await signIn(email), floorId: 'floor-1' }, { record: false });
    jumpTo(robot, at.x, at.y, 'up');
    robots.push(robot);
  }
  await pause(600);
  return robots;
}
const leave = (robots) => robots.forEach((robot) => robot.socket.disconnect());

const STEPS = {
  async layout(page) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
    await enterOffice(page, 'riya@infotact.demo', tile(59, 40), { zoom: 0.3 });
    await page.eval(`document.querySelector('[aria-label="Close the people panel"]')?.click()`);
    await pause(1200);
    await shot(page, '25-v6-layout-zoomed-out');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 860, deviceScaleFactor: 1, mobile: false });
  },

  async chat(page) {
    const robots = await robotsAt([{ email: 'arjun@infotact.demo', at: tile(48, 9) }]);
    await enterOffice(page, 'riya@infotact.demo', tile(49, 13), { zoom: 1.3 });
    robots[0].socket.emit(EVENTS.CHAT_SEND, { text: 'Morning! Ready for the stand-up?' });
    await pause(500);
    await typeInto(page, '.chat-form input', 'Yes, starting now. Nobody outside can hear us.');
    await clickText(page, 'Send');
    await pause(800);
    await shot(page, '26-v6-private-area-chat');
    leave(robots);
  },

  async meeting(page) {
    const robots = await robotsAt([
      { email: 'arjun@infotact.demo', at: tile(33, 9) },
      { email: 'ananya@infotact.demo', at: tile(35, 9) },
    ]);
    await enterOffice(page, 'riya@infotact.demo', tile(34, 13), { zoom: 1.4 });
    await clickText(page, 'Chat'); // switch the right panel to People
    await page.eval(`[...document.querySelectorAll('.bar-btn')].find((b) => b.textContent.trim().match(/^\\d+$/))?.click()`);
    await pause(1200);
    await shot(page, '27-v6-meeting-room-3-people');
    leave(robots);
  },

  async stage(page) {
    const robots = await robotsAt([
      { email: 'farhan@infotact.demo', at: tile(15, 8) }, // on the platform
      { email: 'dev@infotact.demo', at: tile(8, 21) },
      { email: 'isha@infotact.demo', at: tile(20, 17) },
      { email: 'arjun@infotact.demo', at: tile(22, 25) },
    ]);
    await enterOffice(page, 'riya@infotact.demo', tile(12, 19), { zoom: 0.9 });
    await pause(800);
    await shot(page, '28-v6-stage-hall');
    leave(robots);
  },

  async focus(page) {
    const robots = await robotsAt([{ email: 'ananya@infotact.demo', at: tile(73, 11) }]);
    await enterOffice(page, 'riya@infotact.demo', tile(69, 11), { zoom: 1.5 });
    await shot(page, '29-v6-focus-room-silent');
    leave(robots);
  },

  async running(page) {
    await enterOffice(page, 'riya@infotact.demo', tile(36, 23), { zoom: 1.6 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, modifiers: 8 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, modifiers: 8 });
    await pause(650);
    await shot(page, '30-v6-shift-running');
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, modifiers: 8 });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16 });
  },

  async muffled(page) {
    // Two real browser tabs with (fake) microphones, on open floor, either side of the lobby/kitchen wall.
    const arjun = await page.openPage();
    await enterOffice(arjun, 'arjun@infotact.demo', tile(28, 60), { zoom: 1.5 });
    await page.send('Page.bringToFront');
    await enterOffice(page, 'riya@infotact.demo', tile(31, 60), { zoom: 1.8 });
    await page.waitFor(`document.querySelector('.muffled-icon')`, 15000).catch(() => console.log('[screens] no muffled icon yet'));
    await pause(800);
    await shot(page, '31-v6-wall-muffled-voice');
    await arjun.eval(`document.querySelector('.office-bottombar .bar-btn-off:last-child')?.click()`).catch(() => {});
  },

  async comingsoon(page) {
    await enterOffice(page, 'riya@infotact.demo', tile(67, 48), { zoom: 0.7 });
    await page.eval(`document.querySelector('[aria-label="Close the people panel"]')?.click()`);
    await pause(900);
    await shot(page, '32-v6-neighbourhood-coming-soon');
  },

  async fps(page) {
    // 50 bots packed into the lobby around Riya (the load test), then the F key counter.
    const load = spawn(process.execPath, [fileURLToPath(new URL('./load-test.js', import.meta.url)), '--bots=50', '--seconds=40', '--packed'], { stdio: ['ignore', 'pipe', 'inherit'] });
    let output = '';
    load.stdout.on('data', (chunk) => {
      output += chunk;
    });
    await pause(9000);
    await enterOffice(page, 'riya@infotact.demo', tile(51, 66), { zoom: 1.0 });
    await page.press('f');
    const samples = [];
    for (let i = 0; i < 8; i += 1) {
      await pause(1000);
      samples.push(await page.eval(`window.__officeController().lastFps`));
    }
    await shot(page, '33-v6-fps-50-bots');
    const people = await page.eval(`document.querySelectorAll('.person-row').length`);
    console.log(`[screens] FPS with the load test's 50 bots on the floor: ${samples.join(', ')} (people rows in the panel: ${people})`);
    await new Promise((resolve) => load.on('exit', resolve));
    console.log(output.split('\n').filter((line) => line.includes('server tick') || line.includes('peers per bot at the end')).join('\n'));
  },

  async admin(page) {
    await page.goto(`${CLIENT_URL}/#/signin`, 1200);
    await clickText(page, 'Admin');
    await pause(200);
    await typeInto(page, 'input[type=email]', 'admin@infotact.demo');
    await typeInto(page, 'input[type=password]', process.env.ADMIN_PASSWORD || '');
    await clickText(page, 'Continue');
    await page.waitFor(`location.hash === '#/admin'`);
    await page.waitFor(`[...document.querySelectorAll('.side-link')].some((b) => b.textContent.includes('Layouts'))`);
    await clickText(page, 'Layouts');
    await page.waitFor(`document.querySelector('.table td')`);
    await pause(600);
    await shot(page, '34-v6-admin-layouts');
    await clickText(page, 'Overview');
    await pause(1500);
    await shot(page, '35-v6-admin-overview-minimap');
  },
};

async function main() {
  const wanted = process.argv.slice(2);
  const steps = wanted.length > 0 ? wanted : Object.keys(STEPS);
  const page = await launchChrome({ port: 9361, width: 1440, height: 860 });
  try {
    for (const name of steps) {
      console.log(`[screens] ${name}`);
      await STEPS[name](page);
    }
  } finally {
    await page.close();
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
