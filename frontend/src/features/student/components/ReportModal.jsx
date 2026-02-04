import React from 'react';
import DocumentViewer from '../DocumentViewer';

export default function ReportModal({ isOpen, onClose, documentName, score, contentJSON, violations, file }) {
    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
            background: 'white', zIndex: 2000, padding: '2rem',
            display: 'flex', flexDirection: 'column'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid black', paddingBottom: '1rem' }}>
                <div>
                    <h2 style={{ color: 'black', margin: 0, fontSize: '1.5rem' }}>ОТЧЕТ: {documentName || 'Документ'}</h2>
                    {score !== undefined && score !== null && (
                        <span style={{
                            fontWeight: 700, fontSize: '1.2rem',
                            color: score >= 80 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--error)'
                        }}>
                            Оценка: {Number(score).toFixed(0)}/100
                        </span>
                    )}
                </div>
                <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: '1.5rem', padding: '0.5rem 1rem' }}>✕</button>
            </div>
            <DocumentViewer
                file={file}
                contentJSON={contentJSON}
                violations={violations}
                score={score}
            />
        </div>
    );
}
