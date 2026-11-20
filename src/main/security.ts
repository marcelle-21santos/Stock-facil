import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { getDatabase } from './database'

const scrypt = promisify(scryptCallback)
const recoverySetting = 'admin_recovery'

function validatePassword(password: string) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
    throw new Error('A senha deve ter entre 10 e 128 caracteres.')
  }
}

function generateRecoveryCode() {
  const raw = randomBytes(20).toString('hex').toUpperCase()
  return Array.from({ length: 8 }, (_, index) => raw.slice(index * 5, index * 5 + 5)).join('-')
}

function normalizeRecoveryCode(code: string) {
  if (typeof code !== 'string') throw new Error('Código de recuperação inválido.')
  const normalized = code.trim().replace(/[-\s]/g, '').toLowerCase()
  if (!/^[a-f0-9]{40}$/.test(normalized)) throw new Error('Código de recuperação inválido.')
  return normalized
}

async function hashSecret(secret: string) {
  const salt = randomBytes(16)
  const hash = (await scrypt(secret, salt, 64)) as Buffer
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

async function verifySecret(secret: string, encoded: string) {
  const [saltHex, hashHex] = encoded.split(':')
  if (!saltHex || !hashHex || !/^[a-f0-9]+$/i.test(saltHex) || !/^[a-f0-9]+$/i.test(hashHex)) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = (await scrypt(secret, Buffer.from(saltHex, 'hex'), expected.length)) as Buffer
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export async function hasAdminPassword(): Promise<boolean> {
  return Boolean(getDatabase().prepare("SELECT value FROM settings WHERE key='admin_password'").get())
}

export async function createAdminPassword(password: string): Promise<string> {
  validatePassword(password)
  if (await hasAdminPassword()) throw new Error('A senha administrativa já foi configurada.')
  const recoveryCode = generateRecoveryCode()
  const [passwordHash, recoveryHash] = await Promise.all([
    hashSecret(password),
    hashSecret(normalizeRecoveryCode(recoveryCode))
  ])
  const db = getDatabase()
  const tx = db.transaction(() => {
    db.prepare("INSERT INTO settings(key,value) VALUES('admin_password', ?)").run(passwordHash)
    db.prepare('INSERT INTO settings(key,value) VALUES(?,?)').run(recoverySetting, recoveryHash)
    db.prepare('INSERT INTO audit_log(action,details) VALUES(?,?)')
      .run('ADMIN_PASSWORD_CREATED', 'Senha administrativa e recuperação configuradas')
  })
  tx()
  return recoveryCode
}

export async function verifyAdminPassword(password: string): Promise<boolean> {
  if (typeof password !== 'string') return false
  const row = getDatabase().prepare("SELECT value FROM settings WHERE key='admin_password'").get() as { value: string } | undefined
  return row ? verifySecret(password, row.value) : false
}

export async function changeAdminPassword(currentPassword: string, newPassword: string): Promise<void> {
  validatePassword(newPassword)
  if (typeof currentPassword !== 'string') throw new Error('Senha administrativa atual incorreta.')
  const db = getDatabase()
  const current = db.prepare("SELECT value FROM settings WHERE key='admin_password'").get() as { value: string } | undefined
  if (!current || !(await verifySecret(currentPassword, current.value))) throw new Error('Senha administrativa atual incorreta.')
  const passwordHash = await hashSecret(newPassword)
  const tx = db.transaction(() => {
    const result = db.prepare("UPDATE settings SET value=? WHERE key='admin_password' AND value=?").run(passwordHash, current.value)
    if (!result.changes) throw new Error('Senha administrativa não encontrada.')
    db.prepare('INSERT INTO audit_log(action,details) VALUES(?,?)')
      .run('ADMIN_PASSWORD_CHANGED', 'Senha administrativa alterada')
  })
  tx()
}

export async function resetAdminPassword(recoveryCode: string, newPassword: string): Promise<string> {
  validatePassword(newPassword)
  const normalizedCode = normalizeRecoveryCode(recoveryCode)
  const db = getDatabase()
  const recovery = db.prepare('SELECT value FROM settings WHERE key=?').get(recoverySetting) as { value: string } | undefined
  if (!recovery) throw new Error('Esta instalação ainda não tem código de recuperação. Feche o aplicativo e siga as instruções de recuperação local.')
  if (!(await verifySecret(normalizedCode, recovery.value))) throw new Error('Código de recuperação incorreto.')

  const newRecoveryCode = generateRecoveryCode()
  const [passwordHash, recoveryHash] = await Promise.all([
    hashSecret(newPassword),
    hashSecret(normalizeRecoveryCode(newRecoveryCode))
  ])
  const tx = db.transaction(() => {
    const result = db.prepare('UPDATE settings SET value=? WHERE key=? AND value=?')
      .run(recoveryHash, recoverySetting, recovery.value)
    if (!result.changes) throw new Error('Código de recuperação já utilizado. Use o código mais recente.')
    const passwordUpdate = db.prepare("UPDATE settings SET value=? WHERE key='admin_password'").run(passwordHash)
    if (!passwordUpdate.changes) throw new Error('Senha administrativa não encontrada.')
    db.prepare('INSERT INTO audit_log(action,details) VALUES(?,?)')
      .run('ADMIN_PASSWORD_RECOVERED', 'Senha administrativa redefinida com código de recuperação')
  })
  tx()
  return newRecoveryCode
}

export async function hasAdminRecoveryCode(): Promise<boolean> {
  return Boolean(getDatabase().prepare('SELECT value FROM settings WHERE key=?').get(recoverySetting))
}
