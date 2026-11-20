import { dialog, app } from 'electron'
import { createWriteStream } from 'node:fs'
import { getDatabase } from './database'
import { verifyAdminPassword } from './security'
import { productInputSchema, saleInputSchema, dateRangeSchema } from '../shared/contracts'
import type { ProductDuplicate, ProductSaveResult } from '../shared/contracts'
import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import { join } from 'node:path'

const cents = (value: number) => Math.round(value * 100)
const money = (value: number) => `R$ ${(value / 100).toFixed(2).replace('.', ',')}`

function audit(action: string, details: string) {
  getDatabase().prepare('INSERT INTO audit_log(action,details) VALUES(?,?)').run(action, details)
}

export function listProducts() {
  return getDatabase().prepare(`
    SELECT id, name, category, quantity, purchase_price_cents AS purchasePriceCents,
      sale_price_cents AS salePriceCents, min_stock AS minStock, active,
      created_at AS createdAt, updated_at AS updatedAt
    FROM products WHERE active=1 ORDER BY name COLLATE NOCASE
  `).all().map((p: any) => ({
    ...p,
    purchasePrice: p.purchasePriceCents / 100,
    salePrice: p.salePriceCents / 100,
    active: Boolean(p.active)
  }))
}

function normalizeProductName(name: string) {
  return name.normalize('NFC').trim().toLocaleLowerCase('pt-BR')
}

function findActiveProductByName(name: string, excludedId?: number): ProductDuplicate | undefined {
  const rows = getDatabase().prepare(`
    SELECT id, name, quantity FROM products
    WHERE active=1 ${excludedId === undefined ? '' : 'AND id<>?'}
    ORDER BY id
  `).all(...(excludedId === undefined ? [] : [excludedId])) as ProductDuplicate[]
  const normalizedName = normalizeProductName(name)
  return rows.find(product => normalizeProductName(product.name) === normalizedName)
}

export function saveProduct(raw: unknown): ProductSaveResult {
  const parsed = productInputSchema.safeParse(raw)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Dados inválidos.')
  const input = raw as { id?: unknown; duplicateProductId?: unknown }
  if (input.id !== undefined && input.duplicateProductId !== undefined) {
    throw new Error('Solicitação de produto inválida.')
  }
  if (input.duplicateProductId !== undefined &&
      (typeof input.duplicateProductId !== 'number' || !Number.isInteger(input.duplicateProductId) || input.duplicateProductId <= 0)) {
    throw new Error('Produto duplicado inválido.')
  }
  const data = parsed.data
  const db = getDatabase()
  const purchase = cents(data.purchasePrice)
  const sale = cents(data.salePrice)
  const tx = db.transaction((): ProductSaveResult => {
    if (input.id !== undefined) {
      if (typeof input.id !== 'number' || !Number.isInteger(input.id) || input.id <= 0) throw new Error('Produto inválido.')
      if (findActiveProductByName(data.name, input.id)) {
        throw new Error('Já existe um produto ativo com esse nome.')
      }
      const result = db.prepare(`UPDATE products SET name=?,category=?,purchase_price_cents=?,sale_price_cents=?,min_stock=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND active=1`)
        .run(data.name, data.category, purchase, sale, data.minStock, input.id)
      if (!result.changes) throw new Error('Produto não encontrado ou arquivado.')
      audit('PRODUCT_UPDATED', `Produto ${input.id} atualizado`)
      return { status: 'saved' }
    }

    const duplicate = findActiveProductByName(data.name)
    if (duplicate) {
      if (input.duplicateProductId === undefined) return { status: 'duplicate', product: duplicate }
      if (input.duplicateProductId !== duplicate.id) {
        throw new Error('A lista de produtos duplicados mudou. Feche e tente novamente.')
      }
      if (data.quantity <= 0) throw new Error('Informe uma quantidade maior que zero para adicionar ao estoque.')
      const update = db.prepare(`
        UPDATE products SET quantity=quantity+?,updated_at=CURRENT_TIMESTAMP
        WHERE id=? AND active=1
      `).run(data.quantity, duplicate.id)
      if (!update.changes) throw new Error('O produto não está mais disponível. Atualize a lista e tente novamente.')
      db.prepare('INSERT INTO stock_movements(product_id,movement_type,quantity_delta,reason) VALUES(?,?,?,?)')
        .run(duplicate.id, 'ADJUSTMENT', data.quantity, 'Entrada pelo cadastro de produto já existente')
      audit('STOCK_ADDED_FROM_DUPLICATE', `Produto ${duplicate.id}: entrada de ${data.quantity} unidade(s) pelo cadastro duplicado`)
      return { status: 'saved' }
    }

    if (input.duplicateProductId !== undefined) {
      throw new Error('O produto duplicado não está mais disponível. Revise o cadastro e tente novamente.')
    }
    const result = db.prepare(`INSERT INTO products(name,category,quantity,purchase_price_cents,sale_price_cents,min_stock) VALUES(?,?,?,?,?,?)`)
      .run(data.name, data.category, data.quantity, purchase, sale, data.minStock)
    const id = Number(result.lastInsertRowid)
    db.prepare(`INSERT INTO stock_movements(product_id,movement_type,quantity_delta,reason) VALUES(?,?,?,?)`)
      .run(id, 'INITIAL', data.quantity, 'Estoque inicial')
    audit('PRODUCT_CREATED', `Produto ${id} cadastrado`)
    return { status: 'saved' }
  })
  return tx()
}

