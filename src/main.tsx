import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import AuthScreen from './AuthScreen'
import AdminDashboard from './AdminDashboard'
import './index.css'


const isAdminPath = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/')
const initialTheme = isAdminPath ? 'light' : localStorage.getItem('pickle:theme') === 'dark' ? 'dark' : 'light'
document.documentElement.dataset.theme = initialTheme
document.documentElement.style.colorScheme = initialTheme

function Root() {
  const isPasswordRecovery = new URLSearchParams(window.location.search).get('reset') === '1'

  if (isAdminPath) {
    return <AdminDashboard />
  }

  if (isPasswordRecovery) {
    return (
      <div className="bg-white min-h-screen max-w-md mx-auto relative">
        <AuthScreen
          recoveryMode
          onBack={() => {
            const url = new URL(window.location.href)
            url.searchParams.delete('reset')
            url.hash = ''
            window.location.replace(`${url.pathname}${url.search}`)
          }}
          onRecoveryComplete={() => {
            const url = new URL(window.location.href)
            url.searchParams.delete('reset')
            url.hash = ''
            window.location.replace(`${url.pathname}${url.search}`)
          }}
        />
      </div>
    )
  }

  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
)
