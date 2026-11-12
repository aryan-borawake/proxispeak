// client/src/app/OfficeParts.jsx — Person 1
// The pieces drawn around the map in the office (#/office). They only SHOW things and call back
// when clicked; OfficePage.jsx holds the state and does the work.
//   TopBar        "Infotact HQ · Floor 1 · Engineering"
//   BottomBar     me + status, mic, My desk (Ctrl+D), Floors, Leave, People
//   StatusMenu    Available / Busy / Do Not Disturb, and a few shortcuts
//   ZoomControls  +, −, locate me (bottom right of the map)
//   PeoplePanel   the right panel: who is online on this floor, and who is nearby
//   FloorPicker   the elevator / Floors dialog

import { STATUSES } from '@shared/constants.js';
import { Icon } from './icons.jsx';
import { initialsOf, roleLabel, STATUS_INFO, statusColor } from './people.js';

/** v6: the small badge next to a room's name in the top bar. */
const AREA_BADGES = {
  private: { text: 'Private', className: 'area-badge' },
  silent: { text: 'Silent', className: 'area-badge area-badge-silent' },
  stage: { text: 'Stage', className: 'area-badge area-badge-stage' },
};

export function TopBar({ floorName, areaName, areaType, onToggleView }) {
  const badge = areaType ? AREA_BADGES[areaType] : null;
  return (
    <header className="office-topbar">
      <div className="office-topbar-left">
        <span className="pill">Infotact</span>
      </div>
      <div className="office-where">
        <Icon.Pin size={16} />
        <span>Infotact HQ</span>
        <span className="sep">·</span>
        <span>{floorName}</span>
        {areaName && (
          <>
            <span className="sep">·</span>
            <span style={{ color: 'var(--accent)' }}>{areaName}</span>
          </>
        )}
        {badge && <span className={badge.className}>{badge.text}</span>}
      </div>
      <div className="office-topbar-right">{onToggleView}</div>
    </header>
  );
}

export function BottomBar({ profile, avatarColor, status, muted, voiceReady, onOpenStatus, onToggleMute, onMyDesk, onFloors, onLeave, onTogglePeople, peopleOpen, onlineCount, chatOpen, canChat, onToggleChat }) {
  const info = STATUS_INFO[status] || STATUS_INFO[STATUSES.AVAILABLE];
  return (
    <footer className="office-bottombar">
      <button className="bar-me" onClick={onOpenStatus} aria-label="Your status">
        <span className="bar-avatar" style={{ background: avatarColor }}>
          {initialsOf(profile?.name)}
          <span className="status-dot" style={{ background: info.color }} />
        </span>
        <span>
          <span className="bar-name">{profile?.name || '…'}</span>
          <br />
          <span className="bar-status">{info.label}</span>
        </span>
      </button>

      <button className={`bar-btn ${muted || !voiceReady ? 'bar-btn-off' : ''}`} onClick={onToggleMute} disabled={!voiceReady} title={voiceReady ? 'Mute or unmute your microphone' : 'No microphone'}>
        {muted || !voiceReady ? <Icon.MicOff /> : <Icon.Mic />}
        {voiceReady ? (muted ? 'Unmute' : 'Mute') : 'No mic'}
      </button>

      <button className="bar-btn" onClick={onMyDesk}>
        <Icon.Desk /> My desk <span className="kbd">Ctrl+D</span>
      </button>

      <button className="bar-btn" onClick={onFloors}>
        <Icon.Floors /> Floors
      </button>

      <div className="bar-spacer" />

      {canChat && (
        <button className={`bar-btn ${chatOpen ? 'bar-btn-active' : ''}`} onClick={onToggleChat} title="Chat with the people in this room">
          <Icon.Chat /> Chat
        </button>
      )}
      <button className={`bar-btn ${peopleOpen ? 'bar-btn-active' : ''}`} onClick={onTogglePeople}>
        <Icon.People /> {onlineCount}
      </button>
      <button className="bar-btn bar-btn-off" onClick={onLeave} title="Leave the office">
        <Icon.Leave /> Leave
      </button>
    </footer>
  );
}

