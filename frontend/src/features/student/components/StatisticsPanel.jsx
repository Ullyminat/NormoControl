import React from 'react';
import { assessOverallSeverity } from '../utils/errorConfig';

/**
 * Панель статистики и аналитики ошибок
 */
const StatisticsPanel = ({ violations, onSeverityFilter }) => {
    if (!violations || violations.length === 0) return null;

    const stats = assessOverallSeverity(violations);

    // Рассчитываем процент проверки
    const score = Math.max(0, 100 - (stats.critical * 20 + stats.error * 5 + stats.warning * 2));

    // Определяем цвет прогресс-бара
    let progressColor = '#4CAF50'; // Зеленый
    if (score < 50) progressColor = '#DC2626'; // Красный
    else if (score < 75) progressColor = '#F59E0B'; // Оранжевый
    else if (score < 90) progressColor = '#FCD34D'; // Желтый

    return (
        <div style={{
            padding: '1.25rem',
            background: 'linear-gradient(135deg, #1a1a1a, #2a2a2a)',
            borderBottom: '2px solid #333',
            color: 'white'
        }}>
            {/* Общая оценка */}
            <div style={{ marginBottom: '1rem' }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.5rem'
                }}>
                    <span style={{
                        fontSize: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                        color: '#AAA'
                    }}>
                        Оценка документа
                    </span>
                    <span style={{
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        color: progressColor
                    }}>
                        {Math.round(score)}/100
                    </span>
                </div>

                {/* Прогресс-бар */}
                <div style={{
                    width: '100%',
                    height: '8px',
                    background: '#333',
                    borderRadius: '4px',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        width: `${score}%`,
                        height: '100%',
                        background: `linear-gradient(90deg, ${progressColor}, ${progressColor}CC)`,
                        transition: 'width 0.5s ease-out',
                        boxShadow: `0 0 10px ${progressColor}80`
                    }} />
                </div>
            </div>

            {/* Статистика по критичности */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '0.5rem'
            }}>
                {/* Критичные */}
                {stats.critical > 0 && (
                    <button
                        onClick={() => onSeverityFilter && onSeverityFilter('critical')}
                        style={{
                            background: '#DC262610',
                            border: '1px solid #DC262640',
                            borderRadius: '8px',
                            padding: '0.75rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            textAlign: 'left'
                        }}
                        onMouseEnter={(e) => e.target.style.background = '#DC262620'}
                        onMouseLeave={(e) => e.target.style.background = '#DC262610'}
                    >
                        <div style={{
                            fontSize: '0.7rem',
                            color: '#DC2626',
                            marginBottom: '0.25rem',
                            fontWeight: 600
                        }}>
                            🔴 КРИТИЧНЫЕ
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#DC2626' }}>
                            {stats.critical}
                        </div>
                    </button>
                )}

                {/* Ошибки */}
                <button
                    onClick={() => onSeverityFilter && onSeverityFilter('error')}
                    style={{
                        background: '#FF6B6B10',
                        border: '1px solid #FF6B6B40',
                        borderRadius: '8px',
                        padding: '0.75rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        textAlign: 'left'
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#FF6B6B20'}
                    onMouseLeave={(e) => e.target.style.background = '#FF6B6B10'}
                >
                    <div style={{
                        fontSize: '0.7rem',
                        color: '#FF6B6B',
                        marginBottom: '0.25rem',
                        fontWeight: 600
                    }}>
                        ⛔ ОШИБКИ
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#FF6B6B' }}>
                        {stats.error}
                    </div>
                </button>

                {/* Предупреждения */}
                {stats.warning > 0 && (
                    <button
                        onClick={() => onSeverityFilter && onSeverityFilter('warning')}
                        style={{
                            background: '#F59E0B10',
                            border: '1px solid #F59E0B40',
                            borderRadius: '8px',
                            padding: '0.75rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            textAlign: 'left'
                        }}
                        onMouseEnter={(e) => e.target.style.background = '#F59E0B20'}
                        onMouseLeave={(e) => e.target.style.background = '#F59E0B10'}
                    >
                        <div style={{
                            fontSize: '0.7rem',
                            color: '#F59E0B',
                            marginBottom: '0.25rem',
                            fontWeight: 600
                        }}>
                            ⚠️ ПРЕДУПРЕЖДЕНИЯ
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#F59E0B' }}>
                            {stats.warning}
                        </div>
                    </button>
                )}

                {/* Информация */}
                {stats.info > 0 && (
                    <button
                        onClick={() => onSeverityFilter && onSeverityFilter('info')}
                        style={{
                            background: '#3B82F610',
                            border: '1px solid #3B82F640',
                            borderRadius: '8px',
                            padding: '0.75rem',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            textAlign: 'left'
                        }}
                        onMouseEnter={(e) => e.target.style.background = '#3B82F620'}
                        onMouseLeave={(e) => e.target.style.background = '#3B82F610'}
                    >
                        <div style={{
                            fontSize: '0.7rem',
                            color: '#3B82F6',
                            marginBottom: '0.25rem',
                            fontWeight: 600
                        }}>
                            ℹ️ ИНФОРМАЦИЯ
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#3B82F6' }}>
                            {stats.info}
                        </div>
                    </button>
                )}
            </div>
        </div>
    );
};

export default StatisticsPanel;
