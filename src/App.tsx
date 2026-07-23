import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth'
import { PricingProvider } from './pricing'
import { LedgerProvider } from './ledger'
import { SettingsProvider } from './appSettings'
import AppShell from './AppShell'
import Login from './Login'
import NewEntry from './NewEntry'
import Expenses from './Expenses'
import History from './History'
import Prices from './Prices'
import Analytics from './Analytics'
import MenuStudio from './MenuStudio'
import Settings from './Settings'
import type { ReactNode } from 'react'

function Protected({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/" replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <SettingsProvider>
        <PricingProvider>
          <LedgerProvider>
            <Routes>
              <Route path="/" element={<Login />} />
              <Route
                path="/app"
                element={
                  <Protected>
                    <AppShell />
                  </Protected>
                }
              >
                <Route index element={<Navigate to="entry" replace />} />
                <Route path="entry" element={<NewEntry />} />
                <Route path="expenses" element={<Expenses />} />
                <Route path="history" element={<History />} />
                <Route path="prices" element={<Prices />} />
                <Route path="menu" element={<MenuStudio />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </LedgerProvider>
        </PricingProvider>
      </SettingsProvider>
    </AuthProvider>
  )
}
