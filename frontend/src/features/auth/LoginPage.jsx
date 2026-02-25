import { useState } from 'react';
import { useAuth } from './AuthContext';
import AuthSidebarBackground from '../../components/AuthSidebarBackground';

// Matches App.jsx prop onSwitch
export default function LoginPage({ onSwitch }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { login } = useAuth();
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(email, password);
        } catch (err) {
            setError(err.message || 'Неверный email или пароль');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            {/* Left Sidebar - Swiss Red */}
            <div className="auth-sidebar">
                <AuthSidebarBackground />
                <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                    <h1 className="text-huge">Normo<br />Control.</h1>
                    <p style={{ color: 'rgba(255,255,255,0.8)', marginTop: '2rem', fontSize: '1.2rem', maxWidth: '300px' }}>
                        Автоматизированная система проверки академических работ.
                    </p>
                </div>
            </div>

            {/* Right Content - Form */}
            <div className="auth-content">
                <div style={{ width: '100%', maxWidth: '400px' }}>
                    <div style={{ marginBottom: '3rem' }}>
                        <h2 style={{ fontSize: '3rem', letterSpacing: '-0.05em' }}>Вход.</h2>
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        <div>
                            <label>Email</label>
                            <input
                                className="input-field"
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="user@university.edu"
                            />
                        </div>
                        <div>
                            <label>Пароль</label>
                            <input
                                className="input-field"
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                            />
                        </div>

                        {error && <div className="badge error" style={{ padding: '1rem' }}>{error}</div>}

                        <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '60px', marginTop: '1rem' }} disabled={loading}>
                            {loading ? 'ВХОД...' : 'ВОЙТИ В СИСТЕМУ'}
                        </button>
                    </form>

                    <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '2px solid #F4F4F4' }}>
                        <p style={{ color: 'var(--text-main)', fontWeight: 500 }}>
                            Нет аккаунта? <button onClick={onSwitch} style={{ background: 'none', border: 'none', borderBottom: '2px solid var(--accent-primary)', color: 'var(--accent-primary)', fontWeight: 700, cursor: 'pointer', marginLeft: '0.5rem', textTransform: 'uppercase' }}>Регистрация</button>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
