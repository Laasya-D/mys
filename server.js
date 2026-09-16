const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });
const PORT = process.env.PORT || 10000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'Mysterygameadmin';

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

const rooms = new Map();
const playerRooms = new Map();

const CASES = [
  {
    title: 'THE VANISHED KEY',
    clues: [
      'At 21:10, the access cabinet was opened. The camera feed skipped exactly 11 seconds.',
      'A spare key was signed out at 20:45, but the log lists no return.',
      'The person who found the missing key knew the cabinet code before the alarm was raised.',
      'A printed floor map has one room circled in red: the archive.'
    ]
  },
  {
    title: 'THE MIDNIGHT BREACH',
    clues: [
      'A login appears at 02:13 from a workstation that was supposedly powered down.',
      'The breach began three minutes after the night guard left the control room.',
      'One message says: “Don’t trust the obvious suspect.” It was timestamped before the breach.',
      'A backup contains a partial username ending in “_02”. The rest was deleted.'
    ]
  }
];

function cleanName(name) {
  return String(name || '').trim().replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 24);
}
function code() {
  let c;
  do c = 'VLT-' + Math.random().toString(36).slice(2, 6).toUpperCase(); while (rooms.has(c));
  return c;
}
function publicRoom(room) {
  return {
    code: room.code,
    capacity: room.capacity,
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, host: p.host })),
    phase: room.phase,
    caseTitle: CASES[room.caseIndex].title,
    voteCount: Object.keys(room.votes).length,
    messageCount: room.messages.length
  };
}
function emitRoom(room) { io.to(room.code).emit('room:update', publicRoom(room)); }
function leaveRoom(socket) {
  const rc = playerRooms.get(socket.id);
  if (!rc) return;
  const room = rooms.get(rc);
  playerRooms.delete(socket.id);
  if (!room) return;
  const p = room.players.get(socket.id);
  room.players.delete(socket.id);
  if (room.adminId === socket.id) room.adminId = null;
  if (room.players.size === 0) { rooms.delete(rc); return; }
  if (!room.adminId) {
    const next = room.players.values().next().value;
    room.adminId = next.id;
    next.host = true;
    io.to(next.id).emit('admin:promoted');
  }
  emitRoom(room);
}

