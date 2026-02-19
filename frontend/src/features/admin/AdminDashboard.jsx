import { useState, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import DateRangeReport from '../common/DateRangeReport';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement);

function AdminDashboard() {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isReportOpen, setIsReportOpen] = useState(false);
    const [reportData, setReportData] = useState(null);

    useEffect(() => {
        fetch('/api/admin/stats', { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                setStats(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    if (loading) return <div style={{ padding: '2rem' }}>Загрузка статистики...</div>;
    if (!stats) return <div style={{ padding: '2rem' }}>Ошибка загрузки данных.</div>;

    // Swiss Palette
    const COLORS = {
        red: '#FF3B30',
        orange: '#FF9500',
        green: '#008000',
        black: '#000000',
        white: '#FFFFFF',
        textDim: '#555555'
    };

    const handleGenerateReport = (start, end) => {
        if (!start || !end) {
            setReportData(null);
            return;
        }

        const labels = stats.checks_labels || [];
        const counts = stats.checks_per_day || [];

        // Sum counts where label (date string) is within range
        let totalChecks = 0;
        let daysCounted = 0;

        labels.forEach((dateStr, idx) => {
            const date = new Date(dateStr);
            if (date >= start && date <= end) {
                totalChecks += counts[idx] || 0;
                daysCounted++;
            }
        });

        // Pass rate is global, so we just show the active activity for now
        setReportData([
            { label: 'Активность (дни)', value: daysCounted },
            { label: 'Всего проверок', value: totalChecks },
            { label: 'Ср. в день', value: daysCounted > 0 ? (totalChecks / daysCounted).toFixed(1) : 0 }
        ]);
    };

    // Data Transformation
    const trendData = {
        labels: stats.checks_labels || [],
        datasets: [
            {
                label: 'Проверки',
                data: stats.checks_per_day || [],
                borderColor: COLORS.black,
                backgroundColor: 'transparent',
                tension: 0,
                borderWidth: 2,
                pointRadius: 4,
                pointBackgroundColor: COLORS.black,
            },
        ],
    };

    const trendOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: COLORS.black,
                titleColor: COLORS.white,
                bodyColor: COLORS.white,
                cornerRadius: 0,
                displayColors: false,
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                border: { display: true, color: COLORS.black, width: 1 },
                grid: { color: '#E0E0E0', drawBorder: false }
            },
            x: {
                border: { display: true, color: COLORS.black, width: 1 },
                grid: { display: false }
            }
        }
    };

    const passRateData = {
        labels: ['Сдано', 'На доработке'],
        datasets: [
            {
                data: stats.pass_rate_stats || [0, 0],
                backgroundColor: [COLORS.black, COLORS.red],
                borderWidth: 0,
            },
        ],
    };

    return (
        <div className="container">
            <div style={{ marginBottom: '3rem', borderBottom: '2px solid black', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 className="text-huge" style={{ fontSize: '4rem', margin: 0, lineHeight: 0.9 }}>Дашборд.</h1>
                <button
                    onClick={() => setIsReportOpen(true)}
                    className="btn btn-primary"
                >
                    ОТЧЕТ
                </button>
            </div>

            <div style={{ marginBottom: '4rem' }}>
                {/* Metrics Grid - 4 Columns like TeacherStatistics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0', border: '1px solid black', borderBottom: 'none' }}>
                    <div style={{ padding: '2rem', borderRight: '1px solid black', borderBottom: '1px solid black' }}>
                        <div style={{ fontSize: '0.85rem', color: COLORS.textDim, marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase' }}>Пользователей</div>
                        <div style={{ fontSize: '3.5rem', fontWeight: 700, lineHeight: 1 }}>{stats.total_users}</div>
                    </div>
                    <div style={{ padding: '2rem', borderRight: '1px solid black', borderBottom: '1px solid black' }}>
                        <div style={{ fontSize: '0.85rem', color: COLORS.textDim, marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase' }}>Проверок</div>
                        <div style={{ fontSize: '3.5rem', fontWeight: 700, lineHeight: 1 }}>{stats.total_checks}</div>
                    </div>
                    <div style={{ padding: '2rem', borderRight: '1px solid black', borderBottom: '1px solid black', background: '#F0FFF4' }}>
                        <div style={{ fontSize: '0.85rem', color: COLORS.green, marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase' }}>Успешность</div>
                        <div style={{ fontSize: '3.5rem', fontWeight: 700, lineHeight: 1, color: COLORS.green }}>{Math.round(stats.pass_rate)}%</div>
                    </div>
                    <div style={{ padding: '2rem', borderBottom: '1px solid black' }}>
                        <div style={{ fontSize: '0.85rem', color: COLORS.textDim, marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase' }}>Стандартов</div>
                        <div style={{ fontSize: '3.5rem', fontWeight: 700, lineHeight: 1 }}>{stats.total_standards || 0}</div>
                    </div>
                </div>

                {/* Charts Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0', border: '1px solid black', borderTop: 'none' }}>

                    {/* Activity Trend */}
                    <div style={{ padding: '2rem', borderRight: '1px solid black' }}>
                        <h3 style={{ margin: '0 0 2rem 0', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Активность (Дни)</h3>
                        <div style={{ height: '300px' }}>
                            <Line data={trendData} options={trendOptions} />
                        </div>
                    </div>

                    {/* Pass Rate Doughnut */}
                    <div style={{ padding: '2rem' }}>
                        <h3 style={{ margin: '0 0 2rem 0', fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Результаты</h3>
                        <div style={{ height: '300px', display: 'flex', justifyContent: 'center' }}>
                            <Doughnut options={{ maintainAspectRatio: false }} data={passRateData} />
                        </div>
                    </div>
                </div>
            </div>
            <DateRangeReport
                isOpen={isReportOpen}
                onClose={() => {
                    setIsReportOpen(false);
                    setReportData(null);
                }}
                onGenerateReport={handleGenerateReport}
                reportData={reportData}
                title="Отчет активности"
            />
        </div>
    );
}

export default AdminDashboard;
