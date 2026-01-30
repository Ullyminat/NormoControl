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
    const [agreedToPolicy, setAgreedToPolicy] = useState(false);
    const [validationErrors, setValidationErrors] = useState({});


    const validateForm = () => {
        const errors = {};

        // ФИО validation
        if (!formData.fullName.trim()) {
            errors.fullName = 'ФИО обязательно для заполнения';
        } else if (formData.fullName.trim().length < 3) {
            errors.fullName = 'ФИО должно содержать минимум 3 символа';
        }

        // Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!formData.email.trim()) {
            errors.email = 'Email обязателен для заполнения';
        } else if (!emailRegex.test(formData.email)) {
            errors.email = 'Введите корректный email адрес';
        }

        // Password validation
        if (!formData.password) {
            errors.password = 'Пароль обязателен для заполнения';
        } else if (formData.password.length < 6) {
            errors.password = 'Пароль должен содержать минимум 6 символов';
        } else if (!/\d/.test(formData.password)) {
            errors.password = 'Пароль должен содержать хотя бы одну цифру';
        }

        // Policy agreement validation
        if (!agreedToPolicy) {
            errors.policy = 'Необходимо согласие с политикой конфиденциальности';
        }

        return errors;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setValidationErrors({});

        // Validate form
        const errors = validateForm();
        if (Object.keys(errors).length > 0) {
            setValidationErrors(errors);
            return;
        }

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
                                style={{ borderColor: validationErrors.fullName ? '#FF3B30' : undefined }}
                            />
                            {validationErrors.fullName && (
                                <div style={{ color: '#FF3B30', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                                    ⚠️ {validationErrors.fullName}
                                </div>
                            )}
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
                                style={{ borderColor: validationErrors.email ? '#FF3B30' : undefined }}
                            />
                            {validationErrors.email && (
                                <div style={{ color: '#FF3B30', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                                    ⚠️ {validationErrors.email}
                                </div>
                            )}
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
                                style={{ borderColor: validationErrors.password ? '#FF3B30' : undefined }}
                            />
                            {validationErrors.password && (
                                <div style={{ color: '#FF3B30', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                                    ⚠️ {validationErrors.password}
                                </div>
                            )}
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

                        {/* Privacy Policy Checkbox */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: '0.75rem',
                            padding: '1rem',
                            backgroundColor: validationErrors.policy ? '#FFF5F5' : '#F9F9F9',
                            borderRadius: '8px',
                            border: validationErrors.policy ? '2px solid #FF3B30' : '2px solid transparent'
                        }}>
                            <input
                                type="checkbox"
                                id="privacy-policy"
                                checked={agreedToPolicy}
                                onChange={(e) => setAgreedToPolicy(e.target.checked)}
                                style={{
                                    marginTop: '0.25rem',
                                    width: '18px',
                                    height: '18px',
                                    cursor: 'pointer',
                                    accentColor: '#000000'
                                }}
                            />
                            <label
                                htmlFor="privacy-policy"
                                style={{
                                    fontSize: '0.9rem',
                                    lineHeight: '1.5',
                                    cursor: 'pointer',
                                    color: validationErrors.policy ? '#FF3B30' : 'var(--text-main)'
                                }}
                            >
                                Я согласен(на) с{' '}
                                <a
                                    href="#"
                                    onClick={(e) => { e.preventDefault(); alert('Политика конфиденциальности:\n\nВаши данные защищены и используются только для работы системы NormoControl.'); }}
                                    style={{
                                        color: 'var(--accent-primary)',
                                        textDecoration: 'underline',
                                        fontWeight: 600
                                    }}
                                >
                                    политикой конфиденциальности
                                </a>
                                {' '}и{' '}
                                <a
                                    href="#"
                                    onClick={(e) => { e.preventDefault(); alert('Условия использования:\n\nИспользуя систему, вы соглашаетесь соблюдать правила академической честности.'); }}
                                    style={{
                                        color: 'var(--accent-primary)',
                                        textDecoration: 'underline',
                                        fontWeight: 600
                                    }}
                                >
                                    условиями использования
                                </a>
                            </label>
                        </div>
                        {validationErrors.policy && (
                            <div style={{ color: '#FF3B30', fontSize: '0.85rem', marginTop: '-1rem' }}>
                                ⚠️ {validationErrors.policy}
                            </div>
                        )}

                        {error && <div className="badge error" style={{ padding: '1rem' }}>{error}</div>}

                        <button
                            type="submit"
                            className="btn btn-primary"
                            style={{ width: '100%', height: '60px', marginTop: '1rem' }}
                            disabled={loading || !agreedToPolicy}
                        >
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
