// client/src/app/AdminSections.jsx — Person 1
// The five sections of the admin page, plus the floor mini-map and the "move departments" dialog.
// Each section gets `data` (everything loaded by AdminPage) and `act(work)`, which runs one admin
// action, reloads the data and shows the sentence `work` returns (or the server's error).

import { useEffect, useRef, useState } from 'react';
import { ALERT_TYPES, ROLES, WING_IDS } from '@shared/constants.js';
import { Icon } from './icons.jsx';
import { api } from './session.js';
import { roleLabel } from './people.js';

const PRODUCTION_NOTE =
  "In production, new hires arrive from Infotact's HR system automatically; overflow hires get a hot desk and the admin is alerted to rebalance.";

// How many sample employees one click adds.
const SAMPLE_BATCH = 10;

// The mini-map's width in screen pixels (its height follows the floor's shape).
const MINIMAP_WIDTH_PX = 760;

function ProductionNote() {
  return (
    <div className="note-box" style={{ marginBottom: 18 }}>
      <strong style={{ color: 'var(--ink)' }}>Note.</strong> {PRODUCTION_NOTE}
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="card stat">
      <div className="label label-grey">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/** "A + B" for ['A', 'B'] */
const wingsText = (wings) => wings.join(' + ');

// ---------------------------------------------------------------- mini-map

/**
 * A small picture of one floor: the map preview, closed wings darkened with "Opens at tier N",
 * each department's desks filled with its colour, and the hot desks in use.
 * Drawn on a canvas once per change (not animated).
 */
export function MiniMap({ layout, snapshot }) {
  const canvasRef = useRef(null);
  const [picture, setPicture] = useState(null);

  useEffect(() => {
    const image = new Image();
    image.onload = () => setPicture(image);
    image.src = '/office-preview.png';
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout || !snapshot) return;
    const scale = MINIMAP_WIDTH_PX / layout.widthPx;
    canvas.width = MINIMAP_WIDTH_PX;
    canvas.height = Math.round(layout.heightPx * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#8fd3f4';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (picture) ctx.drawImage(picture, 0, 0, canvas.width, canvas.height);

    const rect = (r) => [r.x * scale, r.y * scale, r.w * scale, r.h * scale];
    const desksById = new Map(layout.desks.map((desk) => [desk.id, desk]));
    for (const department of snapshot.departments) {
      ctx.fillStyle = `${department.color}99`; // 99 = 60% opacity in #rrggbbaa
      ctx.strokeStyle = department.color;
      ctx.lineWidth = 1.5;
      for (const deskId of department.deskIds) {
        const desk = desksById.get(deskId);
        if (!desk) continue;
        ctx.fillRect(...rect(desk.area));
      }
    }
    const used = new Set(snapshot.hotDeskIds);
    for (const hotDesk of layout.hotDesks) {
      ctx.fillStyle = used.has(hotDesk.id) ? '#d64545' : 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc((hotDesk.x + 16) * scale, (hotDesk.y + 20) * scale, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const wing of layout.wings) {
      const [x, y, w, h] = rect(wing.outer);
      if (snapshot.openWings.includes(wing.id)) {
        ctx.strokeStyle = 'rgba(15, 27, 45, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(x + 6, y + 6, 58, 18);
        ctx.fillStyle = '#0f1b2d';
        ctx.font = '700 11px system-ui, sans-serif';
        ctx.fillText(`Wing ${wing.id}`, x + 35, y + 15.5);
      } else {
        ctx.fillStyle = 'rgba(15, 27, 45, 0.7)';
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 13px system-ui, sans-serif';
        ctx.fillText(`Wing ${wing.id}`, x + w / 2, y + h / 2 - 9);
        ctx.font = '600 11px system-ui, sans-serif';
        ctx.fillStyle = '#9fd8ea';
        ctx.fillText(`Opens at tier ${wing.tier}`, x + w / 2, y + h / 2 + 9);
      }
    }
  }, [layout, snapshot, picture]);

  return <canvas ref={canvasRef} className="minimap" aria-label={`Mini-map of ${snapshot?.name || 'the floor'}`} />;
}

function Legend({ snapshot }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10 }} className="small">
      {snapshot.departments.map((department) => (
        <span key={department.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span className="dept-swatch" style={{ background: department.color }} /> {department.name} ({department.deskIds.length})
        </span>
      ))}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span className="status-dot" style={{ background: '#d64545' }} /> hot desk in use
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- Overview

export function OverviewSection({ data, layout, onGo }) {
  const { overview } = data;
  const [floorId, setFloorId] = useState(overview.floors[0]?.id);
  const snapshot = overview.snapshots.find((s) => s.floorId === floorId) || overview.snapshots[0];

  return (
    <>
      <span className="label">Infotact office</span>
      <h1 className="admin-title">Overview</h1>
      <p className="muted" style={{ margin: 0 }}>
        Headcount, desks and floors at a glance. {overview.online} {overview.online === 1 ? 'person is' : 'people are'} in the office right now.
      </p>

      <div className="stat-grid">
        <Stat label="Headcount" value={overview.headcount} sub={`${overview.online} online now`} />
        <Stat label="Desks used / capacity" value={`${overview.desksUsed} / ${overview.capacity}`} sub="capacity = desks in open wings" />
        <Stat
          label="Tier per floor"
          value={overview.floors.map((f) => f.tier).join(' · ')}
          sub={overview.floors.map((f) => `${f.name}: ${wingsText(f.openWings)}`).join(' · ')}
        />
        <Stat label="Hot desks used" value={overview.hotDesksUsed} sub="overflow hires without a desk" />
        <Stat label="Open alerts" value={overview.openAlerts} sub={overview.openAlerts > 0 ? 'see Alerts' : 'all clear'} />
      </div>

      <section className="card panel">
        <div className="panel-head">
          <div>
            <span className="label label-grey">Mini-map</span>
            <h3>{snapshot?.name} · tier {snapshot?.tier} · {snapshot?.headcount} people</h3>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {overview.floors.map((floor) => (
              <button key={floor.id} className={`btn btn-small ${floor.id === snapshot?.floorId ? 'btn-primary' : ''}`} onClick={() => setFloorId(floor.id)}>
                {floor.name}
              </button>
            ))}
          </div>
        </div>
        {snapshot && <MiniMap layout={layout} snapshot={snapshot} />}
        {snapshot && <Legend snapshot={snapshot} />}
      </section>

      {overview.openAlerts > 0 && (
        <section className="card panel">
          <div className="panel-head">
            <h3>Open alerts</h3>
            <button className="btn btn-small" onClick={() => onGo('alerts')}>
              View all
            </button>
          </div>
          {data.alerts
            .filter((a) => !a.resolved)
            .slice(0, 3)
            .map((alert) => (
              <div key={alert._id} className="alert-row">
                <span className="status-dot" style={{ background: alert.type === ALERT_TYPES.FLOOR_FULL ? 'var(--danger)' : 'var(--accent)', marginTop: 6 }} />
                <span>{alert.message}</span>
              </div>
            ))}
        </section>
      )}
      <ProductionNote />
    </>
  );
}

// ---------------------------------------------------------------- Departments

function DepartmentRow({ department, floors, act }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(department.name);
  const [size, setSize] = useState(department.size);
  const [color, setColor] = useState(department.color);

  async function save() {
    const ok = await act(async () => {
      await api(`/api/admin/departments/${department._id}`, { method: 'PATCH', body: { name, size: Number(size), color } });
      return `${name} saved: ${size} desks reserved (the desk rule ran again for ${name} only).`;
    });
    if (ok) setEditing(false);
  }

  return (
    <tr>
      <td>
        {editing ? (
          <span style={{ display: 'flex', gap: 6 }}>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Colour" />
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} style={{ padding: '5px 8px' }} aria-label="Name" />
          </span>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
            <span className="dept-swatch" style={{ background: department.color }} /> {department.name}
          </span>
        )}
      </td>
      <td>{floors.find((f) => f.floorId === department.floorId)?.name || department.floorId}</td>
      <td>{[...new Set(department.deskIds.map((id) => id.split('-')[0]))].join(', ') || '—'}</td>
      <td>
        {editing ? (
          <input className="input" type="number" min="0" max="100" value={size} onChange={(e) => setSize(e.target.value)} style={{ width: 80, padding: '5px 8px' }} aria-label="Size" />
        ) : (
          <>
            {department.size} <span className="small muted">({department.deskIds.length} reserved)</span>
          </>
        )}
      </td>
      <td>{department.people}</td>
      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        {editing ? (
          <>
            <button className="btn btn-small btn-primary" onClick={save}>
              Save
            </button>{' '}
            <button className="btn btn-small" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button className="btn btn-small" onClick={() => setEditing(true)}>
            Rename / resize
          </button>
        )}
      </td>
    </tr>
  );
}

export function DepartmentsSection({ data, act }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#00a3a3');
  const [size, setSize] = useState(5);
  const [floorId, setFloorId] = useState(data.floors[0]?.floorId);

  function add(event) {
    event.preventDefault();
    act(async () => {
      const department = await api('/api/admin/departments', { method: 'POST', body: { name, color, size: Number(size), floorId } });
      setName('');
      return `${department.name} added with a block of ${department.deskIds.length} desks (${department.deskIds[0] || 'none'} …).`;
    });
  }

  return (
    <>
      <span className="label">Directory</span>
      <h1 className="admin-title">Departments</h1>
      <p className="muted">Each department sits together in a block of neighbouring desks. Resizing runs the desk rule again for that department only.</p>

      <section className="card panel">
        <div className="table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Floor</th>
                <th>Wing</th>
                <th>Size</th>
                <th>People</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.departments.map((department) => (
                <DepartmentRow key={department._id} department={department} floors={data.floors} act={act} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <form className="card panel" onSubmit={add}>
        <h3 style={{ marginBottom: 12 }}>Add a department</h3>
        <div className="form-row">
          <label className="field">
            Name
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Finance" required />
          </label>
          <label className="field" style={{ minWidth: 90, flex: 0 }}>
            Colour
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ height: 42, width: 70 }} />
          </label>
          <label className="field" style={{ minWidth: 110, flex: 0 }}>
            Desks
            <input className="input" type="number" min="1" max="100" value={size} onChange={(e) => setSize(e.target.value)} />
          </label>
          <label className="field">
            Floor
            <select className="select" value={floorId} onChange={(e) => setFloorId(e.target.value)}>
              {data.floors.map((floor) => (
                <option key={floor.floorId} value={floor.floorId}>
                  {floor.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary">Add department</button>
        </div>
      </form>
    </>
  );
}

// ---------------------------------------------------------------- Employees

export function EmployeesSection({ data, act }) {
  const departments = data.departments;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState(ROLES.EMPLOYEE);
  const [departmentId, setDepartmentId] = useState(departments[0]?._id);
  const [sampleDepartmentId, setSampleDepartmentId] = useState(departments[0]?._id);

  function add(event) {
    event.preventDefault();
    act(async () => {
      const { profile } = await api('/api/admin/employees', { method: 'POST', body: { name, email, role, departmentId } });
      setName('');
      setEmail('');
      return `${profile.name} added: ${profile.hotDesk ? `hot desk ${profile.deskId || '(none free)'}` : `desk ${profile.deskId}`} on ${profile.floorName}.`;
    });
  }

  function addSamples() {
    act(async () => {
      const { added } = await api('/api/admin/employees/sample', { method: 'POST', body: { departmentId: sampleDepartmentId, count: SAMPLE_BATCH } });
      const hot = added.filter((p) => p.hotDesk).length;
      const department = departments.find((d) => d._id === sampleDepartmentId);
      return `${added.length} sample employees joined ${department?.name}: desks ${added.filter((p) => !p.hotDesk).map((p) => p.deskId).join(', ') || 'none'}${hot > 0 ? `; ${hot} got a hot desk` : ''}.`;
    });
  }

  const newestFirst = [...data.employees].reverse();
  return (
    <>
      <span className="label">Directory</span>
      <h1 className="admin-title">Employees</h1>
      <p className="muted">{data.employees.length} people in the Infotact directory.</p>
      <ProductionNote />

      <section className="card panel">
        <div className="panel-head">
          <h3>Grow the office</h3>
          <div className="form-row">
            <select className="select" value={sampleDepartmentId} onChange={(e) => setSampleDepartmentId(e.target.value)} aria-label="Department for sample employees">
              {departments.map((department) => (
                <option key={department._id} value={department._id}>
                  {department.name}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={addSamples}>
              Add {SAMPLE_BATCH} sample employees
            </button>
          </div>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Random demo names, seated one by one by the desk rule. Watch the wings open on the Overview mini-map.
        </p>
      </section>

      <form className="card panel" onSubmit={add}>
        <h3 style={{ marginBottom: 12 }}>Add employee</h3>
        <div className="form-row">
          <label className="field">
            Name
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            Email
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@infotact.demo" required />
          </label>
          <label className="field">
            Role
            <select className="select" value={role} onChange={(e) => setRole(e.target.value)}>
              {Object.values(ROLES).map((value) => (
                <option key={value} value={value}>
                  {roleLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Department
            <select className="select" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              {departments.map((department) => (
                <option key={department._id} value={department._id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-primary">Add employee</button>
        </div>
      </form>

      <section className="card panel">
        <div className="table-scroll" style={{ maxHeight: 520, overflowY: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Department</th>
                <th>Floor</th>
                <th>Desk</th>
                <th>Online</th>
              </tr>
            </thead>
            <tbody>
              {newestFirst.map((person) => (
                <tr key={person.employeeId}>
                  <td style={{ fontWeight: 600 }}>{person.name}</td>
                  <td className="muted">{person.email}</td>
                  <td>{roleLabel(person.role)}</td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span className="dept-swatch" style={{ background: person.department?.color }} /> {person.department?.name}
                    </span>
                  </td>
                  <td>{person.floorName}</td>
                  <td>{person.hotDesk ? <span className="pill" style={{ background: '#fdecec', color: 'var(--danger)' }}>hot desk {person.deskId || ''}</span> : person.deskId || '—'}</td>
                  <td>
                    <span className="status-dot" style={{ background: person.online ? 'var(--ok)' : '#cfd6de' }} title={person.online ? 'online' : 'offline'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------- Floors

function MoveDepartmentsDialog({ data, onApply, onClose }) {
  const [choices, setChoices] = useState(() => Object.fromEntries(data.departments.map((d) => [d._id, d.floorId])));
  const changes = data.departments.filter((d) => choices[d._id] !== d.floorId);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="card dialog" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Move departments">
        <span className="label">Rebalance</span>
        <h3 style={{ fontSize: 20, margin: '4px 0 6px' }}>Which floor is each department on?</h3>
        <p className="small muted" style={{ marginTop: 0 }}>
          Moved departments get a new desk block on their floor (by the desk rule); hot-deskers who stay get a real desk where one frees up. Online members are moved there straight away.
        </p>
        <table className="table">
          <tbody>
            {data.departments.map((department) => (
              <tr key={department._id}>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                    <span className="dept-swatch" style={{ background: department.color }} /> {department.name}
                  </span>
                  <div className="small muted">{department.people} people</div>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <select className="select" value={choices[department._id]} onChange={(e) => setChoices({ ...choices, [department._id]: e.target.value })} aria-label={`Floor for ${department.name}`}>
                    {data.floors.map((floor) => (
                      <option key={floor.floorId} value={floor.floorId}>
                        {floor.name}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={changes.length === 0} onClick={() => onApply(changes.map((d) => ({ departmentId: d._id, floorId: choices[d._id] })))}>
            Apply {changes.length > 0 ? `(${changes.length} move${changes.length === 1 ? '' : 's'})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FloorsSection({ data, layout, act }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const nextFloorNumber = data.floors.length + 1;

  async function addFloor() {
    const ok = await act(async () => {
      const floor = await api('/api/admin/floors', { method: 'POST' });
      return `${floor.name} added. Choose which departments move there.`;
    });
    if (ok) setDialogOpen(true);
  }

  async function apply(moves) {
    const ok = await act(async () => {
      const result = await api('/api/admin/floors/apply', { method: 'POST', body: { moves } });
      return `Done: ${result.moved} people moved floor, ${result.reseated} hot-desker(s) got a real desk.`;
    });
    if (ok) setDialogOpen(false);
  }

  return (
    <>
      <span className="label">Scaling</span>
      <h1 className="admin-title">Floors</h1>
      <p className="muted">
        A floor opens wing by wing: tier 1 = wing A (25 desks), tier 2 = A + B (50), tier 3 = A–C (75), tier 4 = all {WING_IDS.length} wings (100). Past 100, new hires get hot desks until you add a floor.
      </p>

      <div style={{ display: 'flex', gap: 10, margin: '16px 0' }}>
        <button className="btn btn-primary" onClick={addFloor}>
          <Icon.Building size={17} /> Add Floor {nextFloorNumber}
        </button>
        <button className="btn" onClick={() => setDialogOpen(true)} disabled={data.floors.length < 2}>
          Move departments…
        </button>
      </div>

      {data.floors.map((floor) => {
        const numbers = data.overview.floors.find((f) => f.id === floor.floorId);
        return (
          <section key={floor.floorId} className="card panel">
            <div className="panel-head">
              <div>
                <span className="label label-grey">{floor.floorId}</span>
                <h3>
                  {floor.name} · tier {floor.tier} · open wings {wingsText(floor.openWings)}
                </h3>
              </div>
              <div className="small muted">
                {numbers?.headcount ?? floor.headcount} people · {numbers?.desksUsed ?? 0} / {numbers?.capacity ?? 0} desks · {floor.hotDeskIds.length} hot desks · {numbers?.online ?? 0} online
              </div>
            </div>
            <MiniMap layout={layout} snapshot={floor} />
            <Legend snapshot={floor} />
          </section>
        );
      })}

      {dialogOpen && <MoveDepartmentsDialog data={data} onApply={apply} onClose={() => setDialogOpen(false)} />}
    </>
  );
}

// ---------------------------------------------------------------- Alerts

export function AlertsSection({ data, act }) {
  const open = data.alerts.filter((a) => !a.resolved);
  const done = data.alerts.filter((a) => a.resolved);
  const row = (alert) => (
    <div key={alert._id} className="alert-row">
      <span className="status-dot" style={{ background: alert.resolved ? '#cfd6de' : alert.type === ALERT_TYPES.FLOOR_FULL ? 'var(--danger)' : 'var(--accent)', marginTop: 6 }} />
      <div style={{ flex: 1 }}>
        <div>{alert.message}</div>
        <div className="small muted">
          {alert.type} · {new Date(alert.createdAt).toLocaleString()}
        </div>
      </div>
      {!alert.resolved && (
        <button className="btn btn-small" onClick={() => act(async () => { await api(`/api/admin/alerts/${alert._id}/resolve`, { method: 'POST' }); return 'Alert resolved.'; })}>
          Resolve
        </button>
      )}
    </div>
  );
  return (
    <>
      <span className="label">Scaling</span>
      <h1 className="admin-title">Alerts</h1>
      <p className="muted">Wings opening, full floors and new floors. A full floor's alerts resolve by themselves once its hot-deskers have desks again.</p>
      <section className="card panel">
        <h3 style={{ marginBottom: 6 }}>Open ({open.length})</h3>
        {open.length === 0 ? <p className="muted small">Nothing needs your attention.</p> : open.map(row)}
      </section>
      {done.length > 0 && (
        <section className="card panel">
          <h3 style={{ marginBottom: 6 }}>Resolved ({done.length})</h3>
          {done.map(row)}
        </section>
      )}
    </>
  );
}
