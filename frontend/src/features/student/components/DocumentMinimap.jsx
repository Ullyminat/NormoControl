import React from 'react';

/**
 * Миникарта документа (тепловая карта страниц с ошибками)
 */
const DocumentMinimap = ({ numPages, violations, currentPage, onPageClick }) => {
    if (!numPages || numPages === 0) return null;

    // Группируем ошибки по страницам
    const violationsByPage = {};
    violations.forEach(v => {
        const match = v.position_in_doc?.match(/Page (\d+)/);
        if (match) {
            const pageNum = parseInt(match[1]);
            if (!violationsByPage[pageNum]) {
                violationsByPage[pageNum] = [];
            }
            violationsByPage[pageNum].push(v);
        }
    });

    // Определяем максимальное количество ошибок на странице для нормализации
    const maxErrorsOnPage = Math.max(...Object.values(violationsByPage).map(v => v.length), 1);

    return (
        <div style={{
            padding: '1rem',
            background: '#f9f9f9',
            borderBottom: '1px solid #E5E5E5'
        }}>
            <div style={{
                fontSize: '0.75rem',
                color: '#666',
                marginBottom: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontWeight: 600
            }}>
                📄 Карта документа
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(45px, 1fr))',
                gap: '0.5rem',
                maxHeight: '200px',
                overflowY: 'auto'
            }}>
                {Array.from({ length: numPages }, (_, idx) => {
                    const pageNum = idx + 1;
                    const pageErrors = violationsByPage[pageNum] || [];
                    const errorCount = pageErrors.length;
                    const isCurrent = currentPage === pageNum;

                    // Рассчитываем интенсивность цвета
                    let backgroundColor = '#E5E5E5'; // Серый - нет ошибок
                    let textColor = '#666';
                    let borderColor = '#E5E5E5';

                    if (errorCount > 0) {
                        const intensity = errorCount / maxErrorsOnPage;
                        // От желтого к красному
                        if (intensity > 0.7) {
                            backgroundColor = '#DC2626'; // Красный
                            textColor = 'white';
                            borderColor = '#991B1B';
                        } else if (intensity > 0.4) {
                            backgroundColor = '#F59E0B'; // Оранжевый
                            textColor = 'white';
                            borderColor = '#B45309';
                        } else {
                            backgroundColor = '#FCD34D'; // Желтый
                            textColor = '#78350F';
                            borderColor = '#F59E0B';
                        }
                    } else {
                        backgroundColor = '#4CAF50'; // Зеленый - нет ошибок
                        textColor = 'white';
                        borderColor = '#2E7D32';
                    }

                    return (
                        <button
                            key={pageNum}
                            onClick={() => onPageClick && onPageClick(pageNum)}
                            style={{
                                background: backgroundColor,
                                color: textColor,
                                border: isCurrent ? `2px solid black` : `1px solid ${borderColor}`,
                                borderRadius: '4px',
                                padding: '0.5rem 0.25rem',
                                cursor: 'pointer',
                                transition: 'transform 0.2s ease, background 0.2s ease, color 0.2s ease',
                                fontSize: '0.75rem',
                                fontWeight: isCurrent ? 700 : 500,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '0.25rem',
                                position: 'relative',
                                transform: isCurrent ? 'scale(1.05)' : 'scale(1)',
                                boxShadow: 'none'
                            }}
                            onMouseEnter={(e) => {
                                if (!isCurrent) {
                                    e.target.style.transform = 'scale(1.05)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isCurrent) {
                                    e.target.style.transform = 'scale(1)';
                                }
                            }}
                            title={`Страница ${pageNum}${errorCount > 0 ? `: ${errorCount} ошибок` : ': ✓'}`}
                        >
                            <div>{pageNum}</div>
                            {errorCount > 0 && (
                                <div style={{
                                    fontSize: '0.65rem',
                                    fontWeight: 600
                                }}>
                                    {errorCount}
                                </div>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Легенда */}
            <div style={{
                display: 'flex',
                gap: '0.75rem',
                marginTop: '0.75rem',
                fontSize: '0.65rem',
                flexWrap: 'wrap'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <div style={{ width: '12px', height: '12px', background: '#4CAF50', borderRadius: '2px' }} />
                    <span style={{ color: '#666' }}>Без ошибок</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <div style={{ width: '12px', height: '12px', background: '#FCD34D', borderRadius: '2px' }} />
                    <span style={{ color: '#666' }}>Мало</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <div style={{ width: '12px', height: '12px', background: '#F59E0B', borderRadius: '2px' }} />
                    <span style={{ color: '#666' }}>Средне</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <div style={{ width: '12px', height: '12px', background: '#DC2626', borderRadius: '2px' }} />
                    <span style={{ color: '#666' }}>Много</span>
                </div>
            </div>
        </div>
    );
};

export default DocumentMinimap;
