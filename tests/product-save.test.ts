import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestProduct = {
  id: number
  name: string
  quantity: number
  active: number
  category: string
  purchase_price_cents: number
  sale_price_cents: number
  min_stock: number
}

const state = vi.hoisted(() => ({
  products: [] as TestProduct[],
  movements: [] as Array<{ productId: number; type: string; quantityDelta: number; reason: string }>,
  audit: [] as Array<{ action: string; details: string }>,
  nextId: 1
}))

vi.mock('electron', () => ({ app: {}, dialog: {} }))
vi.mock('../src/main/security', () => ({ verifyAdminPassword: vi.fn() }))
vi.mock('../src/main/database', () => ({
  getDatabase: () => ({
    prepare: (query: string) => ({
      all: (...args: unknown[]) => {
        const excludedId = args[0]
        return state.products
          .filter(product => product.active === 1 && (excludedId === undefined || product.id !== excludedId))
          .map(({ id, name, quantity }) => ({ id, name, quantity }))
      },
      run: (...args: unknown[]) => {
        if (query.startsWith('INSERT INTO audit_log')) {
          state.audit.push({ action: String(args[0]), details: String(args[1]) })
          return { changes: 1 }
        }
        if (query.startsWith('INSERT INTO stock_movements')) {
          state.movements.push({
            productId: Number(args[0]),
            type: String(args[1]),
            quantityDelta: Number(args[2]),
            reason: String(args[3])
          })
          return { changes: 1 }
        }
        if (query.includes('UPDATE products SET quantity=quantity+?')) {
          const product = state.products.find(item => item.id === args[1] && item.active === 1)
          if (!product) return { changes: 0 }
          product.quantity += Number(args[0])
          return { changes: 1 }
        }
        if (query.startsWith('UPDATE products SET name=?')) {
          const product = state.products.find(item => item.id === args[5] && item.active === 1)
          if (!product) return { changes: 0 }
          Object.assign(product, {
            name: String(args[0]),
            category: String(args[1]),
            purchase_price_cents: Number(args[2]),
            sale_price_cents: Number(args[3]),
            min_stock: Number(args[4])
          })
          return { changes: 1 }
        }
        if (query.startsWith('INSERT INTO products')) {
          const id = state.nextId++
          state.products.push({
            id,
            name: String(args[0]),
            category: String(args[1]),
            quantity: Number(args[2]),
            purchase_price_cents: Number(args[3]),
            sale_price_cents: Number(args[4]),
            min_stock: Number(args[5]),
            active: 1
          })
          return { changes: 1, lastInsertRowid: id }
        }
        throw new Error(`Unexpected SQL in product save test: ${query}`)
      }
    }),
    transaction: (callback: () => unknown) => () => {
      const products = state.products.map(product => ({ ...product }))
      const movements = [...state.movements]
      const audit = [...state.audit]
      const nextId = state.nextId
      try {
        return callback()
      } catch (error) {
        state.products = products
        state.movements = movements
        state.audit = audit
        state.nextId = nextId
        throw error
      }
    }
  })
}))

import { saveProduct } from '../src/main/services'

function seedProduct(name: string, quantity: number) {
  const product = {
    id: state.nextId++,
    name,
    quantity,
    active: 1,
    category: '',
    purchase_price_cents: 100,
    sale_price_cents: 200,
    min_stock: 0
  }
  state.products.push(product)
  return product
}

function productInput(name: string, quantity: number) {
  return { name, category: 'Bebidas', quantity, purchasePrice: 1, salePrice: 2, minStock: 0 }
}

describe('cadastro de produtos duplicados', () => {
  beforeEach(() => {
    state.products = []
    state.movements = []
    state.audit = []
    state.nextId = 1
  })

  it('identifica nomes que diferem apenas por maiúsculas e minúsculas, inclusive com acentos', () => {
    const existing = seedProduct('Água Mineral', 4)

    const result = saveProduct(productInput('água mineral', 3))

    expect(result).toEqual({ status: 'duplicate', product: { id: existing.id, name: existing.name, quantity: 4 } })
    expect(state.products).toHaveLength(1)
    expect(state.movements).toHaveLength(0)
  })

  it('soma a quantidade confirmada e registra a movimentação de estoque', () => {
    const existing = seedProduct('Café', 4)
    const input = productInput('CAFÉ', 3)
    const duplicate = saveProduct(input)
    expect(duplicate.status).toBe('duplicate')

    const result = saveProduct({ ...input, duplicateProductId: existing.id })

    expect(result).toEqual({ status: 'saved' })
    expect(state.products[0]?.quantity).toBe(7)
    expect(state.products).toHaveLength(1)
    expect(state.movements).toEqual([{
      productId: existing.id,
      type: 'ADJUSTMENT',
      quantityDelta: 3,
      reason: 'Entrada pelo cadastro de produto já existente'
    }])
    expect(state.audit).toHaveLength(1)
  })

  it('impede salvar outro produto com o mesmo nome durante a edição', () => {
    seedProduct('Café', 4)
    const edited = seedProduct('Chá', 2)

    expect(() => saveProduct({ ...productInput('CAFÉ', 2), id: edited.id }))
      .toThrow('Já existe um produto ativo com esse nome.')
    expect(edited.name).toBe('Chá')
  })
})
