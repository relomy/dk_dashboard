import { constantTimeEqual } from './security'

const PASSWORD_ALGO = 'pbkdf2_sha256'
const PASSWORD_ITERATIONS = 100_000
const DERIVED_KEY_BYTES = 32
const SALT_BYTES = 16
const ENCODER = new TextEncoder()

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  const base64 = btoa(binary)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const paddingLength = (4 - (normalized.length % 4)) % 4
  const padded = normalized + '='.repeat(paddingLength)
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function deriveHash(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const passwordBytes = new Uint8Array(ENCODER.encode(password))
  const normalizedSalt = new Uint8Array(salt)
  const key = await crypto.subtle.importKey('raw', passwordBytes, { name: 'PBKDF2' }, false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: normalizedSalt,
      iterations,
    },
    key,
    DERIVED_KEY_BYTES * 8,
  )
  return bytesToHex(new Uint8Array(bits))
}

function generateSalt(): Uint8Array {
  const bytes = new Uint8Array(SALT_BYTES)
  crypto.getRandomValues(bytes)
  return bytes
}

export async function hashPassword(password: string): Promise<string> {
  const salt = generateSalt()
  const digest = await deriveHash(password, salt, PASSWORD_ITERATIONS)
  return `${PASSWORD_ALGO}$${PASSWORD_ITERATIONS}$${bytesToBase64Url(salt)}$${digest}`
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split('$')
  if (parts.length !== 4) {
    return false
  }

  const [algo, iterationsRaw, saltEncoded, expectedDigest] = parts
  if (algo !== PASSWORD_ALGO) {
    return false
  }

  const iterations = Number(iterationsRaw)
  if (!Number.isFinite(iterations) || iterations <= 0) {
    return false
  }

  let salt: Uint8Array
  try {
    salt = base64UrlToBytes(saltEncoded)
  } catch {
    return false
  }

  let actualDigest: string
  try {
    actualDigest = await deriveHash(password, salt, iterations)
  } catch {
    return false
  }
  return constantTimeEqual(actualDigest, expectedDigest)
}
