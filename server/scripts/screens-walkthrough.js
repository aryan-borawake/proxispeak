// server/scripts/screens-walkthrough.js — Person 1
// Clicks through the whole product in a headless Chrome and saves screenshots to docs/screens/.
//
// How to run it:
//   1. In server/:  npm run dev        (ADMIN_PASSWORD set, e.g. in .env)
//   2. In client/:  npm run dev        (Vite on http://localhost:5173)
//   3. From the repo root:  node server/scripts/screens-walkthrough.js [step …]
// With no steps it runs all of them. Example: node server/scripts/screens-walkthrough.js landing signin
// It reads ADMIN_PASSWORD from the repo-root .env (or the environment), like the server does.
//
// NOTE: the "growth" and "floors" steps really change the directory (they add sample employees, a
// floor, and move a department). Run `node server/office/reset-demo.js` afterwards for a clean demo.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { launchChrome, pause } from './cdp.js';

const ENV_FILE_PATH = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(ENV_FILE_PATH)) dotenv.config({ path: ENV_FILE_PATH, quiet: true });

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const SCREENS_DIR = fileURLToPath(new URL('../../docs/screens/', import.meta.url));
const EMPLOYEE_EMAIL = 'riya@infotact.demo';
const ADMIN_EMAIL = 'admin@infotact.demo';

const shot = (page, name) => page.screenshot(`${SCREENS_DIR}${name}.png`);

