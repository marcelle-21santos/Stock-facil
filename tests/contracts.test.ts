import { describe, expect, it } from 'vitest'
import { productInputSchema, saleInputSchema, dateRangeSchema } from '../src/shared/contracts'

describe('validação de produtos', () => {
  const valid = { name: 'Cerveja Pilsen', category: 'Cervejas', quantity: 12, purchasePrice: 3.5, salePrice: 6, minStock: 4 }
  it('aceita um produto válido', () => expect(productInputSchema.safeParse(valid).success).toBe(true))
  it('rejeita nome vazio', () => expect(productInputSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false))
  it('rejeita quantidade negativa', () => expect(productInputSchema.safeParse({ ...valid, quantity: -1 }).success).toBe(false))
  it('rejeita quantidade fracionada', () => expect(productInputSchema.safeParse({ ...valid, quantity: 1.5 }).success).toBe(false))
  it('rejeita preço negativo', () => expect(productInputSchema.safeParse({ ...valid, salePrice: -2 }).success).toBe(false))
})

describe('validação de vendas', () => {
  it('exige ao menos um item', () => expect(saleInputSchema.safeParse({ items: [], paymentMethod: 'PIX' }).success).toBe(false))
  it('rejeita quantidade zero', () => expect(saleInputSchema.safeParse({ items: [{ productId: 1, quantity: 0 }], paymentMethod: 'PIX' }).success).toBe(false))
  it('aceita forma de pagamento suportada', () => expect(saleInputSchema.safeParse({ items: [{ productId: 1, quantity: 1 }], paymentMethod: 'DINHEIRO' }).success).toBe(true))
  it('rejeita forma de pagamento desconhecida', () => expect(saleInputSchema.safeParse({ items: [{ productId: 1, quantity: 1 }], paymentMethod: 'BOLETO' }).success).toBe(false))
})

describe('período de relatório', () => {
  it('aceita intervalo válido', () => expect(dateRangeSchema.safeParse({ startDate: '2026-01-01', endDate: '2026-01-31' }).success).toBe(true))
  it('rejeita data inicial posterior à final', () => expect(dateRangeSchema.safeParse({ startDate: '2026-02-01', endDate: '2026-01-01' }).success).toBe(false))
})
