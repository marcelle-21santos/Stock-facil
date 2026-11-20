import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  settings: new Map<string, string>(),
  audit: [] as Array<{ action: string; details: string }>
}))

vi.mock('../src/main/database', () => ({
  getDatabase: () => ({
    prepare: (query: string) => ({
      get: (...args: unknown[]) => {
        const key = query.includes("key='admin_password'") ? 'admin_password' : String(args[0])
        const value = state.settings.get(key)
        return value === undefined ? undefined : { value }
      },
      run: (...args: unknown[]) => {
        if (query.startsWith('INSERT INTO audit_log')) {
          state.audit.push({ action: String(args[0]), details: String(args[1]) })
          return { changes: 1 }
        }
        if (query.includes("VALUES('admin_password', ?)")) {
          state.settings.set('admin_password', String(args[0]))
          return { changes: 1 }
        }
        if (query.startsWith('INSERT INTO settings')) {
          state.settings.set(String(args[0]), String(args[1]))
          return { changes: 1 }
        }
        if (query.includes('WHERE key=? AND value=?')) {
          const key = String(args[1])
          if (state.settings.get(key) !== args[2]) return { changes: 0 }
          state.settings.set(key, String(args[0]))
          return { changes: 1 }
        }
        if (query.includes("WHERE key='admin_password' AND value=?")) {
          if (state.settings.get('admin_password') !== args[1]) return { changes: 0 }
          state.settings.set('admin_password', String(args[0]))
          return { changes: 1 }
        }
        if (query.includes("WHERE key='admin_password'")) {
          if (!state.settings.has('admin_password')) return { changes: 0 }
          state.settings.set('admin_password', String(args[0]))
          return { changes: 1 }
        }
        throw new Error(`Unexpected SQL in security test: ${query}`)
      }
    }),
    transaction: (callback: () => void) => () => {
      const settings = new Map(state.settings)
      const audit = [...state.audit]
      try {
        callback()
      } catch (error) {
        state.settings = settings
        state.audit = audit
        throw error
      }
    }
  })
}))

import {
  changeAdminPassword,
  createAdminPassword,
  hasAdminRecoveryCode,
  resetAdminPassword,
  verifyAdminPassword
} from '../src/main/security'

describe('segurança da senha administrativa', () => {
  beforeEach(() => {
    state.settings.clear()
    state.audit.length = 0
  })

  it('cria um código forte e persiste apenas seu hash', async () => {
    const recoveryCode = await createAdminPassword('senha-forte-123')

    expect(recoveryCode).toMatch(/^(?:[A-F0-9]{5}-){7}[A-F0-9]{5}$/)
    expect(state.settings.get('admin_recovery')).toMatch(/^[a-f0-9]{32}:[a-f0-9]{128}$/)
    expect(state.settings.get('admin_recovery')).not.toContain(recoveryCode)
    expect(await hasAdminRecoveryCode()).toBe(true)
    expect(await verifyAdminPassword('senha-forte-123')).toBe(true)
  })

  it('troca a senha, rotaciona o código e rejeita o código anterior', async () => {
    const recoveryCode = await createAdminPassword('senha-forte-123')
    const nextCode = await resetAdminPassword(recoveryCode, 'nova-senha-forte-456')

    expect(nextCode).not.toBe(recoveryCode)
    expect(await verifyAdminPassword('nova-senha-forte-456')).toBe(true)
    await expect(resetAdminPassword(recoveryCode, 'outra-senha-forte-789')).rejects.toThrow('Código de recuperação incorreto.')
  })

  it('não consome o código de recuperação se a atualização da senha falhar', async () => {
    const recoveryCode = await createAdminPassword('senha-forte-123')
    const storedRecovery = state.settings.get('admin_recovery')
    state.settings.delete('admin_password')

    await expect(resetAdminPassword(recoveryCode, 'nova-senha-forte-456')).rejects.toThrow('Senha administrativa não encontrada.')
    expect(state.settings.get('admin_recovery')).toBe(storedRecovery)
    expect(state.audit).toHaveLength(1)
  })

  it('altera senha normal somente com a senha atual', async () => {
    await createAdminPassword('senha-forte-123')

    await expect(changeAdminPassword('incorreta', 'nova-senha-forte-456')).rejects.toThrow('Senha administrativa atual incorreta.')
    await changeAdminPassword('senha-forte-123', 'nova-senha-forte-456')

    expect(await verifyAdminPassword('nova-senha-forte-456')).toBe(true)
  })
})
