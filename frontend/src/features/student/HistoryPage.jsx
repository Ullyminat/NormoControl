import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ReportModal from './components/ReportModal';

export default function HistoryPage() {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedItem, setSelectedItem] = useState(null); // Full detail object
    const [loadingDetail, setLoadingDetail] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        fetch('http://localhost:8080/api/history', { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                console.log('📊 History data received:', data);
                setHistory(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    const handleItemClick = async (id) => {
        setLoadingDetail(true);
        try {
            const res = await fetch(`http://localhost:8080/api/history/${id}`, { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setSelectedItem(data);
            } else {
                alert("Не удалось загрузить детали проверки.");
            }
        } catch (err) {
            console.error(err);
            alert("Ошибка сети.");
        } finally {
            setLoadingDetail(false);
        }
    };

    return (
        <div className="container">
            {/* Header */}
            <div style={{ marginBottom: '4rem', borderBottom: '2px solid black', paddingBottom: '2rem' }}>
                <h1 style={{ fontSize: '5rem', lineHeight: 0.9, marginBottom: '1rem' }}>История.</h1>
                <p style={{ fontSize: '1.25rem', color: 'var(--text-dim)' }}>Архив всех проведенных проверок</p>
            </div>

            {loading ? (
                <div style={{ textAlign: 'center', padding: '4rem' }}>
                    <div className="spinner" style={{ margin: '0 auto 1rem', borderColor: '#000', borderTopColor: 'transparent' }}></div>
                    <p>ЗАГРУЗКА ДАННЫХ...</p>
                </div>
            ) : history.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '6rem', border: '1px solid black' }}>
                    <p style={{ fontSize: '1.5rem', fontWeight: 600 }}>ИСТОРИЯ ПУСТА</p>
                    <p style={{ color: 'var(--text-dim)', marginTop: '0.5rem' }}>Вы еще не загружали работ на проверку.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0', border: '1px solid black' }}>
                    {/* Header Row */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', padding: '1rem 2rem', borderBottom: '1px solid black', background: '#F4F4F4', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '0.05em' }}>
                        <div>Документ</div>
                        <div>Дата</div>
                        <div>Результат</div>
                        <div>Статус</div>
                    </div>

                    {history.map(item => (
                        <div
                            key={item.id}
                            onClick={() => handleItemClick(item.id)}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '1.5fr 1fr 1fr 1fr',
                                padding: '1.5rem 2rem',
                                borderBottom: '1px solid #E5E5E5',
                                cursor: 'pointer',
                                transition: 'background 0.2s',
                                alignItems: 'center',
                                background: 'white'
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
                            onMouseLeave={e => e.currentTarget.style.background = 'white'}
                        >
                            <div style={{ fontWeight: 600 }}>{item.document_name}</div>
                            <div style={{ color: 'var(--text-dim)', fontFamily: 'JetBrains Mono', fontSize: '0.9rem' }}>
                                {new Date(item.check_date).toLocaleDateString()}
                            </div>
                            <div>
                                <span style={{
                                    fontWeight: 700,
                                    fontSize: '1.1rem',
                                    color: item.score >= 80 ? 'var(--success)' : item.score >= 50 ? 'var(--warning)' : 'var(--error)'
                                }}>
                                    {Math.round(item.score)}%
                                </span>
                            </div>
                            <div>
                                <span className={`badge ${item.status === 'checked' ? 'success' : 'warning'}`}>
                                    {item.status === 'checked' ? 'ПРОВЕРЕНО' : 'В РАБОТЕ'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Detail Viewer Modal */}
            <ReportModal
                isOpen={!!selectedItem}
                onClose={() => setSelectedItem(null)}
                documentName={selectedItem?.document_name}
                score={selectedItem?.score}
                contentJSON={selectedItem?.content_json}
                violations={selectedItem?.violations}
            />

            {loadingDetail && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(255,255,255,0.8)', zIndex: 999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div className="spinner"></div>
                </div>
            )}
        </div>
    );
}
