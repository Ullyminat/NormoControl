import { createContext, useContext, useState, useEffect } from 'react';

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
            const res = await fetch('http://localhost:8080/api/auth/me', {
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
        const res = await fetch('http://localhost:8080/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
            credentials: 'include' // Important for setting the cookie!
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Ошибка входа');

        // Backend set the cookie. We just set the user.
        setUser(data.user);
    };

    const register = async (email, password, fullName, role) => {
        const res = await fetch('http://localhost:8080/api/auth/register', {
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
        if (!res.ok) throw new Error(data.error || 'Ошибка регистрации');
    };

    const logout = async () => {
        try {
            await fetch('http://localhost:8080/api/auth/logout', {
                method: 'POST',
                credentials: 'include'
            });
        } catch (e) {
            console.error(e);
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
