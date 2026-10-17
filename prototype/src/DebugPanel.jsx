import { EARSHOT_RADIUS } from './proximity.js'
import { SENDS_PER_SECOND } from './network.js'

// The right-hand sidebar. It only DISPLAYS numbers that the game loop in
// Game.jsx hands to it a few times per second; it never changes the game
// except through the two toggle switches.
export default function DebugPanel({
  stats,
  throttling,
  onToggleThrottling,
  interpolation,
  onToggleInterpolation,
  playerName,
  playerColor,
}) {
  const audio = stats?.audio ?? []
  const inEarshot = audio.filter((a) => a.inEarshot)

  return (
    <aside className="sidebar">
      <section>
        <h3>Participants · {audio.length + 1}</h3>
        <ul className="people">
          <li>
            <span className="person-avatar" style={{ background: playerColor }} />
            <span className="person-name">{playerName} (you)</span>
            <span className="status-dot" />
          </li>
          {audio.map((a) => (
            <li key={a.name} className={a.inEarshot ? '' : 'dim'}>
              <span className="person-avatar" style={{ background: a.color }} />
              <span className="person-name">{a.name}</span>
              <span className="person-meta">{a.inEarshot ? '🔊 can hear' : 'too far'}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Performance</h3>
        <Stat
          label="FPS"
          value={stats?.fps ?? '–'}
          hint="Frames per second: how many times per second the whole map is redrawn."
        />
        <Stat
          label="Position sends / sec"
          value={stats?.sendsPerSecond ?? '–'}
          highlight={!throttling}
          hint={
            throttling
              ? `Throttled: at most ${SENDS_PER_SECOND} fake sendPosition() calls per second.`
              : 'Not throttled: one sendPosition() call EVERY frame — compare with FPS!'
          }
        />
        <Toggle label="Throttling" on={throttling} onClick={onToggleThrottling} />
        <div className="tiny muted">
          Total sends: {stats?.totalSent ?? 0} · last payload:{' '}
          <code>{stats?.lastPayload ? JSON.stringify(stats.lastPayload) : '–'}</code>
        </div>
      </section>

      <section>
        <h3>Earshot · {EARSHOT_RADIUS}px</h3>
        {inEarshot.length === 0 && (
          <p className="tiny muted">
            Nobody is inside your dashed circle. Walk towards a bot to hear them.
          </p>
        )}
        {inEarshot.map((a) => (
          <div className="audio-card" key={a.name}>
            <div className="audio-head">
              <span className="person-avatar small" style={{ background: a.color }} />
              <strong>{a.name}</strong>
              <span className="muted tiny">{Math.round(a.distance)}px away</span>
            </div>
            <div className="meter-row">
              <span className="meter-label">Volume</span>
              <div className="meter">
                <div className="meter-fill" style={{ width: `${a.volume * 100}%` }} />
              </div>
              <span className="meter-value">{Math.round(a.volume * 100)}%</span>
            </div>
            <div className="meter-row">
              <span className="meter-label">Pan</span>
              <div className="pan">
                <span className="pan-l">L</span>
                <div className="pan-track">
                  <div className="pan-center" />
                  <div className="pan-knob" style={{ left: `${((a.pan + 1) / 2) * 100}%` }} />
                </div>
                <span className="pan-r">R</span>
              </div>
              <span className="meter-value">{a.pan >= 0 ? '+' : ''}{a.pan.toFixed(2)}</span>
            </div>
          </div>
        ))}
      </section>

      <section>
        <h3>Bot movement</h3>
        <Toggle label="Interpolation" on={interpolation} onClick={onToggleInterpolation} />
        <p className="tiny muted">
          Bot positions only update 10×/sec. {interpolation
            ? 'Interpolation ON: we slide them between updates, so they glide.'
            : 'Interpolation OFF: drawn only where the last update said — watch them hop.'}
        </p>
      </section>

      <section className="glossary">
        <h3>What do these words mean?</h3>
        <dl>
          <dt>Frame</dt>
          <dd>One still picture of the map. Many per second = animation.</dd>
          <dt>FPS</dt>
          <dd>Frames per second. ~60 on most screens.</dd>
          <dt>Throttling</dt>
          <dd>Limiting how often something may happen — here, network sends.</dd>
          <dt>Interpolation</dt>
          <dd>Guessing the in-between positions so movement looks smooth.</dd>
          <dt>Earshot</dt>
          <dd>The distance within which you can hear someone.</dd>
          <dt>Volume / Pan</dt>
          <dd>How loud someone is (closer = louder) and which ear they come from.</dd>
        </dl>
      </section>
    </aside>
  )
}

function Stat({ label, value, hint, highlight }) {
  return (
    <div className={`stat ${highlight ? 'stat-warn' : ''}`}>
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-value">{value}</span>
      </div>
      <div className="tiny muted">{hint}</div>
    </div>
  )
}

function Toggle({ label, on, onClick }) {
  return (
    <button className={`toggle ${on ? 'on' : ''}`} onClick={onClick} type="button">
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      {label}: <strong>{on ? 'ON' : 'OFF'}</strong>
    </button>
  )
}
