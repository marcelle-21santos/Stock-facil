import { useEffect, useState } from 'react'
import { LayoutDashboard, Package, ShoppingCart, FileBarChart, Settings, Plus, Search, Archive, Download, RefreshCw, X, CheckCircle2, CircleAlert, Database as DatabaseIcon, Info } from 'lucide-react'
import type { DatabaseStatus, Product } from '../../shared/contracts'

type Page = 'overview' | 'products' | 'cash' | 'reports' | 'settings'
type NoticeKind = 'success' | 'error' | 'warning' | 'info'
type MessageHandler = (text: string, kind?: NoticeKind) => void
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

async function refreshAfterWrite(refresh: () => Promise<void>, setMessage: MessageHandler, successText: string) {
  setMessage(successText, 'success')
  try {
    await refresh()
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : ''
    setMessage(`${successText} Os dados foram gravados, mas a tela não conseguiu atualizá-los.${detail}`, 'warning')
  }
}

export default function App() {
  const [page, setPage] = useState<Page>('overview')
  const [products, setProducts] = useState<Product[]>([])
  const [sales, setSales] = useState<any[]>([])
  const [adminReady, setAdminReady] = useState<boolean | null>(null)
  const [notice, setNotice] = useState<{ text: string; kind: NoticeKind } | null>(null)
  const [busy, setBusy] = useState(false)

  function setMessage(text: string, kind: NoticeKind = 'info') {
    setNotice({ text, kind })
  }

  async function refresh() {
    const [p, s] = await Promise.all([window.stockFacil.products.list(), window.stockFacil.sales.list()])
    setProducts(p as Product[])
    setSales(s)
  }

  async function refreshWithFeedback() {
    setBusy(true)
    try {
      await refresh()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível atualizar os dados.', 'error')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    window.stockFacil.security.hasAdmin().then(setAdminReady)
    refreshWithFeedback()
  }, [])

  const confirmedSales = sales.filter(s => s.status === 'CONFIRMED')
  const today = new Date().toISOString().slice(0, 10)
  const todayTotal = confirmedSales.filter(s => String(s.soldAt).slice(0, 10) === today).reduce((sum, s) => sum + s.totalCents, 0)
  const lowStock = products.filter(p => p.quantity <= p.minStock)

  if (adminReady === null) return <div className="loading">Carregando Stock Fácil…</div>
  if (!adminReady) return <FirstAccess onDone={() => setAdminReady(true)} />

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">SF</span><div><strong>Stock Fácil</strong><small>GESTÃO DO SEU NEGÓCIO</small></div></div>
      <div className="nav-label">MENU PRINCIPAL</div>
      <nav>
        <NavButton active={page === 'overview'} onClick={() => setPage('overview')} icon={<LayoutDashboard size={18}/>} label="Visão geral"/>
        <NavButton active={page === 'products'} onClick={() => setPage('products')} icon={<Package size={18}/>} label="Produtos"/>
        <NavButton active={page === 'cash'} onClick={() => setPage('cash')} icon={<ShoppingCart size={18}/>} label="Caixa"/>
        <NavButton active={page === 'reports'} onClick={() => setPage('reports')} icon={<FileBarChart size={18}/>} label="Relatórios"/>
      </nav>
      <div className="sidebar-bottom"><NavButton active={page === 'settings'} onClick={() => setPage('settings')} icon={<Settings size={18}/>} label="Administração"/><small>Versão 1.0.0</small></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div><span className="eyebrow">STOCK FÁCIL / PAINEL</span><h1>{({overview:'Visão geral',products:'Produtos',cash:'Caixa',reports:'Relatórios',settings:'Administração'})[page]}</h1></div><button className="icon-button" onClick={refreshWithFeedback} disabled={busy} title="Atualizar" aria-label="Atualizar dados"><RefreshCw size={17}/></button></header>
      {notice && <div className={`notice notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'} aria-live={notice.kind === 'error' ? 'assertive' : 'polite'}>
        <span className="notice-icon">{notice.kind === 'error' || notice.kind === 'warning' ? <CircleAlert size={22}/> : notice.kind === 'info' ? <Info size={22}/> : <CheckCircle2 size={22}/>}</span>
        <div className="notice-copy"><strong>{({success:'Concluído',error:'Não foi possível concluir',warning:'Atenção',info:'Informação'})[notice.kind]}</strong><p>{notice.text}</p></div>
        <button type="button" className="notice-close" onClick={() => setNotice(null)} aria-label="Fechar aviso"><X size={18}/></button>
      </div>}
      {page === 'overview' && <section className="content">
        <div className="welcome"><div><span className="eyebrow light">RESUMO OPERACIONAL</span><h2>Tudo do seu negócio, em um só lugar.</h2><p>Acompanhe estoque, vendas e resultados com clareza.</p></div><button className="primary" onClick={() => setPage('cash')}><Plus size={16}/> Nova venda</button></div>
        <div className="metric-grid">
          <Metric label="Vendas de hoje" value={brl(todayTotal / 100)} note={`${confirmedSales.filter(s => String(s.soldAt).slice(0,10) === today).length} vendas confirmadas`}/>
          <Metric label="Produtos cadastrados" value={String(products.length)} note="Produtos ativos no catálogo"/>
          <Metric label="Itens em estoque" value={String(products.reduce((n,p) => n+p.quantity,0))} note="Unidades disponíveis"/>
          <Metric label="Estoque baixo" value={String(lowStock.length)} note="No limite mínimo ou abaixo"/>
        </div>
        <div className="panel"><div className="panel-heading"><div><h3>Estoque que precisa de atenção</h3><p>Produtos no estoque mínimo ou abaixo dele.</p></div><button className="text-button" onClick={() => setPage('products')}>Ver produtos</button></div>
          {lowStock.length ? <div className="table-wrap"><table><thead><tr><th>Produto</th><th>Categoria</th><th>Disponível</th><th>Estoque mínimo</th></tr></thead><tbody>{lowStock.map(p => <tr key={p.id}><td className="strong">{p.name}</td><td>{p.category || '—'}</td><td><span className="stock-warning">{p.quantity} un.</span></td><td>{p.minStock} un.</td></tr>)}</tbody></table></div> : <Empty text="Nenhum produto com estoque baixo."/>}
        </div>
      </section>}
      {page === 'products' && <Products products={products} refresh={refresh} setMessage={setMessage}/>}
      {page === 'cash' && <Cash products={products} refresh={refresh} setMessage={setMessage}/>}
      {page === 'reports' && <Reports setMessage={setMessage}/>}
      {page === 'settings' && <SettingsPage setMessage={setMessage}/>}
      <footer>Stock Fácil <span>•</span> Seus dados ficam armazenados neste computador.</footer>
    </main>
  </div>
}

function NavButton({active,onClick,icon,label}:{active:boolean;onClick:()=>void;icon:React.ReactNode;label:string}) {
  return <button className={`nav-button ${active?'active':''}`} onClick={onClick}>{icon}<span>{label}</span></button>
}
function Metric({label,value,note}:{label:string;value:string;note:string}) { return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></div> }
function Empty({text}:{text:string}) { return <div className="empty">{text}</div> }

function FirstAccess({onDone}:{onDone:()=>void}) {
  const [password,setPassword] = useState('')
  const [confirm,setConfirm] = useState('')
  const [recoveryCode,setRecoveryCode] = useState('')
  const [codeSaved,setCodeSaved] = useState(false)
  const [copied,setCopied] = useState(false)
  const [error,setError] = useState('')
  const [loading,setLoading] = useState(false)
  async function submit(e:React.FormEvent) {
    e.preventDefault(); setError('')
    if(password.length < 10) return setError('Use pelo menos 10 caracteres.')
    if(password !== confirm) return setError('As senhas não conferem.')
    setLoading(true)
    try { setRecoveryCode(await window.stockFacil.security.createAdmin(password)) }
    catch(err) { setError(err instanceof Error ? err.message : 'Não foi possível criar a senha.') }
    finally { setLoading(false) }
  }
  async function copyRecoveryCode() {
    try {
      await navigator.clipboard.writeText(recoveryCode)
      setCopied(true)
      setError('')
    } catch {
      setError('Não foi possível copiar. Selecione e copie o código manualmente.')
    }
  }
  if (recoveryCode) return <div className="setup-screen"><div className="setup-card">
    <div className="brand centered"><span className="brand-mark">SF</span><div><strong>Stock Fácil</strong><small>RECUPERAÇÃO SEGURA</small></div></div>
    <h1>Guarde seu código de recuperação</h1>
    <p>Este código será mostrado somente agora. Use-o se esquecer a senha administrativa. Ele não fica salvo em texto no banco.</p>
    <code className="recovery-code">{recoveryCode}</code>
    <button type="button" className="secondary full" onClick={copyRecoveryCode}>{copied?'Código copiado':'Copiar código'}</button>
    <label className="recovery-confirm"><input type="checkbox" checked={codeSaved} onChange={e=>setCodeSaved(e.target.checked)}/> Guardei o código em um local seguro.</label>
    {error&&<div className="form-error" role="alert">{error}</div>}
    <button className="primary full" disabled={!codeSaved} onClick={onDone}>Continuar para o aplicativo</button>
  </div></div>
  return <div className="setup-screen"><form className="setup-card" onSubmit={submit}><div className="brand centered"><span className="brand-mark">SF</span><div><strong>Stock Fácil</strong><small>CONFIGURAÇÃO INICIAL</small></div></div><h1>Crie sua senha administrativa</h1><p>Ela será solicitada para operações sensíveis, como arquivar produtos, cancelar vendas e exportar backups.</p><label>Senha administrativa<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" required minLength={10}/></label><label>Confirme a senha<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" required/></label>{error&&<div className="form-error">{error}</div>}<button className="primary full" disabled={loading}>{loading?'Configurando…':'Criar senha e continuar'}</button><small className="hint">Mínimo de 10 caracteres. Guarde a senha em local seguro.</small></form></div>
}

function Products({products,refresh,setMessage}:{products:Product[];refresh:()=>Promise<void>;setMessage:MessageHandler}) {
  const [search,setSearch] = useState('')
  const [editing,setEditing] = useState<Product|null>(null)
  const [showForm,setShowForm] = useState(false)
  const [archiving,setArchiving] = useState<Product|null>(null)
  const [adjusting,setAdjusting] = useState<Product|null>(null)
  const filtered = products.filter(p => `${p.name} ${p.category}`.toLowerCase().includes(search.toLowerCase()))
  return <section className="content">
    <div className="toolbar"><div className="searchbox"><Search size={17}/><input placeholder="Buscar produto ou categoria…" value={search} onChange={e=>setSearch(e.target.value)}/></div><button className="primary" onClick={()=>{setEditing(null);setShowForm(true)}}><Plus size={16}/> Cadastrar produto</button></div>
    <div className="panel"><div className="panel-heading"><div><h3>Catálogo de produtos</h3><p>{products.length} produtos ativos</p></div></div>
      {filtered.length ? <div className="table-wrap"><table><thead><tr><th>Produto</th><th>Categoria</th><th>Estoque</th><th>Custo</th><th>Preço de venda</th><th>Margem bruta*</th><th></th></tr></thead><tbody>{filtered.map(p=><tr key={p.id}><td className="strong">{p.name}</td><td>{p.category||'—'}</td><td>{p.quantity} un.</td><td>{brl(p.purchasePrice)}</td><td>{brl(p.salePrice)}</td><td>{p.salePrice>0?`${(((p.salePrice-p.purchasePrice)/p.salePrice)*100).toFixed(1)}%`:'—'}</td><td><div className="row-actions"><button className="small-button" onClick={()=>{setEditing(p);setShowForm(true)}}>Editar</button><button className="small-button" onClick={()=>setAdjusting(p)}>Ajustar estoque</button><button className="small-button danger-button" onClick={()=>setArchiving(p)}><Archive size={13}/> Arquivar</button></div></td></tr>)}</tbody></table></div>:<Empty text="Nenhum produto encontrado."/>}
      <p className="footnote">* Margem bruta estimada sobre o preço de venda, antes de despesas e impostos.</p>
    </div>
    {showForm&&<ProductModal product={editing} onClose={()=>setShowForm(false)} onSaved={async()=>{setShowForm(false);await refreshAfterWrite(refresh,setMessage,'Produto salvo no banco de dados.')}}/>}
    {archiving&&<ArchiveProductModal product={archiving} onClose={()=>setArchiving(null)} onArchived={async()=>{setArchiving(null);await refreshAfterWrite(refresh,setMessage,'Produto arquivado com sucesso.')}}/>}
    {adjusting&&<StockAdjustmentModal product={adjusting} onClose={()=>setAdjusting(null)} onAdjusted={async()=>{setAdjusting(null);await refreshAfterWrite(refresh,setMessage,'Estoque ajustado com sucesso.')}}/>}
  </section>
}

function ArchiveProductModal({product,onClose,onArchived}:{product:Product;onClose:()=>void;onArchived:()=>Promise<void>}) {
  const [password,setPassword] = useState('')
  const [error,setError] = useState('')
  const [loading,setLoading] = useState(false)
  async function submit(e:React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await window.stockFacil.products.archive(product.id,password)
      await onArchived()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível arquivar o produto.')
    } finally {
      setLoading(false)
    }
  }
  return <div className="modal-backdrop"><form className="modal action-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="archive-title">
    <div className="modal-head"><div><h2 id="archive-title">Arquivar produto</h2><p>{product.name} deixará de aparecer no catálogo, mas continuará salvo no banco e no histórico.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X/></button></div>
    <label>Senha administrativa<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required autoFocus/></label>
    {error&&<div className="form-error" role="alert">{error}</div>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose} disabled={loading}>Cancelar</button><button className="primary" disabled={loading||!password}>{loading?'Arquivando…':'Confirmar arquivamento'}</button></div>
  </form></div>
}

function StockAdjustmentModal({product,onClose,onAdjusted}:{product:Product;onClose:()=>void;onAdjusted:()=>Promise<void>}) {
  const [delta,setDelta] = useState('')
  const [reason,setReason] = useState('')
  const [password,setPassword] = useState('')
  const [error,setError] = useState('')
  const [loading,setLoading] = useState(false)
  async function submit(e:React.FormEvent) {
    e.preventDefault()
    setError('')
    const quantityDelta = Number(delta)
    if (!Number.isInteger(quantityDelta) || quantityDelta === 0) {
      setError('Informe uma quantidade inteira diferente de zero.')
      return
    }
    if (!reason.trim()) {
      setError('Informe o motivo do ajuste.')
      return
    }
    setLoading(true)
    try {
      await window.stockFacil.products.adjustStock(product.id,quantityDelta,reason,password)
      await onAdjusted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível ajustar o estoque.')
    } finally {
      setLoading(false)
    }
  }
  return <div className="modal-backdrop"><form className="modal action-modal" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="adjust-stock-title">
    <div className="modal-head"><div><h2 id="adjust-stock-title">Ajustar estoque</h2><p>{product.name} tem {product.quantity} unidades disponíveis. Use valor positivo para entrada e negativo para saída.</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar"><X/></button></div>
    <div className="form-grid"><label>Quantidade a ajustar<input type="number" step="1" value={delta} onChange={e=>setDelta(e.target.value)} required autoFocus/></label><label>Motivo<input value={reason} maxLength={160} onChange={e=>setReason(e.target.value)} required/></label><label className="wide">Senha administrativa<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label></div>
    {error&&<div className="form-error" role="alert">{error}</div>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose} disabled={loading}>Cancelar</button><button className="primary" disabled={loading||!password}>{loading?'Salvando…':'Salvar ajuste'}</button></div>
  </form></div>
}

function ProductModal({product,onClose,onSaved}:{product:Product|null;onClose:()=>void;onSaved:()=>Promise<void>}) {
  const [form,setForm] = useState({name:product?.name??'',category:product?.category??'',quantity:String(product?.quantity??0),purchasePrice:String(product?.purchasePrice??''),salePrice:String(product?.salePrice??''),minStock:String(product?.minStock??0)})
  const [error,setError] = useState('')
  const [loading,setLoading] = useState(false)
  const [duplicate,setDuplicate] = useState<{id:number;name:string;quantity:number}|null>(null)
  function field(name:keyof typeof form,value:string){
    setForm(f=>({...f,[name]:value}))
    if(name==='name') setDuplicate(null)
  }

  async function save(duplicateProductId?:number) {
    setError('')
    setLoading(true)
    try {
      const result = await window.stockFacil.products.save({
        id:product?.id,
        name:form.name,
        category:form.category,
        quantity:Number(form.quantity),
        purchasePrice:Number(form.purchasePrice),
        salePrice:Number(form.salePrice),
        minStock:Number(form.minStock),
        ...(duplicateProductId === undefined ? {} : {duplicateProductId})
      })
      if(result.status==='duplicate') {
        setDuplicate(result.product)
        return
      }
      await onSaved()
    } catch(err) {
      setError(err instanceof Error?err.message:'Erro ao salvar produto.')
    } finally {
      setLoading(false)
    }
  }

  async function submit(e:React.FormEvent){
    e.preventDefault();setError('')
    const quantity=Number(form.quantity), purchasePrice=Number(form.purchasePrice), salePrice=Number(form.salePrice), minStock=Number(form.minStock)
    if(!form.name.trim()) return setError('Informe o nome do produto.')
    if(![quantity,minStock].every(Number.isInteger)||quantity<0||minStock<0) return setError('Quantidade e estoque mínimo devem ser números inteiros não negativos.')
    if(![purchasePrice,salePrice].every(n=>Number.isFinite(n)&&n>=0)) return setError('Informe valores válidos e não negativos.')
    await save()
  }
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}>
    <div className="modal-head"><div><h2>{product?'Editar produto':'Novo produto'}</h2><p>Preencha os dados do produto.</p></div><button type="button" className="icon-button" onClick={onClose} disabled={loading}><X/></button></div>
    <div className="form-grid">
      <label className="wide">Nome do produto *<input value={form.name} maxLength={100} onChange={e=>field('name',e.target.value)} required autoFocus/></label>
      <label>Categoria<input value={form.category} maxLength={60} onChange={e=>field('category',e.target.value)} placeholder="Ex.: Cervejas"/></label>
      <label>{product?'Quantidade atual':'Quantidade inicial'} *<input type="text" inputMode="numeric" pattern="[0-9]*" value={form.quantity} disabled={!!product} onChange={e=>field('quantity',e.target.value)} required/></label>
      <label>Custo de compra (R$)<input type="number" min="0" step="0.01" value={form.purchasePrice} onChange={e=>field('purchasePrice',e.target.value)} required/></label>
      <label>Preço de venda (R$)<input type="number" min="0" step="0.01" value={form.salePrice} onChange={e=>field('salePrice',e.target.value)} required/></label>
      <label>Estoque mínimo<input type="text" inputMode="numeric" pattern="[0-9]*" value={form.minStock} onChange={e=>field('minStock',e.target.value)} required/></label>
    </div>
    {product&&<p className="hint">Para alterar a quantidade, use o ajuste de estoque. Assim o histórico fica preservado.</p>}
    {duplicate&&<div className="duplicate-confirm" role="alert">
      <strong>Produto já existe</strong>
      <p>“{duplicate.name}” já tem {duplicate.quantity} unidade(s) em estoque. {Number(form.quantity)>0?`Deseja adicionar mais ${form.quantity} unidade(s)? O cadastro e os preços existentes serão mantidos.`:'Informe uma quantidade maior que zero para adicionar ao estoque.'}</p>
      <div className="modal-actions">
        <button type="button" className="secondary" onClick={()=>setDuplicate(null)} disabled={loading}>Voltar e editar</button>
        <button type="button" className="secondary" onClick={onClose} disabled={loading}>Cancelar</button>
        <button type="button" className="primary" onClick={()=>save(duplicate.id)} disabled={loading||Number(form.quantity)<=0}>{loading?'Atualizando…':`Adicionar ${form.quantity} unidade(s)`}</button>
      </div>
    </div>}
    {error&&<div className="form-error" role="alert">{error}</div>}
    {!duplicate&&<div className="modal-actions"><button type="button" className="secondary" onClick={onClose} disabled={loading}>Cancelar</button><button className="primary" disabled={loading}>{loading?'Salvando…':'Salvar produto'}</button></div>}
  </form></div>
}

function Cash({products,refresh,setMessage}:{products:Product[];refresh:()=>Promise<void>;setMessage:MessageHandler}) {
  const [productId,setProductId]=useState('')
  const [quantity,setQuantity]=useState('1')
  const [items,setItems]=useState<Array<{productId:number;name:string;quantity:number;price:number}>>([])
  const [payment,setPayment]=useState<'DINHEIRO'|'PIX'|'DEBITO'|'CREDITO'>('PIX')
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(false)
  const selected=products.find(p=>p.id===Number(productId))
  const total=items.reduce((n,i)=>n+i.quantity*i.price,0)
  function addItem(){
    setError('')
    const q=Number(quantity)
    if(!selected)return setError('Selecione um produto.')
    if(!Number.isInteger(q)||q<1)return setError('Informe uma quantidade válida.')
    const already=items.find(i=>i.productId===selected.id)?.quantity??0
    if(already+q>selected.quantity)return setError(`Estoque insuficiente. Disponível: ${selected.quantity-already}.`)
    setItems(old=>{const found=old.find(i=>i.productId===selected.id);return found?old.map(i=>i.productId===selected.id?{...i,quantity:i.quantity+q}:i):[...old,{productId:selected.id,name:selected.name,quantity:q,price:selected.salePrice}]})
    setProductId('');setQuantity('1')
  }
  async function finish(){
    setError('')
    if(!items.length)return setError('Adicione pelo menos um produto.')
    setLoading(true)
    try {
      const saleId = await window.stockFacil.sales.create({items:items.map(i=>({productId:i.productId,quantity:i.quantity})),paymentMethod:payment})
      setItems([])
      await refreshAfterWrite(refresh,setMessage,`Venda #${saleId} registrada no banco e estoque atualizado.`)
    } catch(err) {
      setError(err instanceof Error?err.message:'Não foi possível registrar a venda.')
    } finally {
      setLoading(false)
    }
  }
  return <section className="content cash-layout"><div className="panel cash-entry"><div className="panel-heading"><div><h3>Adicionar produtos</h3><p>Selecione os itens desta venda.</p></div></div><label>Produto<select value={productId} onChange={e=>setProductId(e.target.value)}><option value="">Selecione um produto</option>{products.filter(p=>p.quantity>0).map(p=><option key={p.id} value={p.id}>{p.name} — {p.quantity} disponíveis</option>)}</select></label><div className="inline-fields"><label>Quantidade<input type="text" inputMode="numeric" pattern="[0-9]*" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><button className="primary align-end" onClick={addItem}><Plus size={16}/> Adicionar</button></div>{error&&<div className="form-error">{error}</div>}</div><div className="panel sale-panel"><div className="panel-heading"><div><h3>Resumo da venda</h3><p>Confira os itens antes de confirmar.</p></div></div>{items.length?<div className="sale-items">{items.map(i=><div className="sale-item" key={i.productId}><div><strong>{i.name}</strong><small>{i.quantity} × {brl(i.price)}</small></div><strong>{brl(i.quantity*i.price)}</strong><button className="remove-button" onClick={()=>setItems(old=>old.filter(x=>x.productId!==i.productId))}><X size={15}/></button></div>)}</div>:<Empty text="Nenhum produto adicionado."/>}<label>Forma de pagamento<select value={payment} onChange={e=>setPayment(e.target.value as any)}><option value="PIX">Pix</option><option value="DINHEIRO">Dinheiro</option><option value="DEBITO">Cartão de débito</option><option value="CREDITO">Cartão de crédito</option></select></label><div className="sale-total"><span>Total da venda</span><strong>{brl(total)}</strong></div><button className="primary full" disabled={!items.length||loading} onClick={finish}>{loading?'Registrando…':'Confirmar venda'}</button><small className="hint">A baixa no estoque ocorre somente após a confirmação da venda.</small></div><div className="panel history-panel"><div className="panel-heading"><div><h3>Vendas recentes</h3><p>Últimas 200 vendas registradas neste computador.</p></div></div><div className="table-wrap"><table><thead><tr><th>Venda</th><th>Data</th><th>Pagamento</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>{/* Histórico atualizado após cada venda. */}</tbody></table><Empty text="O histórico detalhado será exibido nesta área na próxima etapa de interface."/></div></div></section>
}

