// client/src/app/AreaChat.jsx — Person 1, v6
// The area chat panel (right side of the office), shown while I stand in a room: a meeting room,
// a booth, a desk pod, a tea table, the focus room or the stage hall.
// Like Gather: only the people inside the area see the messages, and nothing is stored, so someone who
// walks in later starts with an empty chat. OfficePage keeps the messages; this file only shows them.

import { useEffect, useRef, useState } from 'react';
import { CHAT_MAX_CHARS, ZONE_TYPES } from '@shared/constants.js';
import { Icon } from './icons.jsx';

/** What the area does to sound, in a few words, for the panel's note. */
const AREA_NOTES = {
  [ZONE_TYPES.PRIVATE]: 'Everyone in here hears each other at the same volume. Nobody outside can hear you.',
  [ZONE_TYPES.SILENT]: 'Focus room: microphones are off for everyone in here. Type instead.',
  [ZONE_TYPES.STAGE]: 'Stage hall: whoever stands on the stage is heard by the whole hall.',
};

/** "14:05" from a server time in ms. */
function timeOf(t) {
  const date = new Date(t);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * @param {{ area: object, messages: Array<object>, selfId: string, onSend: (text: string) => void, onClose: () => void }} props
 */
export function AreaChatPanel({ area, messages, selfId, onSend, onClose }) {
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);

  // Keep the newest message in view.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  function send(event) {
    event.preventDefault();
    const text = draft.trim();
    if (text === '') return;
    onSend(text);
    setDraft('');
  }

  return (
    <aside className="people-panel chat-panel" aria-label={`Chat in ${area.name}`}>
      <div className="people-panel-head">
        <h3>Chat</h3>
        <button className="btn btn-small" onClick={onClose} aria-label="Close the chat">
          <Icon.Close size={15} />
        </button>
      </div>
      <div className="chat-where">
        <Icon.Pin size={15} /> {area.name}
      </div>
      <p className="chat-note">{AREA_NOTES[area.type]} Messages can only be seen by people in this area, and new people won't see earlier ones.</p>
      <div className="chat-list" ref={listRef}>
        {messages.length === 0 && <p className="small muted chat-empty">No messages yet. Say hello to the room.</p>}
        {messages.map((message, index) => (
          <div key={`${message.t}-${index}`} className={`chat-message ${message.from.id === selfId ? 'chat-message-mine' : ''}`}>
            <div className="chat-meta">
              <strong>{message.from.id === selfId ? 'You' : message.from.name}</strong> <span>{timeOf(message.t)}</span>
            </div>
            <div className="chat-text">{message.text}</div>
          </div>
        ))}
      </div>
      <form className="chat-form" onSubmit={send}>
        <input
          className="input"
          value={draft}
          maxLength={CHAT_MAX_CHARS}
          placeholder={`Message ${area.name}`}
          onChange={(event) => setDraft(event.target.value)}
          aria-label={`Message to ${area.name}`}
        />
        <button className="btn btn-primary" type="submit" disabled={draft.trim() === ''}>
          Send
        </button>
      </form>
    </aside>
  );
}
