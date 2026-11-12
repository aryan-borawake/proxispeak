// client/src/app/LobbyPage.jsx — Person 1
// Screen 3 (#/lobby): "this is you" before entering the office.
//   - who I am, from the directory (GET /api/me): name, role, department, floor, desk;
//   - pick one of 6 avatar colours (AVATAR_COLORS), remembered for this tab;
//   - test the microphone with Person 4's mic meter (createMicMeter);
//   - "Join office" → #/office.
// The test microphone is switched off when leaving this page; the office asks for its own.

import { useEffect, useRef, useState } from 'react';
import { AVATAR_COLORS } from '@shared/constants.js';
import { getMicStream } from '../rtc/index.js';
import { createMicMeter } from '../audio/index.js';
import { Logo } from './Logo.jsx';
import { Icon } from './icons.jsx';
import { ROUTES, navigate } from './router.js';
import { api, clearSession, getAvatarColor, saveAvatarColor } from './session.js';
import { initialsOf, roleLabel } from './people.js';

export function LobbyPage() {
  const [profile, setProfile] = useState(null);
  const [errorText, setErrorText] = useState('');
  const [color, setColor] = useState(() => getAvatarColor() || AVATAR_COLORS[0]);
  const [micState, setMicState] = useState('off'); // 'off' → 'starting' → 'on', or 'error'
  const [micError, setMicError] = useState('');

  // The mic test lives in refs: the level changes 60 times a second, so we move the bar directly
  // (style.width) instead of React state, which would redraw the whole page every frame.
  const micRef = useRef(null);
  const meterRef = useRef(null);
  const barRef = useRef(null);
  const frameRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    api('/api/me')
      .then((answer) => {
        if (!cancelled) setProfile(answer.profile);
      })
      .catch((error) => {
        if (cancelled) return;
        if (error.status === 401) {
          clearSession();
          navigate(ROUTES.SIGN_IN);
          return;
        }
        setErrorText(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Leaving the lobby: stop the meter and switch the test microphone off.
  useEffect(() => stopMicTest, []);

  function stopMicTest() {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    meterRef.current?.stop();
    meterRef.current = null;
    if (micRef.current) {
      for (const track of micRef.current.getTracks()) track.stop();
      micRef.current = null;
    }
  }

  async function startMicTest() {
    setMicState('starting');
    setMicError('');
    try {
      micRef.current = await getMicStream();
      meterRef.current = createMicMeter(micRef.current);
      const draw = () => {
        if (barRef.current && meterRef.current) {
          barRef.current.style.width = `${Math.round(meterRef.current.getLevel() * 100)}%`;
        }
        frameRef.current = requestAnimationFrame(draw);
      };
      frameRef.current = requestAnimationFrame(draw);
      setMicState('on');
    } catch (error) {
      setMicState('error');
      setMicError(error.message);
    }
  }

  function chooseColor(nextColor) {
    setColor(nextColor);
    saveAvatarColor(nextColor);
  }

  function joinOffice() {
    saveAvatarColor(color);
    stopMicTest();
    navigate(ROUTES.OFFICE);
  }

  function signOut() {
    stopMicTest();
    clearSession();
    navigate(ROUTES.SIGN_IN);
  }

  return (
    <div>
      <header className="topbar">
        <a href="#/">
          <Logo />
        </a>
        <button className="btn btn-small" onClick={signOut}>
          Sign out
        </button>
      </header>

      <main className="center-page">
        <section className="card center-card lobby-card">
          <span className="label">Lobby</span>
          <h2 style={{ textAlign: 'left', marginTop: 6 }}>Ready to go in?</h2>
          <p className="muted" style={{ margin: '4px 0 18px' }}>
            Pick your colour and check your microphone. People near you will hear you.
          </p>

          {errorText !== '' && <div className="error-box">{errorText}</div>}

          {profile && (
            <div className="lobby-profile">
              <div className="lobby-avatar" style={{ background: color }}>
                {initialsOf(profile.name)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 17 }}>{profile.name}</div>
                <div className="muted small">
                  {roleLabel(profile.role)} ·{' '}
                  {profile.department && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span className="dept-swatch" style={{ background: profile.department.color }} />
                      {profile.department.name}
                    </span>
                  )}
                </div>
                <div className="small" style={{ color: 'var(--ink-faint)' }}>
                  Infotact HQ · {profile.floorName} · {profile.hotDesk ? `hot desk ${profile.deskId || ''}` : profile.deskId ? `desk ${profile.deskId}` : 'no desk yet'}
                </div>
              </div>
            </div>
          )}

          <div className="label label-grey">Avatar colour</div>
          <div className="color-row" role="radiogroup" aria-label="Avatar colour">
            {AVATAR_COLORS.map((choice) => (
              <button
                key={choice}
                type="button"
                role="radio"
                aria-checked={choice === color}
                aria-label={`Colour ${choice}`}
                className={`color-choice ${choice === color ? 'color-choice-active' : ''}`}
                style={{ background: choice }}
                onClick={() => chooseColor(choice)}
              />
            ))}
          </div>

          <div className="label label-grey">Microphone</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0 6px' }}>
            {micState === 'on' ? (
              <button className="btn btn-small" onClick={() => { stopMicTest(); setMicState('off'); }}>
                <Icon.MicOff size={16} /> Stop test
              </button>
            ) : (
              <button className="btn btn-small" onClick={startMicTest} disabled={micState === 'starting'}>
                <Icon.Mic size={16} /> {micState === 'starting' ? 'Starting…' : 'Test microphone'}
              </button>
            )}
            <div className="meter" style={{ flex: 1 }}>
              <div ref={barRef} style={{ width: '0%' }} />
            </div>
          </div>
          <p className="small muted" style={{ margin: '0 0 22px' }}>
            {micState === 'on' ? 'Say something: the bar should move.' : micError || 'Optional. The office asks for the microphone when you join.'}
          </p>

          <button className="btn btn-primary btn-big" style={{ width: '100%' }} onClick={joinOffice} disabled={!profile}>
            Join office <Icon.Chevron />
          </button>
        </section>
      </main>
    </div>
  );
}