io.on('connection', socket => {
  socket.on('admin:login', ({ key }, cb) => {
    if (key !== ADMIN_KEY) return cb({ ok:false, error:'Access denied.' });
    const active = [...rooms.values()].some(r => r.adminId && io.sockets.sockets.has(r.adminId));
    if (active) return cb({ ok:false, error:'The admin is already active. Close the existing admin session first.' });
    cb({ ok:true });
  });
  socket.on('admin:create', ({ key, capacity, caseIndex }, cb) => {
    if (key !== ADMIN_KEY) return cb({ ok:false, error:'Access denied.' });
    if (rooms.size && [...rooms.values()].some(r => r.adminId && io.sockets.sockets.has(r.adminId))) {
      // A single admin session is intentionally enforced for this event app.
      return cb({ ok:false, error:'The admin is already active. Close the existing admin session first.' });
    }
    capacity = Number(capacity);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 100) return cb({ ok:false, error:'Player count must be between 1 and 100.' });
    const roomCode = code();
    const room = { code: roomCode, capacity, caseIndex: Number(caseIndex) === 1 ? 1 : 0, phase:'lobby', adminId:socket.id, players:new Map(), votes:{}, messages:[], createdAt:Date.now() };
    rooms.set(roomCode, room);
    socket.join(roomCode);
    playerRooms.set(socket.id, roomCode);
    room.players.set(socket.id, { id:socket.id, name:'ADMIN', host:true, role:null });
    cb({ ok:true, room:publicRoom(room), code:roomCode });
    emitRoom(room);
  });

  socket.on('admin:resume', ({ key, code: roomCode }, cb) => {
    if (key !== ADMIN_KEY) return cb({ ok:false, error:'Access denied.' });
    const room = rooms.get(String(roomCode || '').toUpperCase());
    if (!room) return cb({ ok:false, error:'Room not found or expired.' });
    if (room.adminId && room.adminId !== socket.id) return cb({ ok:false, error:'This room already has an admin.' });
    room.adminId = socket.id;
    socket.join(room.code); playerRooms.set(socket.id, room.code);
    room.players.set(socket.id, { id:socket.id, name:'ADMIN', host:true, role:null });
    cb({ ok:true, room:publicRoom(room), code:room.code }); emitRoom(room);
  });

  socket.on('player:join', ({ code: roomCode, name }, cb) => {
    const room = rooms.get(String(roomCode || '').trim().toUpperCase());
    const clean = cleanName(name);
    if (!room) return cb({ ok:false, error:'Room not found. Ask the admin for the current room code.' });
    if (room.phase !== 'lobby') return cb({ ok:false, error:'This game has already started.' });
    if (!clean) return cb({ ok:false, error:'Enter a name.' });
    const names = [...room.players.values()].map(p => p.name.toLowerCase());
    if (names.includes(clean.toLowerCase())) return cb({ ok:false, error:'That name is already taken.' });
    if (room.players.size - 1 >= room.capacity) return cb({ ok:false, error:'This room is full.' });
    socket.join(room.code); playerRooms.set(socket.id, room.code);
    room.players.set(socket.id, { id:socket.id, name:clean, host:false, role:null });
    cb({ ok:true, room:publicRoom(room), playerId:socket.id });
    emitRoom(room);
  });

  socket.on('game:start', cb => {
    const rc = playerRooms.get(socket.id); const room = rooms.get(rc);
    if (!room || room.adminId !== socket.id) return cb?.({ok:false,error:'Admin only.'});
    const people = [...room.players.values()].filter(p => !p.host);
    if (people.length < 1) return cb?.({ok:false,error:'Add at least one player.'});
    // Deterministic role assignment is server-side and never sent before reveal.
    people.forEach(p => p.role = null);
    const imposter = people[Math.floor(Math.random() * people.length)];
    imposter.role = 'IMPOSTER';
    people.filter(p => p !== imposter).forEach(p => p.role = 'DETECTIVE');
    room.imposterId = imposter.id;
    room.phase = 'clues';
    room.messages = [];
    room.votes = {};
    io.to(room.code).emit('game:started', { caseTitle:CASES[room.caseIndex].title, clues:CASES[room.caseIndex].clues });
    emitRoom(room); cb?.({ok:true});
  });

  socket.on('chat:send', ({ text }, cb) => {
    const rc = playerRooms.get(socket.id); const room = rooms.get(rc); if (!room) return;
    if (room.phase !== 'clues' && room.phase !== 'discussion') return cb?.({ok:false,error:'Discussion is closed.'});
    const p = room.players.get(socket.id); const clean = String(text || '').trim().slice(0, 300); if (!p || !clean) return;
    const msg = { id:Date.now()+Math.random(), name:p.name, text:clean, at:Date.now() };
    room.messages.push(msg); if (room.messages.length > 100) room.messages.shift();
    io.to(room.code).emit('chat:message', msg); cb?.({ok:true});
  });

  socket.on('game:votePhase', cb => {
    const rc = playerRooms.get(socket.id); const room = rooms.get(rc);
    if (!room || room.adminId !== socket.id) return cb?.({ok:false,error:'Admin only.'});
    room.phase = 'vote'; room.votes = {};
    io.to(room.code).emit('phase:vote'); emitRoom(room); cb?.({ok:true});
  });

  socket.on('vote:cast', ({ targetId }, cb) => {
    const rc = playerRooms.get(socket.id); const room = rooms.get(rc); if (!room) return cb?.({ok:false,error:'Room missing.'});
    if (room.phase !== 'vote') return cb?.({ok:false,error:'Voting is not open.'});
    const voter = room.players.get(socket.id); const target = room.players.get(targetId);
    if (!voter || voter.host || !target || target.host || target.id === voter.id) return cb?.({ok:false,error:'Invalid vote.'});
    room.votes[socket.id] = target.id;
    io.to(room.code).emit('vote:progress', { count:Object.keys(room.votes).length, total:[...room.players.values()].filter(p=>!p.host).length });
    const total = [...room.players.values()].filter(p=>!p.host).length;
    if (Object.keys(room.votes).length >= total) reveal(room);
    cb?.({ok:true});
  });

  socket.on('admin:reveal', cb => {
    const rc = playerRooms.get(socket.id); const room = rooms.get(rc);
    if (!room || room.adminId !== socket.id) return cb?.({ok:false,error:'Admin only.'});
    reveal(room); cb?.({ok:true});
  });

  socket.on('disconnect', () => leaveRoom(socket));
});

function reveal(room) {
  if (room.phase === 'reveal') return;
  room.phase = 'reveal';
  const tally = {};
  Object.values(room.votes).forEach(id => { tally[id] = (tally[id] || 0) + 1; });
  const imposter = room.players.get(room.imposterId);
  const results = [...room.players.values()].filter(p=>!p.host).map(p => ({ id:p.id, name:p.name, votes:tally[p.id]||0, role:p.role }));
  io.to(room.code).emit('game:reveal', { imposterId:room.imposterId, imposterName:imposter?.name, results, caseTitle:CASES[room.caseIndex].title });
  emitRoom(room);
}

setInterval(() => {
  const cutoff = Date.now() - 6 * 60 * 60 * 1000;
  for (const [c,r] of rooms) if (r.createdAt < cutoff && r.players.size === 0) rooms.delete(c);
}, 10 * 60 * 1000);

server.listen(PORT, '0.0.0.0', () => console.log(`ByteVault listening on ${PORT}`));