/** Type into the input that matches `selector` the way a person would (React sees the change). */
function typeInto(page, selector, text) {
  return page.eval(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(text)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
}

/** Click the first button (or link) whose text contains `text`. */
function clickText(page, text, tag = 'button') {
  return page.eval(`(() => {
    const element = [...document.querySelectorAll(${JSON.stringify(tag)})].find((el) => el.textContent.includes(${JSON.stringify(text)}));
    if (!element) throw new Error('no ${tag} with text: ' + ${JSON.stringify(text)});
    element.click();
  })()`);
}

/** Click the office's zoom button: zoom(page, 'in') or zoom(page, 'out'). */
function zoom(page, direction) {
  const label = direction === 'in' ? 'Zoom in' : 'Zoom out';
  return page.eval(`document.querySelector('[aria-label="${label}"]').click()`);
}

/** Sign in through the page (sets the token in sessionStorage like a real user). */
async function signInEmployee(page, email = EMPLOYEE_EMAIL) {
  await page.goto(`${CLIENT_URL}/#/signin`, 1500);
  await typeInto(page, 'input[type=email]', email);
  await clickText(page, 'Continue');
  await page.waitFor(`location.hash === '#/lobby'`);
  // "Join office" is enabled once the profile has loaded.
  await page.waitFor(`document.querySelector('.lobby-profile')`);
}

async function signInAdmin(page) {
  await page.goto(`${CLIENT_URL}/#/signin`, 1500);
  await clickText(page, 'Admin');
  await pause(200);
  await typeInto(page, 'input[type=email]', ADMIN_EMAIL);
  await typeInto(page, 'input[type=password]', process.env.ADMIN_PASSWORD || '');
  await clickText(page, 'Continue');
  await page.waitFor(`location.hash === '#/admin'`);
}

const STEPS = {
  async landing(page) {
    await page.goto(`${CLIENT_URL}/#/`, 2000);
    await shot(page, '01-landing');
  },

  async signin(page) {
    await page.goto(`${CLIENT_URL}/#/signin`, 1800);
    await shot(page, '02-signin-employee');
    await clickText(page, 'Admin');
    await pause(300);
    await shot(page, '03-signin-admin');
    // A wrong email shows the directory error.
    await clickText(page, 'Employee');
    await typeInto(page, 'input[type=email]', 'stranger@example.com');
    await clickText(page, 'Continue');
    await page.waitFor(`document.querySelector('.error-box')`);
    await shot(page, '04-signin-not-in-directory');
  },

  async lobby(page) {
    await signInEmployee(page);
    await page.waitFor(`document.querySelector('.lobby-profile')`);
    await page.eval(`document.querySelectorAll('.color-choice')[4].click()`);
    await clickText(page, 'Test microphone');
    await pause(1200);
    await shot(page, '05-lobby');
  },

  async office(page) {
    // A second person (Arjun, Engineering) in another tab sits at his desk next to Riya's.
    const arjun = await page.openPage();
    await arjun.send('Page.bringToFront');
    await signInEmployee(arjun, 'arjun@infotact.demo');
    await clickText(arjun, 'Join office');
    await arjun.waitFor(`document.querySelector('.office-bottombar .bar-name')?.textContent.includes('Arjun')`, 10000);
    await pause(1500);
    await arjun.press('d', { ctrl: true });
    await pause(500);
    await page.send('Page.bringToFront');

    // Riya joins: welcome card, lobby, camera on her.
    await signInEmployee(page);
    await clickText(page, 'Join office');
    await page.waitFor(`document.querySelector('.welcome-card')`, 10000);
    await pause(2500);
    await shot(page, '06-office-welcome');

    // Zoomed out: the whole floor, department borders in wing A, wings B–D closed.
    for (let i = 0; i < 4; i += 1) await zoom(page, 'out');
    await pause(1500);
    await shot(page, '07-office-zoomed-out');

    // Zoomed in (pixel art stays crisp).
    for (let i = 0; i < 6; i += 1) await zoom(page, 'in');
    await pause(1500);
    await shot(page, '08-office-zoomed-in');
    for (let i = 0; i < 2; i += 1) await zoom(page, 'out');

    // Camera follow: walk right for a moment.
    await page.press('ArrowRight', { holdMs: 1600 });
    await pause(900);
    await shot(page, '09-office-camera-follow');

    // Ctrl+D: jump to her desk (A-01), the desk pulses; Arjun at A-02 is nearby and audible.
    await page.press('d', { ctrl: true });
    await pause(3000);
    await shot(page, '10-office-my-desk-ctrl-d');

    // Arjun walks over to Riya's desk (desks are 128 px apart, earshot is 100 px), so the panel shows
    // him under "Nearby" with the speaker icon once their voices connect.
    await arjun.send('Page.bringToFront');
    await arjun.press('ArrowLeft', { holdMs: 480 });
    await pause(300);
    await page.send('Page.bringToFront');
    await pause(4000);
    await shot(page, '10b-office-nearby-hearing');

    // The status menu, then Busy.
    await page.eval(`document.querySelector('.bar-me').click()`);
    await pause(400);
    await shot(page, '11-office-status-menu');
    await clickText(page, 'Busy');
    await pause(800);
    await shot(page, '12-office-people-panel-busy');
  },

  async admin(page) {
    await signInAdmin(page);
    await page.waitFor(`document.querySelector('.stat-grid')`, 10000);
    await pause(1500);
    await shot(page, '13-admin-overview');
    await clickText(page, 'Departments');
    await pause(600);
    await shot(page, '14-admin-departments');
    await clickText(page, 'Employees');
    await pause(600);
    await shot(page, '15-admin-employees');
  },

  async growth(page) {
    // Add sample hires batch by batch until wing B opens, then until Floor 1 overflows into hot desks.
    await signInAdmin(page);
    await page.waitFor(`document.querySelector('.stat-grid')`, 10000);
    await clickText(page, 'Employees');
    await pause(500);
    const batches = ['dept-engineering', 'dept-marketing', 'dept-engineering', 'dept-design', 'dept-engineering', 'dept-marketing', 'dept-engineering', 'dept-engineering', 'dept-marketing'];
    for (let i = 0; i < batches.length; i += 1) {
      await chooseOption(page, 'select[aria-label="Department for sample employees"]', batches[i]);
      await clickText(page, 'sample employees');
      await page.waitFor(`document.querySelector('.note-box')?.textContent.includes('sample employees joined')`, 15000);
      if (i === 0) {
        await clickText(page, 'Overview');
        await pause(1500);
        await shot(page, '16-growth-wing-b-open');
        await clickText(page, 'Employees');
        await pause(500);
      }
    }
    await pause(1000);
    await shot(page, '17-growth-employees-hot-desks');
    await clickText(page, 'Alerts');
    await pause(800);
    await shot(page, '18-overflow-alert-floor-full');
    await clickText(page, 'Overview');
    await pause(1500);
    await shot(page, '19-overview-floor-1-full');
  },

  async floors(page) {
    // An engineer (Riya) is in the office while the admin moves Engineering to the new Floor 2.
    const riya = await page.openPage();
    await riya.send('Page.bringToFront');
    await signInEmployee(riya);
    await clickText(riya, 'Join office');
    await riya.waitFor(`document.querySelector('.office-bottombar .bar-name')?.textContent.includes('Riya')`, 10000);
    await pause(1500);
    await page.send('Page.bringToFront');

    await signInAdmin(page);
    await page.waitFor(`document.querySelector('.stat-grid')`, 10000);
    await clickText(page, 'Floors');
    await pause(500);
    await clickText(page, 'Add Floor');
    await page.waitFor(`document.querySelector('.dialog')`, 10000);
    await chooseOption(page, 'select[aria-label="Floor for Engineering"]', 'floor-2');
    await pause(300);
    await shot(page, '20-floors-add-floor-2-dialog');
    await page.eval(`[...document.querySelectorAll('.dialog button')].find((b) => b.textContent.includes('Apply')).click()`);
    await page.waitFor(`document.querySelector('.note-box')?.textContent.includes('people moved floor')`, 15000);
    await pause(1500);
    await shot(page, '21-floors-after-move');

    await riya.send('Page.bringToFront');
    await riya.waitFor(`document.querySelector('.office-where')?.textContent.includes('Floor 2')`, 10000);
    await pause(1200);
    await riya.press('d', { ctrl: true });
    await pause(2500);
    await shot(riya, '22-office-moved-to-floor-2');
    await page.send('Page.bringToFront');
  },
};

/** Pick an <option> in a <select> the way a person would (React sees the change). */
function chooseOption(page, selector, value) {
  return page.eval(`(() => {
    const select = document.querySelector(${JSON.stringify(selector)});
    if (!select) throw new Error('no select ' + ${JSON.stringify(selector)});
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(select, ${JSON.stringify(value)});
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}

async function main() {
  const wanted = process.argv.slice(2);
  const names = wanted.length > 0 ? wanted : Object.keys(STEPS);
  try {
    await fetch(`${SERVER_URL}/api/health`);
  } catch {
    console.error(`[screens] the server is not running at ${SERVER_URL}`);
    process.exit(1);
  }
  const page = await launchChrome({ width: 1440, height: 900 });
  let failed = false;
  try {
    for (const name of names) {
      if (!STEPS[name]) throw new Error(`[screens] no step called ${name}; steps: ${Object.keys(STEPS).join(', ')}`);
      console.log(`[screens] step: ${name}`);
      await STEPS[name](page, { signInEmployee, signInAdmin, clickText, typeInto });
    }
  } catch (error) {
    failed = true;
    console.error(`[screens] FAILED: ${error.message}`);
    console.error('[screens] last page console lines:\n' + page.consoleLines.slice(-15).join('\n'));
  } finally {
    await page.close();
  }
  process.exit(failed ? 1 : 0);
}

main();
