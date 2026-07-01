import { explorerLink } from '../lib/chain.js'

export function Spinner() {
  return <span className="spin" />
}

export function Unavailable({ label = 'Unavailable' }) {
  return <span className="unavail" title="No confirmed live source — see ARCHITECTURE.md">{label}</span>
}

export function Tag({ children, kind }) {
  return <span className={`tag${kind ? ' ' + kind : ''}`}>{children}</span>
}

export function Panel({ title, aside, children, className = '' }) {
  return (
    <div className={`panel ${className}`}>
      {(title || aside) && (
        <div className="panel-h">
          <span>{title}</span>
          {aside}
        </div>
      )}
      <div className="panel-b">{children}</div>
    </div>
  )
}

export function Stat({ k, accent, children, sub, tag }) {
  return (
    <div className={`stat${accent ? ' ' + accent : ''}`}>
      <div className="k">
        {k}
        {tag}
      </div>
      <div className="v">{children}</div>
      {sub && <div className="d">{sub}</div>}
    </div>
  )
}

export function Coin({ kind, src, sym }) {
  if (src) {
    return (
      <span className="coin">
        <img src={src} alt={sym || ''} onError={(e) => (e.currentTarget.style.display = 'none')} />
      </span>
    )
  }
  return <span className={`coin ${kind || ''}`}>{(sym || '?').slice(0, 1)}</span>
}

export function TxStatus({ status }) {
  if (!status?.message) return null
  const cls = status.kind || 'info'
  return (
    <div className={`txstatus ${cls}`}>
      {cls === 'info' && <Spinner />}
      {status.hash ? (
        <>
          {status.message}{' '}
          <a href={explorerLink(status.hash, 'tx')} target="_blank" rel="noreferrer">
            view tx
          </a>
        </>
      ) : (
        status.message
      )}
    </div>
  )
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>
}
