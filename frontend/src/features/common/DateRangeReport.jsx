import React, { useState } from 'react';

const DateRangeReport = ({ isOpen, onClose, onGenerateReport, reportData, title = "Генератор Отчетов" }) => {
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    if (!isOpen) return null;

    const handleGenerate = () => {
        if (!startDate || !endDate) {
            alert('Пожалуйста, выберите обе даты');
            return;
        }
        onGenerateReport(new Date(startDate), new Date(endDate));
    };

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(255, 255, 255, 0.95)', // Cleaner overlay
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
        }} onClick={onClose}>
            <div
                className="card"
                style={{
                    width: '600px',
                    maxWidth: '90%',
                    border: '1px solid black', // Strict border
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2rem'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ borderBottom: '2px solid black', paddingBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ fontSize: '2rem', lineHeight: 1, margin: 0 }}>{title}.</h2>
                    <button
                        onClick={onClose}
                        className="btn btn-ghost"
                        style={{ padding: '0.5rem 1rem', fontSize: '1.2rem' }}
                    >
                        ✕
                    </button>
                </div>

                {/* Calculator Inputs */}
                {!reportData ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                        <div>
                            <label>Начало периода</label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                className="input-field"
                            />
                        </div>
                        <div>
                            <label>Конец периода</label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                                className="input-field"
                            />
                        </div>
                        <button
                            onClick={handleGenerate}
                            className="btn btn-primary"
                            style={{ width: '100%', marginTop: '1rem' }}
                        >
                            РАССЧИТАТЬ
                        </button>
                    </div>
                ) : (
                    /* Report Result View */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                        <div style={{ background: 'var(--bg-app)', padding: '1.5rem', borderLeft: '4px solid black' }}>
                            <label style={{ marginBottom: '0.5rem' }}>ПЕРИОД</label>
                            <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 600, fontSize: '1.1rem' }}>
                                {new Date(startDate).toLocaleDateString()} — {new Date(endDate).toLocaleDateString()}
                            </div>
                        </div>

                        <div className="grid-2" style={{ gap: '1px', background: 'black', border: '1px solid black' }}>
                            {reportData.map((item, idx) => (
                                <div key={idx} style={{ background: 'white', padding: '1.5rem' }}>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase' }}>{item.label}</div>
                                    <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>{item.value}</div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={() => {
                                onGenerateReport(null, null); // Reset report data in parent to show inputs again
                            }}
                            className="btn btn-ghost"
                            style={{ width: '100%' }}
                        >
                            НОВЫЙ РАСЧЕТ
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DateRangeReport;
