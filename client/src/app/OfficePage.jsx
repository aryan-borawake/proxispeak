// client/src/app/OfficePage.jsx — Person 1
// Screen 4 (#/office): the Infotact office, full screen, with a Gather-style layout and our own look.
//
//   top bar      Infotact HQ · Floor 1 · <the room or department I'm standing in>
//   map          WorldCanvas filling the screen, sky blue around the building; camera follows me;
//                zoom with + / − (bottom right) or the mouse wheel; "locate me" re-centres
//   right panel  People: who is nearby (and whether I can hear them), who is online on this floor
//   bottom bar   me + status menu, mute, My desk (Ctrl+D), Floors, people, Leave
//
// The wiring is the same as OfficeLab (CONTRACTS.md section 8), through useVoiceSession:
//   net.connect({ token }) → WORLD_INIT → WorldCanvas → onFrame → mixer.update
//   rtc manager (made right after joining) → mixer
// Things that change 60 times a second (positions) live in refs; the panels are refreshed twice a
// second (PANEL_REFRESH_MS), never every frame.

import { useEffect, useMemo, useRef, useState } from 'react';
import { AVATAR_COLORS, EARSHOT_PX, ERROR_CODES, STATUSES } from '@shared/constants.js';
import { net } from '../net/index.js';
import { WorldCanvas, areaAt, isClosedArea } from '../world/index.js';
import { AreaChatPanel } from './AreaChat.jsx';
import { useVoiceSession } from './useVoiceSession.js';
import { api, clearSession, getAvatarColor, getToken } from './session.js';
import { ROUTES, navigate } from './router.js';
import { statusColor } from './people.js';
import { BottomBar, FloorPicker, PeoplePanel, StatusMenu, TopBar, ZoomControls } from './OfficeParts.jsx';
import { Icon } from './icons.jsx';

// How often the people panel and the "where am I" label are refreshed.
const PANEL_REFRESH_MS = 500;

// How long a toast message stays on screen.
const TOAST_MS = 4500;

// A mixer volume above this counts as "I can hear them" (the speaker icon).
const HEARING_GAIN = 0.01;

// After a floor change, wait this long for the new world to be ready before jumping to my desk.
const DESK_AFTER_FLOOR_MS = 400;

// The world's starting zoom in the office (WorldCanvas starts there too).
const START_ZOOM = 1.5;

// The colour of other people when they did not choose one.
const DEFAULT_OTHER_COLOR = '#6366f1';

/** Is the middle of an avatar at (x, y) inside rect { x, y, w, h }? */
function standsIn(x, y, rect) {
  const middleX = x + 12;
  const middleY = y + 16;
  return middleX >= rect.x && middleX < rect.x + rect.w && middleY >= rect.y && middleY < rect.y + rect.h;
}

/**
 * The name for the top bar. v6: a room (meeting room, booth, focus room, stage hall) first; on a desk
 * pod, the department too; else the open area or room; else ''.
 * Example: in Meeting room 2 → 'Meeting room 2'; at desk A-03 → 'Engineering · Pod A1'; in the lounge → 'Lounge'.
 */
function areaNameAt(x, y, layout, office) {
  if (!layout) return '';
  const area = areaAt(layout.areas, x, y);
  const department = office ? departmentAt(x, y, layout, office) : '';
  if (area && department) return `${department} · ${area.name}`;
  if (area) return area.name;
  if (department) return department;
  const room = layout.rooms.find((r) => standsIn(x, y, r.rect));
  return room ? room.name : '';
}

/** The department whose desk block I'm standing on, or ''. */
function departmentAt(x, y, layout, office) {
  {
    const desksById = new Map(layout.desks.map((desk) => [desk.id, desk]));
    for (const department of office.departments) {
      if (department.deskIds.some((id) => desksById.get(id) && standsIn(x, y, desksById.get(id).area))) return department.name;
    }
  }
  return '';
}

