import React from 'react';
import { getCategoryConfig, getSeverityConfig, getFixSuggestions } from '../utils/errorConfig';

/**
 * Расширенная карточка ошибки с деталями и рекомендациями
 */
const EnhancedErrorCard = ({
    violation,
    onClose,
    onNext,
    onPrevious,
    onNavigate,
    hasNext = false,
    hasPrevious = false
}) => {
    if (!violation) return null;

    const categoryConfig = getCategoryConfig(violation);
    const severityConfig = getSeverityConfig(violation);
    const suggestions = getFixSuggestions(violation);

    return (
        <div
            style={{
                position: 'fixed',
                bottom: '2rem',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '700px',
                maxWidth: '95%',
                background: '#1a1a1a',
                color: 'white',
                padding: '0',
                borderRadius: '16px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
                zIndex: 10000,
                borderLeft: `6px solid ${categoryConfig.color}`,
                animation: 'slide-up 0.3s ease-out',
                overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
        >
            {/* Заголовок */}
            <div style={{
                padding: '1.5rem',
                background: `linear-gradient(135deg, ${categoryConfig.color}20, ${categoryConfig.color}10)`,
                borderBottom: '1px solid rgba(255,255,255,0.1)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
                        <span style={{ fontSize: '2rem' }}>{categoryConfig.icon}</span>
                        <div style={{ flex: 1 }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                marginBottom: '0.25rem'
                            }}>
                                <span style={{
                                    fontSize: '0.65rem',
                                    color: categoryConfig.color,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                    fontWeight: 700
                                }}>
                                    {categoryConfig.name}
                                </span>
                                <span style={{
                                    fontSize: '0.65rem',
                                    padding: '0.2rem 0.5rem',
                                    background: severityConfig.color,
                                    borderRadius: '10px',
                                    fontWeight: 600
                                }}>
                                    {severityConfig.icon} {severityConfig.name}
                                </span>
                            </div>
                            <h3 style={{
                                margin: 0,
                                fontSize: '1.15rem',
                                fontWeight: 700,
                                lineHeight: 1.3
                            }}>
                                {violation.description}
                            </h3>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: '#888',
                            cursor: 'pointer',
                            fontSize: '1.5rem',
                            padding: '0.25rem 0.5rem',
                            transition: 'color 0.2s',
                            marginLeft: '0.5rem'
                        }}
                        onMouseEnter={(e) => e.target.style.color = 'white'}
                        onMouseLeave={(e) => e.target.style.color = '#888'}
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* Содержимое */}
            <div style={{ padding: '1.5rem' }}>
                {/* Позиция в документе */}
                {violation.position_in_doc && (
                    <div style={{
                        fontSize: '0.85rem',
                        color: '#AAA',
                        marginBottom: '1rem',
                        fontFamily: 'monospace',
                        background: '#2a2a2a',
                        padding: '0.6rem',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}>
                        <span>📍</span>
                        <span>{violation.position_in_doc}</span>
                    </div>
                )}

                {/* Контекст (если есть) */}
                {violation.context_text && (
                    <div style={{ marginBottom: '1rem' }}>
                        <div style={{
                            fontSize: '0.7rem',
                            color: '#888',
                            marginBottom: '0.4rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px'
                        }}>
                            Фрагмент текста
                        </div>
                        <div style={{
                            background: '#2a2a2a',
                            padding: '0.75rem',
                            borderRadius: '6px',
                            fontStyle: 'italic',
                            color: '#ddd',
                            fontSize: '0.9rem',
                            lineHeight: 1.5,
                            borderLeft: `3px solid ${categoryConfig.color}`
                        }}>
                            "{violation.context_text.slice(0, 150)}{violation.context_text.length > 150 ? '...' : ''}"
                        </div>
                    </div>
                )}

                {/* Сравнение значений */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '1rem',
                    background: '#2a2a2a',
                    padding: '1.25rem',
                    borderRadius: '8px',
                    marginBottom: '1.25rem'
                }}>
                    <div>
                        <div style={{
                            fontSize: '0.7rem',
                            color: '#AAA',
                            textTransform: 'uppercase',
                            marginBottom: '0.5rem',
                            letterSpacing: '0.5px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                        }}>
                            <span>✅</span> Ожидалось
                        </div>
                        <div style={{
                            fontWeight: 600,
                            color: '#4CAF50',
                            fontSize: '1.1rem'
                        }}>
                            {violation.expected_value}
                        </div>
                    </div>
                    <div>
                        <div style={{
                            fontSize: '0.7rem',
                            color: '#AAA',
                            textTransform: 'uppercase',
                            marginBottom: '0.5rem',
                            letterSpacing: '0.5px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                        }}>
                            <span>❌</span> Найдено
                        </div>
                        <div style={{
                            fontWeight: 600,
                            color: '#FF3B30',
                            fontSize: '1.1rem'
                        }}>
                            {violation.actual_value}
                        </div>
                    </div>
                </div>

                {/* Рекомендации по исправлению */}
                {suggestions.length > 0 && (
                    <div style={{
                        background: `linear-gradient(135deg, ${categoryConfig.color}15, transparent)`,
                        border: `1px solid ${categoryConfig.color}30`,
                        borderRadius: '8px',
                        padding: '1rem'
                    }}>
                        <div style={{
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            marginBottom: '0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            color: '#FFA500'
                        }}>
                            <span>💡</span> Как исправить:
                        </div>
                        <ol style={{
                            margin: 0,
                            paddingLeft: '1.25rem',
                            color: '#ddd',
                            fontSize: '0.9rem',
                            lineHeight: 1.7
                        }}>
                            {suggestions.map((suggestion, idx) => (
                                <li key={idx} style={{ marginBottom: '0.3rem' }}>
                                    {suggestion}
                                </li>
                            ))}
                        </ol>
                    </div>
                )}
            </div>

            {/* Навигация */}
            <div style={{
                padding: '1rem 1.5rem',
                background: '#222',
                borderTop: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                gap: '0.75rem',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        onClick={onPrevious}
                        disabled={!hasPrevious}
                        style={{
                            padding: '0.6rem 1.25rem',
                            background: hasPrevious ? '#3a3a3a' : '#2a2a2a',
                            color: hasPrevious ? 'white' : '#555',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: hasPrevious ? 'pointer' : 'not-allowed',
                            fontSize: '0.85rem',
                            fontWeight: 500,
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}
                        onMouseEnter={(e) => hasPrevious && (e.target.style.background = '#444')}
                        onMouseLeave={(e) => hasPrevious && (e.target.style.background = '#3a3a3a')}
                    >
                        ← Предыдущая
                    </button>

                    <button
                        onClick={onNext}
                        disabled={!hasNext}
                        style={{
                            padding: '0.6rem 1.25rem',
                            background: hasNext ? '#3a3a3a' : '#2a2a2a',
                            color: hasNext ? 'white' : '#555',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: hasNext ? 'pointer' : 'not-allowed',
                            fontSize: '0.85rem',
                            fontWeight: 500,
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}
                        onMouseEnter={(e) => hasNext && (e.target.style.background = '#444')}
                        onMouseLeave={(e) => hasNext && (e.target.style.background = '#3a3a3a')}
                    >
                        Следующая →
                    </button>
                </div>

                {onNavigate && (
                    <button
                        onClick={onNavigate}
                        style={{
                            padding: '0.6rem 1.25rem',
                            background: categoryConfig.color,
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: 600,
                            transition: 'all 0.2s',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                        }}
                        onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                        onMouseLeave={(e) => e.target.style.opacity = '1'}
                    >
                        📍 Показать в документе
                    </button>
                )}
            </div>
        </div>
    );
};

export default EnhancedErrorCard;
