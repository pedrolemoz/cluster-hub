import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Activity, ArrowRight, Check, CirclePower, LogOut, Monitor, Pencil, Plus, RefreshCw, Server, ShieldCheck, Trash2, X, Zap } from 'lucide-react'
import { api, type AuthStatus, type Computer, type NetworkEndpoint } from './api'

function AuthScreen({ setup, onDone }: { setup: boolean; onDone: () => void }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (setup && password !== confirm) return setError('Passwords do not match.')
    setBusy(true)
    try { setup ? await api.setup(username, password) : await api.login(username, password); onDone() }
    catch (reason) { setError((reason as Error).message) } finally { setBusy(false) }
  }
  return <main className="auth-page">
    <div className="auth-grid" aria-hidden="true" />
    <section className="auth-intro"><Brand /><p className="eyebrow">Private infrastructure</p><h1>Your machines.<br/><span>One command center.</span></h1><p>Wake, monitor, and safely shut down every computer on your network from one focused dashboard.</p><div className="feature-line"><ShieldCheck size={18}/><span>Protected by private, local credentials</span></div></section>
    <section className="auth-panel"><div className="form-card"><span className="step">{setup ? 'INITIAL SETUP' : 'WELCOME BACK'}</span><h2>{setup ? 'Secure your hub' : 'Sign in to ClusterHub'}</h2><p>{setup ? 'Create the only account for this ClusterHub installation. Password recovery is intentionally unavailable.' : 'Enter your credentials to manage your computers.'}</p>
      <form onSubmit={submit}><label>Username<input autoFocus autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="Your username" minLength={3} required /></label><label>Password<input type="password" autoComplete={setup ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={setup ? 'At least 10 characters' : 'Your password'} minLength={setup ? 10 : undefined} required /></label>{setup && <label>Confirm password<input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repeat your password" required /></label>}{error && <p className="error" role="alert">{error}</p>}<button className="primary wide" disabled={busy}>{busy ? 'Please wait...' : setup ? 'Create account' : 'Sign in'}<ArrowRight size={18}/></button></form>
    </div></section>
  </main>
}

function Brand() { return <div className="brand"><span className="brand-mark"><Server size={18}/></span><span>ClusterHub</span></div> }

function ComputerDialog({ computer, onClose, onSaved }: { computer?: Computer; onClose: () => void; onSaved: (computer: Computer) => void }) {
  const editing = Boolean(computer)
  const [name, setName] = useState(computer?.name ?? ''); const [endpoints, setEndpoints] = useState<Array<NetworkEndpoint | { ipAddress: string; port: string }>>(computer?.endpoints ?? [{ ipAddress: '', port: '8732' }]); const [mac, setMac] = useState(computer?.macAddress ?? ''); const [allowShutdown, setAllowShutdown] = useState(computer?.allowShutdown ?? true)
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setError(''); try { const values = { name, endpoints: endpoints.map(endpoint => ({ ipAddress: endpoint.ipAddress, port: Number(endpoint.port) })), macAddress: mac, allowShutdown }; onSaved(computer ? await api.updateComputer(computer.id, values) : await api.addComputer(values)) } catch (reason) { setError((reason as Error).message); setBusy(false) } }
  return <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="computer-dialog-title"><header><div><span className="step">{editing ? 'EDIT MACHINE' : 'NEW MACHINE'}</span><h2 id="computer-dialog-title">{editing ? 'Edit computer' : 'Add a computer'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={20}/></button></header><form onSubmit={submit}>
    <label>Computer name<input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Studio workstation" maxLength={80} required /></label>
    <fieldset><legend>Network endpoints</legend>{endpoints.map((endpoint, index) => <div className="endpoint-row" key={index}><input aria-label={`IP address or alias ${index + 1}`} value={endpoint.ipAddress} onChange={e => setEndpoints(current => current.map((value, i) => i === index ? { ...value, ipAddress: e.target.value } : value))} placeholder="IP address or alias" required /><input className="port-input" aria-label={`Port ${index + 1}`} type="number" value={endpoint.port} onChange={e => setEndpoints(current => current.map((value, i) => i === index ? { ...value, port: e.target.value } : value))} min={1} max={65535} placeholder="Port" required />{endpoints.length > 1 && <button type="button" className="remove-field" onClick={() => setEndpoints(current => current.filter((_, i) => i !== index))} aria-label={`Remove network endpoint ${index + 1}`}><X size={17}/></button>}</div>)}{endpoints.length < 10 && <button type="button" className="text-button" onClick={() => setEndpoints(current => [...current, { ipAddress: '', port: '8732' }])}><Plus size={16}/>Add another address <small>{endpoints.length}/10</small></button>}</fieldset>
    <label>MAC address<input value={mac} onChange={e => setMac(e.target.value)} placeholder="00:11:22:33:44:55" required /></label>
    <label className="toggle-row"><span><strong>Allow remote shutdown</strong><small>Show the shutdown action while this computer is online.</small></span><input type="checkbox" checked={allowShutdown} onChange={e => setAllowShutdown(e.target.checked)} /><i aria-hidden="true" /></label>
    {error && <p className="error" role="alert">{error}</p>}<footer><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy && <RefreshCw className="spin" size={17}/>} {busy ? (editing ? 'Saving...' : 'Adding...') : (editing ? 'Save changes' : 'Add computer')}{!busy && (editing ? <Check size={17}/> : <Plus size={17}/>)}</button></footer>
  </form></section></div>
}

