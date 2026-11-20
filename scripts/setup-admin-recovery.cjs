const { randomBytes, scryptSync } = require('node:crypto')
const { app } = require('electron')
const Database = require('better-sqlite3')
const fs = require('node:fs')
const path = require('node:path')

app.setName('stock-facil')

function createRecoveryCode() {
  const raw = randomBytes(20).toString('hex').toUpperCase()
  return Array.from({ length: 8 }, (_, index) => raw.slice(index * 5, index * 5 + 5)).join('-')
}

app.whenReady().then(() => {
  let db
  try {
    const databasePath = path.join(app.getPath('userData'), 'stock-facil.sqlite')
    if (!fs.existsSync(databasePath)) throw new Error(`Banco não encontrado: ${databasePath}`)

    db = new Database(databasePath)
    db.pragma('busy_timeout = 5000')
    const integrity = db.pragma('integrity_check')
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') {
      throw new Error('O banco não passou na verificação de integridade. Faça uma cópia e corrija o banco antes de continuar.')
    }
    const hasAdmin = db.prepare("SELECT 1 FROM settings WHERE key='admin_password'").get()
    if (!hasAdmin) throw new Error('Senha administrativa não configurada. Abra o aplicativo para concluir o primeiro acesso.')

    const hasRecovery = db.prepare("SELECT 1 FROM settings WHERE key='admin_recovery'").get()
    const rotate = process.argv.includes('--rotate')
    if (hasRecovery && !rotate) throw new Error('Já existe um código de recuperação. Use --rotate somente se perdeu o código anterior.')

    const code = createRecoveryCode()
    const salt = randomBytes(16)
    const normalizedCode = code.replace(/-/g, '').toLowerCase()
    const hash = scryptSync(normalizedCode, salt, 64)
    const encodedHash = `${salt.toString('hex')}:${hash.toString('hex')}`
    const action = hasRecovery ? 'ADMIN_RECOVERY_ROTATED' : 'ADMIN_RECOVERY_CREATED'

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO settings(key,value) VALUES('admin_recovery',?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value
      `).run(encodedHash)
      db.prepare('INSERT INTO audit_log(action,details) VALUES(?,?)')
        .run(action, 'Código de recuperação configurado offline')
    })
    tx()

    process.stdout.write(`Código de recuperação (guarde-o; não será exibido novamente):\n${code}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'Falha ao configurar recuperação.'}\n`)
    process.exitCode = 1
  } finally {
    db?.close()
    app.quit()
  }
})
