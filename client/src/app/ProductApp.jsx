// client/src/app/ProductApp.jsx — Person 1
// The product for Infotact: picks the screen from the address (hash routing, router.js).
//   #/ landing → #/signin → #/lobby → #/office,  and #/admin for admins.
// Screens that need a sign-in send you to #/signin when there is no token in this tab.

import './app.css';
import { ROUTES, navigate, useRoute } from './router.js';
import { getToken } from './session.js';
import { LandingPage } from './LandingPage.jsx';
import { SignInPage } from './SignInPage.jsx';
import { LobbyPage } from './LobbyPage.jsx';
import { OfficePage } from './OfficePage.jsx';
import { AdminPage } from './AdminPage.jsx';

// Which screens need a token.
const SIGNED_IN_ONLY = new Set([ROUTES.LOBBY, ROUTES.OFFICE, ROUTES.ADMIN]);

export function ProductApp() {
  const route = useRoute();

  if (SIGNED_IN_ONLY.has(route) && !getToken()) {
    // Not signed in in this tab: go to sign-in first. (The server checks the token too.)
    navigate(ROUTES.SIGN_IN);
    return null;
  }

  let screen;
  if (route === ROUTES.SIGN_IN) screen = <SignInPage />;
  else if (route === ROUTES.LOBBY) screen = <LobbyPage />;
  else if (route === ROUTES.OFFICE) screen = <OfficePage />;
  else if (route === ROUTES.ADMIN) screen = <AdminPage />;
  else screen = <LandingPage />;

  // key={route}: each screen starts fresh when you arrive on it.
  return (
    <div className="app-root" key={route}>
      {screen}
    </div>
  );
}
