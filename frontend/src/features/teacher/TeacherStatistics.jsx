import { useState, useEffect } from 'react';
import DocumentViewer from '../student/DocumentViewer';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend
);

export default function TeacherStatistics() {
    const [history, setHistory] = useState([]);
    const [selectedCheck, setSelectedCheck] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortField, setSortField] = useState('check_date'); // 'check_date' or 'score'
    const [sortDirection, setSortDirection] = useState('desc'); // 'asc' or 'desc'
    const [selectedStandard, setSelectedStandard] = useState('all'); // Filter by standard

    useEffect(() => {
        fetchHistory();
    }, []);

    const fetchHistory = async () => {
        try {
            const res = await fetch('http://localhost:8080/api/teacher/history', { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setHistory(data || []);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleViewDetail = async (id) => {
        setDetailLoading(true);
        try {
            const res = await fetch(`http://localhost:8080/api/teacher/history/${id}`, { credentials: 'include' });
            if (res.ok) {
                const data = await res.json();
                setSelectedCheck(data);
            } else {
                alert('Не удалось загрузить детали');
            }
        } catch (err) {
            console.error(err);
        } finally {
            setDetailLoading(false);
        }
    };

    const handleSort = (field) => {
        // If clicking the same field, toggle direction
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            // If clicking a new field, set it and default to descending
            setSortField(field);
            setSortDirection('desc');
        }
    };

    // Filter Logic - by search AND standard
    const filteredHistory = history.filter(item => {
        const query = searchQuery.toLowerCase();
        const matchesSearch = (item.student_name && item.student_name.toLowerCase().includes(query)) ||
            (item.standard_name && item.standard_name.toLowerCase().includes(query));

        const matchesStandard = selectedStandard === 'all' || item.standard_name === selectedStandard;

        return matchesSearch && matchesStandard;
    });

    // Sort Logic
    const sortedHistory = [...filteredHistory].sort((a, b) => {
        let aVal, bVal;

        if (sortField === 'check_date') {
            aVal = new Date(a.check_date);
            bVal = new Date(b.check_date);
        } else if (sortField === 'score') {
            aVal = a.score;
            bVal = b.score;
        }

        if (sortDirection === 'asc') {
            return aVal > bVal ? 1 : -1;
        } else {
            return aVal < bVal ? 1 : -1;
        }
    });

    // Analytics Calculations
    const uniqueStandards = ['all', ...new Set(history.map(item => item.standard_name))];

    const avgScore = filteredHistory.length > 0
        ? (filteredHistory.reduce((sum, item) => sum + item.score, 0) / filteredHistory.length).toFixed(1)
        : 0;

    const totalChecks = filteredHistory.length;
    const successRate = filteredHistory.length > 0
        ? ((filteredHistory.filter(item => item.score >= 80).length / filteredHistory.length) * 100).toFixed(1)
        : 0;
    const problemRate = filteredHistory.length > 0
        ? ((filteredHistory.filter(item => item.score < 50).length / filteredHistory.length) * 100).toFixed(1)
        : 0;

    // Score Distribution (0-20, 20-40, 40-60, 60-80, 80-100)
    const scoreDistribution = [
        { range: '0-20%', count: filteredHistory.filter(item => item.score >= 0 && item.score < 20).length, color: '#C5221F' },
        { range: '20-40%', count: filteredHistory.filter(item => item.score >= 20 && item.score < 40).length, color: '#E8710A' },
        { range: '40-60%', count: filteredHistory.filter(item => item.score >= 40 && item.score < 60).length, color: '#F9AB00' },
        { range: '60-80%', count: filteredHistory.filter(item => item.score >= 60 && item.score < 80).length, color: '#1E8E3E' },
        { range: '80-100%', count: filteredHistory.filter(item => item.score >= 80 && item.score <= 100).length, color: '#137333' },
    ];
    const maxCount = Math.max(...scoreDistribution.map(d => d.count), 1);

    // Top 5 Most Common Errors
    const errorCounts = {};
    filteredHistory.forEach(item => {
        if (item.violations && Array.isArray(item.violations)) {
            item.violations.forEach(v => {
                const type = v.rule_type || 'unknown';
                errorCounts[type] = (errorCounts[type] || 0) + 1;
            });
        }
    });
    const topErrors = Object.entries(errorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([type, count]) => ({ type, count }));

    // Trend Data - Group by weeks
    const getWeekKey = (date) => {
        const d = new Date(date);
        const yearStart = new Date(d.getFullYear(), 0, 1);
        const weekNumber = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return `${d.getFullYear()}-W${weekNumber}`;
    };

    const weeklyData = {};
    filteredHistory.forEach(item => {
        const weekKey = getWeekKey(item.check_date);
        if (!weeklyData[weekKey]) {
            weeklyData[weekKey] = { scores: [], count: 0 };
        }
        weeklyData[weekKey].scores.push(item.score);
        weeklyData[weekKey].count++;
    });

    const sortedWeeks = Object.keys(weeklyData).sort();
    const trendLabels = sortedWeeks.map(week => {
        const [year, w] = week.split('-W');
        return `Неделя ${w}`;
    });
    const trendScores = sortedWeeks.map(week => {
        const avg = weeklyData[week].scores.reduce((sum, s) => sum + s, 0) / weeklyData[week].count;
        return avg.toFixed(1);
    });

    const trendData = {
        labels: trendLabels,
        datasets: [
            {
                label: 'Средняя оценка',
                data: trendScores,
                borderColor: '#000000',
                backgroundColor: 'rgba(0, 0, 0, 0.1)',
                tension: 0.3,
                borderWidth: 3,
                pointRadius: 5,
                pointBackgroundColor: '#000000',
                pointBorderColor: '#FFFFFF',
                pointBorderWidth: 2,
            },
        ],
    };

    const trendOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false,
            },
            title: {
                display: false,
            },
            tooltip: {
                backgroundColor: '#000000',
                titleColor: '#FFFFFF',
                bodyColor: '#FFFFFF',
                borderColor: '#000000',
                borderWidth: 2,
                padding: 12,
                displayColors: false,
                callbacks: {
                    label: function (context) {
                        return `Средняя: ${context.parsed.y}%`;
                    }
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                max: 100,
                ticks: {
                    callback: function (value) {
                        return value + '%';
                    },
                    font: {
                        size: 12,
                        weight: 600,
                    }
                },
                grid: {
                    color: '#E0E0E0',
                }
            },
            x: {
                ticks: {
                    font: {
                        size: 11,
                        weight: 600,
                    }
                },
                grid: {
                    display: false,
                }
            }
        }
    };

    return (
        <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
            <div style={{ marginBottom: '4rem', borderBottom: '2px solid black', paddingBottom: '2rem' }}>
                <h2 className="text-huge" style={{ fontSize: '4rem', lineHeight: 0.9, marginBottom: '1rem' }}>Статистика.</h2>
                <p style={{ fontSize: '1.25rem', color: 'var(--text-dim)' }}>Результаты проверок студентов по вашим стандартам</p>
            </div>

            {/* Toolbar */}
            <div style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                <input
                    className="input-field"
                    placeholder="Поиск по студенту или стандарту..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ height: '50px', fontSize: '1.1rem', flex: 1 }}
                />
                <select
                    className="input-field"
                    value={selectedStandard}
                    onChange={(e) => setSelectedStandard(e.target.value)}
                    style={{ height: '50px', fontSize: '1.1rem', flex: 1 }}
                >
                    {uniqueStandards.map(std => (
                        <option key={std} value={std}>
                            {std === 'all' ? 'Все стандарты' : std}
                        </option>
                    ))}
                </select>
            </div>

            {/* Analytics Dashboard */}
            <div style={{ marginBottom: '3rem' }}>
                {/* Metrics Cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '2rem' }}>
                    <div style={{ padding: '1.5rem', background: '#F9F9F9', border: '2px solid black', borderRadius: '4px' }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Средняя Оценка</div>
                        <div style={{ fontSize: '3rem', fontWeight: 700, lineHeight: 1 }}>{avgScore}%</div>
                    </div>
                    <div style={{ padding: '1.5rem', background: '#F9F9F9', border: '2px solid black', borderRadius: '4px' }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Всего Проверок</div>
                        <div style={{ fontSize: '3rem', fontWeight: 700, lineHeight: 1 }}>{totalChecks}</div>
                    </div>
                    <div style={{ padding: '1.5rem', background: '#E6F4EA', border: '2px solid #137333', borderRadius: '4px' }}>
                        <div style={{ fontSize: '0.85rem', color: '#137333', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Успешных</div>
                        <div style={{ fontSize: '3rem', fontWeight: 700, lineHeight: 1, color: '#137333' }}>{successRate}%</div>
                    </div>
                    <div style={{ padding: '1.5rem', background: '#FCE8E6', border: '2px solid #C5221F', borderRadius: '4px' }}>
                        <div style={{ fontSize: '0.85rem', color: '#C5221F', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Проблемных</div>
                        <div style={{ fontSize: '3rem', fontWeight: 700, lineHeight: 1, color: '#C5221F' }}>{problemRate}%</div>
                    </div>
                </div>

                {/* Charts Row */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem' }}>
                    {/* Score Distribution Chart */}
                    <div style={{ padding: '1.5rem', background: 'white', border: '2px solid black', borderRadius: '4px' }}>
                        <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.25rem', fontWeight: 700 }}>Распределение Оценок</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {scoreDistribution.map(item => (
                                <div key={item.range} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ minWidth: '70px', fontSize: '0.9rem', fontWeight: 600 }}>{item.range}</div>
                                    <div style={{ flex: 1, height: '30px', background: '#F4F4F4', position: 'relative', border: '1px solid #DDD', borderRadius: '2px' }}>
                                        <div style={{
                                            height: '100%',
                                            width: `${(item.count / maxCount) * 100}%`,
                                            background: item.color,
                                            transition: 'width 0.3s ease',
                                            display: 'flex',
                                            alignItems: 'center',
                                            paddingLeft: '8px',
                                            color: 'white',
                                            fontWeight: 700,
                                            fontSize: '0.85rem'
                                        }}>
                                            {item.count > 0 && item.count}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Top 5 Errors */}
                    <div style={{ padding: '1.5rem', background: 'white', border: '2px solid black', borderRadius: '4px' }}>
                        <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.25rem', fontWeight: 700 }}>Топ-5 Ошибок</h3>
                        {topErrors.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {topErrors.map((error, idx) => (
                                    <div key={error.type} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: '#F9F9F9', borderRadius: '4px' }}>
                                        <div style={{
                                            minWidth: '28px',
                                            height: '28px',
                                            borderRadius: '50%',
                                            background: ['#C5221F', '#E8710A', '#F9AB00', '#1E8E3E', '#137333'][idx],
                                            color: 'white',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontWeight: 700,
                                            fontSize: '0.85rem'
                                        }}>
                                            {idx + 1}
                                        </div>
                                        <div style={{ flex: 1, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={error.type}>
                                            {error.type}
                                        </div>
                                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#000' }}>{error.count}</div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: '2rem 0' }}>Нет данных</div>
                        )}
                    </div>
                </div>

                {/* Trend Over Time Chart */}
                {trendLabels.length > 0 && (
                    <div style={{ marginTop: '1.5rem', padding: '1.5rem', background: 'white', border: '2px solid black', borderRadius: '4px' }}>
                        <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.25rem', fontWeight: 700 }}>Динамика во Времени</h3>
                        <div style={{ height: '300px' }}>
                            <Line data={trendData} options={trendOptions} />
                        </div>
                    </div>
                )}
            </div>

            {/* Table */}
            <div style={{ border: '1px solid black' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 1fr 1fr', padding: '1rem', background: '#F4F4F4', fontWeight: 700, borderBottom: '1px solid black' }}>
                    <div>Студент</div>
                    <div>Стандарт</div>
                    <div
                        onClick={() => handleSort('check_date')}
                        style={{
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            userSelect: 'none'
                        }}
                    >
                        Дата
                        <span style={{ fontSize: '0.7rem' }}>
                            {sortField === 'check_date' && (
                                sortDirection === 'asc' ? '▲' : '▼'
                            )}
                        </span>
                    </div>
                    <div
                        onClick={() => handleSort('score')}
                        style={{
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            userSelect: 'none'
                        }}
                    >
                        Оценка
                        <span style={{ fontSize: '0.7rem' }}>
                            {sortField === 'score' && (
                                sortDirection === 'asc' ? '▲' : '▼'
                            )}
                        </span>
                    </div>
                    <div>Действие</div>
                </div>
                {sortedHistory.length > 0 ? sortedHistory.map(item => (
                    <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 1fr 1fr', padding: '1.5rem 1rem', borderBottom: '1px solid #EEE', alignItems: 'center', background: 'white' }}>
                        <div style={{ fontWeight: 600 }}>{item.student_name || 'Неизвестно'}</div>
                        <div>{item.standard_name}</div>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-dim)' }}>{new Date(item.check_date).toLocaleString()}</div>
                        <div>
                            <span style={{
                                padding: '4px 8px', borderRadius: '4px', fontWeight: 700,
                                background: item.score >= 80 ? '#E6F4EA' : (item.score >= 50 ? '#FEF7E0' : '#FCE8E6'),
                                color: item.score >= 80 ? '#137333' : (item.score >= 50 ? '#B06000' : '#C5221F')
                            }}>
                                {item.score}%
                            </span>
                        </div>
                        <div>
                            <button
                                onClick={() => handleViewDetail(item.id)}
                                className="btn"
                                style={{ padding: '6px 12px', fontSize: '0.8rem', border: '1px solid #CCC', background: 'white', cursor: 'pointer' }}
                            >
                                ОТЧЕТ
                            </button>
                        </div>
                    </div>
                )) : (
                    <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                        {searchQuery ? 'Ничего не найдено.' : 'Проверок пока не было.'}
                    </div>
                )}
            </div>

            {selectedCheck && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                    background: 'white', zIndex: 2000, padding: '2rem',
                    display: 'flex', flexDirection: 'column'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '2px solid black', paddingBottom: '1rem' }}>
                        <div>
                            <h2 style={{ color: 'black', margin: 0, fontSize: '1.5rem' }}>ОТЧЕТ</h2>
                            <p style={{ margin: 0, color: 'var(--text-dim)' }}>{selectedCheck.student_name} / {selectedCheck.standard_name}</p>
                        </div>
                        <button className="btn btn-ghost" onClick={() => setSelectedCheck(null)} style={{ fontSize: '1.5rem', padding: '0.5rem 1rem' }}>✕</button>
                    </div>
                    <DocumentViewer
                        contentJSON={selectedCheck.content_json}
                        violations={selectedCheck.violations}
                    />
                </div>
            )}
        </div>
    );
}