function Reports({setMessage}:{setMessage:MessageHandler}) {
  const [start,setStart]=useState(new Date().toISOString().slice(0,10))
  const [end,setEnd]=useState(new Date().toISOString().slice(0,10))
  const [loading,setLoading]=useState(false)
  async function exportFile(format:'pdf'|'xlsx'){
    if(start>end)return setMessage('A data inicial deve ser anterior ou igual à data final.','error')
    setLoading(true)
    try{const path=await window.stockFacil.reports.export({startDate:start,endDate:end},format);if(path)setMessage(`Relatório salvo em: ${path}`,'success')}
    catch(e){setMessage(e instanceof Error?e.message:'Falha ao gerar relatório.','error')}
    finally{setLoading(false)}
  }
  return <section className="content"><div className="panel report-panel"><div className="panel-heading"><div><h3>Exportar relatório de vendas</h3><p>Escolha o período que deseja analisar.</p></div><FileBarChart size={22}/></div><div className="form-grid"><label>Data inicial<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Data final<input type="date" value={end} onChange={e=>setEnd(e.target.value)}/></label></div><div className="report-actions"><button className="secondary" disabled={loading} onClick={()=>exportFile('pdf')}><Download size={16}/> Exportar PDF</button><button className="primary" disabled={loading} onClick={()=>exportFile('xlsx')}><Download size={16}/> Exportar Excel</button></div><p className="hint">O relatório considera somente vendas confirmadas. Vendas canceladas e seus estornos não entram no faturamento.</p></div></section>
}