export async function archiveProduct(id: number, password: string) {
  if (!Number.isInteger(id) || id <= 0) throw new Error('Produto inválido.')
  if (!(await verifyAdminPassword(password))) throw new Error('Senha administrativa incorreta.')
  const db = getDatabase()
  const tx = db.transaction(() => {
    const result = db.prepare('UPDATE products SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND active=1').run(id)
    if (!result.changes) throw new Error('Produto não encontrado.')
    audit('PRODUCT_ARCHIVED', `Produto ${id} arquivado`)
  })
  tx()
}

export async function adjustStock(id: number, delta: number, reason: string, password: string) {
  if (!(await verifyAdminPassword(password))) throw new Error('Senha administrativa incorreta.')
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(delta) || delta === 0) throw new Error('Ajuste de estoque inválido.')
  const cleanReason = reason.trim().slice(0, 160)
  if (!cleanReason) throw new Error('Informe o motivo do ajuste.')
  const db = getDatabase()
  const tx = db.transaction(() => {
    const product = db.prepare('SELECT quantity FROM products WHERE id=? AND active=1').get(id) as { quantity: number } | undefined
    if (!product) throw new Error('Produto não encontrado.')
    if (product.quantity + delta < 0) throw new Error('O ajuste deixaria o estoque negativo.')
    db.prepare('UPDATE products SET quantity=quantity+?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(delta, id)
    db.prepare('INSERT INTO stock_movements(product_id,movement_type,quantity_delta,reason) VALUES(?,?,?,?)')
      .run(id, 'ADJUSTMENT', delta, cleanReason)
    audit('STOCK_ADJUSTED', `Produto ${id}: ${delta}; ${cleanReason}`)
  })
  tx()
}

