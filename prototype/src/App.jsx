import { useState } from 'react'
import NameScreen from './NameScreen.jsx'
import Game from './Game.jsx'

// The app has only two "screens":
//   1. NameScreen – pick a name and colour, then click Join.
//   2. Game       – the office map with your avatar on it.
export default function App() {
  const [player, setPlayer] = useState(null) // null = not joined yet

  if (!player) {
    return <NameScreen onJoin={setPlayer} />
  }
  return <Game playerName={player.name} playerColor={player.color} onLeave={() => setPlayer(null)} />
}
