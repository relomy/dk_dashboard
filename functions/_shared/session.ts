export const SESSION_COOKIE = 'session_token'
export const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60
// Sliding window: expiry is pushed out at most this often, to avoid a D1 write on every poll.
export const SESSION_EXTEND_AFTER_SECONDS = 60 * 60