export function createSale(raw: unknown): number {
  const input = saleInputSchema.parse(raw)
  const db = getDatabase()
  const tx = db.transaction(() => {
    const consolidated = new Map<number, number>()
    for (const item of input.items) consolidated.set(item.productId, (consolidated.get(item.productId) ?? 0) + item.quantity)
    const items: Array<{ id: number; name: string; quantity: number; price: number }> = []
    let total = 0
    for (const [id, quantity] of consolidated) {
      const product = db.prepare('SELECT id,name,quantity,sale_price_cents FROM products WHERE id=? AND active=1').get(id) as any
      if (!product) throw new Error('Um dos produtos não está disponível.')
      if (product.quantity < quantity) throw new Error(`Estoque insuficiente para ${product.name}. Disponível: ${product.quantity}.`)
      const lineTotal = product.sale_price_cents * quantity
      total += lineTotal
      items.push({ id, name: product.name, quantity, price: product.sale_price_cents })
    }
    const saleId = Number(db.prepare('INSERT INTO sales(payment_method,total_cents) VALUES(?,?)')
      .run(input.paymentMethod, total).lastInsertRowid)
    for (const item of items) {
      db.prepare('INSERT INTO sale_items(sale_id,product_id,product_name,quantity,unit_price_cents,line_total_cents) VALUES(?,?,?,?,?,?)')
        .run(saleId, item.id, item.name, item.quantity, item.price, item.price * item.quantity)
      db.prepare('UPDATE products SET quantity=quantity-?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
        .run(item.quantity, item.id)
      db.prepare('INSERT INTO stock_movements(product_id,movement_type,quantity_delta,reason,sale_id) VALUES(?,?,?,?,?)')
        .run(item.id, 'SALE', -item.quantity, `Venda #${saleId}`, saleId)
    }
    audit('SALE_CREATED', `Venda ${saleId}; total ${total}`)
    return saleId
  })
  return tx()
}

export async function cancelSale(id: number, password: string) {
  if (!Number.isInteger(id) || id <= 0) throw new Error('Venda inválida.')
  if (!(await verifyAdminPassword(password))) throw new Error('Senha administrativa incorreta.')
  const db = getDatabase()
  const tx = db.transaction(() => {
    const sale = db.prepare("SELECT id,status FROM sales WHERE id=?").get(id) as any
    if (!sale) throw new Error('Venda não encontrada.')
    if (sale.status !== 'CONFIRMED') throw new Error('Esta venda já foi cancelada.')
    const items = db.prepare('SELECT product_id,quantity,product_name FROM sale_items WHERE sale_id=?').all(id) as any[]
    for (const item of items) {
      if (item.product_id) {
        db.prepare('UPDATE products SET quantity=quantity+?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(item.quantity, item.product_id)
        db.prepare('INSERT INTO stock_movements(product_id,movement_type,quantity_delta,reason,sale_id) VALUES(?,?,?,?,?)')
          .run(item.product_id, 'CANCEL_SALE', item.quantity, `Estorno da venda #${id}`, id)
      }
    }
    db.prepare("UPDATE sales SET status='CANCELED',canceled_at=CURRENT_TIMESTAMP,canceled_by='ADMIN' WHERE id=?").run(id)
    audit('SALE_CANCELED', `Venda ${id} cancelada e estoque estornado`)
  })
  tx()
}

export function listSales() {
  const db = getDatabase()
  const sales = db.prepare(`SELECT id,sold_at AS soldAt,payment_method AS paymentMethod,total_cents AS totalCents,status FROM sales ORDER BY id DESC LIMIT 200`).all() as any[]
  return sales.map(s => ({
    ...s,
    items: db.prepare('SELECT product_name AS productName,quantity,unit_price_cents AS unitPriceCents,line_total_cents AS lineTotalCents FROM sale_items WHERE sale_id=?').all(s.id)
  }))
}

export function verifyDatabase() {
  const db = getDatabase()
  const checks = db.prepare('PRAGMA integrity_check').all() as Array<{ integrity_check: string }>
  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM products WHERE active=1) AS activeProducts,
      (SELECT COUNT(*) FROM products WHERE active=0) AS archivedProducts,
      (SELECT COUNT(*) FROM sales) AS sales,
      (SELECT COUNT(*) FROM stock_movements) AS stockMovements
  `).get() as {
    activeProducts: number
    archivedProducts: number
    sales: number
    stockMovements: number
  }
  return {
    integrity: checks.map(check => check.integrity_check).join('; '),
    ...counts,
    databasePath: join(app.getPath('userData'), 'stock-facil.sqlite')
  }
}

export async function exportReport(rawRange: unknown, format: 'pdf' | 'xlsx'): Promise<string | null> {
  if (format !== 'pdf' && format !== 'xlsx') throw new Error('Formato de relatório inválido.')
  const range = dateRangeSchema.parse(rawRange)
  const db = getDatabase()
  const rows = db.prepare(`
    SELECT s.id,s.sold_at,s.payment_method,s.total_cents,si.product_name,si.quantity,
      si.unit_price_cents,si.line_total_cents
    FROM sales s JOIN sale_items si ON si.sale_id=s.id
    WHERE s.status='CONFIRMED' AND date(s.sold_at) BETWEEN date(?) AND date(?)
    ORDER BY s.sold_at,s.id
  `).all(range.startDate, range.endDate) as any[]
  const summary = db.prepare(`
    SELECT COUNT(*) AS sales_count, COALESCE(SUM(total_cents),0) AS total
    FROM sales WHERE status='CONFIRMED' AND date(sold_at) BETWEEN date(?) AND date(?)
  `).get(range.startDate, range.endDate) as any
  const { filePath } = await dialog.showSaveDialog({
    title: 'Salvar relatório do Stock Fácil',
    defaultPath: join(app.getPath('documents'), `relatorio-stock-facil-${range.startDate}-a-${range.endDate}.${format}`),
    filters: format === 'pdf' ? [{ name: 'PDF', extensions: ['pdf'] }] : [{ name: 'Excel', extensions: ['xlsx'] }]
  })
  if (!filePath) return null

  if (format === 'xlsx') {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Vendas')
    sheet.addRow(['Relatório de vendas - Stock Fácil'])
    sheet.addRow([`Período: ${range.startDate} até ${range.endDate}`])
    sheet.addRow([`Faturamento: ${money(summary.total)}`, `Vendas: ${summary.sales_count}`])
    sheet.addRow(['Venda', 'Data/hora', 'Produto', 'Quantidade', 'Valor unitário', 'Subtotal', 'Pagamento'])
    for (const r of rows) sheet.addRow([r.id, r.sold_at, r.product_name, r.quantity, r.unit_price_cents / 100, r.line_total_cents / 100, r.payment_method])
    sheet.getRow(4).font = { bold: true }
    sheet.columns.forEach(c => { c.width = 20 })
    await workbook.xlsx.writeFile(filePath)
  } else {
    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 42, size: 'A4' })
      const stream = createWriteStream(filePath)
      doc.pipe(stream)
      doc.fontSize(18).text('Stock Fácil | Relatório de vendas')
      doc.moveDown(0.5).fontSize(10).text(`Período: ${range.startDate} até ${range.endDate}`)
      doc.text(`Faturamento: ${money(summary.total)}   |   Vendas: ${summary.sales_count}`)
      doc.moveDown().fontSize(9)
      for (const r of rows) {
        doc.text(`#${r.id} | ${r.sold_at} | ${r.product_name} | ${r.quantity} un. | ${money(r.line_total_cents)} | ${r.payment_method}`)
        if (doc.y > 740) doc.addPage()
      }
      doc.end()
      stream.on('finish', resolve)
      stream.on('error', reject)
    })
  }
  return filePath
}

export async function exportBackup(password: string): Promise<string | null> {
  if (!(await verifyAdminPassword(password))) throw new Error('Senha administrativa incorreta.')
  const { filePath } = await dialog.showSaveDialog({
    title: 'Salvar cópia de segurança',
    defaultPath: join(app.getPath('documents'), `stock-facil-backup-${new Date().toISOString().slice(0,10)}.sqlite`),
    filters: [{ name: 'Banco SQLite', extensions: ['sqlite'] }]
  })
  if (!filePath) return null
  await getDatabase().backup(filePath)
  audit('BACKUP_EXPORTED', 'Backup manual exportado')
  return filePath
}
