import PickleLogo from "./PickleLogo"
import type { FormEvent, ReactNode } from "react"

type DesktopShellProps = {
  children: ReactNode
  activeNav: number
  searching: boolean
  accountLabel: string
  accountView: boolean
  query: string
  onQueryChange: (query: string) => void
  onSearch: () => void
  onNavigate: (index: number) => void
  onUploadRecipe: () => void
}

export default function DesktopShell({
  children,
  activeNav,
  searching,
  accountLabel,
  accountView,
  query,
  onQueryChange,
  onSearch,
  onNavigate,
  onUploadRecipe,
}: DesktopShellProps) {
  function submit(event: FormEvent) {
    event.preventDefault()
    onSearch()
  }

  return (
    <div className="pickle-web">
      <a className="web-skip-link" href="#pickle-content">
        Skip to recipes
      </a>
      <header className="web-header">
        <div className="web-header-inner">
          <button
            type="button"
            className="web-brand"
            onClick={() => onNavigate(0)}
            aria-label="Pickle home"
          >
            <PickleLogo iconSize={40} />
          </button>
          <nav className="web-navigation" aria-label="Main navigation">
            {[
              [0, "Home"],
              [1, "Browse"],
              [2, "Saved recipes"],
            ].map(([index, label]) => (
              <button
                key={index}
                type="button"
                aria-current={
                  activeNav === index && !searching ? "page" : undefined
                }
                onClick={() => onNavigate(Number(index))}
              >
                {label}
              </button>
            ))}
          </nav>
          <form className="web-header-search" role="search" onSubmit={submit}>
            <button type="submit" aria-label="Submit recipe search">
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m16 16 5 5" />
              </svg>
            </button>
            <input
              aria-label="Search recipes"
              placeholder="Find a recipe or ingredient"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
            />
          </form>
          <button type="button" className="web-upload-recipe" aria-label="Add recipe" title="Add recipe" onClick={onUploadRecipe}>
            <svg width="30" height="30" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="16" cy="16" r="13" />
              <path d="M16 10v12M10 16h12" />
            </svg>
          </button>
          <button
            type="button"
            className="web-account"
            onClick={() => onNavigate(4)}
            aria-current={accountView ? "page" : undefined}
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 22v-3a8 8 0 0 1 16 0v3" />
            </svg>
            {accountLabel}
          </button>
        </div>
      </header>
      <main
        id="pickle-content"
        tabIndex={-1}
        className={`desktop-screen${
          accountView ? " desktop-account-screen" : ""
        }`}
      >
        {children}
      </main>
      <footer className="web-footer">
        <PickleLogo size={21} />
        <span>Recipes worth coming back to.</span>
        <button type="button" onClick={() => onNavigate(1)}>
          Browse recipes
        </button>
      </footer>
    </div>
  )
}
