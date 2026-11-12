// client/src/app/SignInPage.jsx — Person 1
// Screen 2 (#/signin): two tabs.
//   Employee: email + Continue. The server looks the email up in the Infotact directory.
//             The demo emails are shown as chips: click one to fill the box.
//   Admin:    email + password (checked on the server against ADMIN_PASSWORD).
// On success the token goes into sessionStorage (session.js), then: employee → lobby, admin → admin page.

import { useEffect, useState } from 'react';
import { Logo, LogoMark } from './Logo.jsx';
import { Icon } from './icons.jsx';
import { ROUTES, navigate } from './router.js';
import { api, saveSession } from './session.js';

const TABS = Object.freeze({ EMPLOYEE: 'employee', ADMIN: 'admin' });

export function SignInPage() {
  const [tab, setTab] = useState(TABS.EMPLOYEE);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorText, setErrorText] = useState('');
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState({ employees: [], admin: null });

  // The demo emails for the chips (asked once, when the page opens).
  useEffect(() => {
    let cancelled = false;
    api('/api/auth/demo')
      .then((answer) => {
        if (!cancelled) setDemo(answer);
      })
      .catch(() => {
        // No chips if the server is not reachable; the form still shows the error on submit.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function switchTab(nextTab) {
    setTab(nextTab);
    setErrorText('');
    setPassword('');
    setEmail(nextTab === TABS.ADMIN && demo.admin ? demo.admin : '');
  }

  async function handleSubmit(event) {
    event.preventDefault(); // a form would otherwise reload the page
    setBusy(true);
    setErrorText('');
    try {
      if (tab === TABS.EMPLOYEE) {
        const answer = await api('/api/auth/employee', { method: 'POST', body: { email } });
        saveSession({ token: answer.token, admin: false });
        navigate(ROUTES.LOBBY);
      } else {
        const answer = await api('/api/auth/admin', { method: 'POST', body: { email, password } });
        saveSession({ token: answer.token, admin: true });
        navigate(ROUTES.ADMIN);
      }
    } catch (error) {
      setErrorText(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <header className="topbar">
        <a href="#/">
          <Logo />
        </a>
        <span className="muted small">Infotact workspace</span>
      </header>

      <main className="center-page">
        <form className="card center-card" onSubmit={handleSubmit}>
          <div className="center-logo">
            <span>
              <LogoMark size={34} />
            </span>
          </div>
          <h2>Sign in to the Infotact office</h2>
          <p className="subtitle">Choose how you sign in.</p>

          <div className="tabs" role="tablist">
            <button type="button" role="tab" className={`tab ${tab === TABS.EMPLOYEE ? 'tab-active' : ''}`} onClick={() => switchTab(TABS.EMPLOYEE)}>
              Employee
            </button>
            <button type="button" role="tab" className={`tab ${tab === TABS.ADMIN ? 'tab-active' : ''}`} onClick={() => switchTab(TABS.ADMIN)}>
              Admin
            </button>
          </div>

          {errorText !== '' && <div className="error-box">{errorText}</div>}

          <label className="field">
            Work email
            <input
              className="input"
              type="email"
              autoComplete="username"
              placeholder="name@infotact.demo"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>

          {tab === TABS.EMPLOYEE && demo.employees.length > 0 && (
            <div className="chip-row" aria-label="Demo emails">
              {demo.employees.map((person) => (
                <button type="button" key={person.email} className="chip" onClick={() => setEmail(person.email)} title={`${person.name}, ${person.department}`}>
                  {person.email}
                </button>
              ))}
            </div>
          )}

          {tab === TABS.ADMIN && (
            <label className="field">
              Password
              <input className="input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>
          )}

          <button className="btn btn-primary btn-big" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Checking…' : 'Continue'} <Icon.Chevron />
          </button>

          <p className="sso-note">
            In production, identity comes from Infotact's dashboard (single sign-on). This demo looks you up in the employee directory.
          </p>
        </form>
      </main>
    </div>
  );
}
