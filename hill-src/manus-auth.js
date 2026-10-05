// The hill inside Dream Gallery has no Manus account service: everyone plays offline and alone.
// This stand-in keeps the original game's calls working (same shape as the real ManusAuth).
const offline = { status: 'offline', user: null }
const unavailable = () => Promise.reject(new Error('Sign-in is not available here'))

export const ManusAuth = Object.freeze({
  prepare: () => Promise.resolve(offline),
  login: unavailable,
  logout: () => Promise.resolve(offline),
  startGame: start => Promise.resolve(start(offline)).then(() => offline),
  invoke: (_operation, done) => done('unavailable'),
  get_session: () => offline,
  query: unavailable,
  mutate: unavailable,
  open_standalone: () => {},
})
