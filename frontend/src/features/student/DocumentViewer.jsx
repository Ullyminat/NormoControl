import { useState, useEffect, useRef, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

// PDF Text Extractor - ТОЧНЫЕ координаты через PDF.js API
import { getTextContentWithCoordinates, findTextItemByString, findTextItemByParagraph } from './utils/pdfTextExtractor';

// Fallback утилиты
import { isValidText } from './utils/textMatcher';
import { validatePosition, preventOverlap, optimizeMarkerPositions } from './utils/clusteringEngine';
import { extractParagraphNumber } from './utils/paragraphDetector';

// Конфигурация
import {
    ERROR_CATEGORIES,
    SWISS_COLORS,
    getCategoryConfig,
    getSeverityConfig,
    categorizeViolations,
    assessOverallSeverity,
    getFixSuggestions,
    generateSwissCSS
} from './utils/errorConfig';

// Worker setup
pdfjs.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs`;

export default function DocumentViewer({ file, contentJSON, violations }) {
    // Состояния
    const [pdfUrl, setPdfUrl] = useState(null);
    const [pdfDoc, setPdfDoc] = useState(null); // PDF document object
    const [numPages, setNumPages] = useState(null);
    const [selectedViolation, setSelectedViolation] = useState(null);
    const [hoveredViolation, setHoveredViolation] = useState(null);
    const [violationPositions, setViolationPositions] = useState({});
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Refs
    const containerRef = useRef(null);
    const pageRefs = useRef({}); // Store PDF page proxies

    // Парсинг PDF URL
    useEffect(() => {
        if (contentJSON) {
            try {
                const data = JSON.parse(contentJSON);
                if (data.pdf_url) {
                    setPdfUrl(`http://localhost:8080${data.pdf_url}`);
                }
            } catch (e) {
                console.error("Failed to parse contentJSON", e);
            }
        }
    }, [contentJSON]);

    // SINGLE SOURCE OF TRUTH для score
    const stats = useMemo(() => {
        const result = assessOverallSeverity(violations);
        console.log('📊 Score calculation:', result);
        return result;
    }, [violations]);

    // Авто-расчет позиций используя PDF.js getTextContent API
    const performPDFPositioning = async (pageNum, pageProxy, pageDiv) => {
        const pageViolations = getViolationsForPage(pageNum - 1);
        if (pageViolations.length === 0) return;

        const pageHeight = pageDiv.clientHeight || 1000;
        const viewport = pageProxy.getViewport({ scale: 1.0 });

        console.log(`🎯 PDF.js positioning ${pageViolations.length} violations on page ${pageNum}`);

        try {
            // Получаем ТОЧНЫЕ координаты текста через PDF.js
            const textItems = await getTextContentWithCoordinates(pageProxy, viewport);
            console.log(`  → Extracted ${textItems.length} text items from PDF.js`);

            const newPositions = {};

            pageViolations.forEach((v, index) => {
                let position = null;
                let method = 'unknown';

                // УРОВЕНЬ 1: Поиск по context_text через PDF.js textItems (100% точность)
                if (v.context_text && isValidText(v.context_text)) {
                    const textItem = findTextItemByString(textItems, v.context_text);
                    if (textItem) {
                        // Используем ТОЧНЫЕ координаты из PDF.js
                        const scale = pageDiv.clientWidth / viewport.width;
                        position = textItem.y * scale;
                        method = 'pdf.js_exact';
                    }
                }

                // УРОВЕНЬ 2: Поиск по номеру параграфа через PDF.js (90% точность)
                if (position === null) {
                    const paraNum = extractParagraphNumber(v.position_in_doc);
                    if (paraNum) {
                        const textItem = findTextItemByParagraph(textItems, paraNum);
                        if (textItem) {
                            const scale = pageDiv.clientWidth / viewport.width;
                            position = textItem.y * scale;
                            method = 'pdf.js_paragraph';
                        }
                    }
                }

                // УРОВЕНЬ 3: Fallback - интерполяция (50% точность)
                if (position === null) {
                    position = (pageHeight / (pageViolations.length + 1)) * (index + 1);
                    method = 'interpolation';
                }

                // Валидация границ
                position = validatePosition(position, pageHeight);

                const key = `${v.id}_${v.position_in_doc}`;
                newPositions[key] = position;

                console.log(`  → Violation ${index + 1}: ${method} → ${Math.round(position)}px`);
            });

            // Предотвращение наложения
            const optimized = optimizeMarkerPositions(pageViolations, newPositions, pageHeight);

            setViolationPositions(prev => ({ ...prev, ...optimized }));
            console.log(`✅ Positioned ${pageViolations.length} violations on page ${pageNum}`);

        } catch (error) {
            console.error(`❌ Error in PDF.js positioning for page ${pageNum}:`, error);
            // Fallback
            useFallbackPositioning(pageNum, pageViolations, pageHeight);
        }
    };

    // Fallback позиционирование
    const useFallbackPositioning = (pageNum, pageViolations, pageHeight) => {
        console.warn(`⚠️ Using fallback positioning for page ${pageNum}`);

        const newPositions = {};
        pageViolations.forEach((v, index) => {
            const position = (pageHeight / (pageViolations.length + 1)) * (index + 1);
            const key = `${v.id}_${v.position_in_doc}`;
            newPositions[key] = validatePosition(position, pageHeight);
        });

        const optimized = optimizeMarkerPositions(pageViolations, newPositions, pageHeight);
        setViolationPositions(prev => ({ ...prev, ...optimized }));
    };

    // Обработчик загрузки страницы
    const handlePageLoadSuccess = async (pageNum, page) => {
        // Сохраняем page proxy
        pageRefs.current[pageNum] = page;

        // Ждем пока DOM обновится
        setTimeout(async () => {
            const pageDiv = document.querySelector(`.react-pdf__Page[data-page-number="${pageNum}"]`);
            if (pageDiv && page) {
                await performPDFPositioning(pageNum, page, pageDiv);
            }
        }, 1000);
    };

    // Функция для загрузки документа
    function onDocumentLoadSuccess({ numPages }) {
        setNumPages(numPages);
        console.log(`📄 Document loaded: ${numPages} pages`);
    }

    // Сохраняем PDF document
    const onDocumentLoad = async (pdf) => {
        setPdfDoc(pdf);
    };

    // Получить ошибки для конкретной страницы
    const getViolationsForPage = (pageIndex) => {
        const pageNum = pageIndex + 1;
        return violations.filter(v => {
            const match = v.position_in_doc?.match(/Page (\d+)/);
            return match && parseInt(match[1]) === pageNum;
        });
    };

    // Категоризация и фильтрация
    const categorizedViolations = useMemo(() => {
        return categorizeViolations(violations);
    }, [violations]);

    // Сортировка и фильтрация
    const filteredAndSortedViolations = useMemo(() => {
        let filtered = [...violations];

        // Фильтр по категории
        if (selectedCategory !== 'all') {
            filtered = categorizedViolations[selectedCategory] || [];
        }

        // Поиск
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(v =>
                v.description?.toLowerCase().includes(query) ||
                v.position_in_doc?.toLowerCase().includes(query) ||
                v.expected_value?.toLowerCase().includes(query) ||
                v.actual_value?.toLowerCase().includes(query)
            );
        }

        // Сортировка по странице и позиции
        return filtered.sort((a, b) => {
            const pageA = a.position_in_doc?.match(/Page (\d+)/)?.[1] || 0;
            const pageB = b.position_in_doc?.match(/Page (\d+)/)?.[1] || 0;
            if (pageA !== pageB) return parseInt(pageA) - parseInt(pageB);
            const paraA = a.position_in_doc?.match(/Para (\d+)/)?.[1] || 0;
            const paraB = b.position_in_doc?.match(/Para (\d+)/)?.[1] || 0;
            return parseInt(paraA) - parseInt(paraB);
        });
    }, [violations, categorizedViolations, selectedCategory, searchQuery]);

    // Навигация между ошибками
    const currentViolationIndex = filteredAndSortedViolations.findIndex(v => v === selectedViolation);
    const hasNext = currentViolationIndex < filteredAndSortedViolations.length - 1;
    const hasPrevious = currentViolationIndex > 0;

    const navigateToNext = () => {
        if (hasNext) {
            const nextViolation = filteredAndSortedViolations[currentViolationIndex + 1];
            setSelectedViolation(nextViolation);
            scrollToViolation(nextViolation);
        }
    };

    const navigateToPrevious = () => {
        if (hasPrevious) {
            const prevViolation = filteredAndSortedViolations[currentViolationIndex - 1];
            setSelectedViolation(prevViolation);
            scrollToViolation(prevViolation);
        }
    };

    const scrollToViolation = (v) => {
        const marker = document.getElementById(`marker-${v.position_in_doc}`);
        if (marker) {
            marker.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    // Инъекция CSS
    useEffect(() => {
        const styleId = 'swiss-design-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = generateSwissCSS();
            document.head.appendChild(style);
        }
    }, []);

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 400px',
            height: '90vh',
            background: SWISS_COLORS.white,
            fontFamily: '-apple-system, "Helvetica Neue", Arial, sans-serif',
            color: SWISS_COLORS.black
        }}>
            {/* Основная область документа */}
            <div
                ref={containerRef}
                style={{
                    overflowY: 'auto',
                    background: SWISS_COLORS.gray100,
                    borderRight: `2px solid ${SWISS_COLORS.black}`,
                    display: 'flex',
                    justifyContent: 'center',
                    padding: '40px 20px'
                }}
                onClick={() => setSelectedViolation(null)}
            >
                <div style={{ position: 'relative', maxWidth: '850px' }}>
                    {pdfUrl ? (
                        <Document
                            file={pdfUrl}
                            onLoadSuccess={(pdf) => {
                                onDocumentLoadSuccess(pdf);
                                onDocumentLoad(pdf._pdfInfo);
                            }}
                            loading={<div style={{ padding: '40px', textAlign: 'center' }}>Загрузка...</div>}
                            error={<div style={{ padding: '40px', textAlign: 'center', color: SWISS_COLORS.red }}>Ошибка загрузки</div>}
                        >
                            {Array.from(new Array(numPages), (el, index) => {
                                const pageViolations = getViolationsForPage(index);

                                return (
                                    <div key={`page_${index + 1}`} style={{
                                        marginBottom: '30px',
                                        position: 'relative',
                                        boxShadow: `0 0 0 1px ${SWISS_COLORS.black}`,
                                        background: SWISS_COLORS.white
                                    }}>
                                        <Page
                                            pageNumber={index + 1}
                                            renderTextLayer={true}
                                            renderAnnotationLayer={false}
                                            width={850}
                                            onLoadSuccess={(page) => handlePageLoadSuccess(index + 1, page)}
                                        />

                                        {/* Маркеры */}
                                        <div
                                            id={`markers-container-${index + 1}`}
                                            style={{
                                                position: 'absolute',
                                                top: 0,
                                                right: -35,
                                                height: '100%',
                                                width: '30px'
                                            }}
                                        >
                                            {pageViolations.map((v, vIdx) => {
                                                const specificTop = violationPositions[`${v.id}_${v.position_in_doc}`];
                                                const topPos = specificTop !== undefined ? specificTop : (vIdx * 30 + 20);
                                                const severity = getSeverityConfig(v);
                                                const isHovered = hoveredViolation === v;
                                                const isSelected = selectedViolation === v;

                                                return (
                                                    <div
                                                        key={vIdx}
                                                        id={`marker-${v.position_in_doc}`}
                                                        style={{
                                                            position: 'absolute',
                                                            top: `${topPos}px`,
                                                            left: '5px',
                                                            width: '20px',
                                                            height: '20px',
                                                            background: isSelected ? SWISS_COLORS.black : SWISS_COLORS.white,
                                                            color: isSelected ? SWISS_COLORS.white : SWISS_COLORS.black,
                                                            border: `2px solid ${SWISS_COLORS.black}`,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontSize: '16px',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.15s ease',
                                                            transform: isHovered ? 'scale(1.3)' : 'scale(1)'
                                                        }}
                                                        onMouseEnter={() => setHoveredViolation(v)}
                                                        onMouseLeave={() => setHoveredViolation(null)}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedViolation(prev => prev === v ? null : v);
                                                        }}
                                                        title={v.description}
                                                    >
                                                        {severity.marker}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </Document>
                    ) : (
                        <div style={{ padding: '40px', textAlign: 'center' }}>
                            {!file ? "Выберите файл" : "Ожидание..."}
                        </div>
                    )}

                    {/* Карточка ошибки */}
                    {selectedViolation && (
                        <div
                            style={{
                                position: 'fixed',
                                bottom: '0',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                width: '600px',
                                maxWidth: '90%',
                                background: SWISS_COLORS.white,
                                border: `3px solid ${SWISS_COLORS.black}`,
                                padding: '24px',
                                zIndex: 1000
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    {getCategoryConfig(selectedViolation).name}
                                </div>
                                <button
                                    onClick={() => setSelectedViolation(null)}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        fontSize: '20px',
                                        cursor: 'pointer',
                                        padding: 0,
                                        lineHeight: 1
                                    }}
                                >
                                    ×
                                </button>
                            </div>

                            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', lineHeight: 1.4 }}>
                                {selectedViolation.description}
                            </div>

                            <div style={{ fontSize: '11px', marginBottom: '16px', color: SWISS_COLORS.gray500 }}>
                                {selectedViolation.position_in_doc}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px', padding: '12px 0', borderTop: `1px solid ${SWISS_COLORS.gray300}`, borderBottom: `1px solid ${SWISS_COLORS.gray300}` }}>
                                <div>
                                    <div style={{ fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px', color: SWISS_COLORS.gray500 }}>Ожидалось</div>
                                    <div style={{ fontSize: '14px', fontWeight: 600 }}>{selectedViolation.expected_value}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '10px', textTransform: 'uppercase', marginBottom: '4px', color: SWISS_COLORS.gray500 }}>Найдено</div>
                                    <div style={{ fontSize: '14px', fontWeight: 600 }}>{selectedViolation.actual_value}</div>
                                </div>
                            </div>

                            {getFixSuggestions(selectedViolation).length > 0 && (
                                <div style={{ marginBottom: '16px' }}>
                                    <div style={{ fontSize: '10px', textTransform: 'uppercase', marginBottom: '8px' }}>Исправление</div>
                                    {getFixSuggestions(selectedViolation).map((suggestion, i) => (
                                        <div key={i} style={{ fontSize: '12px', marginBottom: '4px' }}>
                                            {suggestion}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                <button
                                    onClick={navigateToPrevious}
                                    disabled={!hasPrevious}
                                    style={{
                                        padding: '8px 16px',
                                        background: hasPrevious ? SWISS_COLORS.black : SWISS_COLORS.gray300,
                                        color: SWISS_COLORS.white,
                                        border: 'none',
                                        cursor: hasPrevious ? 'pointer' : 'not-allowed',
                                        fontSize: '12px',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px'
                                    }}
                                >
                                    ← Пред.
                                </button>
                                <button
                                    onClick={navigateToNext}
                                    disabled={!hasNext}
                                    style={{
                                        padding: '8px 16px',
                                        background: hasNext ? SWISS_COLORS.black : SWISS_COLORS.gray300,
                                        color: SWISS_COLORS.white,
                                        border: 'none',
                                        cursor: hasNext ? 'pointer' : 'not-allowed',
                                        fontSize: '12px',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px'
                                    }}
                                >
                                    След. →
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Боковая панель */}
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: SWISS_COLORS.white }}>
                {/* Заголовок */}
                <div style={{ padding: '20px', borderBottom: `2px solid ${SWISS_COLORS.black}` }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
                        ОТЧЕТ
                    </div>
                    <div style={{ fontSize: '12px' }}>
                        {violations.length} нарушений
                    </div>
                </div>

                {violations.length === 0 ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px', textAlign: 'center' }}>
                        <div>
                            <div style={{ fontSize: '48px', marginBottom: '12px' }}>✓</div>
                            <div style={{ fontSize: '14px', fontWeight: 600 }}>Ошибок нет</div>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Статистика - передаем готовый stats */}
                        <div style={{ padding: '20px', borderBottom: `1px solid ${SWISS_COLORS.gray300}` }}>
                            <div style={{ fontSize: '10px', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '1px' }}>Оценка</div>
                            <div style={{ fontSize: '36px', fontWeight: 700, marginBottom: '8px' }}>
                                {stats.score}<span style={{ fontSize: '18px', fontWeight: 400 }}>/100</span>
                            </div>
                            <div style={{ width: '100%', height: '4px', background: SWISS_COLORS.gray300 }}>
                                <div style={{ width: `${stats.score}%`, height: '100%', background: SWISS_COLORS.black }} />
                            </div>
                        </div>

                        {/* Поиск */}
                        <div style={{ padding: '20px', borderBottom: `1px solid ${SWISS_COLORS.gray300}` }}>
                            <input
                                type="text"
                                placeholder="Поиск..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    border: `1px solid ${SWISS_COLORS.black}`,
                                    fontSize: '12px',
                                    outline: 'none'
                                }}
                            />
                        </div>

                        {/* Фильтры по категориям */}
                        <div style={{ padding: '20px', borderBottom: `1px solid ${SWISS_COLORS.gray300}` }}>
                            <div style={{ fontSize: '10px', textTransform: 'uppercase', marginBottom: '12px', letterSpacing: '1px' }}>Категории</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <button
                                    onClick={() => setSelectedCategory('all')}
                                    style={{
                                        padding: '8px 12px',
                                        background: selectedCategory === 'all' ? SWISS_COLORS.black : SWISS_COLORS.white,
                                        color: selectedCategory === 'all' ? SWISS_COLORS.white : SWISS_COLORS.black,
                                        border: `1px solid ${SWISS_COLORS.black}`,
                                        cursor: 'pointer',
                                        fontSize: '11px',
                                        textAlign: 'left',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.5px'
                                    }}
                                >
                                    Все ({violations.length})
                                </button>
                                {Object.entries(categorizedViolations).map(([key, viols]) => {
                                    const category = ERROR_CATEGORIES[key];
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => setSelectedCategory(key)}
                                            style={{
                                                padding: '8px 12px',
                                                background: selectedCategory === key ? SWISS_COLORS.black : SWISS_COLORS.white,
                                                color: selectedCategory === key ? SWISS_COLORS.white : SWISS_COLORS.black,
                                                border: `1px solid ${SWISS_COLORS.black}`,
                                                cursor: 'pointer',
                                                fontSize: '10px',
                                                textAlign: 'left',
                                                fontWeight: 600,
                                                letterSpacing: '0.3px'
                                            }}
                                        >
                                            {category.name} ({viols.length})
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Список ошибок */}
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            {filteredAndSortedViolations.length === 0 ? (
                                <div style={{ padding: '20px', textAlign: 'center', color: SWISS_COLORS.gray500 }}>
                                    {searchQuery ? 'Ничего не найдено' : 'Нет ошибок'}
                                </div>
                            ) : (
                                filteredAndSortedViolations.map((v, i) => {
                                    const isSelected = selectedViolation === v;
                                    const category = getCategoryConfig(v);

                                    return (
                                        <div
                                            key={i}
                                            onClick={() => {
                                                setSelectedViolation(v);
                                                scrollToViolation(v);
                                            }}
                                            style={{
                                                padding: '16px 20px',
                                                borderBottom: `1px solid ${SWISS_COLORS.gray300}`,
                                                background: isSelected ? SWISS_COLORS.gray100 : SWISS_COLORS.white,
                                                cursor: 'pointer',
                                                transition: 'background 0.15s ease'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = SWISS_COLORS.gray100}
                                            onMouseLeave={(e) => e.currentTarget.style.background = isSelected ? SWISS_COLORS.gray100 : SWISS_COLORS.white}
                                        >
                                            <div style={{ fontSize: '10px', marginBottom: '6px', letterSpacing: '0.5px', color: SWISS_COLORS.gray500, fontWeight: 600 }}>
                                                {category.name} • {v.position_in_doc}
                                            </div>
                                            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', lineHeight: 1.4 }}>
                                                {v.description}
                                            </div>
                                            <div style={{ fontSize: '11px', color: SWISS_COLORS.gray700 }}>
                                                {v.expected_value} → {v.actual_value}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
