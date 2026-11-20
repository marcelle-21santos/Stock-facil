import { z } from 'zod'

export const productInputSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome do produto.').max(100),
  category: z.string().trim().max(60).default(''),
  quantity: z.number().int('A quantidade deve ser um número inteiro.').min(0, 'A quantidade não pode ser negativa.'),
  purchasePrice: z.number().finite().min(0, 'O custo não pode ser negativo.'),
  salePrice: z.number().finite().min(0, 'O preço de venda não pode ser negativo.'),
  minStock: z.number().int().min(0).default(0)
})

export const saleInputSchema = z.object({
  items: z.array(z.object({
    productId: z.number().int().positive(),
    quantity: z.number().int().positive('A quantidade deve ser maior que zero.')
  })).min(1, 'Adicione pelo menos um produto.'),
  paymentMethod: z.enum(['DINHEIRO', 'PIX', 'DEBITO', 'CREDITO'])
})

export const dateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
}).refine(v => v.startDate <= v.endDate, {
  message: 'A data inicial deve ser anterior ou igual à data final.'
})

export type ProductInput = z.infer<typeof productInputSchema>
export type SaleInput = z.infer<typeof saleInputSchema>
export type PaymentMethod = SaleInput['paymentMethod']

export interface Product extends ProductInput {
  id: number
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface ProductDuplicate {
  id: number
  name: string
  quantity: number
}

export type ProductSaveResult =
  | { status: 'saved' }
  | { status: 'duplicate'; product: ProductDuplicate }

export interface SaleRecord {
  id: number
  soldAt: string
  paymentMethod: PaymentMethod
  totalCents: number
  status: 'CONFIRMED' | 'CANCELED'
  items: Array<{ productName: string; quantity: number; unitPriceCents: number; lineTotalCents: number }>
}

export interface DatabaseStatus {
  integrity: string
  activeProducts: number
  archivedProducts: number
  sales: number
  stockMovements: number
  databasePath: string
}

export interface StockFacilApi {
  security: {
    hasAdmin: () => Promise<boolean>
    createAdmin: (password: string) => Promise<string>
    verifyAdmin: (password: string) => Promise<boolean>
    changeAdminPassword: (currentPassword: string, newPassword: string) => Promise<void>
    resetAdminPassword: (recoveryCode: string, newPassword: string) => Promise<string>
    hasRecoveryCode: () => Promise<boolean>
  }
  products: {
    list: () => Promise<Product[]>
    save: (input: ProductInput & { id?: number; duplicateProductId?: number }) => Promise<ProductSaveResult>
    archive: (id: number, password: string) => Promise<void>
    adjustStock: (id: number, delta: number, reason: string, password: string) => Promise<void>
  }
  sales: {
    create: (input: SaleInput) => Promise<number>
    list: () => Promise<SaleRecord[]>
    cancel: (id: number, password: string) => Promise<void>
  }
  reports: {
    export: (range: z.infer<typeof dateRangeSchema>, format: 'pdf' | 'xlsx') => Promise<string | null>
  }
  backup: {
    export: (password: string) => Promise<string | null>
  }
  database: {
    verify: () => Promise<DatabaseStatus>
  }
}
