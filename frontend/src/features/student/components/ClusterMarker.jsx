import React, { useState } from 'react';
import { getCategoryConfig, getSeverityConfig } from '../utils/errorConfig';

/**
 * Компонент кластера маркеров (когда несколько ошибок близко друг к другу)
 */
const ClusterMarker = ({
    cluster,
    isExpanded,
    onToggle,
    onMarkerClick,
    hoveredViolation,
    selectedViolation,
    onMouseEnter,
    onMouseLeave
}) => {
    if (!cluster || !cluster.markers) return null;

    const markerCount = cluster.markers.length;
    const isSingle = markerCount === 1;

    // Для одиночного маркера показываем обычный маркер
    if (isSingle) {
        const violation = cluster.markers[0].violation;
        const categoryConfig = getCategoryConfig(violation);
        const severityConfig = getSeverityConfig(violation);
        const isHovered = hoveredViolation === violation;
        const isSelected = selectedViolation === violation;

        return (
            <div
                style={{
                    position: 'absolute',
                    top: `${cluster.avgPosition}px`,
                    left: '5px',
                    width: `${severityConfig.size}px`,
                    height: `${severityConfig.size}px`,
                    background: categoryConfig.color,
                    color: 'white',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: `${severityConfig.size / 2}px`,
                    cursor: 'pointer',
                    zIndex: isSelected ? 1000 : (isHovered ? 100 : 10),
                    boxShadow: isHovered
                        ? `0 8px 20px ${categoryConfig.color}80`
                        : (isSelected ? `0 6px 16px ${categoryConfig.color}60` : `0 2px 8px ${categoryConfig.color}40`),
                    transform: isHovered ? 'scale(1.4)' : (isSelected ? 'scale(1.3)' : 'scale(1)'),
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    border: isSelected ? '3px solid white' : 'none',
                    animation: severityConfig.pulseAnimation && !isSelected ? 'pulse-critical 2s ease-in-out infinite' : 'none'
                }}
                onClick={(e) => {
                    e.stopPropagation();
                    onMarkerClick(violation);
                }}
                onMouseEnter={() => onMouseEnter(violation)}
                onMouseLeave={() => onMouseLeave()}
                title={`${categoryConfig.name}\n${violation.description}`}
            >
                !
            </div>
        );
    }

    // Для кластера показываем круг с цифрой
    return (
        <div style={{ position: 'relative' }}>
            {/* Главный кластерный маркер */}
            <div
                style={{
                    position: 'absolute',
                    top: `${cluster.avgPosition}px`,
                    left: '5px',
                    width: '36px',
                    height: '36px',
                    background: isExpanded ? '#1a1a1a' : '#FF6B6B',
                    color: 'white',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    cursor: 'pointer',
                    zIndex: isExpanded ? 1000 : 100,
                    boxShadow: isExpanded
                        ? '0 12px 30px rgba(0,0,0,0.5)'
                        : '0 4px 12px rgba(255,107,107,0.6)',
                    transform: isExpanded ? 'scale(1.2)' : 'scale(1)',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    border: isExpanded ? '2px solid white' : '2px solid rgba(255,255,255,0.5)'
                }}
                onClick={(e) => {
                    e.stopPropagation();
                    onToggle();
                }}
                title={`${markerCount} ошибок${isExpanded ? ' (клик чтобы свернуть)' : ' (клик чтобы развернуть)'}`}
            >
                {isExpanded ? '−' : markerCount}
            </div>

            {/* Развернутые маркеры */}
            {isExpanded && (
                <div style={{
                    position: 'absolute',
                    top: `${cluster.avgPosition - (markerCount * 35) / 2}px`,
                    left: '5px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '5px',
                    animation: 'slide-in-right 0.3s ease-out'
                }}>
                    {cluster.markers.map((marker, idx) => {
                        const violation = marker.violation;
                        const categoryConfig = getCategoryConfig(violation);
                        const severityConfig = getSeverityConfig(violation);
                        const isHovered = hoveredViolation === violation;
                        const isSelected = selectedViolation === violation;

                        return (
                            <div
                                key={idx}
                                style={{
                                    width: `${severityConfig.size}px`,
                                    height: `${severityConfig.size}px`,
                                    background: categoryConfig.color,
                                    color: 'white',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 'bold',
                                    fontSize: `${severityConfig.size / 2}px`,
                                    cursor: 'pointer',
                                    zIndex: isSelected ? 1001 : (isHovered ? 101 : 11),
                                    boxShadow: isHovered
                                        ? `0 8px 20px ${categoryConfig.color}80`
                                        : (isSelected ? `0 6px 16px ${categoryConfig.color}60` : `0 2px 8px ${categoryConfig.color}40`),
                                    transform: isHovered ? 'scale(1.3)' : (isSelected ? 'scale(1.2)' : 'scale(1)'),
                                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    border: isSelected ? '2px solid white' : 'none',
                                    animation: `slide-in-right 0.3s ease-out ${idx * 0.05}s backwards`
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onMarkerClick(violation);
                                }}
                                onMouseEnter={() => onMouseEnter(violation)}
                                onMouseLeave={() => onMouseLeave()}
                                title={`${categoryConfig.name}\n${violation.description}`}
                            >
                                !
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default ClusterMarker;
