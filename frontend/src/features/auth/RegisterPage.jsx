import { useState } from 'react';
import { useAuth } from './AuthContext';

// Prop name must match App.jsx usage (onSwitch)
export default function RegisterPage({ onSwitch }) {
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        fullName: '',
        role: 'student'
    });
    const { register } = useAuth();
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await register(formData.email, formData.password, formData.fullName, formData.role);
            alert("Регистрация успешна! Теперь войдите.");
            onSwitch(); // Switch to login view
        } catch (err) {
            setError(err.message || 'Ошибка регистрации');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-container">
            {/* Left Sidebar - Swiss Red */}
            <div className="auth-sidebar">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                    <h1 className="text-huge">Normo<br />Control.</h1>
                    <p style={{ color: 'rgba(255,255,255,0.8)', marginTop: '2rem', fontSize: '1.2rem', maxWidth: '300px' }}>
                        Присоединяйтесь к единому стандарту качества.
                    </p>
                </div>
            </div>

            {/* Right Content */}
            <div className="auth-content">
                <div style={{ width: '100%', maxWidth: '400px' }}>
                    <div style={{ marginBottom: '3rem' }}>
                        <h2 style={{ fontSize: '3rem', letterSpacing: '-0.05em' }}>Регистрация.</h2>
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        <div>
                            <label>ФИО</label>
                            <input
                                className="input-field"
                                required
                                value={formData.fullName}
                                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                                placeholder="Иванов Иван"
                            />
                        </div>
                        <div>
                            <label>Email</label>
                            <input
                                className="input-field"
                                type="email"
                                required
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                placeholder="student@university.edu"
                            />
                        </div>
                        <div>
                            <label>Пароль</label>
                            <input
                                className="input-field"
                                type="password"
                                required
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                placeholder="••••••••"
                            />
                        </div>
                        <div>
                            <label>Роль</label>
                            <select
                                className="input-field"
                                value={formData.role}
                                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                            >
                                <option value="student">Студент</option>
                                <option value="teacher">Преподаватель</option>
                            </select>
                        </div>

                        {error && <div className="badge error" style={{ padding: '1rem' }}>{error}</div>}

                        <button type="submit" className="btn btn-primary" style={{ width: '100%', height: '60px', marginTop: '1rem' }} disabled={loading}>
                            {loading ? 'СОЗДАНИЕ...' : 'СОЗДАТЬ АККАУНТ'}
                        </button>
                    </form>

                    <div style={{ marginTop: '3rem', paddingTop: '2rem', borderTop: '2px solid #F4F4F4' }}>
                        <p style={{ color: 'var(--text-main)', fontWeight: 500 }}>
                            Уже есть аккаунт? <button onClick={onSwitch} style={{ background: 'none', border: 'none', borderBottom: '2px solid var(--accent-primary)', color: 'var(--accent-primary)', fontWeight: 700, cursor: 'pointer', marginLeft: '0.5rem', textTransform: 'uppercase' }}>Войти</button>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
