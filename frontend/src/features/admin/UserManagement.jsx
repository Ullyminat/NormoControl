import { useState, useEffect } from 'react';

function UserManagement() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = () => {
        fetch('http://localhost:8090/api/admin/users', { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                setUsers(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Вы уверены, что хотите удалить этого пользователя?')) return;

        try {
            const res = await fetch(`http://localhost:8090/api/admin/users/${id}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            if (res.ok) {
                setUsers(users.filter(u => u.id !== id));
            } else {
                alert('Ошибка удаления пользователя');
            }
        } catch (err) {
            console.error(err);
            alert('Ошибка сети');
        }
    };

    const filteredUsers = users.filter(user =>
        user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return <div className="container">Загрузка...</div>;

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem', borderBottom: '2px solid black', paddingBottom: '1rem' }}>
                <h1 className="text-huge" style={{ fontSize: '4rem', lineHeight: 0.9 }}>Пользователи.</h1>

                {/* Search Bar - Right Aligned */}
                <input
                    type="text"
                    placeholder="ПОИСК..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                        width: '300px',
                        padding: '0.8rem 1.2rem',
                        border: '1px solid black',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        fontFamily: 'Inter, sans-serif',
                        outline: 'none',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        background: 'white'
                    }}
                />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0', border: '1px solid black' }}>
                {/* Header Row */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 2fr 2fr 1fr 1fr 100px',
                    padding: '1rem 2rem',
                    borderBottom: '1px solid black',
                    background: '#F4F4F4',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    fontSize: '0.85rem',
                    letterSpacing: '0.05em'
                }}>
                    <div>ID</div>
                    <div>Имя</div>
                    <div>Email</div>
                    <div>Роль</div>
                    <div>Статус</div>
                    <div style={{ textAlign: 'right' }}>Действия</div>
                </div>

                {filteredUsers.map((user) => (
                    <div key={user.id} style={{
                        display: 'grid',
                        gridTemplateColumns: '80px 2fr 2fr 1fr 1fr 100px',
                        padding: '1.5rem 2rem',
                        borderBottom: '1px solid #E5E5E5',
                        alignItems: 'center',
                        background: 'white'
                    }}>
                        <div style={{ fontFamily: 'JetBrains Mono', fontSize: '0.9rem', color: '#888' }}>#{user.id}</div>
                        <div style={{ fontWeight: 600 }}>{user.full_name}</div>
                        <div style={{ color: '#555' }}>{user.email}</div>
                        <div>
                            <span style={{
                                padding: '4px 8px',
                                backgroundColor: user.role === 'teacher' ? '#E8F5E9' : user.role === 'admin' ? '#000' : '#E3F2FD',
                                color: user.role === 'teacher' ? '#008000' : user.role === 'admin' ? '#FFF' : '#1565C0',
                                fontSize: '0.75rem',
                                textTransform: 'uppercase',
                                fontWeight: 700,
                                border: `1px solid ${user.role === 'teacher' ? '#008000' : user.role === 'admin' ? '#000' : '#1565C0'}`
                            }}>
                                {user.role === 'teacher' ? 'Преподаватель' : user.role === 'admin' ? 'Админ' : 'Студент'}
                            </span>
                        </div>
                        <div>
                            {user.status === 'active' ? (
                                <span className="badge success">ACTIVE</span>
                            ) : (
                                <span className="badge error">INACTIVE</span>
                            )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <button
                                onClick={() => handleDelete(user.id)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#FF3B30', textTransform: 'uppercase', fontWeight: 700, fontSize: '0.8rem' }}
                            >
                                Удалить
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default UserManagement;
