import { useState, useEffect } from 'react';
import DocumentViewer from '../student/DocumentViewer';

export default function StudentDashboard() {
    const [standards, setStandards] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedStandard, setSelectedStandard] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 6;

    const [selectedType, setSelectedType] = useState('all');
    const [sortOrder, setSortOrder] = useState('newest');

    // Fetch Standards on Mount
    useEffect(() => {
        fetch('http://localhost:8080/api/standards', { credentials: 'include' })
            .then(res => res.json())
            .then(data => setStandards(data || []))
            .catch(err => console.error(err));
    }, []);

    // Filter Logic
    const filteredStandards = standards
        .filter(s => {
            const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (s.document_type && s.document_type.toLowerCase().includes(searchQuery.toLowerCase()));

            const matchesType = selectedType === 'all' || s.document_type === selectedType;

            return matchesSearch && matchesType;
        })
        .sort((a, b) => {
            if (sortOrder === 'newest') return new Date(b.created_at) - new Date(a.created_at);
            if (sortOrder === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
            if (sortOrder === 'name_asc') return a.name.localeCompare(b.name);
            return 0;
        });

    // Pagination Logic
    const totalPages = Math.ceil(filteredStandards.length / itemsPerPage);
    const paginatedStandards = filteredStandards.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Initial View: Selection
    if (!selectedStandard) {
        return (
            <div className="container">
                {/* Header */}
                <div style={{ marginBottom: '4rem', borderBottom: '2px solid black', paddingBottom: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                    <h1 className="text-huge" style={{ fontSize: '5rem', lineHeight: 0.9, marginBottom: '1rem' }}>Дашборд.</h1>
                    <p style={{ fontSize: '1.25rem', color: 'var(--text-dim)', maxWidth: '500px' }}>
                        Выберите стандарт для начала проверки.
                    </p>
                </div>

                {/* Toolbar */}
                <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '300px' }}>
                        <input
                            className="input-field"
                            placeholder="Поиск стандарта..."
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            style={{ height: '50px', fontSize: '1.2rem' }}
                        />
                    </div>
                    <div style={{ width: '200px' }}>
                        <select
                            className="input-field"
                            value={selectedType}
                            onChange={(e) => { setSelectedType(e.target.value); setCurrentPage(1); }}
                            style={{ height: '50px', background: 'white' }}
                        >
                            <option value="all">Все типы</option>
                            <option value="coursework">Курсовая</option>
                            <option value="thesis">Диплом</option>
                            <option value="report">Отчет</option>
                        </select>
                    </div>
                    <div style={{ width: '200px' }}>
                        <select
                            className="input-field"
                            value={sortOrder}
                            onChange={(e) => { setSortOrder(e.target.value); setCurrentPage(1); }}
                            style={{ height: '50px', background: 'white' }}
                        >
                            <option value="newest">Сначала новые</option>
                            <option value="oldest">Сначала старые</option>
                            <option value="name_asc">По названию (А-Я)</option>
                        </select>
                    </div>
                </div>

                {/* Grid */}
                {/* Grid */}
                {filteredStandards.length > 0 ? (
                    <div className="grid-3" style={{ gap: '2rem' }}>
                        {paginatedStandards.map(std => {
                            const isSelected = selectedStandard && selectedStandard.id === std.id;
                            return (
                                <div
                                    key={std.id}
                                    onClick={() => setSelectedStandard(std)}
                                    style={{
                                        border: '2px solid black',
                                        padding: '2rem',
                                        background: isSelected ? 'black' : 'white',
                                        color: isSelected ? 'white' : 'black',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                                        display: 'flex', flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        minHeight: '280px',
                                        position: 'relative'
                                    }}
                                >
                                    <div>
                                        <div style={{
                                            marginBottom: '0.5rem',
                                            opacity: isSelected ? 0.8 : 0.5,
                                            fontSize: '0.85rem',
                                            fontWeight: 700,
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em'
                                        }}>
                                            {std.document_type || 'Стандарт'}
                                        </div>
                                        <h3 style={{
                                            fontSize: '2rem',
                                            fontWeight: 800,
                                            lineHeight: 1.1,
                                            marginBottom: '0.5rem',
                                            wordBreak: 'break-word',
                                            color: isSelected ? 'white' : 'black'
                                        }}>
                                            {std.name}
                                        </h3>
                                        <div style={{
                                            fontSize: '0.75rem',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.05em',
                                            marginBottom: '1rem',
                                            color: isSelected ? 'rgba(255,255,255,0.7)' : '#888',
                                            fontWeight: 500
                                        }}>
                                            BY {std.author_name || 'SYSTEM'}
                                        </div>
                                    </div>

                                    <div style={{
                                        paddingTop: '1.5rem',
                                        borderTop: isSelected ? '1px solid rgba(255,255,255,0.2)' : '1px solid #000',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        marginTop: 'auto'
                                    }}>
                                        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                            {std.modules ? std.modules.length : 0} МОДУЛЕЙ
                                        </span>
                                        {isSelected && <span style={{ fontSize: '1.5rem' }}>●</span>}
                                        {!isSelected && <span style={{ fontSize: '1.5rem' }}>→</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ padding: '6rem', textAlign: 'center', border: '1px solid #EEE', color: 'var(--text-dim)' }}>
                        Стандарты не найдены.
                    </div>
                )}

                {/* Pagination */}
                {totalPages > 1 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '4rem' }}>
                        <button
                            disabled={currentPage === 1}
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            className="btn"
                            style={{ padding: '10px 20px', border: '1px solid #CCC' }}
                        >
                            ←
                        </button>
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                            <button
                                key={p}
                                onClick={() => setCurrentPage(p)}
                                style={{
                                    padding: '10px 20px',
                                    border: p === currentPage ? '2px solid black' : '1px solid #CCC',
                                    background: p === currentPage ? 'black' : 'white',
                                    color: p === currentPage ? 'white' : 'black',
                                    cursor: 'pointer',
                                    fontWeight: 700
                                }}
                            >
                                {p}
                            </button>
                        ))}
                        <button
                            disabled={currentPage === totalPages}
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            className="btn"
                            style={{ padding: '10px 20px', border: '1px solid #CCC' }}
                        >
                            →
                        </button>
                    </div>
                )}
            </div>
        );
    }

    // Detail View: Check Logic
    return (
        <div className="container">
            {/* Header / Back */}
            <div style={{ marginBottom: '3rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <button
                    onClick={() => setSelectedStandard(null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', padding: 0, width: 'fit-content' }}
                >
                    ← НАЗАД К СПИСКУ
                </button>
                <div style={{ borderBottom: '2px solid black', paddingBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                        <span style={{ fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent-primary)', letterSpacing: '0.05em' }}>
                            Выбранный стандарт
                        </span>
                        <h1 style={{ fontSize: '3rem', lineHeight: 1, marginTop: '0.5rem' }}>{selectedStandard.name}</h1>
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 500 }}>
                        {selectedStandard.document_type}
                    </div>
                </div>
            </div>

            {/* Modules Grid */}
            {selectedStandard.modules && selectedStandard.modules.length > 0 ? (
                <div className="grid-2" style={{ gap: '2rem' }}>
                    {selectedStandard.modules.map(module => (
                        <ModuleCard key={module.id} module={module} standardId={selectedStandard.id} />
                    ))}
                </div>
            ) : (
                <div style={{ padding: '4rem', textAlign: 'center', border: '1px dashed #CCC' }}>
                    В этом стандарте пока нет модулей проверки.
                </div>
            )}
        </div>
    );
}

function ModuleCard({ module, standardId }) {
    const [status, setStatus] = useState('idle');
    const [result, setResult] = useState(null);
    const [showPreview, setShowPreview] = useState(false);

    const [selectedFile, setSelectedFile] = useState(null);

    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setSelectedFile(file); // Store file for viewer
        setStatus('uploading');
        const formData = new FormData();
        formData.append('document', file);
        formData.append('config', JSON.stringify(module.config));
        formData.append('standard_id', standardId);

        try {
            const res = await fetch('http://localhost:8080/api/check', {
                method: 'POST',
                body: formData,
                credentials: 'include'
            });
            const data = await res.json();
            if (res.ok) {
                setResult(data);
                setStatus('checked');
            } else {
                alert(data.error || 'Ошибка проверки');
                setStatus('error');
            }
        } catch (err) {
            console.error(err);
            setStatus('error');
            alert('Ошибка сети');
        }
    };

    return (
        <div style={{ border: '1px solid black', padding: '2rem', background: 'white', display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem' }}>{module.name}</h3>
                <p style={{ color: 'var(--text-dim)' }}>Модуль автоматической проверки</p>
            </div>

            {status === 'idle' || status === 'error' ? (
                <div
                    className="upload-zone"
                    onClick={() => document.getElementById(`file-${module.id}`).click()}
                    style={{ border: '2px dashed #CCC', padding: '2rem', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: '#FAFAFA' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'black'; e.currentTarget.style.background = '#FFF'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#CCC'; e.currentTarget.style.background = '#FAFAFA'; }}
                >
                    <input id={`file-${module.id}`} type="file" onChange={handleFileSelect} hidden accept=".docx" />
                    <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>📄</div>
                    <div style={{ fontWeight: 600 }}>Загрузить .docx</div>
                </div>
            ) : status === 'uploading' ? (
                <div style={{ padding: '2rem', textAlign: 'center', background: '#FAFAFA' }}>
                    <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
                    <div>Проверка...</div>
                </div>
            ) : (
                <div>
                    <div style={{ padding: '1.5rem', background: '#F4F4F4', marginBottom: '1rem' }}>
                        <div style={{ fontSize: '0.9rem', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Результат</div>
                        <div style={{ fontSize: '3rem', fontWeight: 800, lineHeight: 1 }}>{result.score}%</div>
                    </div>
                    <button
                        className="btn btn-primary"
                        style={{ width: '100%' }}
                        onClick={() => setShowPreview(true)}
                    >
                        СМОТРЕТЬ ОТЧЕТ
                    </button>
                    <button
                        onClick={() => { setStatus('idle'); setResult(null); setSelectedFile(null); }}
                        style={{ width: '100%', marginTop: '0.5rem', background: 'none', border: 'none', padding: '1rem', cursor: 'pointer', textDecoration: 'underline' }}
                    >
                        Проверить другой файл
                    </button>
                </div>
            )}

            {showPreview && result && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                    background: 'white', zIndex: 2000, padding: '2rem',
                    display: 'flex', flexDirection: 'column'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid black', paddingBottom: '1rem' }}>
                        <div>
                            <h2 style={{ color: 'black', margin: 0, fontSize: '1.5rem' }}>ОТЧЕТ: {module.name}</h2>
                            <span style={{
                                fontWeight: 700, fontSize: '1.2rem',
                                color: result.score >= 80 ? 'var(--success)' : result.score >= 50 ? 'var(--warning)' : 'var(--error)'
                            }}>
                                Оценка: {result.score.toFixed(0)}/100
                            </span>
                        </div>
                        <button className="btn btn-ghost" onClick={() => setShowPreview(false)} style={{ fontSize: '1.5rem', padding: '0.5rem 1rem' }}>✕</button>
                    </div>
                    <DocumentViewer
                        file={selectedFile}
                        contentJSON={result.content_json}
                        violations={result.violations}
                    />
                </div>
            )}
        </div>
    );
}
