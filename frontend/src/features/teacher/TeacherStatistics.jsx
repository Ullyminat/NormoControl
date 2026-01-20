import { useState, useEffect } from 'react';
import DocumentViewer from '../student/DocumentViewer';

export default function TeacherStatistics() {
    const [history, setHistory] = useState([]);
    const [selectedCheck, setSelectedCheck] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            const res = await fetch('http://localhost:8080/api/teacher/history', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setHistory(data || []);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleViewDetail = async (id) => {
        setDetailLoading(true);
        try {
            const res = await fetch(`http://localhost:8080/api/teacher/history/${id}`, { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setSelectedCheck(data);
            } else {
                alert('Не удалось загрузить детали');
            }
        } catch (err) {
            console.error(err);
        } finally {
            setDetailLoading(false);
        }
    };

    // Filter Logic
    const filteredHistory = history.filter(item => {
        const query = searchQuery.toLowerCase();
        return (item.student_name && item.student_name.toLowerCase().includes(query)) ||
            (item.standard_name && item.standard_name.toLowerCase().includes(query));
    });

    return (
        <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
            <div style={{ marginBottom: '4rem', borderBottom: '2px solid black', paddingBottom: '2rem' }}>
                <h2 className="text-huge" style={{ fontSize: '4rem', lineHeight: 0.9, marginBottom: '1rem' }}>Статистика.</h2>
                <p style={{ fontSize: '1.25rem', color: 'var(--text-dim)' }}>Результаты проверок студентов по вашим стандартам</p>
            </div>

            {/* Toolbar */}
            <div style={{ marginBottom: '2rem', display: 'flex' }}>
                <input
                    className="input-field"
                    placeholder="Поиск по студенту или стандарту..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ height: '50px', fontSize: '1.1rem', maxWidth: '400px' }}
                />
            </div>

            {/* Table */}
            <div style={{ border: '1px solid black' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 1fr 1fr', padding: '1rem', background: '#F4F4F4', fontWeight: 700, borderBottom: '1px solid black' }}>
                    <div>Студент</div>
                    <div>Стандарт</div>
                    <div>Дата</div>
                    <div>Оценка</div>
                    <div>Действие</div>
                </div>
                {filteredHistory.length > 0 ? filteredHistory.map(item => (
                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 1fr 1fr', padding: '1.5rem 1rem', borderBottom: '1px solid #EEE', alignItems: 'center', background: 'white' }}>
                        <div style={{ fontWeight: 600 }}>{item.student_name || 'Неизвестно'}</div>
                        <div>{item.standard_name}</div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>{new Date(item.check_date).toLocaleString()}</div>
                        <div>
                            <span style={{
                                padding: '4px 8px', borderRadius: '4px', fontWeight: 700,
                                background: item.score >= 80 ? '#E6F4EA' : (item.score >= 50 ? '#FEF7E0' : '#FCE8E6'),
                                color: item.score >= 80 ? '#137333' : (item.score >= 50 ? '#B06000' : '#C5221F')
                            }}>
                                {item.score}%
                            </span>
                        </div>
                        <div>
                            <button
                                onClick={() => handleViewDetail(item.id)}
                                className="btn"
                                style={{ padding: '6px 12px', fontSize: '0.8rem', border: '1px solid #CCC', background: 'white', cursor: 'pointer' }}
                            >
                                ОТЧЕТ
                            </button>
                        </div>
                    </div>
                )) : (
                    <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                        {searchQuery ? 'Ничего не найдено.' : 'Проверок пока не было.'}
                    </div>
                )}
            </div>

            {selectedCheck && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                    background: 'white', zIndex: 2000, padding: '2rem',
                    display: 'flex', flexDirection: 'column'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid black', paddingBottom: '1rem' }}>
                        <div>
                            <h2 style={{ color: 'black', margin: 0, fontSize: '1.5rem' }}>ОТЧЕТ</h2>
                            <p style={{ margin: 0, color: 'var(--text-dim)' }}>{selectedCheck.student_name} / {selectedCheck.standard_name}</p>
                        </div>
                        <button className="btn btn-ghost" onClick={() => setSelectedCheck(null)} style={{ fontSize: '1.5rem', padding: '0.5rem 1rem' }}>✕</button>
                    </div>
                    <DocumentViewer
                        contentJSON={selectedCheck.content_json}
                        violations={selectedCheck.violations}
                    />
                </div>
            )}
        </div>
    );
}
