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
import { chooseBestPagesForViolations, getViolationKey, getViolationPage, locateViolationsOnPage } from './utils/pdfViolationLocator';

import SlotCounter from '../../components/SlotCounter';

// Worker setup - use CDN to avoid Vite dev-server MIME issues
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@5.4.296/build/pdf.worker.min.mjs`;

import { showToast } from '../../utils/toast';

export default function DocumentViewer({ file, contentJSON, violations: propViolations, score: backendScore }) {
    const [pdfUrl, setPdfUrl] = useState(null);
    const [numPages, setNumPages] = useState(null);
    const [selectedViolation, setSelectedViolation] = useState(null);
    const [hoveredViolation, setHoveredViolation] = useState(null);
    const [violationPositions, setViolationPositions] = useState({});
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [tooltipState, setTooltipState] = useState({ visible: false, x: 0, y: 0, violation: null });
    const [resolvedViolationPages, setResolvedViolationPages] = useState({});

    const [isAIVerifying, setIsAIVerifying] = useState(false);
    const [isAIHovered, setIsAIHovered] = useState(false);
    const [localViolations, setLocalViolations] = useState(propViolations || []);

    // Sync local violations when props change
    useEffect(() => {
        setLocalViolations(propViolations || []);
    }, [propViolations]);

    const handleAIVerify = async (violationId) => {
        setIsAIVerifying(true);
        try {
            const res = await fetch(`/api/ai/verify/${violationId}`, {
                method: 'POST',
                credentials: 'include'
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.details || errorData.error || 'AI Verification failed');
            }

            const data = await res.json();

            // Update local state
            setLocalViolations(prev => prev.map(v =>
                v.id === violationId
                    ? { ...v, ai_verified: true, ai_explanation: data.explanation, is_doubtful: !data.is_valid, suggestion: data.suggestion }
                    : v
            ));

            // Also update selected violation if it's the one we just verified
            if (selectedViolation && selectedViolation.id === violationId) {
                setSelectedViolation(prev => ({
                    ...prev,
                    ai_verified: true,
                    ai_explanation: data.explanation,
                    is_doubtful: !data.is_valid,
                    suggestion: data.suggestion
                }));
            }

            showToast.success('ИИ-экспертиза завершена');
        } catch (error) {
            console.error(error);
            showToast.error(`Ошибка ИИ: ${error.message || 'Проверьте API ключ'}`);
        } finally {
            setIsAIVerifying(false);
        }
    };

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
                critical: localViolations.filter(v => v.severity === 'critical').length,
                error: localViolations.filter(v => v.severity === 'error').length,
                warning: localViolations.filter(v => v.severity === 'warning').length,
                info: localViolations.filter(v => v.severity === 'info').length,
                total: localViolations.length
            };
            console.log('📊 Using backend score:', result);
            return result;
        }
        // Fallback: calculate from violations (for backward compatibility)
        const result = assessOverallSeverity(localViolations);
        console.log('📊 Calculated score from violations:', result);
        return result;
    }, [localViolations, backendScore]);

    // --- Глобальное позиционирование по номеру параграфа ---
    // Para N из max M → globalY = (N/M) × (numPages × PAGE_HEIGHT)
    // Это самый точный метод без чтения текста PDF
    const handlePageLoadSuccess = async (pageNum) => {
        const pageDiv = document.querySelector(`.react-pdf__Page[data-page-number="${pageNum}"]`);
        const pageViolations = localViolations.filter(v => getViolationPage(v) === pageNum);
        const results = await locateViolationsOnPage(pageNum, pageDiv, pageViolations);

        setViolationPositions(prev => ({
            ...prev,
            ...results
        }));
    };

    function onDocumentLoadSuccess({ numPages }) {
        setNumPages(numPages);
        console.log(`📄 Document loaded: ${numPages} pages`);
    }

    // Реактивно пересчитываем позиции при изменении violations или numPages
    useEffect(() => {
        setViolationPositions({});
        setResolvedViolationPages({});
    }, [localViolations, pdfUrl]);

    useEffect(() => {
        if (!numPages || !localViolations.length) return;

        let cancelled = false;
        const locateRenderedPages = async () => {
            const nextPositions = {};

            const pageMap = await chooseBestPagesForViolations(numPages, localViolations);
            if (cancelled) return;
            setResolvedViolationPages(pageMap);

            for (let pageNum = 1; pageNum <= numPages; pageNum++) {
                const pageDiv = document.querySelector(`.react-pdf__Page[data-page-number="${pageNum}"]`);
                const pageViolations = localViolations.filter(v => (pageMap[getViolationKey(v)] || getViolationPage(v)) === pageNum);
                if (!pageDiv || pageViolations.length === 0) continue;

                const results = await locateViolationsOnPage(pageNum, pageDiv, pageViolations);
                Object.assign(nextPositions, results);
            }

            if (!cancelled && Object.keys(nextPositions).length > 0) {
                setViolationPositions(nextPositions);
            }
        };

        locateRenderedPages();
        return () => {
            cancelled = true;
        };
    }, [localViolations, numPages, pdfUrl]);

    const getViolationsForPage = (pageIndex) => {
        const physicalPageNum = pageIndex + 1;
        return localViolations.filter(v => {
            const resolvedPage = resolvedViolationPages[getViolationKey(v)];
            if (resolvedPage) return resolvedPage === physicalPageNum;
            if (getViolationPage(v) === physicalPageNum) return true;
            const key = getViolationKey(v);
            const pos = violationPositions[key];
            return pos && pos.foundPageNum === physicalPageNum;
        });
    };

    const categorizedViolations = useMemo(() => {
        return categorizeViolations(localViolations);
    }, [localViolations]);

    const filteredAndSortedViolations = useMemo(() => {
        let filtered = [...localViolations];

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
    }, [localViolations, categorizedViolations, selectedCategory, searchQuery]);

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
        const marker = document.getElementById(`marker-${getViolationKey(v)}`);
        if (marker) {
            marker.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        const resolvedPage = resolvedViolationPages[getViolationKey(v)] || getViolationPage(v);
        if (resolvedPage) {
            const page = document.getElementById(`pdf-page-${resolvedPage}`);
            if (page) {
                page.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
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

    useEffect(() => {
        const styleId = 'active-violation-highlight-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .violation-highlight-selected {
                    background-color: rgba(255, 214, 10, 0.92) !important;
                    outline: none !important;
                    box-shadow: inset 0 -0.32em 0 rgba(0,0,0,0.32), 0 0 18px rgba(255, 214, 10, 0.72) !important;
                    border-radius: 4px !important;
                    color: #000 !important;
                    mix-blend-mode: normal !important;
                    opacity: 1 !important;
                    z-index: 8 !important;
                    position: relative !important;
                }
                .violation-highlight-selected[data-violation-severity="critical"],
                .violation-highlight-selected[data-violation-severity="error"] {
                    background-color: rgba(255, 77, 77, 0.9) !important;
                    box-shadow: inset 0 -0.32em 0 rgba(0,0,0,0.32), 0 0 18px rgba(255, 77, 77, 0.7) !important;
                }
                .violation-highlight-selected[data-violation-severity="warning"] {
                    background-color: rgba(255, 214, 10, 0.94) !important;
                    box-shadow: inset 0 -0.32em 0 rgba(0,0,0,0.32), 0 0 18px rgba(255, 214, 10, 0.72) !important;
                }
                .violation-highlight-selected[data-violation-severity="info"] {
                    background-color: rgba(56, 189, 248, 0.86) !important;
                    box-shadow: inset 0 -0.32em 0 rgba(0,0,0,0.3), 0 0 18px rgba(56, 189, 248, 0.65) !important;
                }
            `;
            document.head.appendChild(style);
        }
    }, []);

    useEffect(() => {
        document.querySelectorAll('.violation-highlight-selected').forEach(el => {
            el.classList.remove('violation-highlight-selected');
        });

        if (!selectedViolation) return;

        const selectedKey = getViolationKey(selectedViolation);
        document.querySelectorAll('.violation-highlight').forEach(el => {
            if (el.dataset.violationKey === selectedKey) {
                el.classList.add('violation-highlight-selected');
            }
        });
    }, [selectedViolation, violationPositions, resolvedViolationPages]);

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
                        const v = localViolations.find(vi => getViolationKey(vi) === String(vKey));
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
                        const v = localViolations.find(vi => getViolationKey(vi) === String(vKey));
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
                                                const positionData = violationPositions[getViolationKey(v)];
                                                const topPos = positionData?.markerY ?? positionData?.y ?? (vIdx * 30 + 20);
                                                const confidence = positionData?.confidence || 0.5;
                                                const method = positionData?.method || 'unknown';

                                                const severity = getSeverityConfig(v);
                                                const isHovered = hoveredViolation === v;
                                                const isSelected = selectedViolation === v;
                                                const isActive = isHovered || isSelected;

                                                return (
                                                    <div key={vIdx} id={`marker-${getViolationKey(v)}`}>
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
                                                            {(v.is_doubtful || v.ai_verified) ? (
                                                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                                    <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill={isSelected ? "white" : "black"} />
                                                                </svg>
                                                            ) : severity.marker}
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

                            {/* AI Review Section */}
                            {(selectedViolation.is_doubtful || selectedViolation.ai_verified) && (
                                <div style={{
                                    marginBottom: '20px',
                                    padding: '16px',
                                    background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
                                    border: '1px solid #000',
                                    position: 'relative',
                                    overflow: 'visible'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '14px' }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="black" />
                                        </svg>
                                        <span style={{ fontSize: '11px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                                            Интеллектуальная проверка
                                        </span>
                                    </div>

                                    {selectedViolation.ai_verified ? (
                                        <div style={{ fontSize: '13px', lineHeight: '1.5' }}>
                                            <div style={{ fontWeight: 600, color: selectedViolation.is_doubtful ? 'var(--error)' : 'var(--success)', marginBottom: '4px' }}>
                                                {selectedViolation.is_doubtful ? '● Нарушение подтверждено' : '○ Ошибка не подтверждена'}
                                            </div>
                                            <p style={{ color: '#333', fontSize: '12px' }}>{selectedViolation.ai_explanation}</p>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                                            <p style={{ fontSize: '12px', color: '#555', textAlign: 'center', lineHeight: '1.5' }}>Алгоритм пометил это место как сомнительное. Требуется экспертная оценка ИИ.</p>

                                            <div style={{ position: 'relative', width: '100%' }}>
                                                {/* Masking Container for Robot */}
                                                <div style={{
                                                    position: 'absolute',
                                                    bottom: '100%',
                                                    left: '-100px',
                                                    right: 0,
                                                    height: '120px',
                                                    overflow: 'hidden',
                                                    pointerEvents: 'none',
                                                    zIndex: 1
                                                }}>
                                                    {/* Peeking Robot */}
                                                    <div style={{
                                                        position: 'absolute',
                                                        bottom: 0,
                                                        left: '105px',
                                                        width: '90px',
                                                        height: '90px',
                                                        transform: `translateY(${isAIHovered ? '35px' : '110px'}) rotate(${isAIHovered ? '-15deg' : '0deg'}) scale(${isAIHovered ? 1.1 : 0.8})`,
                                                        opacity: isAIHovered ? 1 : 0,
                                                        transition: 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                                                        transformOrigin: 'bottom center',
                                                    }}>
                                                        <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ overflow: 'visible' }}>
                                                            <path d="M 50 20 L 50 5" stroke="#111827" strokeWidth="3" />
                                                            <circle cx="50" cy="5" r="4" fill="#FF3B30" />
                                                            <rect x="15" y="20" width="70" height="60" rx="30" fill="white" stroke="#111827" strokeWidth="4" />
                                                            <rect x="25" y="30" width="50" height="35" rx="15" fill="#111827" />
                                                            <rect x="35" y="42" width="8" height="12" rx="4" fill="white" />
                                                            <rect x="57" y="42" width="8" height="12" rx="4" fill="white" />
                                                        </svg>
                                                    </div>
                                                </div>

                                                <button
                                                    onClick={() => handleAIVerify(selectedViolation.id)}
                                                    onMouseEnter={() => setIsAIHovered(true)}
                                                    onMouseLeave={() => setIsAIHovered(false)}
                                                    disabled={isAIVerifying}
                                                    className="btn btn-primary"
                                                    style={{
                                                        width: '100%',
                                                        padding: '14px 20px',
                                                        fontSize: '12px',
                                                        fontWeight: '700',
                                                        letterSpacing: '0.05em',
                                                        background: '#000',
                                                        color: '#fff',
                                                        border: 'none',
                                                        cursor: isAIVerifying ? 'not-allowed' : 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        transition: 'all 0.2s ease',
                                                        boxShadow: '0 4px 0px rgba(0,0,0,0.1)',
                                                        position: 'relative',
                                                        zIndex: 2
                                                    }}
                                                >
                                                    {isAIVerifying ? (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            <div className="spinner" style={{ width: '14px', height: '14px', borderColor: '#fff', borderTopColor: 'transparent', borderWidth: '2px' }} />
                                                            АНАЛИЗИРУЮ...
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                                <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill="white" />
                                                            </svg>
                                                            ЗАПУСТИТЬ ИИ-ЭКСПЕРТИЗУ
                                                        </div>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    )}
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
                        {localViolations.length} нарушений
                    </div>
                </div>

                {localViolations.length === 0 ? (
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
                                    Все ({localViolations.length})
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
                                    const isDoubtful = v.is_doubtful || (v.ai_verified && v.is_doubtful);

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
                                                transition: 'background 0.15s ease',
                                                position: 'relative'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.background = SWISS_COLORS.gray100}
                                            onMouseLeave={(e) => e.currentTarget.style.background = isSelected ? SWISS_COLORS.gray100 : SWISS_COLORS.white}
                                        >
                                            {isDoubtful && (
                                                <div style={{ position: 'absolute', top: '16px', right: '16px' }}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" title="Требуется ИИ-экспертиза">
                                                        <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" fill={v.ai_verified ? (v.is_doubtful ? "#FF3B30" : "#008000") : "#000"} />
                                                    </svg>
                                                </div>
                                            )}
                                            <div style={{ fontSize: '10px', marginBottom: '6px', letterSpacing: '0.5px', color: SWISS_COLORS.gray500, fontWeight: 600, paddingRight: isDoubtful ? '24px' : '0' }}>
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