type PowerAction = { kind: 'wake' | 'shutdown'; pending: boolean; cooldownUntil: number }

function ComputerCard({ computer, action, now, onAction, onEdit, onDelete }: { computer: Computer; action?: PowerAction; now: number; onAction: (kind: 'wake' | 'shutdown') => void; onEdit: () => void; onDelete: () => void }) {
  const formatEndpoint = (endpoint: NetworkEndpoint) => `${endpoint.ipAddress.includes(':') ? `[${endpoint.ipAddress}]` : endpoint.ipAddress}:${endpoint.port}`
  const cooldownSeconds = action ? Math.max(0, Math.ceil((action.cooldownUntil - now) / 1000)) : 0
  const disabled = Boolean(action?.pending || cooldownSeconds)
  const actionLabel = (kind: 'wake' | 'shutdown') => action?.pending ? (action.kind === 'wake' ? 'Waking...' : 'Shutting down...') : cooldownSeconds ? `Wait ${cooldownSeconds}s` : (kind === 'wake' ? 'Turn on' : 'Shut down')
  return <article className={`computer-card ${computer.online ? 'online' : ''}`}><div className="card-top"><span className="computer-icon"><Monitor size={25}/></span><span className={`status ${computer.online ? 'is-online' : ''}`}><i/>{computer.online === null ? 'Checking' : computer.online ? 'Online' : 'Offline'}</span><button className="card-icon-button" onClick={onEdit} aria-label={`Edit ${computer.name}`}><Pencil size={16}/></button><button className="delete-button" onClick={onDelete} aria-label={`Remove ${computer.name}`}><Trash2 size={16}/></button></div><h3>{computer.name}</h3><dl><div><dt>MAC ADDRESS</dt><dd>{computer.macAddress}</dd></div><div><dt>{computer.online ? 'DETECTED ENDPOINT' : 'NETWORK ENDPOINTS'}</dt><dd>{computer.detectedEndpoint ? formatEndpoint(computer.detectedEndpoint) : computer.endpoints.map(formatEndpoint).join(' · ')}</dd></div></dl><div className="card-footer"><span className={computer.allowShutdown ? 'allowed' : ''}>{computer.allowShutdown ? <><Check size={14}/>Shutdown allowed</> : 'Wake only'}</span>{computer.online === null ? <span className="checking-status"><RefreshCw className="spin" size={15}/>Checking status</span> : computer.online ? computer.allowShutdown && <button className="danger" disabled={disabled} onClick={() => onAction('shutdown')}>{action?.pending ? <RefreshCw className="spin" size={17}/> : <CirclePower size={17}/>} {actionLabel('shutdown')}</button> : <button className="wake" disabled={disabled} onClick={() => onAction('wake')}>{action?.pending ? <RefreshCw className="spin" size={17}/> : <Zap size={17}/>} {actionLabel('wake')}</button>}</div></article>
}