export function OfficePage() {
  const voice = useVoiceSession();

  const [phase, setPhase] = useState('joining'); // 'joining' → 'joined', or 'error'
  const [errorText, setErrorText] = useState('');
  const [world, setWorld] = useState(null); // { selfId, roomId, spawn, players, version }
  const [profile, setProfile] = useState(null);
  const [office, setOffice] = useState(null); // the floor snapshot (EVENTS.OFFICE_UPDATE)
  const [layout, setLayout] = useState(null); // the floor plan (GET /api/office/layout)
  const [status, setStatus] = useState(STATUSES.AVAILABLE);
  const [muted, setMuted] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [menu, setMenu] = useState(null); // null, 'status' or 'floors'
  // v6: the right panel: 'people', 'chat' (only inside a room) or null (closed).
  const [sidePanel, setSidePanel] = useState('people');
  const [currentArea, setCurrentArea] = useState(null); // the area I stand in (from WorldCanvas)
  const [chatMessages, setChatMessages] = useState([]); // this area's chat, since I walked in
  const [zoom, setZoom] = useState(START_ZOOM);
  const [nearElevator, setNearElevator] = useState(false);
  const [panel, setPanel] = useState({ online: [], nearby: [], area: '' });
  const [toast, setToast] = useState('');
  const [showWelcome, setShowWelcome] = useState(true);
  const [avatarColor] = useState(() => getAvatarColor() || AVATAR_COLORS[0]);
  const [soundBlocked, setSoundBlocked] = useState(false); // the browser wants a click before sound
  const [showFps, setShowFps] = useState(false); // v6: the F key shows the frames-per-second counter

  // Refs: read by listeners and the world without redrawing the page.
  const peopleRef = useRef({}); // id → { name, color, dotColor, status, department }
  const selfDotColorRef = useRef(statusColor(STATUSES.AVAILABLE));
  const controllerRef = useRef(null); // filled by WorldCanvas: zoomIn, jumpTo, pulseAt, …
  const latest = useRef({}); // the latest world, profile, office, nearElevator for listeners
  latest.current = { world, profile, office, nearElevator, voiceReady, currentArea };
  const pendingDeskRef = useRef(false); // "go to my desk" waiting for a floor change
  const versionRef = useRef(0);

  // v6: this floor's stored layout (GET /api/rooms/:floorId): { map, areas, version }; undefined while
  // loading, null if it could not be loaded (then the world draws the static /maps/office.json).
  const [room, setRoom] = useState(undefined);
  const [roomReload, setRoomReload] = useState(0); // bumped by EVENTS.LAYOUT_UPDATE
  const loadedRoomIdRef = useRef(null);
  const floorLayout = useMemo(() => (layout && room?.areas ? { ...layout, areas: room.areas } : layout), [layout, room]);
  const overlayData = useMemo(() => ({ layout: floorLayout, office }), [floorLayout, office]);

  // Development only: let the headless screenshot scripts (server/scripts/screens-*.js) steer the world.
  // import.meta.env.DEV is false in the built app, so this never reaches production.
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    window.__officeController = () => controllerRef.current;
    return () => {
      delete window.__officeController;
    };
  }, []);

  /** Remember one person for the map labels and the panel. */
  function rememberPerson(player) {
    peopleRef.current[player.id] = {
      name: player.name,
      color: player.avatarColor || DEFAULT_OTHER_COLOR,
      status: player.status || STATUSES.AVAILABLE,
      dotColor: statusColor(player.status),
      department: player.department || null,
    };
  }

  /** A new world: the first join, a floor change, or a re-join after a reconnect. */
  function applyWorld(init, spawnOverride) {
    peopleRef.current = {};
    for (const player of init.players) rememberPerson(player);
    versionRef.current += 1;
    setWorld({ selfId: init.selfId, roomId: init.roomId, spawn: spawnOverride || init.spawn, players: init.players, version: versionRef.current });
    if (init.profile) setProfile(init.profile);
    if (init.office) setOffice(init.office);
  }

  function showToast(text) {
    setToast(text);
  }

  // Toasts disappear by themselves.
  useEffect(() => {
    if (toast === '') return undefined;
    const timer = setTimeout(() => setToast(''), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  // Join the office. setTimeout(0): React StrictMode mounts, unmounts and mounts again straight away
  // in development; the first mount's timer is cancelled by its cleanup before it runs, so we join
  // exactly once. Leaving the page (cleanup) leaves the office.
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      api('/api/office/layout')
        .then((floorPlan) => !cancelled && setLayout(floorPlan))
        .catch((error) => console.warn('[office] could not load the floor plan:', error.message));

      // 1. Sound and microphone. Without them you can still walk around; you just can't talk.
      let audioOk = true;
      try {
        await voice.startAudio();
      } catch (error) {
        audioOk = false;
        showToast(`${error.message} You can walk around, but voice is off.`);
      }
      if (cancelled) return;

      // 2. Join with my token: the server knows who I am and which floor I'm on.
      let result;
      try {
        result = await net.connect({ token: getToken(), avatarColor });
      } catch (error) {
        if (cancelled) return;
        if (error.message.includes('BAD_TOKEN')) {
          clearSession();
          navigate(ROUTES.SIGN_IN);
          return;
        }
        setErrorText(error.message);
        setPhase('error');
        return;
      }
      if (cancelled) return;

      // 3. The rtc manager straight away (the first peers:update may come any moment).
      if (audioOk) {
        voice.startRtc(result.selfId);
        setVoiceReady(true);
        if (!voice.isSoundOn()) setSoundBlocked(true);
      }
      applyWorld(result);
      setPhase('joined');
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      net.leave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // v6: load this floor's stored layout whenever I'm on a new floor (or the admin uploaded a new one).
  const roomId = world?.roomId;
  useEffect(() => {
    if (!roomId) return undefined;
    let cancelled = false;
    // A different floor: wait for its layout before drawing it (a reload keeps the old map until then).
    if (loadedRoomIdRef.current !== roomId) setRoom(undefined);
    loadedRoomIdRef.current = roomId;
    api(`/api/rooms/${roomId}`)
      .then((stored) => !cancelled && setRoom({ map: stored.map, areas: stored.areas, version: stored.version }))
      .catch((error) => {
        console.warn(`[office] could not load the stored layout of ${roomId}, using /maps/office.json:`, error.message);
        if (!cancelled) setRoom(null);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, roomReload]);

  // Listen to the server while on this page.
  useEffect(() => {
    const stops = [
      net.onPlayerJoined((player) => rememberPerson(player)),
      net.onPlayerLeft(({ id }) => {
        delete peopleRef.current[id];
      }),
      net.onPlayerStatus(({ id, status: nextStatus }) => {
        const person = peopleRef.current[id];
        if (person) {
          person.status = nextStatus;
          person.dotColor = statusColor(nextStatus);
        }
      }),
      net.onOfficeUpdate((snapshot) => {
        if (snapshot.floorId !== latest.current.world?.roomId) return;
        setOffice(snapshot);
        // My desk may have changed (resize, rebalance): ask who I am again.
        api('/api/me')
          .then((answer) => setProfile(answer.profile))
          .catch(() => {});
      }),
      net.onFloorChanged((init) => {
        if (latest.current.voiceReady) voice.startRtc(init.selfId); // new people: fresh connections
        applyWorld(init);
        setMenu(null);
        showToast(`You are now on ${init.office?.name || init.roomId}.`);
        if (pendingDeskRef.current) {
          pendingDeskRef.current = false;
          setTimeout(() => goToDesk(), DESK_AFTER_FLOOR_MS);
        }
      }),
      // v6: area chat. Only messages for the area I'm in right now (the server only sends those anyway).
      net.onChatMessage((message) => {
        if (message.areaId !== latest.current.currentArea?.id) return;
        setChatMessages((list) => [...list, message]);
      }),
      net.onLayoutUpdate(({ floorId, version }) => {
        if (floorId !== latest.current.world?.roomId) return;
        showToast(`This floor has a new layout (version ${version}). Loading it…`);
        setRoomReload((n) => n + 1);
      }),
      net.onServerError(({ code, message }) => {
        if (code === ERROR_CODES.BAD_CHAT) showToast(message);
      }),
      net.onRejoin((init) => {
        // A reconnect: NEW selfId. Rebuild the voice connections and the world at my last spot.
        if (latest.current.voiceReady) voice.startRtc(init.selfId);
        const lastSelf = voice.frameRef.current?.self;
        const position = lastSelf ? { x: lastSelf.x, y: lastSelf.y } : init.spawn;
        net.sendMove({ x: position.x, y: position.y, dir: 'down' });
        applyWorld(init, position);
      }),
    ];
    return () => stops.forEach((stop) => stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Ctrl+D / "My desk": jump to my desk (no path-finding) and pulse it. */
  function goToDesk() {
    const me = latest.current.profile;
    const here = latest.current.world;
    if (!me || !here) return;
    if (!me.desk) {
      showToast('You have no desk yet. Ask your admin to add a desk for your department.');
      return;
    }
    if (me.floorId !== here.roomId) {
      pendingDeskRef.current = true;
      showToast(`Your desk is on ${me.floorName}: taking the elevator.`);
      net.changeFloor(me.floorId);
      return;
    }
    controllerRef.current?.jumpTo(me.desk.x, me.desk.y, 'up');
    controllerRef.current?.pulseAt(me.desk.x, me.desk.y);
    setShowWelcome(false);
    setMenu(null);
    showToast(me.hotDesk ? `This is hot desk ${me.deskId}.` : `This is your desk, ${me.deskId}.`);
  }

  // Keyboard shortcuts: Ctrl+D (my desk), E (elevator, when standing at it), F (FPS counter), Escape (close menus).
  useEffect(() => {
    function handleKey(event) {
      const typing = event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault(); // otherwise the browser would bookmark the page
        goToDesk();
        return;
      }
      if (typing) return;
      if (event.key.toLowerCase() === 'e' && !event.ctrlKey && latest.current.nearElevator) {
        setMenu('floors');
      }
      if (event.key === 'Escape') setMenu(null);
      if (event.key.toLowerCase() === 'f' && !event.ctrlKey && !event.metaKey) setShowFps((on) => !on);
      // Arrow keys walk; stop them scrolling the page.
      if (event.key.startsWith('Arrow')) event.preventDefault();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Twice a second: who is online / nearby / audible, and where am I.
  useEffect(() => {
    if (phase !== 'joined') return undefined;
    const timer = setInterval(() => {
      const frame = voice.frameRef.current;
      const gains = {};
      const muffled = {};
      for (const diagnostic of voice.mixerRef.current?.getPeerDiagnostics() || []) {
        gains[diagnostic.id] = diagnostic.gain;
        muffled[diagnostic.id] = diagnostic.blocked === true;
      }
      const departmentsById = {};
      for (const department of latest.current.office?.departments || []) departmentsById[department.id] = department;

      const describe = (id, person, extra) => {
        const department = person.department ? departmentsById[person.department.id] || person.department : null;
        return {
          id,
          name: person.name,
          color: person.color,
          status: person.status,
          departmentName: department?.name,
          departmentColor: department?.color,
          hearing: (gains[id] || 0) > HEARING_GAIN,
          muffled: muffled[id] === true, // v6: behind a wall (open floor)
          ...extra,
        };
      };

      const me = latest.current.profile;
      const self = {
        id: 'self',
        name: me?.name || 'You',
        color: avatarColor,
        status: selfStatusRef.current,
        departmentName: me?.department?.name,
        departmentColor: me?.department?.color,
        hearing: false,
        isSelf: true,
      };
      const others = Object.entries(peopleRef.current).map(([id, person]) => describe(id, person));
      others.sort((a, b) => a.name.localeCompare(b.name));

      let nearby = [];
      let area = '';
      if (frame) {
        const positions = {};
        for (const other of frame.others) positions[other.id] = other;
        // v6: nearby = within earshot, or someone I can hear, or in the same room as me (any distance).
        const myArea = areaAt(floorLayout?.areas, frame.self.x, frame.self.y);
        nearby = others.filter((person) => {
          const position = positions[person.id];
          if (!position) return false;
          if (person.hearing) return true;
          if (isClosedArea(myArea) && areaAt(floorLayout?.areas, position.x, position.y)?.id === myArea.id) return true;
          return !isClosedArea(myArea) && Math.hypot(position.x - frame.self.x, position.y - frame.self.y) <= EARSHOT_PX;
        });
        area = areaNameAt(frame.self.x, frame.self.y, floorLayout, latest.current.office);
      }
      setPanel({ online: [self, ...others], nearby, area });
    }, PANEL_REFRESH_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, floorLayout]);

  // My status, also in a ref for the panel timer.
  const selfStatusRef = useRef(status);
  function chooseStatus(nextStatus) {
    setStatus(nextStatus);
    selfStatusRef.current = nextStatus;
    selfDotColorRef.current = statusColor(nextStatus);
    net.sendStatus(nextStatus);
    setMenu(null);
    if (nextStatus === STATUSES.DND) showToast('Do Not Disturb: nobody hears you, and you hear nobody.');
  }

  function toggleMute() {
    const nextMuted = !muted;
    voice.setMuted(nextMuted);
    setMuted(nextMuted);
  }

  /**
   * v6: WorldCanvas says I stepped into or out of an area. A new room means a fresh, empty chat
   * (nothing is stored, like Gather); stepping into a room opens the chat, leaving it shows People.
   */
  function handleAreaChange(area) {
    setCurrentArea(area);
    setChatMessages([]);
    if (isClosedArea(area)) setSidePanel((panel) => (panel === null ? null : 'chat'));
    else setSidePanel((panel) => (panel === 'chat' ? 'people' : panel));
  }

  function pickFloor(floorId) {
    setMenu(null);
    if (floorId !== world?.roomId) net.changeFloor(floorId);
  }

  function leave(route) {
    net.leave();
    voice.stopAll();
    navigate(route);
  }

  const floorName = office?.name || profile?.floorName || 'Floor';
  const floors = office?.floors || [];

  return (
    <div className="office-root">
      <TopBar floorName={floorName} areaName={panel.area} areaType={isClosedArea(currentArea) ? currentArea.type : null} />

      <div className={`office-stage ${sidePanel ? 'office-stage-with-panel' : ''}`}>
        {world && room !== undefined && (
          // key: a new selfId (reconnect) or a new floor builds a fresh world.
          <WorldCanvas
            key={`${world.selfId}:${world.roomId}:${world.version}:${room?.version || 0}`}
            mapData={room?.map}
            fill
            zoomable
            net={net}
            selfId={world.selfId}
            spawn={world.spawn}
            initialPlayers={world.players}
            onFrame={voice.onFrame}
            controllerRef={controllerRef}
            avatarColor={avatarColor}
            selfName={profile?.name || 'You'}
            selfDotColorRef={selfDotColorRef}
            peopleRef={peopleRef}
            overlayData={overlayData}
            onZoomChange={setZoom}
            onNearElevator={setNearElevator}
            onAreaChange={handleAreaChange}
            showFps={showFps}
            background="#1b2030"
          />
        )}

        <ZoomControls
          zoom={zoom}
          onZoomIn={() => controllerRef.current?.zoomIn()}
          onZoomOut={() => controllerRef.current?.zoomOut()}
          onLocate={() => controllerRef.current?.locate()}
        />

        {phase === 'joining' && <div className="card office-toast">Joining the Infotact office…</div>}

        {phase === 'error' && (
          <div className="card welcome-card" style={{ left: '50%', transform: 'translateX(-50%)', bottom: '40%' }}>
            <h3>Could not join the office</h3>
            <p>{errorText}</p>
            <button className="btn btn-primary" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        )}

        {phase === 'joined' && showWelcome && profile && (
          <div className="card welcome-card">
            <span className="label">Welcome</span>
            <h3>Welcome to the Infotact office!</h3>
            <p>
              {profile.desk
                ? `You have ${profile.hotDesk ? 'hot desk' : 'desk'} ${profile.deskId}${profile.department ? ` with ${profile.department.name}` : ''} on ${profile.floorName}. Walk there with the arrow keys, or jump straight to it.`
                : 'You have no desk yet. Explore the office with the arrow keys.'}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              {profile.desk && (
                <button className="btn btn-primary" onClick={goToDesk}>
                  Walk to my desk <span className="kbd" style={{ color: '#d7eef6', borderColor: '#4fa9c7' }}>Ctrl+D</span>
                </button>
              )}
              <button className="btn" onClick={() => setShowWelcome(false)}>
                Later
              </button>
            </div>
          </div>
        )}

        {nearElevator && (
          <div className="card elevator-hint">
            <Icon.Floors size={15} /> Press <span className="kbd">E</span> to take the elevator
          </div>
        )}
      </div>

      {sidePanel === 'chat' && isClosedArea(currentArea) && (
        <AreaChatPanel area={currentArea} messages={chatMessages} selfId={world?.selfId} onSend={(text) => net.sendChat(text)} onClose={() => setSidePanel(null)} />
      )}
      {sidePanel === 'people' && <PeoplePanel floorName={floorName} online={panel.online} nearby={panel.nearby} onClose={() => setSidePanel(null)} />}

      <BottomBar
        profile={profile}
        avatarColor={avatarColor}
        status={status}
        muted={muted}
        voiceReady={voiceReady}
        onOpenStatus={() => setMenu(menu === 'status' ? null : 'status')}
        onToggleMute={toggleMute}
        onMyDesk={goToDesk}
        onFloors={() => setMenu('floors')}
        onLeave={() => leave(ROUTES.LOBBY)}
        onTogglePeople={() => setSidePanel(sidePanel === 'people' ? null : 'people')}
        peopleOpen={sidePanel === 'people'}
        chatOpen={sidePanel === 'chat'}
        canChat={isClosedArea(currentArea)}
        onToggleChat={() => setSidePanel(sidePanel === 'chat' ? null : 'chat')}
        onlineCount={panel.online.length}
      />

      {menu === 'status' && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 19 }} onClick={() => setMenu(null)} />
          <StatusMenu
            profile={profile}
            avatarColor={avatarColor}
            status={status}
            onChoose={chooseStatus}
            onMyDesk={goToDesk}
            onLobby={() => leave(ROUTES.LOBBY)}
            onSignOut={() => {
              clearSession();
              leave(ROUTES.SIGN_IN);
            }}
          />
        </>
      )}

      {menu === 'floors' && <FloorPicker floors={floors} currentFloorId={world?.roomId} onPick={pickFloor} onClose={() => setMenu(null)} />}

      {toast !== '' && <div className="card office-toast">{toast}</div>}

      {soundBlocked && (
        // After a page reload the browser keeps sound off until a click: one click anywhere fixes it.
        <div
          className="dialog-backdrop"
          onClick={() => {
            voice.resumeSound();
            setSoundBlocked(false);
          }}
        >
          <div className="card dialog" style={{ textAlign: 'center' }}>
            <Icon.Speaker size={28} />
            <h3 style={{ margin: '8px 0 4px' }}>Click anywhere to turn on sound</h3>
            <p className="muted small" style={{ margin: 0 }}>Your browser keeps sound off until you click on the page.</p>
          </div>
        </div>
      )}
    </div>
  );
}
