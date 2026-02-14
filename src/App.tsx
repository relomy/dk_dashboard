import { Navigate, Route, Routes } from 'react-router-dom'
import AppShell from './components/AppShell'
import { ProfileProvider } from './context/ProfileContext'
import Health from './routes/Health'
import History from './routes/History'
import Latest from './routes/Latest'
import Live from './routes/Live'
import Settings from './routes/Settings'
import Sport from './routes/Sport'

function App() {
  return (
    <ProfileProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/latest" element={<Latest />} />
          <Route path="/live/:sport" element={<Live />} />
          <Route path="/history" element={<History />} />
          <Route path="/history/:timestamp" element={<History />} />
          <Route path="/sport/:sport" element={<Sport />} />
          <Route path="/health" element={<Health />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/latest" replace />} />
        </Route>
      </Routes>
    </ProfileProvider>
  )
}

export default App
