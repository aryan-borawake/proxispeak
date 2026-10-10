# proxispeak
Problem Statement:Remote collaboration tools (like Zoom) force users into rigid "rooms" where only one
person can speak at a time. They lack the spontaneous, spatial dynamics of a real office where you can
hear people talking nearby and organically walk over to join a conversation.
Use Case: An Infotact team logs into ProxiSpeak. They see a 2D overhead map of a virtual office rendered in React Canvas. As a user moves their avatar closer to a group of colleagues, the WebRTC audio dynamically crossfades, becoming louder. The Node.js backend continuously calculates the spatial distances between all avatars using MongoDB Geospatial queries, orchestrating a seamless, organic audio experience for 50+ concurrent users in the same virtual space.


Key Modules:

• Geospatial Engine (MongoDB $near & $geoWithin): Tracks the real-time X/Y coordinates of all
users and calculates physical proximity clusters.

• Signaling Server (Node.js & Socket.io): Orchestrates the WebRTC peer-to-peer connection
handshakes based on who is within "earshot."

• Spatial Audio Mixer (Web Audio API): Frontend module that dynamically adjusts the gain
(volume) and 3D panning (left/right ear) of peer audio tracks based on relative avatar distance.

• 2D Virtual World (React & HTML5 Canvas): A high-performance rendering engine for the virtual
office map and real-time avatar movements.
