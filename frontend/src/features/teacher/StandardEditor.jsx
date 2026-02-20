import { useState, useRef } from 'react';
import { showToast, toastMessages } from '../../utils/toast';

export default function StandardEditor({ onCancel, onSuccess, initialData = null }) {
    const [formData, setFormData] = useState(initialData ? {
        ...initialData,
        // Ensure modules are deep copied or at least exist
        modules: initialData.modules || []
    } : {
        name: '',
        description: '',
        document_type: 'coursework',
        modules: []
    });

    const [activeModuleId, setActiveModuleId] = useState(null);
    const [activeTab, setActiveTab] = useState('page'); // page, font, typography, paragraph
    const fileInputRef = useRef(null);
    const [loadingExtract, setLoadingExtract] = useState(false);

    // Helper to get active module
    const activeModule = formData.modules.find(m => m.id === activeModuleId);

    const addModule = () => {
        const newId = Date.now().toString();
        setFormData(prev => ({
            ...prev,
            modules: [...prev.modules, {
                id: newId,
                name: 'Новый Модуль',
                config: {
                    margins: { top: 20, bottom: 20, left: 30, right: 10, tolerance: 2.5 },
                    page_setup: { orientation: 'portrait' },
                    header_footer: { header_dist: 12.5, footer_dist: 12.5 },
                    font: { name: 'Times New Roman', size: 14 },
                    typography: { forbid_bold: false, forbid_italic: false, forbid_underline: false, forbid_all_caps: false },
                    paragraph: { line_spacing: 1.5, alignment: 'justify', first_line_indent: 12.5 },
                    structure: { heading_1_start_new_page: true, heading_hierarchy: true, list_alignment: 'left', verify_toc: false },
                    images: { caption_position: 'bottom', alignment: 'center' },
                    references: { required: true, title_keyword: 'Список литературы' },
                    scope: { start_page: 1, min_pages: 0, max_pages: 0, forbidden_words: '' },
                    tables: { caption_position: 'top', alignment: 'center', require_caption: false, caption_keyword: 'Таблица', caption_dash_format: false, require_borders: false, require_header_row: false, min_row_height_mm: 0, max_width_pct: 0 },
                    formulas: { alignment: 'center', require_numbering: false, numbering_position: 'right', numbering_format: '(1)' }
                }
            }]
        }));
        setActiveModuleId(newId);
    };

    const removeModule = (id, e) => {
        e.stopPropagation();
        setFormData(prev => ({
            ...prev,
            modules: prev.modules.filter(m => m.id !== id)
        }));
        if (activeModuleId === id) setActiveModuleId(null);
    };

    const applyEskdPreset = () => {
        if (!activeModuleId) return;
        setFormData(prev => ({
            ...prev,
            modules: prev.modules.map(m => m.id !== activeModuleId ? m : {
                ...m,
                config: {
                    ...m.config,
                    font: { ...m.config.font, name: 'Times New Roman', size: 14 },
                    paragraph: { ...m.config.paragraph, line_spacing: 1.5, first_line_indent: 12.5, alignment: 'justify' },
                    tables: {
                        caption_position: 'top', alignment: 'left',
                        require_caption: true, caption_keyword: 'Таблица',
                        caption_dash_format: true,
                        require_borders: true, require_header_row: false,
                        min_row_height_mm: 8, max_width_pct: 0
                    },
                    formulas: {
                        alignment: 'center',
                        require_numbering: true,
                        numbering_position: 'right',
                        numbering_format: '(1)'
                    }
                }
            })
        }));
    };

    const updateModuleConfig = (section, field, value) => {
        setFormData(prev => ({
            ...prev,
            modules: prev.modules.map(m => {
                if (m.id === activeModuleId) {
                    return {
                        ...m,
                        config: {
                            ...m.config,
                            [section]: {
                                ...m.config[section],
                                [field]: value
                            }
                        }
                    };
                }
                return m;
            })
        }));
    };

    const updateActiveModuleName = (name) => {
        setFormData(prev => ({
            ...prev,
            modules: prev.modules.map(m => m.id === activeModuleId ? { ...m, name } : m)
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            showToast.warning('Введите название стандарта');
            return;
        }
        if (formData.modules.length === 0) {
            showToast.warning('Добавьте хотя бы один модуль');
            return;
        }

        try {
            const url = initialData
                ? `/api/standards/${initialData.id}`
                : '/api/standards';

            const method = initialData ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
                credentials: 'include'
            });
            if (res.ok) {
                showToast.success(initialData ? toastMessages.standardUpdated : toastMessages.standardCreated);
                onSuccess();
            } else {
                const txt = await res.text();
                showToast.error('Ошибка: ' + txt);
            }
        } catch (err) {
            console.error(err);
            showToast.error(toastMessages.networkError);
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setLoadingExtract(true);
        showToast.info('Анализ документа...');
        const data = new FormData();
        data.append('document', file);

        try {
            const res = await fetch('/api/standards/extract', {
                method: 'POST',
                body: data,
                credentials: 'include'
            });
            const result = await res.json();

            if (result.config) {
                setFormData(prev => ({
                    ...prev,
                    modules: prev.modules.map(m => {
                        if (m.id === activeModuleId) {
                            // Merge detected config with defaults if needed
                            return {
                                ...m,
                                config: { ...m.config, ...result.config }
                            };
                        }
                        return m;
                    })
                }));
                showToast.success('Настройки успешно извлечены из файла!');
            } else {
                showToast.error('Не удалось извлечь настройки');
            }
        } catch (err) {
            console.error(err);
            showToast.error('Ошибка анализа файла');
        } finally {
            setLoadingExtract(false);
        }
    };

    return (
        <div className="grid-sidebar" style={{ background: 'white', margin: '4rem auto', width: '100%', height: '80vh', border: '1px solid black', display: 'grid', gridTemplateColumns: '300px 1fr' }}>
            {/* Sidebar */}
            <div style={{ borderRight: '1px solid black', display: 'flex', flexDirection: 'column', background: '#FAFAFA' }}>
                <div style={{ padding: '2rem', borderBottom: '1px solid black' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem' }}>КОНФИГУРАТОР</h3>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase' }}>Название стандарта</label>
                        <input className="input-field" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="ГОСТ 2024" style={{ background: 'white', paddingLeft: '0.5rem' }} />
                    </div>
                    <div>
                        <label style={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase' }}>Тип документа</label>
                        <select className="input-field" value={formData.document_type} onChange={e => setFormData({ ...formData, document_type: e.target.value })} style={{ background: 'white', paddingLeft: '0.5rem' }}>
                            <option value="coursework">Курсовая</option>
                            <option value="thesis">Диплом</option>
                            <option value="report">Отчет</option>
                        </select>
                    </div>
                </div>

                <div style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <label style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>МОДУЛИ</label>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            {activeModuleId && (
                                <button
                                    onClick={applyEskdPreset}
                                    title="Применить параметры ЕСКД"
                                    style={{ padding: '4px 8px', background: '#1a1a1a', color: 'white', border: 'none', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', letterSpacing: '0.05em' }}
                                >
                                    ЕСКД
                                </button>
                            )}
                            <button
                                onClick={addModule}
                                className="btn"
                                style={{ padding: '4px 10px', background: 'black', color: 'white', border: 'none', fontSize: '1rem', lineHeight: 1 }}>
                                +
                            </button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {formData.modules.map(m => (
                            <div
                                key={m.id}
                                onClick={() => setActiveModuleId(m.id)}
                                style={{
                                    padding: '16px',
                                    background: activeModuleId === m.id ? 'white' : 'transparent',
                                    color: 'black',
                                    border: '1px solid #E5E5E5',
                                    borderLeft: activeModuleId === m.id ? '4px solid var(--accent-primary)' : '1px solid #E5E5E5',
                                    cursor: 'pointer',
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    fontSize: '0.9rem',
                                    fontWeight: activeModuleId === m.id ? 700 : 500,
                                    boxShadow: activeModuleId === m.id ? '0 4px 12px rgba(0,0,0,0.05)' : 'none',
                                    transition: 'all 0.2s'
                                }}
                            >
                                <span>{m.name}</span>
                                <span onClick={(e) => removeModule(m.id, e)} style={{ opacity: 0.5, fontSize: '1.2rem', lineHeight: 0.7, color: 'var(--text-dim)' }}>×</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div style={{ padding: '1.5rem 1rem', borderTop: '1px solid black', display: 'flex', gap: '0.5rem', background: 'white' }}>
                    <button type="button" onClick={onCancel} className="btn btn-ghost" style={{ flex: 1, textTransform: 'uppercase', justifyContent: 'center', padding: '10px' }}>Отмена</button>
                    <button type="button" onClick={handleSubmit} className="btn btn-primary" style={{ flex: 1, textTransform: 'uppercase', justifyContent: 'center', padding: '10px' }}>Сохранить</button>
                </div>
            </div>

            {/* Editor Area */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, background: 'white' }}>
                {activeModule ? (
                    <>
                        {/* Header */}
                        <div style={{ padding: '2rem 3rem', borderBottom: '1px solid black', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ flex: 1, marginRight: '2rem' }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-dim)', marginBottom: '0.5rem', display: 'block' }}>НАЗВАНИЕ МОДУЛЯ</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <input
                                        value={activeModule.name}
                                        onChange={e => updateActiveModuleName(e.target.value)}
                                        className="input-field"
                                        style={{ fontSize: '1.5rem', padding: '0.5rem', background: '#FAFAFA', border: '1px solid #CCC', borderRadius: '4px', fontWeight: 700 }}
                                    />
                                    <span style={{ fontSize: '1.5rem', opacity: 0.3 }}>✎</span>
                                </div>
                            </div>
                            <div>
                                <input type="file" ref={fileInputRef} hidden accept=".docx" onChange={handleFileUpload} />
                                <button
                                    className="btn"
                                    onClick={() => fileInputRef.current.click()}
                                    disabled={loadingExtract}
                                    style={{ background: 'var(--accent-primary)', color: 'white', border: 'none', fontWeight: '700', padding: '12px 24px', textTransform: 'uppercase' }}>
                                    {loadingExtract ? 'ЗАГРУЗКА...' : 'ИМПОРТ ИЗ .DOCX'}
                                </button>
                            </div>
                        </div>

                        {/* Split Layout: Config Sidebar | Content */}
                        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', flex: 1, overflow: 'hidden' }}>
                            {/* Inner Sidebar (Categories) */}
                            <div style={{ background: '#FAFAFA', borderRight: '1px solid black', overflowY: 'auto' }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    {[
                                        { id: 'page', l: 'Разметка' },
                                        { id: 'header_footer', l: 'Колонтитулы' },
                                        { id: 'font', l: 'Шрифт' },
                                        { id: 'typography', l: 'Типографика' },
                                        { id: 'paragraph', l: 'Абзац' },
                                        { id: 'structure', l: 'Структура' },
                                        { id: 'images', l: 'Рисунки' },
                                        { id: 'tables', l: 'Таблицы' },
                                        { id: 'formulas', l: 'Формулы' },
                                        { id: 'references', l: 'Библиография' },
                                        { id: 'scope', l: 'Область' }
                                    ].map(tab => (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            style={{
                                                background: activeTab === tab.id ? 'white' : 'transparent',
                                                border: 'none',
                                                borderRight: activeTab === tab.id ? 'none' : '1px solid transparent', // Trick for clean merge
                                                borderBottom: '1px solid #E5E5E5',
                                                textAlign: 'left',
                                                padding: '16px 20px',
                                                cursor: 'pointer',
                                                fontSize: '0.9rem',
                                                fontWeight: activeTab === tab.id ? 700 : 500,
                                                color: activeTab === tab.id ? 'black' : 'var(--text-dim)',
                                                position: 'relative',
                                            }}
                                        >
                                            {activeTab === tab.id && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', background: 'var(--accent-primary)' }} />}
                                            {tab.l}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Config Content Area */}
                            <div style={{ padding: '3rem', overflowY: 'auto' }}>

                                {activeTab === 'header_footer' && (
                                    <div className="grid-2">
                                        <div>
                                            <label>От края до верхнего колонтитула (мм)</label>
                                            <input
                                                className="input-field"
                                                type="number" step="0.1"
                                                value={activeModule.config.header_footer?.header_dist?.toFixed(1) || 12.5}
                                                onChange={e => updateModuleConfig('header_footer', 'header_dist', parseFloat(e.target.value))}
                                            />
                                        </div>
                                        <div>
                                            <label>От края до нижнего колонтитула (мм)</label>
                                            <input
                                                className="input-field"
                                                type="number" step="0.1"
                                                value={activeModule.config.header_footer?.footer_dist?.toFixed(1) || 12.5}
                                                onChange={e => updateModuleConfig('header_footer', 'footer_dist', parseFloat(e.target.value))}
                                            />
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'page' && (
                                    <>
                                        <div style={{ marginBottom: '2rem' }}>
                                            <label>Ориентация страницы</label>
                                            <select
                                                className="input-field"
                                                value={activeModule.config.page_setup?.orientation || 'portrait'}
                                                onChange={e => updateModuleConfig('page_setup', 'orientation', e.target.value)}
                                                style={{ width: '300px' }}
                                            >
                                                <option value="portrait">Книжная (Portrait)</option>
                                                <option value="landscape">Альбомная (Landscape)</option>
                                            </select>
                                        </div>
                                        <h4 style={{ fontSize: '0.9rem', textTransform: 'uppercase', color: 'black', marginBottom: '1.5rem', fontWeight: 700 }}>Поля (мм)</h4>
                                        <div className="grid-2" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem' }}>
                                            {[{ k: 'top', l: 'Верхнее' }, { k: 'bottom', l: 'Нижнее' }, { k: 'left', l: 'Левое' }, { k: 'right', l: 'Правое' }].map(pos => (
                                                <div key={pos.k}>
                                                    <label>{pos.l}</label>
                                                    <input
                                                        className="input-field"
                                                        type="number" step="0.1"
                                                        value={activeModule.config.margins[pos.k]?.toFixed(1)}
                                                        onChange={e => updateModuleConfig('margins', pos.k, parseFloat(e.target.value))}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {activeTab === 'font' && (
                                    <div className="grid-2">
                                        <div>
                                            <label>Название шрифта</label>
                                            <input
                                                className="input-field"
                                                value={activeModule.config.font.name}
                                                onChange={e => updateModuleConfig('font', 'name', e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label>Размер (pt)</label>
                                            <input
                                                className="input-field"
                                                type="number" step="0.5"
                                                value={activeModule.config.font.size}
                                                onChange={e => updateModuleConfig('font', 'size', parseFloat(e.target.value))}
                                            />
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'typography' && (
                                    <div>
                                        <p style={{ color: 'var(--text-dim)', marginBottom: '2rem', fontSize: '1rem', maxWidth: '600px', lineHeight: 1.5, textAlign: 'center', margin: '0 auto 2rem' }}>
                                            Выделите параметры, которые <b style={{ color: 'black' }}>категорически запрещены</b> в данном модуле.<br />Нарушение этих правил приведет к снижению оценки.
                                        </p>
                                        <div className="grid-2">
                                            {[
                                                { k: 'forbid_bold', l: 'Запретить Жирный (Bold)' },
                                                { k: 'forbid_italic', l: 'Запретить Курсив (Italic)' },
                                                { k: 'forbid_underline', l: 'Запретить Подчеркивание' },
                                                { k: 'forbid_all_caps', l: 'Запретить CAPS LOCK' }
                                            ].map(item => (
                                                <div key={item.k}
                                                    onClick={() => updateModuleConfig('typography', item.k, !activeModule.config.typography?.[item.k])}
                                                    style={{
                                                        padding: '1.5rem',
                                                        border: activeModule.config.typography?.[item.k] ? '2px solid var(--error)' : '1px solid #E5E5E5',
                                                        background: activeModule.config.typography?.[item.k] ? '#FFF5F5' : 'white',
                                                        cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    <span style={{ fontWeight: 600, color: activeModule.config.typography?.[item.k] ? 'var(--error)' : 'black' }}>{item.l}</span>
                                                    <span style={{ fontWeight: 700, fontSize: '0.8rem', color: activeModule.config.typography?.[item.k] ? 'var(--error)' : 'var(--text-dim)' }}>
                                                        {activeModule.config.typography?.[item.k] ? 'ЗАПРЕЩЕНО' : 'РАЗРЕШЕНО'}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'paragraph' && (
                                    <div className="grid-3">
                                        <div>
                                            <label>Межстрочный интервал</label>
                                            <input
                                                className="input-field"
                                                type="number" step="0.01"
                                                value={activeModule.config.paragraph.line_spacing?.toFixed(2)}
                                                onChange={e => updateModuleConfig('paragraph', 'line_spacing', parseFloat(e.target.value))}
                                            />
                                        </div>
                                        <div>
                                            <label>Отступ первой строки (мм)</label>
                                            <input
                                                className="input-field"
                                                type="number" step="0.1"
                                                value={activeModule.config.paragraph.first_line_indent?.toFixed(1)}
                                                onChange={e => updateModuleConfig('paragraph', 'first_line_indent', parseFloat(e.target.value))}
                                            />
                                        </div>
                                        <div>
                                            <label>Выравнивание</label>
                                            <select
                                                className="input-field"
                                                value={activeModule.config.paragraph.alignment}
                                                onChange={e => updateModuleConfig('paragraph', 'alignment', e.target.value)}
                                            >
                                                <option value="justify">По ширине (Justify)</option>
                                                <option value="left">По левому (Left)</option>
                                                <option value="center">По центру (Center)</option>
                                                <option value="right">По правому (Right)</option>
                                            </select>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'structure' && (
                                    <div>
                                        <p style={{ color: 'var(--text-dim)', marginBottom: '1.5rem', fontSize: '0.9rem', textAlign: 'center' }}>
                                            Настройки структуры и иерархии документа.
                                        </p>
                                        <div className="grid-2">
                                            {[
                                                { k: 'heading_1_start_new_page', l: 'Заголовок 1 с новой страницы' },
                                                { k: 'heading_hierarchy', l: 'Строгая иерархия (1→2→3)' },
                                            ].map(item => (
                                                <div key={item.k}
                                                    onClick={() => updateModuleConfig('structure', item.k, !activeModule.config.structure?.[item.k])}
                                                    style={{
                                                        padding: '1.5rem',
                                                        border: activeModule.config.structure?.[item.k] ? '2px solid black' : '1px solid #CCC',
                                                        background: activeModule.config.structure?.[item.k] ? 'white' : '#FAFAFA',
                                                        cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                        position: 'relative',
                                                        userSelect: 'none'
                                                    }}
                                                >
                                                    <span style={{ fontWeight: 600, color: activeModule.config.structure?.[item.k] ? 'black' : 'var(--text-dim)' }}>{item.l}</span>

                                                    {/* Toggle Switch */}
                                                    <div style={{
                                                        width: '44px', height: '24px', flexShrink: 0, // Prevent squishing
                                                        background: activeModule.config.structure?.[item.k] ? 'black' : '#DDD',
                                                        borderRadius: '24px', position: 'relative', transition: 'background 0.2s'
                                                    }}>
                                                        <div style={{
                                                            width: '20px', height: '20px', background: 'white', borderRadius: '50%',
                                                            position: 'absolute', top: '2px', left: activeModule.config.structure?.[item.k] ? '22px' : '2px',
                                                            transition: 'left 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)',
                                                            boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                                                        }} />
                                                    </div>
                                                </div>
                                            ))}
                                            <div
                                                onClick={() => updateModuleConfig('structure', 'verify_toc', !activeModule.config.structure?.verify_toc)}
                                                style={{
                                                    marginTop: '1.5rem',
                                                    padding: '1.5rem',
                                                    border: activeModule.config.structure?.verify_toc ? '2px solid black' : '1px solid #CCC',
                                                    background: activeModule.config.structure?.verify_toc ? 'white' : '#FAFAFA',
                                                    cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    userSelect: 'none'
                                                }}
                                            >
                                                <span style={{ fontWeight: 600 }}>Сверять Оглавление (TOC)</span>
                                                <div style={{
                                                    width: '44px', height: '24px', flexShrink: 0,
                                                    background: activeModule.config.structure?.verify_toc ? 'black' : '#DDD',
                                                    borderRadius: '24px', position: 'relative', transition: 'background 0.2s'
                                                }}>
                                                    <div style={{
                                                        width: '20px', height: '20px', background: 'white', borderRadius: '50%',
                                                        position: 'absolute', top: '2px', left: activeModule.config.structure?.verify_toc ? '22px' : '2px',
                                                        transition: 'left 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)',
                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                                                    }} />
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ marginTop: '2rem' }}>
                                            <label>Выравнивание списков</label>
                                            <select
                                                className="input-field"
                                                value={activeModule.config.structure?.list_alignment || 'left'}
                                                onChange={e => updateModuleConfig('structure', 'list_alignment', e.target.value)}
                                                style={{ width: '300px' }}
                                            >
                                                <option value="left">Слева (Left)</option>
                                                <option value="justify">По ширине (Justify)</option>
                                            </select>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'images' && (
                                    <div className="grid-2">
                                        <div>
                                            <label>Положение подписи</label>
                                            <select
                                                className="input-field"
                                                value={activeModule.config.images?.caption_position || 'bottom'}
                                                onChange={e => updateModuleConfig('images', 'caption_position', e.target.value)}
                                            >
                                                <option value="bottom">Снизу (Bottom)</option>
                                                <option value="top">Сверху (Top)</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label>Выравнивание</label>
                                            <select
                                                className="input-field"
                                                value={activeModule.config.images?.alignment || 'center'}
                                                onChange={e => updateModuleConfig('images', 'alignment', e.target.value)}
                                            >
                                                <option value="center">По центру (Center)</option>
                                                <option value="left">Слева (Left)</option>
                                            </select>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'tables' && (
                                    <div>
                                        <p style={{ color: 'var(--text-dim)', marginBottom: '1.5rem', fontSize: '0.9rem', textAlign: 'center' }}>
                                            Настройки оформления таблиц в документе.
                                        </p>

                                        {/* Row 1: Alignment + Caption Position */}
                                        <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
                                            <div>
                                                <label>Выравнивание таблицы</label>
                                                <select
                                                    className="input-field"
                                                    value={activeModule.config.tables?.alignment || 'center'}
                                                    onChange={e => updateModuleConfig('tables', 'alignment', e.target.value)}
                                                >
                                                    <option value="center">По центру (Center)</option>
                                                    <option value="left">Слева (Left)</option>
                                                    <option value="right">Справа (Right)</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label>Положение подписи</label>
                                                <select
                                                    className="input-field"
                                                    value={activeModule.config.tables?.caption_position || 'top'}
                                                    onChange={e => updateModuleConfig('tables', 'caption_position', e.target.value)}
                                                >
                                                    <option value="top">Сверху (Top)</option>
                                                    <option value="bottom">Снизу (Bottom)</option>
                                                    <option value="none">Не проверять</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* Row 2: Caption keyword + Max width */}
                                        <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
                                            <div>
                                                <label>Ключевое слово подписи</label>
                                                <input
                                                    className="input-field"
                                                    value={activeModule.config.tables?.caption_keyword || 'Таблица'}
                                                    onChange={e => updateModuleConfig('tables', 'caption_keyword', e.target.value)}
                                                    placeholder="Таблица"
                                                />
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>Текст перед номером (напр. «Таблица» или «Table»)</span>
                                            </div>
                                            <div>
                                                <label>Макс. ширина таблицы (%)</label>
                                                <input
                                                    className="input-field"
                                                    type="number" min="0" max="100" step="5"
                                                    value={activeModule.config.tables?.max_width_pct || 0}
                                                    onChange={e => updateModuleConfig('tables', 'max_width_pct', parseInt(e.target.value) || 0)}
                                                />
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>0 = не проверять</span>
                                            </div>
                                        </div>

                                        {/* Toggles */}
                                        <div className="grid-2">
                                            {[
                                                { k: 'require_caption', l: 'Требовать подпись', hint: 'Каждая таблица должна иметь подпись' },
                                                { k: 'require_borders', l: 'Требовать рамки', hint: 'Таблица должна иметь видимые границы' },
                                                { k: 'require_header_row', l: 'Требовать строку заголовка', hint: 'Первая строка — заголовок (Header Row)' },
                                                { k: 'caption_dash_format', l: 'Формат ESKD «Таблица N – Название»', hint: 'В подписи должно быть тире (– или —)' },
                                            ].map(item => (
                                                <div key={item.k}
                                                    onClick={() => updateModuleConfig('tables', item.k, !activeModule.config.tables?.[item.k])}
                                                    style={{
                                                        padding: '1.5rem',
                                                        border: activeModule.config.tables?.[item.k] ? '2px solid black' : '1px solid #CCC',
                                                        background: activeModule.config.tables?.[item.k] ? 'white' : '#FAFAFA',
                                                        cursor: 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                        userSelect: 'none', gap: '1rem'
                                                    }}
                                                >
                                                    <div>
                                                        <div style={{ fontWeight: 600, color: activeModule.config.tables?.[item.k] ? 'black' : 'var(--text-dim)' }}>{item.l}</div>
                                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '2px' }}>{item.hint}</div>
                                                    </div>
                                                    <div style={{
                                                        width: '44px', height: '24px', flexShrink: 0,
                                                        background: activeModule.config.tables?.[item.k] ? 'black' : '#DDD',
                                                        borderRadius: '24px', position: 'relative', transition: 'background 0.2s'
                                                    }}>
                                                        <div style={{
                                                            width: '20px', height: '20px', background: 'white', borderRadius: '50%',
                                                            position: 'absolute', top: '2px',
                                                            left: activeModule.config.tables?.[item.k] ? '22px' : '2px',
                                                            transition: 'left 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)',
                                                            boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                                                        }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Min row height */}
                                        <div style={{ marginTop: '1.5rem' }}>
                                            <label>Мин. высота строки (мм)</label>
                                            <input
                                                className="input-field"
                                                type="number" min="0" max="50" step="0.5"
                                                value={activeModule.config.tables?.min_row_height_mm || 0}
                                                onChange={e => updateModuleConfig('tables', 'min_row_height_mm', parseFloat(e.target.value) || 0)}
                                                style={{ maxWidth: '180px' }}
                                            />
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>0 = не проверять · ЕСКД = 8 мм</span>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'formulas' && (
                                    <div>
                                        <p style={{ color: 'var(--text-dim)', marginBottom: '1.5rem', fontSize: '0.9rem', textAlign: 'center' }}>
                                            Настройки оформления формул в документе.
                                        </p>

                                        {/* Row 1: Alignment */}
                                        <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
                                            <div>
                                                <label>Выравнивание формул</label>
                                                <select
                                                    className="input-field"
                                                    value={activeModule.config.formulas?.alignment || 'center'}
                                                    onChange={e => updateModuleConfig('formulas', 'alignment', e.target.value)}
                                                >
                                                    <option value="center">По центру (Center)</option>
                                                    <option value="left">Слева (Left)</option>
                                                    <option value="right">Справа (Right)</option>
                                                    <option value="group">Группой (centerGroup)</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label>Формат нумерации</label>
                                                <select
                                                    className="input-field"
                                                    value={activeModule.config.formulas?.numbering_format || '(1)'}
                                                    onChange={e => updateModuleConfig('formulas', 'numbering_format', e.target.value)}
                                                    disabled={!activeModule.config.formulas?.require_numbering}
                                                    style={{ opacity: activeModule.config.formulas?.require_numbering ? 1 : 0.5 }}
                                                >
                                                    <option value="(1)">(1) — порядковый</option>
                                                    <option value="(1.1)">(1.1) — раздел.номер</option>
                                                    <option value="(Г.1)">(Г.1) — глава.номер</option>
                                                    <option value="(А.1)">(А.1) — приложение</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* Row 2: Numbering position */}
                                        <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
                                            <div>
                                                <label>Позиция номера</label>
                                                <select
                                                    className="input-field"
                                                    value={activeModule.config.formulas?.numbering_position || 'right'}
                                                    onChange={e => updateModuleConfig('formulas', 'numbering_position', e.target.value)}
                                                    disabled={!activeModule.config.formulas?.require_numbering}
                                                    style={{ opacity: activeModule.config.formulas?.require_numbering ? 1 : 0.5 }}
                                                >
                                                    <option value="right">Справа (Right)</option>
                                                    <option value="left">Слева (Left)</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* Toggle: require numbering */}
                                        <div
                                            onClick={() => updateModuleConfig('formulas', 'require_numbering', !activeModule.config.formulas?.require_numbering)}
                                            style={{
                                                padding: '1.5rem',
                                                border: activeModule.config.formulas?.require_numbering ? '2px solid black' : '1px solid #CCC',
                                                background: activeModule.config.formulas?.require_numbering ? 'white' : '#FAFAFA',
                                                cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                userSelect: 'none'
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontWeight: 600, color: activeModule.config.formulas?.require_numbering ? 'black' : 'var(--text-dim)' }}>Требовать нумерацию формул</div>
                                                <div style={{ fontSize: '0.78rem', color: 'var(--text-dim)', marginTop: '2px' }}>Каждая формула должна иметь порядковый номер</div>
                                            </div>
                                            <div style={{
                                                width: '44px', height: '24px', flexShrink: 0,
                                                background: activeModule.config.formulas?.require_numbering ? 'black' : '#DDD',
                                                borderRadius: '24px', position: 'relative', transition: 'background 0.2s'
                                            }}>
                                                <div style={{
                                                    width: '20px', height: '20px', background: 'white', borderRadius: '50%',
                                                    position: 'absolute', top: '2px',
                                                    left: activeModule.config.formulas?.require_numbering ? '22px' : '2px',
                                                    transition: 'left 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)',
                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                                                }} />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'references' && (
                                    <div className="grid-2">
                                        <div onClick={() => updateModuleConfig('references', 'required', !activeModule.config.references?.required)}
                                            style={{
                                                padding: '1.5rem',
                                                border: activeModule.config.references?.required ? '2px solid black' : '1px solid #CCC',
                                                borderRadius: '4px',
                                                background: activeModule.config.references?.required ? 'white' : '#FAFAFA',
                                                cursor: 'pointer',
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                userSelect: 'none'
                                            }}
                                        >
                                            <span style={{ fontWeight: 600 }}>Требовать список литературы</span>
                                            <div style={{
                                                width: '44px', height: '24px', flexShrink: 0, // Prevent squishing
                                                background: activeModule.config.references?.required ? 'black' : '#DDD',
                                                borderRadius: '24px', position: 'relative', transition: 'background 0.2s'
                                            }}>
                                                <div style={{
                                                    width: '20px', height: '20px', background: 'white', borderRadius: '50%',
                                                    position: 'absolute', top: '2px', left: activeModule.config.references?.required ? '22px' : '2px',
                                                    transition: 'left 0.2s cubic-bezier(0.4, 0.0, 0.2, 1)',
                                                    boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                                                }} />
                                            </div>
                                        </div>
                                        <div>
                                            <label>Ключевое слово заголовка</label>
                                            <input
                                                className="input-field"
                                                value={activeModule.config.references?.title_keyword || ''}
                                                onChange={e => updateModuleConfig('references', 'title_keyword', e.target.value)}
                                                placeholder="Список литературы"
                                            />
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'scope' && (
                                    <div>
                                        <p style={{ color: 'var(--text-dim)', marginBottom: '2rem', fontSize: '0.9rem' }}>
                                            Настройка области проверки и ограничений.
                                        </p>
                                        <div className="grid-3" style={{ marginBottom: '2rem' }}>
                                            <div>
                                                <label>Начать с (стр)</label>
                                                <input
                                                    className="input-field"
                                                    type="number" min="1"
                                                    value={activeModule.config.scope?.start_page || 1}
                                                    onChange={e => updateModuleConfig('scope', 'start_page', parseInt(e.target.value))}
                                                />
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Пропуск титульных</span>
                                            </div>
                                            <div>
                                                <label>Мин. страниц</label>
                                                <input
                                                    className="input-field"
                                                    type="number" min="0"
                                                    value={activeModule.config.scope?.min_pages || 0}
                                                    onChange={e => updateModuleConfig('scope', 'min_pages', parseInt(e.target.value))}
                                                />
                                            </div>
                                            <div>
                                                <label>Макс. страниц</label>
                                                <input
                                                    className="input-field"
                                                    type="number" min="0"
                                                    value={activeModule.config.scope?.max_pages || 0}
                                                    onChange={e => updateModuleConfig('scope', 'max_pages', parseInt(e.target.value))}
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label>Запрещенные слова / фразы</label>
                                            <textarea
                                                className="input-field"
                                                value={activeModule.config.scope?.forbidden_words || ''}
                                                onChange={e => updateModuleConfig('scope', 'forbidden_words', e.target.value)}
                                                placeholder="Введите слова через запятую: я считаю, очевидно, таким образом"
                                                style={{ height: '120px', resize: 'none', lineHeight: 1.5 }}
                                            />
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '0.5rem', display: 'block' }}>Перечислите через запятую. Регистр не важен.</span>
                                        </div>
                                    </div>
                                )}

                                {activeTab === 'introduction' && (
                                    <div>
                                        <p style={{ color: 'var(--text-dim)', marginBottom: '2rem', fontSize: '0.9rem' }}>
                                            Настройки проверки объема введения. <br />Страницы считаются от заголовка "Введение" до следующего заголовка того же уровня.
                                        </p>
                                        <div className="grid-2">
                                            <div>
                                                <label>Мин. страниц</label>
                                                <input
                                                    className="input-field"
                                                    type="number" min="0"
                                                    value={activeModule.config.introduction?.min_pages || 0}
                                                    onChange={e => updateModuleConfig('introduction', 'min_pages', parseInt(e.target.value))}
                                                />
                                            </div>
                                            <div>
                                                <label>Макс. страниц</label>
                                                <input
                                                    className="input-field"
                                                    type="number" min="0"
                                                    value={activeModule.config.introduction?.max_pages || 0}
                                                    onChange={e => updateModuleConfig('introduction', 'max_pages', parseInt(e.target.value))}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}

                            </div>
                        </div>
                    </>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-dim)', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ fontSize: '3rem', opacity: 0.1 }}>←</div>
                        <p>Выберите модуль в меню слева или создайте новый</p>
                    </div>
                )}
            </div>
        </div >
    );
}
