import { useState, useEffect } from 'react';

function StandardsManagement() {
    const [standards, setStandards] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('http://localhost:8090/api/standards', { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                setStandards(data || []);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    if (loading) return <div className="container">Загрузка...</div>;

    const handleDelete = async (id) => {
        if (!window.confirm('Вы уверены, что хотите удалить этот стандарт?')) return;

        try {
            const res = await fetch(`http://localhost:8080/api/standards/${id}`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (res.ok) {
                setStandards(standards.filter(s => s.id !== id));
            } else {
                alert('Не удалось удалить стандарт');
            }
        } catch (err) {
            console.error(err);
            alert('Ошибка сети');
        }
    };

    return (
        <div className="container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3rem' }}>
                <h1 className="text-huge" style={{ fontSize: '4rem' }}>Стандарты.</h1>
                {/* Add button removed as requested */}
            </div>

            <div className="grid-3" style={{ gap: '2rem' }}>
                {standards.map((std) => (
                    <div key={std.id} style={{
                        border: '2px solid black',
                        padding: '2rem',
                        background: 'white',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: '250px'
                    }}>
                        <div>
                            {/* Badge removed as requested */}
                            <h3 style={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.1, marginBottom: '1rem' }}>{std.name}</h3>
                            <p style={{ fontSize: '0.9rem', color: '#555', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                                {std.description}
                            </p>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid black' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                by {std.author_name}
                            </span>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <button
                                    onClick={() => handleDelete(std.id)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: 'pointer',
                                        color: '#FF3B30', // Red for delete
                                        textTransform: 'uppercase',
                                        fontWeight: 700,
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    УДАЛИТЬ
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}


export default StandardsManagement;
