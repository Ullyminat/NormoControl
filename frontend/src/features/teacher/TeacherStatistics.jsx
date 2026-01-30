import { useState, useEffect } from 'react';
import ReportModal from '../student/components/ReportModal';
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

    // Swiss Palette & Constants
    const COLORS = {
        red: '#FF3B30',
        orange: '#FF9500',
        green: '#008000', // standard green
        darkGreen: '#005500',
        black: '#000000',
        white: '#FFFFFF',
        gray: '#E5E5E5',
        textDim: '#555555'
    };

    // Score Distribution (0-20, 20-40, 40-60, 60-80, 80-100)
    const scoreDistribution = [
        { range: '0-20%', count: filteredHistory.filter(item => item.score >= 0 && item.score < 20).length, color: COLORS.red },
        { range: '20-40%', count: filteredHistory.filter(item => item.score >= 20 && item.score < 40).length, color: COLORS.orange },
        { range: '40-60%', count: filteredHistory.filter(item => item.score >= 40 && item.score < 60).length, color: COLORS.orange },
        { range: '60-80%', count: filteredHistory.filter(item => item.score >= 60 && item.score < 80).length, color: COLORS.green },
        { range: '80-100%', count: filteredHistory.filter(item => item.score >= 80 && item.score <= 100).length, color: COLORS.darkGreen },
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
        return `Н${w}`; // Shortened for Swiss minimalism (Н = Неделя)
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
                borderColor: COLORS.black,
                backgroundColor: 'transparent',
                tension: 0, // Sharp lines
                borderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                pointBackgroundColor: COLORS.black,
                pointBorderColor: COLORS.black,
                pointBorderWidth: 0,
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
                backgroundColor: COLORS.black,
                titleColor: COLORS.white,
                bodyColor: COLORS.white,
                borderColor: COLORS.black,
                borderWidth: 0,
                padding: 12,
                cornerRadius: 0, // Sharp corners
                displayColors: false,
                callbacks: {
                    label: function (context) {
                        return `${context.parsed.y}%`;
                    },
                    title: function (context) {
                        // Extract number from "Н5" or similar
                        const label = context[0].label;
                        const weekNum = label.replace(/\D/g, '');
                        return `Неделя ${weekNum}`;
                    }
                },
                titleFont: {
                    family: 'Inter',
                    size: 14,
                    weight: 'bold'
                },
                bodyFont: {
                    family: 'JetBrains Mono',
                    size: 14
                }
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                max: 100,
                border: { display: true, color: COLORS.black, width: 1 },
                ticks: {
                    callback: function (value) {
                        return value + '%';
                    },
                    font: {
                        family: 'JetBrains Mono',
                        size: 10,
                        weight: 500,
                    },
                    color: COLORS.textDim
                },
                grid: {
                    color: '#E0E0E0',
                    drawBorder: false,
                    tickLength: 0
                }
            },
            x: {
                border: { display: true, color: COLORS.black, width: 1 },
                ticks: {
                    font: {
                        family: 'JetBrains Mono',
                        size: 10,
                        weight: 500,
                    },
                    color: COLORS.textDim
                },
                grid: {
                    display: false,
                    drawBorder: false,
                }
            }
        }
    };

    return (
        <div className="container">
            <div style={{ marginBottom: '4rem', borderBottom: '2px solid black', paddingBottom: '2rem' }}>
                <h2 className="text-huge" style={{ marginBottom: '1rem' }}>Статистика.</h2>
                <p style={{ fontSize: '1.25rem' }}>Анализ успеваемости студентов</p>
            </div>

            {/* Toolbar */}
            <div style={{ marginBottom: '3rem', display: 'flex', gap: '0', border: '1px solid black' }}>
                <input
                    className="input-field"
                    placeholder="ПОИСК..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ border: 'none', borderRight: '1px solid black', height: '60px', fontSize: '1rem', textTransform: 'uppercase' }}
                />
                <select
                    className="input-field"
                    value={selectedStandard}
                    onChange={(e) => setSelectedStandard(e.target.value)}
                    style={{ border: 'none', height: '60px', fontSize: '1rem', textTransform: 'uppercase' }}
                >
                    {uniqueStandards.map(std => (
                        <option key={std} value={std}>
                            {std === 'all' ? 'ВСЕ СТАНДАРТЫ' : std}
                        </option>
                    ))}
                </select>
            </div>

            {/* Analytics Dashboard */}
            <div style={{ marginBottom: '4rem' }}>
                {/* Metrics Cards - Grid 4 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0', border: '1px solid black', borderBottom: 'none', marginBottom: '0' }}>
                    <div style={{ padding: '2rem', borderRight: '1px solid black', borderBottom: '1px solid black' }}>
                        <div style={{ fontSize: '0.85rem', color: COLORS.textDim, marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase' }}>Средняя Оценка</div>
                        <div style={{ fontSize: '3.5rem', fontWeight: 700, lineHeight: 1 }}>{avgScore}%</div>
                    </div>
                    <div style={{ padding: '2rem', borderRight: '1px solid black', borderBottom: '1px solid black' }}>
                        <div style={{ fontSize: '0.85rem', color: COLORS.textDim, marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase' }}>Всего Проверок</div>
                        <div style={{ fontSize: '3.5rem', fontWeight: 700, lineHeight: 1 }}>{totalChecks}</div>
                    </div>
                    <div style={{ padding: '2rem', borderRight: '1px solid black', borderBottom: '1px solid black', background: '#F0FFF4' }}>
                        <div style={{ fontSize: '0.85rem', color: COLORS.darkGreen, marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase' }}>Успех</div>
                        <div style={{ fontSize: '3.5rem', fontWeight: 700, lineHeight: 1, color: COLORS.darkGreen }}>{successRate}%</div>
                    </div>
                    <div style={{ padding: '2rem', borderBottom: '1px solid black', background: '#FFF0F0' }}>
                        <div style={{ fontSize: '0.85rem', color: COLORS.red, marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase' }}>Проблемы</div>
                        <div style={{ fontSize: '3.5rem', fontWeight: 700, lineHeight: 1, color: COLORS.red }}>{problemRate}%</div>
                    </div>
                </div>

                {/* Charts Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', border: '1px solid black', borderTop: 'none' }}>

                    {/* Score Distribution Chart */}
                    <div style={{ padding: '2rem', borderRight: '1px solid black' }}>
                        <h3 style={{ margin: '0 0 2rem 0', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Распределение</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {scoreDistribution.map(item => (
                                <div key={item.range} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ minWidth: '60px', fontSize: '0.8rem', fontWeight: 600, fontFamily: 'JetBrains Mono' }}>{item.range}</div>
                                    <div style={{ flex: 1, height: '32px', background: '#F4F4F4', position: 'relative' }}>
                                        <div style={{
                                            height: '100%',
                                            width: `${(item.count / maxCount) * 100}%`,
                                            background: item.color,
                                            display: 'flex',
                                            alignItems: 'center',
                                            paddingLeft: '8px',
                                            color: 'white',
                                            fontWeight: 700,
                                            fontSize: '0.8rem',
                                            fontFamily: 'JetBrains Mono'
                                        }}>
                                            {item.count > 0 && item.count}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Trend Over Time Chart */}
                    <div style={{ padding: '2rem' }}>
                        <h3 style={{ margin: '0 0 2rem 0', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Динамика</h3>
                        <div style={{ height: '300px' }}>
                            {trendLabels.length > 0 ? (
                                <Line data={trendData} options={trendOptions} />
                            ) : (
                                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: COLORS.textDim }}>НЕТ ДАННЫХ</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Top 5 Errors - Separate Section */}
                <div style={{ marginTop: '0', border: '1px solid black', borderTop: 'none', padding: '2rem' }}>
                    <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Частые Ошибки</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                        {topErrors.length > 0 ? topErrors.map((error, idx) => (
                            <div key={error.type} style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                border: '1px solid black',
                                padding: '0.5rem 1rem',
                                background: idx === 0 ? 'black' : 'white',
                                color: idx === 0 ? 'white' : 'black'
                            }}>
                                <span style={{ fontFamily: 'JetBrains Mono', marginRight: '0.5rem', fontWeight: 700 }}>#{idx + 1}</span>
                                <span style={{ fontWeight: 500, marginRight: '1rem' }}>{error.type}</span>
                                <span style={{ fontFamily: 'JetBrains Mono', fontWeight: 700 }}>{error.count}</span>
                            </div>
                        )) : (
                            <div style={{ color: COLORS.textDim }}>Ошибок пока не найдено</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Table */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0', border: '1px solid black' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1.5fr 1fr 1fr', padding: '1rem 2rem', background: '#F4F4F4', fontWeight: 700, textTransform: 'uppercase', fontSize: '0.85rem', letterSpacing: '0.05em', borderBottom: '1px solid black' }}>
                    <div>Студент</div>
                    <div>Стандарт</div>
                    <div
                        onClick={() => handleSort('check_date')}
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', userSelect: 'none' }}
                    >
                        Дата {sortField === 'check_date' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </div>
                    <div
                        onClick={() => handleSort('score')}
                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', userSelect: 'none' }}
                    >
                        Оценка {sortField === 'score' && (sortDirection === 'asc' ? '↑' : '↓')}
                    </div>
                    <div style={{ textAlign: 'center' }}>Инфо</div>
                </div>
                {sortedHistory.length > 0 ? sortedHistory.map(item => (
                    <div
                        key={item.id}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '2fr 2fr 1.5fr 1fr 1fr',
                            padding: '1.5rem 2rem',
                            borderBottom: '1px solid #E5E5E5',
                            alignItems: 'center',
                            background: 'white',
                            transition: 'background 0.2s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#FAFAFA'}
                        onMouseLeave={e => e.currentTarget.style.background = 'white'}
                    >
                        <div style={{ fontWeight: 600 }}>{item.student_name || 'Неизвестно'}</div>
                        <div style={{ fontSize: '0.9rem', color: COLORS.textDim }}>{item.standard_name}</div>
                        <div style={{ fontSize: '0.85rem', fontFamily: 'JetBrains Mono', color: COLORS.textDim, textAlign: 'center' }}>{new Date(item.check_date).toLocaleDateString()}</div>
                        <div style={{ textAlign: 'center' }}>
                            <span className={`badge ${item.score >= 80 ? 'success' : item.score >= 50 ? 'warning' : 'error'}`}>
                                {item.score}%
                            </span>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <button
                                onClick={() => handleViewDetail(item.id)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'black',
                                    textTransform: 'uppercase',
                                    fontWeight: 700,
                                    fontSize: '0.8rem',
                                    padding: 0
                                }}
                            >
                                ОТЧЕТ
                            </button>
                        </div>
                    </div>
                )) : (
                    <div style={{ padding: '4rem', textAlign: 'center', color: COLORS.textDim }}>
                        {searchQuery ? 'НИЧЕГО НЕ НАЙДЕНО' : 'НЕТ ЗАПИСЕЙ'}
                    </div>
                )}
            </div>

            <ReportModal
                isOpen={!!selectedCheck}
                onClose={() => setSelectedCheck(null)}
                documentName={selectedCheck ? `${selectedCheck.student_name}: ${selectedCheck.standard_name}` : 'Отчет'}
                score={selectedCheck?.score}
                contentJSON={selectedCheck?.content_json}
                violations={selectedCheck?.violations}
            />
        </div>
    );
}
