import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import StandardEditor from './StandardEditor';
import { showToast, toastMessages } from '../../utils/toast';

export default function TeacherDashboard() {
    const navigate = useNavigate();
    const [isCreating, setIsCreating] = useState(false);
    const [editingStandard, setEditingStandard] = useState(null);
    const [standards, setStandards] = useState([]);

    useEffect(() => {
        if (!isCreating && !editingStandard) fetchStandards();
    }, [isCreating, editingStandard]);

    const fetchStandards = async () => {
        try {
            const res = await fetch('/api/standards', { credentials: 'include' });
            const data = await res.json();
            setStandards(data || []);
        } catch (err) {
            console.error(err);
            showToast.error(toastMessages.networkError);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Вы уверены, что хотите удалить этот стандарт?')) return;
        try {
            const res = await fetch(`/api/standards/${id}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            if (res.ok) {
                setStandards(standards.filter(s => s.id !== id));
                showToast.success(toastMessages.standardDeleted);
            } else {
                const data = await res.json();
                showToast.error(data.error || toastMessages.deleteError);
            }
        } catch (err) {
            console.error(err);
            showToast.error(toastMessages.networkError);
        }
    };

    if (isCreating || editingStandard) {
        return (
            <StandardEditor
                initialData={editingStandard}
                onCancel={() => { setIsCreating(false); setEditingStandard(null); }}
                onSuccess={() => { setIsCreating(false); setEditingStandard(null); }}
            />
        );
    }

    return (
        <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
            <div style={{ marginBottom: '4rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid black', paddingBottom: '2rem' }}>
                <div>
                    <h1 className="text-huge" style={{ fontSize: '4rem', lineHeight: 0.9, marginBottom: '1rem' }}>Стандарты.</h1>
                    <p style={{ fontSize: '1.25rem' }}>Управление нормами и правилами</p>
                </div>
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                        onClick={() => navigate('/check')}
                        className="btn"
                        style={{ height: '60px', background: 'white', color: 'black', border: '2px solid black', fontWeight: 800, padding: '0 2rem' }}
                    >
                        ПРОВЕРИТЬ ДОКУМЕНТ
                    </button>
                    <button
                        onClick={() => setIsCreating(true)}
                        className="btn btn-primary"
                        style={{ height: '60px' }}
                    >
                        + НОВЫЙ СТАНДАРТ
                    </button>
                </div>
            </div>

            <div className="grid-3" style={{ gap: '2rem' }}>
                {standards.map(s => (
                    <div key={s.id} className="card" style={{ padding: '0', border: '1px solid black' }}>
                        <div style={{ padding: '2rem', borderBottom: '1px solid black', background: '#fff' }}>
                            <h3 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{s.name}</h3>
                            <p style={{ fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.document_type}</p>
                        </div>
                        <div style={{ padding: '2rem', background: '#F4F4F4' }}>
                            <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)', marginBottom: '1.5rem' }}>
                                Модулей проверки: <b>{s.modules ? s.modules.length : 0}</b>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                <button
                                    className="btn-edit"
                                    onClick={() => setEditingStandard(s)}
                                    style={{
                                        width: '100%',
                                        background: 'white',
                                        border: '1px solid black',
                                        padding: '12px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        textTransform: 'uppercase'
                                    }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = 'black'; e.currentTarget.style.color = 'white'; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = 'white'; e.currentTarget.style.color = 'black'; }}
                                >
                                    РЕДАКТИРОВАТЬ
                                </button>
                                <button
                                    onClick={() => handleDelete(s.id)}
                                    style={{
                                        width: '100%',
                                        background: 'transparent',
                                        border: 'none',
                                        padding: '8px',
                                        color: '#FF3B30',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        textTransform: 'uppercase',
                                        fontSize: '0.8rem'
                                    }}
                                >
                                    УДАЛИТЬ
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {standards.length === 0 && (
                <div style={{ textAlign: 'center', padding: '6rem', border: '1px dashed black', color: 'var(--text-dim)' }}>
                    СПИСОК СТАНДАРТОВ ПУСТ
                </div>
            )}
        </div>
    );
}