function SettingsPage({setMessage}:{setMessage:MessageHandler}) {
  const [backupPassword,setBackupPassword]=useState('')
  const [loading,setLoading]=useState(false)
  const [databaseStatus,setDatabaseStatus]=useState<DatabaseStatus|null>(null)
  const [checkingDatabase,setCheckingDatabase]=useState(false)
  const [currentPassword,setCurrentPassword]=useState('')
  const [newPassword,setNewPassword]=useState('')
  const [confirmPassword,setConfirmPassword]=useState('')
  const [changingPassword,setChangingPassword]=useState(false)
  const [hasRecoveryCode,setHasRecoveryCode]=useState<boolean|null>(null)
  const [showRecovery,setShowRecovery]=useState(false)
  const [recoveryCode,setRecoveryCode]=useState('')
  const [recoveryPassword,setRecoveryPassword]=useState('')
  const [confirmRecoveryPassword,setConfirmRecoveryPassword]=useState('')
  const [newRecoveryCode,setNewRecoveryCode]=useState('')
  const [recoveryError,setRecoveryError]=useState('')
  const [copiedRecoveryCode,setCopiedRecoveryCode]=useState(false)

  useEffect(() => {
    window.stockFacil.security.hasRecoveryCode()
      .then(setHasRecoveryCode)
      .catch(error => setMessage(error instanceof Error ? error.message : 'Não foi possível verificar o código de recuperação.', 'error'))
  }, [])

  async function backup(){
    setLoading(true)
    try{const path=await window.stockFacil.backup.export(backupPassword);if(path)setMessage(`Backup salvo em: ${path}`,'success');setBackupPassword('')}
    catch(e){setMessage(e instanceof Error?e.message:'Não foi possível gerar o backup.','error')}
    finally{setLoading(false)}
  }

  async function changePassword(e:React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 10 || newPassword.length > 128) {
      setMessage('A nova senha deve ter entre 10 e 128 caracteres.','error')
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage('A confirmação da nova senha não confere.','error')
      return
    }
    setChangingPassword(true)
    try {
      await window.stockFacil.security.changeAdminPassword(currentPassword,newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setMessage('Senha administrativa alterada.','success')
    } catch(error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível alterar a senha.','error')
    } finally {
      setChangingPassword(false)
    }
  }

  async function resetPassword(e:React.FormEvent) {
    e.preventDefault()
    setRecoveryError('')
    if (recoveryPassword.length < 10 || recoveryPassword.length > 128) {
      setRecoveryError('A nova senha deve ter entre 10 e 128 caracteres.')
      return
    }
    if (recoveryPassword !== confirmRecoveryPassword) {
      setRecoveryError('A confirmação da nova senha não confere.')
      return
    }
    setChangingPassword(true)
    try {
      const nextRecoveryCode = await window.stockFacil.security.resetAdminPassword(recoveryCode,recoveryPassword)
      setNewRecoveryCode(nextRecoveryCode)
      setHasRecoveryCode(true)
      setRecoveryCode('')
      setRecoveryPassword('')
      setConfirmRecoveryPassword('')
      setMessage('Senha redefinida. O código de recuperação anterior foi invalidado.','success')
    } catch(error) {
      setRecoveryError(error instanceof Error ? error.message : 'Não foi possível redefinir a senha.')
    } finally {
      setChangingPassword(false)
    }
  }

  async function copyNewRecoveryCode() {
    try {
      await navigator.clipboard.writeText(newRecoveryCode)
      setCopiedRecoveryCode(true)
      setRecoveryError('')
    } catch {
      setRecoveryError('Não foi possível copiar. Selecione e copie o código manualmente.')
    }
  }

  async function checkDatabase() {
    setCheckingDatabase(true)
    try {
      const status = await window.stockFacil.database.verify()
      setDatabaseStatus(status)
      setMessage(status.integrity === 'ok' ? 'Verificação concluída: o banco está íntegro.' : `O SQLite reportou um problema: ${status.integrity}`, status.integrity === 'ok' ? 'success' : 'error')
    } catch(e) {
      setMessage(e instanceof Error ? e.message : 'Não foi possível verificar o banco de dados.', 'error')
    } finally {
      setCheckingDatabase(false)
    }
  }
  return <section className="content settings-grid">
    <div className="panel settings-card security-card">
      <div className="panel-heading"><div><h3>Senha administrativa</h3><p>Altere usando sua senha atual ou recupere usando o código de uso único.</p></div><Settings size={22}/></div>
      <div className="settings-body">
        <form className="password-form" onSubmit={changePassword}>
          <div className="form-grid"><label>Senha atual<input type="password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} autoComplete="current-password" required/></label><label>Nova senha<input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)} autoComplete="new-password" minLength={10} maxLength={128} required/></label><label>Confirme a nova senha<input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} autoComplete="new-password" required/></label></div>
          <button className="primary" disabled={changingPassword}>{changingPassword?'Salvando…':'Alterar senha'}</button>
        </form>
        <div className="recovery-section">
          <div className="recovery-heading"><div><h4>Esqueceu a senha?</h4><p>O código de recuperação é único para esta instalação e muda após cada recuperação.</p></div><button type="button" className="text-button" onClick={()=>setShowRecovery(value=>!value)}>{showRecovery?'Fechar':'Recuperar senha'}</button></div>
          {hasRecoveryCode === false && <div className="form-error">Este banco antigo ainda não possui código de recuperação. Feche o aplicativo e execute <code>npm run admin:setup-recovery</code> na pasta do projeto. O comando preserva os dados e mostra o código uma única vez.</div>}
          {showRecovery && hasRecoveryCode && <form className="recovery-form" onSubmit={resetPassword}>
            <label>Código de recuperação<input value={recoveryCode} onChange={e=>setRecoveryCode(e.target.value)} autoComplete="off" placeholder="XXXXX-XXXXX-…" required/></label>
            <div className="form-grid"><label>Nova senha<input type="password" value={recoveryPassword} onChange={e=>setRecoveryPassword(e.target.value)} autoComplete="new-password" minLength={10} maxLength={128} required/></label><label>Confirme a nova senha<input type="password" value={confirmRecoveryPassword} onChange={e=>setConfirmRecoveryPassword(e.target.value)} autoComplete="new-password" required/></label></div>
            {recoveryError&&<div className="form-error" role="alert">{recoveryError}</div>}
            <button className="primary" disabled={changingPassword}>{changingPassword?'Redefinindo…':'Redefinir senha'}</button>
          </form>}
          {newRecoveryCode && <div className="recovery-code-panel"><strong>Guarde seu novo código</strong><p>O código anterior foi invalidado e este será mostrado somente agora.</p><code className="recovery-code">{newRecoveryCode}</code><button type="button" className="secondary" onClick={copyNewRecoveryCode}>{copiedRecoveryCode?'Código copiado':'Copiar código'}</button>{recoveryError&&<div className="form-error" role="alert">{recoveryError}</div>}</div>}
        </div>
      </div>
    </div>
    <div className="panel settings-card">
      <div className="panel-heading"><div><h3>Banco de dados</h3><p>Confira a integridade e os registros salvos neste computador.</p></div><DatabaseIcon size={22}/></div>
      <div className="settings-body">
        <button className="secondary" disabled={checkingDatabase} onClick={checkDatabase}><RefreshCw size={16}/>{checkingDatabase?'Verificando…':'Verificar banco de dados'}</button>
        {databaseStatus && <div className={`database-status ${databaseStatus.integrity === 'ok' ? 'is-healthy' : 'has-error'}`} role="status">
          <strong>{databaseStatus.integrity === 'ok' ? 'Banco íntegro' : 'Verificação encontrou um problema'}</strong>
          <dl><div><dt>Produtos ativos</dt><dd>{databaseStatus.activeProducts}</dd></div><div><dt>Produtos arquivados</dt><dd>{databaseStatus.archivedProducts}</dd></div><div><dt>Vendas registradas</dt><dd>{databaseStatus.sales}</dd></div><div><dt>Movimentações de estoque</dt><dd>{databaseStatus.stockMovements}</dd></div></dl>
          <small>Local do arquivo</small><code className="database-path">{databaseStatus.databasePath}</code>
        </div>}
        <p className="hint">Produtos arquivados deixam de aparecer no catálogo, mas permanecem no banco para preservar o histórico.</p>
      </div>
    </div>
    <div className="panel settings-card">
      <div className="panel-heading"><div><h3>Cópia de segurança</h3><p>Exporte uma cópia do banco de dados para guardar em local seguro.</p></div><Download size={22}/></div>
      <div className="settings-body"><label>Senha administrativa<input type="password" value={backupPassword} onChange={e=>setBackupPassword(e.target.value)} autoComplete="current-password" required/></label><button className="primary" disabled={!backupPassword||loading} onClick={backup}><Download size={16}/> {loading?'Gerando backup…':'Exportar backup'}</button><div className="security-note"><CheckCircle2 size={18}/><span>O banco original permanece no computador. A exportação cria uma cópia e não apaga os dados.</span></div></div>
    </div>
  </section>
}
