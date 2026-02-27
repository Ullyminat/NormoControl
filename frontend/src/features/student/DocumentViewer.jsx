import { useState, useEffect, useRef, useMemo } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

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

// Точное позиционирование
import { findPreciseTextPosition, findAllViolationsOnPage } from './utils/preciseTextLocator';

import SlotCounter from '../../components/SlotCounter';

// Worker setup - use CDN to avoid Vite dev-server MIME issues
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.4.296/build/pdf.worker.min.mjs`;

export default function DocumentViewer({ file, contentJSON, violations, score: backendScore }) {
    const [pdfUrl, setPdfUrl] = useState(null);
    const [numPages, setNumPages] = useState(null);
    const [selectedViolation, setSelectedViolation] = useState(null);
    const [hoveredViolation, setHoveredViolation] = useState(null);
    const [violationPositions, setViolationPositions] = useState({});
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [tooltipState, setTooltipState] = useState({ visible: false, x: 0, y: 0, violation: null });

    const containerRef = useRef(null);

    const [pdfLoadTimeout, setPdfLoadTimeout] = useState(false);

    useEffect(() => {
        if (contentJSON) {
            try {
                const data = JSON.parse(contentJSON);
                if (data.pdf_url) {
                    setPdfUrl(`${data.pdf_url}`);
                    setPdfLoadTimeout(false);
                } else {
                    // pdf_url absent (LibreOffice conversion failed) — give up after 5s
                    const t = setTimeout(() => setPdfLoadTimeout(true), 5000);
                    return () => clearTimeout(t);
                }
            } catch (e) {
                console.error("Failed to parse contentJSON", e);
                setPdfLoadTimeout(true);
            }
        }
    }, [contentJSON]);

    // Use backend score if provided, otherwise calculate from violations (fallback)
    const stats = useMemo(() => {
        if (backendScore !== undefined && backendScore !== null) {
            // Use backend score as single source of truth
            const result = {
                score: Math.round(backendScore),
                critical: violations.filter(v => v.severity === 'critical').length,
                error: violations.filter(v => v.severity === 'error').length,
                warning: violations.filter(v => v.severity === 'warning').length,
                info: violations.filter(v => v.severity === 'info').length,
                total: violations.length
            };
            console.log('📊 Using backend score:', result);
            return result;
        }
        // Fallback: calculate from violations (for backward compatibility)
        const result = assessOverallSeverity(violations);
        console.log('📊 Calculated score from violations:', result);
        return result;
    }, [violations, backendScore]);

    // --- Глобальное позиционирование по номеру параграфа ---
    // Para N из max M → globalY = (N/M) × (numPages × PAGE_HEIGHT)
    // Это самый точный метод без чтения текста PDF
    const computeProportionalPositions = (currentNumPages) => {
        if (!violations || violations.length === 0 || !currentNumPages) return;

        // A4 при ширине 850px: 850 × (297/210) ≈ 1203px
        const PAGE_HEIGHT = 1203;
        const totalHeight = currentNumPages * PAGE_HEIGHT;

        // Находим максимальный номер параграфа (= длина документа в параграфах)
        let maxPara = 1;
        violations.forEach(v => {
            const match = v.position_in_doc?.match(/Para (\d+)/);
            if (match) maxPara = Math.max(maxPara, parseInt(match[1]));
        });

        const newPositions = {};

        violations.forEach(v => {
            const match = v.position_in_doc?.match(/Para (\d+)/);
            if (!match) return;

            const paraNum = parseInt(match[1]);

            // Глобальная Y-позиция в px от начала всего документа
            const globalY = (paraNum / maxPara) * totalHeight;

            // PDF-страница (1-indexed)
            const pdfPageNum = Math.min(currentNumPages, Math.max(1, Math.ceil(globalY / PAGE_HEIGHT)));

            // Y относительно этой страницы (с небольшим отступом сверху)
            const localY = Math.max(20, globalY - (pdfPageNum - 1) * PAGE_HEIGHT);

            const key = `${v.id}_${v.position_in_doc}`;
            newPositions[key] = {
                y: Math.round(localY),
                confidence: 0.9,
                method: 'para_global',
                foundPageNum: pdfPageNum
            };
        });

        setViolationPositions(newPositions);
        console.log(`📍 Para-mapped ${Object.keys(newPositions).length} violations across ${currentNumPages} pages (maxPara: ${maxPara})`);
    };

    // Ищет текст в слое и подсвечивает конкретные спаны + обновляет Y-позицию маркера
    const searchAndHighlightOnPage = (pageNum) => {
        const pageDiv = document.querySelector(`.react-pdf__Page[data-page-number="${pageNum}"]`);
        if (!pageDiv) return;
        const textLayer = pageDiv.querySelector('.react-pdf__Page__textContent');
        if (!textLayer) return;

        const allSpans = Array.from(textLayer.querySelectorAll('span'));
        if (allSpans.length === 0) return;

        const norm = (t) => t.toLowerCase().replace(/[^\wа-яё0-9]/gi, '');

        let fullText = '';
        const spanMap = [];
        allSpans.forEach(span => {
            const spanNorm = norm(span.textContent || '');
            if (!spanNorm) return;
            spanMap.push({ start: fullText.length, end: fullText.length + spanNorm.length, span });
            fullText += spanNorm;
        });

        if (!fullText) return;

        violations.forEach(v => {
            const key = `${v.id}_${v.position_in_doc}`;
            const pos = violationPositions[key];
            if (!pos || pos.foundPageNum !== pageNum) return;

            // Извлекаем текст из position_in_doc: "Page X, Para Y: <текст>..."
            const textMatch = v.position_in_doc?.match(/Para \d+:\s*(.+?)\.{0,3}$/);
            if (!textMatch || !textMatch[1]) return;

            const query = norm(textMatch[1]);
            if (query.length < 5) return;

            const idx = fullText.indexOf(query);
            if (idx === -1) return; // код/картинка — не найдено

            const matchEnd = idx + query.length;
            const matchingSpans = spanMap.filter(m => m.start < matchEnd && m.end > idx);
            if (matchingSpans.length === 0) return;

            const firstRect = matchingSpans[0].span.getBoundingClientRect();
            const pageRect = pageDiv.getBoundingClientRect();
            const spanY = firstRect.top - pageRect.top;
            if (spanY < 0) return;

            setViolationPositions(prev => ({
                ...prev,
                [key]: { ...prev[key], y: Math.round(spanY), method: 'text_exact', confidence: 0.97 }
            }));

            let bgColor = 'rgba(239,68,68,0.3)';
            if (v.severity === 'critical') bgColor = 'rgba(185,28,28,0.4)';
            else if (v.severity === 'warning') bgColor = 'rgba(245,158,11,0.3)';
            else if (v.severity === 'info') bgColor = 'rgba(59,130,246,0.3)';

            matchingSpans.forEach(({ span }) => {
                span.style.backgroundColor = bgColor;
                span.style.borderRadius = '3px';
                span.style.cursor = 'pointer';
                span.style.transition = 'background-color 0.2s';
                span.classList.add('violation-highlight');
                span.dataset.violationKey = key;
            });

            console.log(`✅ Page ${pageNum}: text highlight "${textMatch[1].slice(0, 30)}" at Y=${Math.round(spanY)}`);
        });
    };

    const handlePageLoadSuccess = (pageNum) => {
        let attempts = 0;
        const interval = setInterval(() => {
            attempts++;
            const pageDiv = document.querySelector(`.react-pdf__Page[data-page-number="${pageNum}"]`);
            const textLayer = pageDiv?.querySelector('.react-pdf__Page__textContent');
            const spans = textLayer?.querySelectorAll('span');
            const hasText = spans && Array.from(spans).some(s => s.textContent?.trim().length > 0);
            if (hasText) {
                clearInterval(interval);
                setTimeout(() => searchAndHighlightOnPage(pageNum), 200);
            } else if (attempts > 40) {
                clearInterval(interval);
            }
        }, 250);
    };

    function onDocumentLoadSuccess({ numPages }) {
        setNumPages(numPages);
        console.log(`📄 Document loaded: ${numPages} pages`);
    }

    // Реактивно пересчитываем позиции при изменении violations или numPages
    useEffect(() => {
        if (violations && violations.length > 0 && numPages) {
            computeProportionalPositions(numPages);
        }
    }, [violations, numPages]); // eslint-disable-line react-hooks/exhaustive-deps

    const getViolationsForPage = (pageIndex) => {
        const physicalPageNum = pageIndex + 1;
        return violations.filter(v => {
            const key = `${v.id}_${v.position_in_doc}`;
            const pos = violationPositions[key];
            return pos && pos.foundPageNum === physicalPageNum;
        });
    };

    const categorizedViolations = useMemo(() => {
        return categorizeViolations(violations);
    }, [violations]);

    const filteredAndSortedViolations = useMemo(() => {
        let filtered = [...violations];

        if (selectedCategory !== 'all') {
            filtered = categorizedViolations[selectedCategory] || [];
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(v =>
                v.description?.toLowerCase().includes(query) ||
                v.position_in_doc?.toLowerCase().includes(query) ||
                v.expected_value?.toLowerCase().includes(query) ||
                v.actual_value?.toLowerCase().includes(query)
            );
        }

        return filtered.sort((a, b) => {
            const pageA = a.position_in_doc?.match(/Page (\d+)/)?.[1] || 0;
            const pageB = b.position_in_doc?.match(/Page (\d+)/)?.[1] || 0;
            if (pageA !== pageB) return parseInt(pageA) - parseInt(pageB);
            const paraA = a.position_in_doc?.match(/Para (\d+)/)?.[1] || 0;
            const paraB = b.position_in_doc?.match(/Para (\d+)/)?.[1] || 0;
            return parseInt(paraA) - parseInt(paraB);
        });
    }, [violations, categorizedViolations, selectedCategory, searchQuery]);

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
                onMouseMove={(e) => {
                    const target = e.target;
                    if (target.classList && target.classList.contains('violation-highlight')) {
                        const vKey = target.dataset.violationKey;
                        const v = violations.find(vi => `${vi.id}_${vi.position_in_doc}` === String(vKey));
                        if (v) {
                            setHoveredViolation(v);
                            // Set tooltip slightly offset from cursor
                            setTooltipState({
                                visible: true,
                                x: e.clientX,
                                y: e.clientY + 20,
                                violation: v
                            });
                            // Make it slightly darker on hover
                            target.style.opacity = '0.8';
                        }
                    } else {
                        if (tooltipState.visible) {
                            setTooltipState({ ...tooltipState, visible: false });
                            setHoveredViolation(null);
                        }
                        // Reset opacity on previously hovered elements
                        const previouslyHovered = document.querySelectorAll('.violation-highlight[style*="opacity: 0.8"]');
                        previouslyHovered.forEach(el => el.style.opacity = '1');
                    }
                }}
                onMouseLeave={() => {
                    if (tooltipState.visible) {
                        setTooltipState({ ...tooltipState, visible: false });
                        setHoveredViolation(null);
                    }
                }}
                onClick={(e) => {
                    const target = e.target;
                    if (target.classList && target.classList.contains('violation-highlight')) {
                        const vKey = target.dataset.violationKey;
                        const v = violations.find(vi => `${vi.id}_${vi.position_in_doc}` === String(vKey));
                        if (v) {
                            setSelectedViolation(prev => prev === v ? null : v);
                            e.stopPropagation();
                            return;
                        }
                    }
                    setSelectedViolation(null);
                }}
            >
                <div style={{ position: 'relative', maxWidth: '850px' }}>
                    {pdfUrl ? (
                        <Document
                            file={pdfUrl}
                            onLoadSuccess={onDocumentLoadSuccess}
                            loading={<div style={{ padding: '40px', textAlign: 'center' }}>Загрузка...</div>}
                            error={<div style={{ padding: '40px', textAlign: 'center', color: SWISS_COLORS.red }}>Ошибка загрузки</div>}
                        >
                            {Array.from(new Array(numPages), (el, index) => {
                                const pageViolations = getViolationsForPage(index);
                                const isSelectedPage = selectedViolation &&
                                    pageViolations.some(v => v === selectedViolation);
                                const isHoveredPage = hoveredViolation &&
                                    pageViolations.some(v => v === hoveredViolation);
                                const hasErrors = pageViolations.some(v => v.severity === 'error' || v.severity === 'critical');
                                const hasWarnings = pageViolations.some(v => v.severity === 'warning');
                                const borderAccentColor = hasErrors ? '#ef4444' : hasWarnings ? '#f59e0b' : '#3b82f6';

                                return (
                                    <div key={`page_${index + 1}`} id={`pdf-page-${index + 1}`} style={{
                                        marginBottom: '30px',
                                        position: 'relative',
                                        boxShadow: isSelectedPage
                                            ? `0 0 0 3px ${borderAccentColor}, 0 4px 20px rgba(0,0,0,0.2)`
                                            : isHoveredPage
                                                ? `0 0 0 2px ${borderAccentColor}80`
                                                : `0 0 0 1px ${SWISS_COLORS.black}`,
                                        background: SWISS_COLORS.white,
                                        transition: 'box-shadow 0.25s ease',
                                    }}>
                                        <Page
                                            pageNumber={index + 1}
                                            renderTextLayer={true}
                                            renderAnnotationLayer={false}
                                            width={850}
                                            onLoadSuccess={() => {
                                                console.log(`[DEBUG PDF] 🔵 Page ${index + 1} metadata loaded`);
                                                handlePageLoadSuccess(index + 1);
                                            }}
                                        />

                                        {/* Индикатор ошибок уровня страницы — честный, без угадывания Y */}
                                        {pageViolations.length > 0 && (() => {
                                            const hasCritical = pageViolations.some(v => v.severity === 'critical');
                                            const hasError = pageViolations.some(v => v.severity === 'error');
                                            const hasWarning = pageViolations.some(v => v.severity === 'warning');
                                            const badgeColor = hasCritical ? '#b91c1c'
                                                : hasError ? '#ef4444'
                                                    : hasWarning ? '#f59e0b'
                                                        : '#3b82f6';

                                            return (
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        top: 0,
                                                        left: 0,
                                                        bottom: 0,
                                                        width: '4px',
                                                        background: badgeColor,
                                                        opacity: 0.75,
                                                        zIndex: 2,
                                                        pointerEvents: 'none',
                                                    }}
                                                />
                                            );
                                        })()}

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
                                                const positionData = violationPositions[`${v.id}_${v.position_in_doc}`];
                                                const topPos = positionData?.y !== undefined ? positionData.y : (vIdx * 30 + 20);
                                                const confidence = positionData?.confidence || 0.5;
                                                const method = positionData?.method || 'unknown';

                                                const severity = getSeverityConfig(v);
                                                const isHovered = hoveredViolation === v;
                                                const isSelected = selectedViolation === v;
                                                const isActive = isHovered || isSelected;

                                                return (
                                                    <div key={vIdx} id={`marker-${v.position_in_doc}`}>
                                                        {/* Горизонтальная линия-указатель */}
                                                        <div
                                                            style={{
                                                                position: 'absolute',
                                                                top: `${topPos}px`,
                                                                left: 0,
                                                                right: '25px',
                                                                height: '2px',
                                                                background: isActive
                                                                    ? `linear-gradient(to left, ${SWISS_COLORS.black} 0%, ${SWISS_COLORS.black} 60%, transparent 100%)`
                                                                    : 'transparent',
                                                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                                                opacity: isActive ? (confidence > 0.7 ? 1 : 0.5) : 0,
                                                                pointerEvents: 'none',
                                                                transformOrigin: 'right center',
                                                                transform: isActive ? 'scaleX(1)' : 'scaleX(0.3)'
                                                            }}
                                                        />

                                                        {/* Маркер */}
                                                        <div
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
                                                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                                transform: isHovered ? 'scale(1.3)' : 'scale(1)',
                                                                zIndex: isActive ? 10 : 1,
                                                                boxShadow: isActive ? `0 0 0 3px ${SWISS_COLORS.white}` : 'none'
                                                            }}
                                                            onMouseEnter={() => setHoveredViolation(v)}
                                                            onMouseLeave={() => setHoveredViolation(null)}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedViolation(prev => prev === v ? null : v);
                                                            }}
                                                            title={`${v.description}\n\nМетод: ${method}\nТочность: ${Math.round(confidence * 100)}%`}
                                                        >
                                                            {severity.marker}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })
                            }
                        </Document>
                    ) : (
                        <div style={{ padding: '40px', textAlign: 'center', color: SWISS_COLORS.gray500 }}>
                            {contentJSON && !pdfLoadTimeout ? (
                                <div>
                                    <div className="spinner" style={{ margin: '0 auto 1rem', borderColor: '#000', borderTopColor: 'transparent' }} />
                                    <div>Загрузка PDF...</div>
                                </div>
                            ) : (
                                <div>
                                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠</div>
                                    <div style={{ fontWeight: 600 }}>PDF недоступен</div>
                                    <div style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>Конвертация не удалась (LibreOffice)</div>
                                </div>
                            )}
                        </div>
                    )}

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

                    {tooltipState.visible && tooltipState.violation && (
                        <div
                            style={{
                                position: 'fixed',
                                top: tooltipState.y,
                                left: tooltipState.x,
                                // Offset a bit so the cursor isn't directly on top
                                transform: 'translate(10px, 10px)',
                                maxWidth: '350px',
                                background: SWISS_COLORS.white,
                                border: `2px solid ${SWISS_COLORS.black}`,
                                padding: '16px',
                                zIndex: 9999, /* High z-index to appear over everything */
                                pointerEvents: 'none', /* Let clicks pass through to the highlight span */
                                boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
                                transition: 'opacity 0.15s ease-out'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: '16px', height: '16px',
                                    background: getSeverityConfig(tooltipState.violation).color,
                                    color: SWISS_COLORS.white,
                                    fontSize: '10px',
                                    marginRight: '8px',
                                    borderRadius: '50%'
                                }}>
                                    {getSeverityConfig(tooltipState.violation).marker === '●' && tooltipState.violation.severity === 'critical' ? '!' : getSeverityConfig(tooltipState.violation).marker}
                                </span>
                                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    {getCategoryConfig(tooltipState.violation).name}
                                </div>
                            </div>
                            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', lineHeight: 1.3 }}>
                                {tooltipState.violation.description}
                            </div>
                            <div style={{ fontSize: '11px', color: SWISS_COLORS.gray500, fontStyle: 'italic' }}>
                                Нажмите на текст, чтобы посмотреть детали...
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Боковая панель */}
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: SWISS_COLORS.white }}>
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
                        <div style={{ padding: '20px', borderBottom: `1px solid ${SWISS_COLORS.gray300}` }}>
                            <div style={{ fontSize: '10px', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '1px' }}>Оценка</div>
                            <div style={{ fontSize: '36px', fontWeight: 700, marginBottom: '8px' }}>
                                <SlotCounter value={stats.score} /><span style={{ fontSize: '18px', fontWeight: 400 }}>/100</span>
                            </div>
                            <div style={{ width: '100%', height: '4px', background: SWISS_COLORS.gray300 }}>
                                <div style={{ width: `${stats.score}%`, height: '100%', background: SWISS_COLORS.black }} />
                            </div>
                        </div>

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