function Dashboard({ status, onLogout }: { status: AuthStatus; onLogout: () => void }) {
  const [computers, setComputers] = useState<Computer[]>([]); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false); const [dialog, setDialog] = useState<Computer | 'add' | null>(null); const [error, setError] = useState(''); const [actions, setActions] = useState<Record<string, PowerAction>>({}); const [now, setNow] = useState(Date.now()); const actionLocks = useRef(new Map<string, number>())
  const refresh = useCallback(async (quiet = false) => { if (!quiet) setRefreshing(true); try { setComputers(await api.computers()); setError('') } catch (reason) { setError((reason as Error).message) } finally { setLoading(false); setRefreshing(false) } }, [])
  useEffect(() => {
    api.computers(false).then(saved => { setComputers(saved); setLoading(false); void refresh(true) }).catch(reason => { setError((reason as Error).message); setLoading(false) })
    const timer = window.setInterval(() => refresh(true), 5000)
    return () => window.clearInterval(timer)
  }, [refresh])
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(timer) }, [])
  async function act(computer: Computer, kind: 'wake' | 'shutdown') {
    const currentTime = Date.now(); if ((actionLocks.current.get(computer.id) ?? 0) > currentTime) return
    actionLocks.current.set(computer.id, Number.POSITIVE_INFINITY); setActions(current => ({ ...current, [computer.id]: { kind, pending: true, cooldownUntil: Number.POSITIVE_INFINITY } })); setError('')
    try { kind === 'wake' ? await api.wake(computer.id) : await api.shutdown(computer.id); window.setTimeout(() => refresh(true), kind === 'wake' ? 3000 : 1500) } catch (reason) { setError((reason as Error).message) } finally {
      const cooldownUntil = Date.now() + 10_000; actionLocks.current.set(computer.id, cooldownUntil); setNow(Date.now()); setActions(current => ({ ...current, [computer.id]: { kind, pending: false, cooldownUntil } }))
    }
  }
  async function remove(computer: Computer) { if (!window.confirm(`Remove ${computer.name} from ClusterHub?`)) return; try { await api.removeComputer(computer.id); await refresh(true) } catch (reason) { setError((reason as Error).message) } }
  return <div className="dashboard"><header className="topbar"><Brand/><div className="header-meta"><span className="secure"><ShieldCheck size={15}/>Secured</span><span>{status.username}</span><button className="icon-button" onClick={onLogout} aria-label="Log out"><LogOut size={18}/></button></div></header><main className="dashboard-main"><section className="dashboard-heading"><div><p className="eyebrow">COMMAND CENTER</p><h1>Your computers</h1><p>Monitor availability and control every machine connected to your hub.</p></div><div className="heading-actions"><button className="secondary" onClick={() => refresh()} disabled={refreshing}><RefreshCw className={refreshing ? 'spin' : ''} size={17}/>Refresh</button><button className="primary" onClick={() => setDialog('add')}><Plus size={18}/>Add computer</button></div></section><section className="summary"><div><Activity size={18}/><span>Machines</span><strong>{computers.length}</strong></div><div><span className="summary-dot online-dot"/><span>Online</span><strong>{computers.filter(item => item.online === true).length}</strong></div><div><span className="summary-dot"/><span>Offline</span><strong>{computers.filter(item => item.online === false).length}</strong></div><p><RefreshCw size={13}/>Auto-refreshes every 5 seconds</p></section>{error && <p className="page-error" role="alert">{error}<button onClick={() => setError('')}><X size={15}/></button></p>}{loading ? <div className="loading"><RefreshCw className="spin"/><p>Loading your computers...</p></div> : computers.length === 0 ? <section className="empty"><span><Monitor size={35}/></span><h2>No computers yet</h2><p>Add your first computer to start monitoring its availability and control its power remotely.</p><button className="primary" onClick={() => setDialog('add')}><Plus size={18}/>Add your first computer</button></section> : <section className="computer-grid">{computers.map(computer => <ComputerCard key={computer.id} computer={computer} action={actions[computer.id]} now={now} onAction={kind => act(computer, kind)} onEdit={() => setDialog(computer)} onDelete={() => remove(computer)}/>)}</section>}</main><footer className="app-footer"><Brand/><span>Private infrastructure control</span></footer>{dialog && <ComputerDialog computer={dialog === 'add' ? undefined : dialog} onClose={() => setDialog(null)} onSaved={saved => { setComputers(current => dialog === 'add' ? [...current, saved] : current.map(item => item.id === saved.id ? saved : item)); setDialog(null); void refresh(true) }}/>}</div>
}

export default function App() {
  const [status, setStatus] = useState<AuthStatus | null>(null); const [error, setError] = useState('')
  const load = useCallback(() => api.authStatus().then(setStatus).catch(reason => setError((reason as Error).message)), [])
  useEffect(() => { load() }, [load])
  if (error) return <main className="fatal"><Server size={32}/><h1>ClusterHub is unavailable</h1><p>{error}</p><button className="primary" onClick={() => location.reload()}>Try again</button></main>
  if (!status) return <main className="splash"><span className="brand-mark"><Server/></span><RefreshCw className="spin"/></main>
  if (!status.authenticated) return <AuthScreen setup={status.needsSetup} onDone={load}/>
  return <Dashboard status={status} onLogout={async () => { await api.logout(); load() }}/>
}
