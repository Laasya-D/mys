# ByteVault Imposter Files

This is a playable front-end prototype based on the dark ByteVault/detective visual direction.

## Current prototype
- Admin creates a room and selects 2 case sets.
- Player names can be added to the lobby.
- Four private clue cards.
- Discussion/question board.
- Secret final vote.
- Reveal screen.
- Responsive/mobile-friendly UI.
- No backend is included yet.

## Important
The prototype uses localStorage, so it is useful for testing the complete UX on one browser/device. It is NOT yet a true multi-device multiplayer deployment.

For the event version, connect the room/lobby/clues/chat/votes to a realtime backend such as Supabase Realtime or Firebase Realtime Database. Then players can join from their own phones or the same tablet can be passed around.

## Customize
Edit the CASES array near the bottom of index.html to replace the demo clues and hidden imposters with your two real clue sets.
