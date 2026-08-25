/* ============================================================================
   TOTAL WORK — Shared UI primitives

   Four things every page needed and each page was solving on its own: the page
   heading, the empty state, the modal shell, and a net under the whole tree.

   `Intro` in particular is now a plain component. It used to inspect what it
   was handed — comparing the title against the literal string 'Paiements &
   échéances' to rewrite it, and reading `action.props.onClick` to decide whether
   to render the button at all. Both callers now pass what they mean.
   ========================================================================== */
import { Component } from 'react'
import { createPortal } from 'react-dom'
import { RefreshCw, Search, TriangleAlert } from 'lucide-react'
import { useModal } from './hooks.js'

export function Intro({ eyebrow, title, description, action }) {
  return <div className="intro"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>
}

export function Empty({ title = 'Aucune donnée trouvée', description = 'Essayez d’ajuster vos filtres ou vos critères de recherche.' }) {
  return <div className="empty"><span><Search size={24} /></span><h2>{title}</h2><p>{description}</p></div>
}

/**
 * The scrim + dismissal contract shared by every overlay.
 *
 * The dialog element itself stays with the caller — `.modal-layer` is a flex
 * container and `.drawer`/`.form-modal` are its flex children, so slipping a
 * wrapper in between would break both layouts. Callers pass their own box as
 * children and hand its ref back here, which is all this needs to give them
 * Escape-to-close, Tab confined to the dialog, and focus restored on close.
 *
 * Rendered into `document.body`, because `position: fixed` resolves against the
 * nearest ancestor that has a transform, and `.page` keeps one: its entry
 * animation fills forwards, so its transform stays at the identity matrix
 * instead of `none`. The import confirmation is rendered inside `.page`, so its
 * scrim covered the content column only — sidebar still visible and clickable
 * behind the modal — and the dialog centred itself 132px right of the viewport
 * on a 1600px screen. An overlay must not care where it was rendered from.
 */
export function Overlay({ close, className = '', children, dialogRef }) {
  useModal(dialogRef, close)
  /* tabIndex -1: the scrim is a click target, not a control. As a plain button
     it was the first tab stop inside every dialog, so the first Tab press
     landed on something whose only behaviour was "discard what you are doing". */
  return createPortal(
    <div className={`modal-layer ${className}`.trim()}>
      <button className="backdrop" onClick={close} aria-label="Fermer" tabIndex={-1} />
      {children}
    </div>,
    document.body,
  )
}

/* ============================================================================
   Error boundary

   React unmounts the whole tree when a render throws, so a single bad record
   reaching a chart used to blank the entire dashboard with nothing on screen to
   explain it. This keeps the shell, names what failed, and offers the two exits
   that actually help: try this view again, or reload.

   A class is not a style choice here — componentDidCatch has no hook form.
   ========================================================================== */
export class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) { return { error } }

  componentDidCatch(error, info) { console.error('Erreur de rendu', error, info) }

  /* No reset-on-navigation logic here: App keys the `.page` container on the
     current page, so changing page unmounts this boundary together with the
     view that threw and the next one mounts clean. "Réessayer" covers the other
     case — the user stays put and wants the same view rendered again. */

  render() {
    if (!this.state.error) return this.props.children
    return <section className="panel error-boundary">
      <span><TriangleAlert size={26} /></span>
      <h2>Cette section n’a pas pu s’afficher</h2>
      <p>Une erreur inattendue est survenue pendant l’affichage. Vos données ne sont pas affectées.</p>
      <footer>
        <button className="secondary" onClick={() => this.setState({ error: null })}><RefreshCw size={16} />Réessayer</button>
        <button className="primary" onClick={() => location.reload()}>Recharger l’application</button>
      </footer>
    </section>
  }
}