export function StatusMenu({ profile, avatarColor, status, onChoose, onMyDesk, onLobby, onSignOut }) {
  return (
    <div className="card status-menu" role="menu">
      <div className="status-menu-head">
        <span className="bar-avatar" style={{ background: avatarColor }}>
          {initialsOf(profile?.name)}
        </span>
        <div>
          <div style={{ fontWeight: 700 }}>{profile?.name}</div>
          <div className="small muted">
            {roleLabel(profile?.role)} · {profile?.department?.name}
          </div>
        </div>
      </div>
      {Object.values(STATUSES).map((value) => (
        <button key={value} className={`menu-item ${value === status ? 'menu-item-active' : ''}`} onClick={() => onChoose(value)} role="menuitemradio" aria-checked={value === status}>
          <span className="status-dot" style={{ background: statusColor(value) }} />
          <span>
            {STATUS_INFO[value].label}
            <small>{STATUS_INFO[value].hint}</small>
          </span>
        </button>
      ))}
      <div style={{ borderTop: '1px solid var(--line)', margin: '6px 0' }} />
      <button className="menu-item" onClick={onMyDesk}>
        <Icon.Desk size={16} /> <span style={{ flex: 1 }}>Walk to my desk</span> <span className="kbd">Ctrl+D</span>
      </button>
      <button className="menu-item" onClick={onLobby}>
        <Icon.Door size={16} /> Back to the lobby
      </button>
      <button className="menu-item" onClick={onSignOut}>
        <Icon.Leave size={16} /> Sign out
      </button>
      <div className="small" style={{ color: 'var(--ink-faint)', padding: '6px 10px 2px' }}>
        {profile?.email}
      </div>
    </div>
  );
}

export function ZoomControls({ zoom, onZoomIn, onZoomOut, onLocate }) {
  return (
    <div className="zoom-controls">
      <button className="zoom-btn" onClick={onLocate} title="Locate me" aria-label="Locate me">
        <Icon.Locate />
      </button>
      <button className="zoom-btn" onClick={onZoomIn} title="Zoom in" aria-label="Zoom in">
        +
      </button>
      <button className="zoom-btn" onClick={onZoomOut} title="Zoom out" aria-label="Zoom out">
        −
      </button>
      <div className="zoom-level">{Math.round(zoom * 100)}%</div>
    </div>
  );
}

/** One person in the right panel. */
function PersonRow({ person }) {
  return (
    <div className="person-row">
      <span className="person-avatar" style={{ background: person.color }}>
        {initialsOf(person.name)}
        <span className="status-dot" style={{ background: statusColor(person.status) }} />
      </span>
      <span className="person-text">
        <span className="person-name" style={{ display: 'block' }}>
          {person.name}
          {person.isSelf ? ' (you)' : ''}
        </span>
        <span className="person-sub">
          {person.departmentColor && <span className="dept-swatch" style={{ background: person.departmentColor }} />}
          {person.departmentName || 'Guest'} · {(STATUS_INFO[person.status] || STATUS_INFO[STATUSES.AVAILABLE]).label}
        </span>
      </span>
      {person.hearing && !person.muffled && (
        <span className="hear-icon" title="You can hear them">
          <Icon.Speaker size={17} />
        </span>
      )}
      {person.muffled && (
        <span className="muffled-icon" title="Behind a wall: their voice is muffled" aria-label="Muffled by a wall">
          <Icon.Muffled size={17} />
        </span>
      )}
    </div>
  );
}

export function PeoplePanel({ floorName, online, nearby, onClose }) {
  return (
    <aside className="people-panel">
      <div className="people-panel-head">
        <h3>People</h3>
        <button className="btn btn-small" onClick={onClose} aria-label="Close the people panel">
          <Icon.Close size={15} />
        </button>
      </div>
      <div className="people-scroll">
        <div className="label label-grey people-section-title">Nearby · {nearby.length}</div>
        {nearby.length === 0 && <p className="small muted" style={{ padding: '0 8px', margin: 0 }}>Nobody in earshot. Walk up to someone to talk.</p>}
        {nearby.map((person) => (
          <PersonRow key={person.id} person={person} />
        ))}
        <div className="label label-grey people-section-title">
          Online on {floorName} · {online.length}
        </div>
        {online.map((person) => (
          <PersonRow key={person.id} person={person} />
        ))}
      </div>
    </aside>
  );
}

export function FloorPicker({ floors, currentFloorId, onPick, onClose }) {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="card dialog" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Choose a floor">
        <span className="label">Elevator</span>
        <h3 style={{ fontSize: 20, margin: '4px 0 14px' }}>Which floor?</h3>
        {floors.map((floor) => (
          <button key={floor.id} className={`menu-item ${floor.id === currentFloorId ? 'menu-item-active' : ''}`} onClick={() => onPick(floor.id)} disabled={floor.id === currentFloorId}>
            <Icon.Floors size={16} />
            <span style={{ flex: 1 }}>{floor.name}</span>
            {floor.id === currentFloorId && <span className="pill">You are here</span>}
          </button>
        ))}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
