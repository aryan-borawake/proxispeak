// client/src/app/router.js — Person 1
// Simple "hash routing": the part of the address after # decides which screen shows.
//   http://localhost:5173/#/        → landing page
//   http://localhost:5173/#/signin  → sign-in page
//   … #/lobby, #/office, #/admin
//
// Why the hash? Changing the part after # never reloads the page and never asks the server for a
// new file, so it works on any static host (Render's static site) with no extra set-up and no
// router package. The browser fires a "hashchange" event whenever it changes.

import { useEffect, useState } from 'react';

// Every screen the app knows. Anything else shows the landing page.
export const ROUTES = Object.freeze({
  LANDING: '/',
  SIGN_IN: '/signin',
  LOBBY: '/lobby',
  OFFICE: '/office',
  ADMIN: '/admin',
});

/**
 * Read the current route from the address.
 * Example: '#/signin' → '/signin';  '' or '#' → '/';  '#/admin?x=1' → '/admin'
 * @returns {string}
 */
export function readRoute() {
  const hash = window.location.hash.replace(/^#/, '');
  const path = hash.split('?')[0];
  return path === '' ? ROUTES.LANDING : path;
}

/** Go to another screen. Example: navigate(ROUTES.LOBBY) */
export function navigate(path) {
  window.location.hash = path;
}

/**
 * React hook: the current route, kept up to date. A "hook" is a function a component calls to get
 * a value that can change; when it changes, React draws the component again.
 * @returns {string}
 */
export function useRoute() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    function handleHashChange() {
      setRoute(readRoute());
      window.scrollTo(0, 0);
    }
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);
  return route;
}
