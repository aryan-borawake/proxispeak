import { useState } from 'react'

const AVATAR_COLORS = ['#6c72ff', '#ff7b9c', '#ffb547', '#4ecdc4', '#a66cff', '#5ac85a']

// Step 1: pick a name (and a colour), then click Join.
export default function NameScreen({ onJoin }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(AVATAR_COLORS[0])
  const trimmed = name.trim()

  function handleSubmit(e) {
    e.preventDefault() // stop the browser from reloading the page
    if (trimmed) onJoin({ name: trimmed.slice(0, 16), color })
  }

  return (
    <div className="join-screen">
      <form className="join-card" onSubmit={handleSubmit}>
        <div className="join-brand">◆ Proximity Office</div>
        <h1>Welcome to the office!</h1>
        <p className="muted">A tiny demo of a proximity-audio virtual office.</p>

        <div className="preview">
          <div className="preview-tag">
            <span className="status-dot" />
            {trimmed || 'Your name'}
          </div>
          <div className="preview-avatar" style={{ background: color }}>
            <span className="eyes" />
          </div>
        </div>

        <label className="field-label" htmlFor="name">What's your name?</label>
        <input
          id="name"
          autoFocus
          maxLength={16}
          placeholder="Enter your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <div className="field-label">Pick a colour</div>
        <div className="swatches">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`swatch ${c === color ? 'selected' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`Colour ${c}`}
            />
          ))}
        </div>

        <button className="join-btn" type="submit" disabled={!trimmed}>
          Join
        </button>
      </form>
    </div>
  )
}
