import { useState } from 'react'
import { Routes, Route, Link, useNavigate, useLocation, Navigate } from 'react-router-dom'
import './App.css'
import { AuthProvider, useAuth } from './features/auth/AuthContext'
import LoginPage from './features/auth/LoginPage'
import RegisterPage from './features/auth/RegisterPage'
import StudentDashboard from './features/dashboard/StudentDashboard'
import TeacherDashboard from './features/teacher/TeacherDashboard'
import TeacherStatistics from './features/teacher/TeacherStatistics'
import HistoryPage from './features/student/HistoryPage'

function MainLayout() {
  const { user, logout } = useAuth();
  const [isLogin, setIsLogin] = useState(true);

  if (!user) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        {isLogin ? (
          <LoginPage onSwitch={() => setIsLogin(false)} />
        ) : (
          <RegisterPage onSwitch={() => setIsLogin(true)} />
        )}
      </div>
    );
  }

  return (
    <div className="app-container">
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem', borderBottom: '2px solid black', paddingBottom: '1.5rem' }}>
        <div>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <h2 style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1, color: 'black', letterSpacing: '-0.03em' }}>NormoControl.</h2>
          </Link>
          <span style={{ color: 'var(--text-dim)', fontSize: '0.9rem', marginTop: '4px', display: 'block' }}>Пользователь: <b>{user.full_name}</b> ({user.role === 'student' ? 'Студент' : 'Преподаватель'})</span>
        </div>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <Link to="/" style={{ color: 'black', textDecoration: 'none', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.9rem' }}>ГЛАВНАЯ</Link>

          {user.role === 'student' && (
            <Link to="/history" style={{ color: 'black', textDecoration: 'none', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.9rem' }}>ИСТОРИЯ</Link>
          )}

          {user.role === 'teacher' && (
            <Link to="/statistics" style={{ color: 'black', textDecoration: 'none', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.9rem' }}>СТАТИСТИКА</Link>
          )}

          <button onClick={logout} className="btn btn-ghost" style={{ fontSize: '0.85rem', padding: '8px 16px' }}>
            ВЫЙТИ
          </button>
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={
            user.role === 'student' ? <StudentDashboard /> : <TeacherDashboard />
          } />

          <Route path="/history" element={
            user.role === 'student' ? <HistoryPage /> : <Navigate to="/" replace />
          } />

          <Route path="/statistics" element={
            user.role === 'teacher' ? <TeacherStatistics /> : <Navigate to="/" replace />
          } />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  )
}

export default App
