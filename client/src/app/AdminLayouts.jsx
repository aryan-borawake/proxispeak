// client/src/app/AdminLayouts.jsx — Person 1, v6 ("Room Persistence", spec Week 4)
// Admin → Layouts: every floor's stored office layout (version, generated or uploaded, when), a
// "Download" button (the stored Tiled JSON, to edit in Tiled) and "Upload layout (Tiled JSON)".
// The SERVER validates an upload (required layers, size, embedded tilesets, zones) and saves it as the
// next version; everyone on that floor then gets the new map straight away (EVENTS.LAYOUT_UPDATE).

import { useCallback, useEffect, useState } from 'react';
import { api } from './session.js';
import { Icon } from './icons.jsx';

/** Save a JSON value as a file in the browser's downloads. */
function downloadJson(value, fileName) {
  const blob = new Blob([JSON.stringify(value)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function LayoutsSection({ data, act }) {
  const [rooms, setRooms] = useState(null);
  const [floorId, setFloorId] = useState(data.floors[0]?.floorId || 'floor-1');
  const [problem, setProblem] = useState('');

  const load = useCallback(() => {
    api('/api/rooms')
      .then(setRooms)
      .catch((error) => setProblem(error.message));
  }, []);
  useEffect(load, [load]);

  /** The admin picked a file: read it, check it is JSON, send it. The server does the real checks. */
  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = ''; // so the same file can be picked again
    if (!file) return;
    setProblem('');
    let map;
    try {
      map = JSON.parse(await file.text());
    } catch {
      setProblem(`"${file.name}" is not JSON. In Tiled: File → Export As… → JSON map files (*.json).`);
      return;
    }
    const ok = await act(async () => {
      const saved = await api(`/api/rooms/${floorId}/layout`, { method: 'POST', body: map });
      return `${floorId}: layout version ${saved.version} saved (${saved.areas} areas). Everyone on the floor now has the new map.`;
    });
    if (ok !== false) load();
  }

  async function restore(roomId) {
    const ok = await act(async () => {
      const saved = await api(`/api/rooms/${roomId}/generated`, { method: 'POST' });
      return `${roomId}: back to the generated layout (version ${saved.version}).`;
    });
    if (ok !== false) load();
  }

  async function download(roomId) {
    try {
      const room = await api(`/api/rooms/${roomId}`);
      downloadJson(room.map, `${roomId}-layout-v${room.version}.json`);
    } catch (error) {
      setProblem(error.message);
    }
  }

  const floorName = (id) => data.floors.find((floor) => floor.floorId === id)?.name || id;

  return (
    <>
      <span className="label">Room persistence</span>
      <h1 className="admin-title">Layouts</h1>
      <p className="muted">
        Every floor's office map is stored with a version number. The server stores the generated layout when it starts; an uploaded layout replaces it for
        that floor (desks stay the same, the rooms come from the map's <code>zones</code> layer).
      </p>
      {problem !== '' && (
        <div className="error-box" role="alert">
          {problem}
        </div>
      )}

      <section className="card panel">
        <h3 style={{ marginBottom: 10 }}>Stored layouts</h3>
        {!rooms && <p className="muted small">Loading…</p>}
        {rooms && (
          <table className="table">
            <thead>
              <tr>
                <th>Floor</th>
                <th>Version</th>
                <th>Source</th>
                <th>Areas</th>
                <th>Desks</th>
                <th>Saved</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room._id}>
                  <td>{floorName(room.floorId)}</td>
                  <td>
                    <span className="pill">v{room.version}</span>
                  </td>
                  <td>{room.source === 'uploaded' ? 'Uploaded' : 'Generated'}</td>
                  <td>{room.areas}</td>
                  <td>{room.desks}</td>
                  <td className="small">{new Date(room.updatedAt).toLocaleString()}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-small" onClick={() => download(room._id)}>
                      Download
                    </button>{' '}
                    {room.source === 'uploaded' && (
                      <button className="btn btn-small" onClick={() => restore(room._id)}>
                        Use generated
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card panel">
        <h3 style={{ marginBottom: 6 }}>Upload layout (Tiled JSON)</h3>
        <p className="muted small" style={{ marginTop: 0 }}>
          Needs: orthogonal map, 32 px tiles, at most 128 × 128 tiles, embedded tilesets, tile layers <code>floor</code>, <code>walls</code>, <code>furniture</code>,{' '}
          <code>collision</code>, object layers <code>zones</code> (rectangles with <code>zoneType</code> and <code>name</code>) and <code>spawn</code>. Tip: download a
          layout, edit it in Tiled, upload it again.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="input" style={{ width: 'auto' }} value={floorId} onChange={(event) => setFloorId(event.target.value)} aria-label="Floor to upload to">
            {data.floors.map((floor) => (
              <option key={floor.floorId} value={floor.floorId}>
                {floor.name}
              </option>
            ))}
          </select>
          <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
            <Icon.Map size={16} /> Upload layout (Tiled JSON)
            <input type="file" accept=".json,application/json" onChange={upload} style={{ display: 'none' }} data-testid="layout-file" />
          </label>
        </div>
      </section>
    </>
  );
}
