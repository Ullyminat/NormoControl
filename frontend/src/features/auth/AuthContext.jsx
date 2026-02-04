import { createContext, useContext, useState, useEffect } from 'react';
import { showToast, toastMessages } from '../../utils/toast';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // Check Session on Mount
    useEffect(() => {
        // CLEANUP: Remove old localStorage items from previous insecure version
        localStorage.removeItem('token');
        localStorage.removeItem('user');

        checkAuth();
    }, []);

    const checkAuth = async () => {
        try {
            // credentials: 'include' sends the cookie to the backend
            const res = await fetch('/api/auth/me', {
                credentials: 'include'
            });
            if (res.ok) {
                const data = await res.json();
                setUser(data.user);
            } else {
                setUser(null);
            }
        } catch (e) {
            console.error("Auth check failed", e);
            setUser(null);
        } finally {
            setLoading(false);
        }
    };

    const login = async (email, password) => {
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
                credentials: 'include' // Important for setting the cookie!
            });

            const data = await res.json();
            if (!res.ok) {
                showToast.error(data.error || toastMessages.loginError);
                throw new Error(data.error || 'Ошибка входа');
            }

            // Backend set the cookie. We just set the user.
            setUser(data.user);
            showToast.success(toastMessages.loginSuccess);
        } catch (error) {
            if (!error.message.includes('Ошибка входа')) {
                showToast.error(toastMessages.networkError);
            }
            throw error;
        }
    };

    const register = async (email, password, fullName, role) => {
        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    password,
                    full_name: fullName,
                    role
                })
            });

            const data = await res.json();
            if (!res.ok) {
                showToast.error(data.error || toastMessages.registerError);
                throw new Error(data.error || 'Ошибка регистрации');
            }
            showToast.success(toastMessages.registerSuccess);
        } catch (error) {
            if (!error.message.includes('Ошибка регистрации')) {
                showToast.error(toastMessages.networkError);
            }
            throw error;
        }
    };

    const logout = async () => {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include'
            });
            showToast.success(toastMessages.logoutSuccess);
        } catch (e) {
            console.error(e);
            showToast.error('Ошибка при выходе');
        }
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, login, register, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
