// client/src/app/AdminPage.jsx — Person 1
// Screen 5 (#/admin): the admin's dashboard, in Infotact's dashboard style (left sidebar, white cards).
//   Overview · Departments · Employees · Floors · Layouts (v6) · Alerts · Enter office
// Every action is a call to an /api/admin route; the SERVER checks the admin token each time
// (requireAdmin), so hiding this page from employees is not what keeps it safe.
// The data is loaded when the page opens, after every action, and every few seconds (online people).

import { useCallback, useEffect, useState } from 'react';
import { Logo } from './Logo.jsx';
import { Icon } from './icons.jsx';
import { ROUTES, navigate } from './router.js';
import { api, clearSession } from './session.js';
import { AlertsSection, DepartmentsSection, EmployeesSection, FloorsSection, OverviewSection } from './AdminSections.jsx';
import { LayoutsSection } from './AdminLayouts.jsx';

// How often the page asks the server again (for the "online" column and new alerts).
const ADMIN_REFRESH_MS = 5000;

const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: <Icon.Grid size={17} /> },
  { id: 'departments', label: 'Departments', icon: <Icon.Rooms size={17} /> },
  { id: 'employees', label: 'Employees', icon: <Icon.Users size={17} /> },
  { id: 'floors', label: 'Floors', icon: <Icon.Building size={17} /> },
  { id: 'layouts', label: 'Layouts', icon: <Icon.Map size={17} /> }, // v6: room persistence
  { id: 'alerts', label: 'Alerts', icon: <Icon.Bell size={17} /> },
];

export function AdminPage() {
  const [section, setSection] = useState('overview');
  const [data, setData] = useState(null); // { overview, departments, employees, floors, alerts }
  const [layout, setLayout] = useState(null);
  const [me, setMe] = useState(null);
  const [errorText, setErrorText] = useState('');
  const [notice, setNotice] = useState('');

  /** Ask the server for everything the page shows. */
  const reload = useCallback(async () => {
    try {
      const [overview, departments, employees, floors, alerts] = await Promise.all([
        api('/api/admin/overview'),
        api('/api/admin/departments'),
        api('/api/admin/employees'),
        api('/api/admin/floors'),
        api('/api/admin/alerts'),
      ]);
      setData({ overview, departments, employees, floors, alerts });
      setErrorText('');
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        // Not an admin (or the sign-in expired): back to sign-in.
        clearSession();
        navigate(ROUTES.SIGN_IN);
        return;
      }
      setErrorText(error.message);
    }
  }, []);

  useEffect(() => {
    api('/api/me')
      .then((answer) => setMe(answer.profile))
      .catch(() => {});
    api('/api/office/layout')
      .then(setLayout)
      .catch(() => {});
    reload();
    const timer = setInterval(reload, ADMIN_REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);

  /**
   * Run one admin action, show its result, and reload. `work` returns a short sentence to show.
   * Errors from the server (e.g. "riya@infotact.demo is already in the directory") are shown too.
   */
  async function act(work) {
    setNotice('');
    try {
      const message = await work();
      await reload();
      if (message) setNotice(message);
      return true;
    } catch (error) {
      setErrorText(error.message);
      return false;
    }
  }

  const openAlerts = data ? data.alerts.filter((alert) => !alert.resolved).length : 0;
  const title = SECTIONS.find((s) => s.id === section)?.label;

  return (
    <div className="admin-shell">
      <nav className="admin-sidebar" aria-label="Admin sections">
        <a href="#/">
          <Logo size={26} />
        </a>
        <div className="label label-grey" style={{ padding: '0 10px 6px' }}>
          Infotact office
        </div>
        {SECTIONS.map((item) => (
          <button key={item.id} className={`side-link ${section === item.id ? 'side-link-active' : ''}`} onClick={() => setSection(item.id)}>
            {item.icon} {item.label}
            {item.id === 'alerts' && openAlerts > 0 && <span className="side-count">{openAlerts}</span>}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary" onClick={() => navigate(ROUTES.LOBBY)}>
          <Icon.Door size={17} /> Enter office
        </button>
        <button
          className="side-link"
          onClick={() => {
            clearSession();
            navigate(ROUTES.SIGN_IN);
          }}
        >
          <Icon.Leave size={17} /> Sign out
        </button>
      </nav>

      <main className="admin-main">
        <header className="admin-header">
          <div className="crumb">
            <span className="pill">Admin</span>
            <span className="muted">/</span>
            <span>{title}</span>
          </div>
          <div className="small muted">{me ? `${me.name} · ${me.email}` : ''}</div>
        </header>

        {errorText !== '' && (
          <div className="error-box" role="alert">
            {errorText}{' '}
            <button className="btn btn-small" onClick={() => setErrorText('')}>
              OK
            </button>
          </div>
        )}
        {notice !== '' && <div className="note-box" style={{ marginBottom: 14 }}>{notice}</div>}

        {!data && <p className="muted">Loading the Infotact directory…</p>}
        {data && section === 'overview' && <OverviewSection data={data} layout={layout} onGo={setSection} />}
        {data && section === 'departments' && <DepartmentsSection data={data} act={act} />}
        {data && section === 'employees' && <EmployeesSection data={data} act={act} />}
        {data && section === 'floors' && <FloorsSection data={data} layout={layout} act={act} />}
        {data && section === 'alerts' && <AlertsSection data={data} act={act} />}
        {data && section === 'layouts' && <LayoutsSection data={data} act={act} />}
      </main>
    </div>
  );
}
