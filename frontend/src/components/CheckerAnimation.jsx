import React from 'react';

const CheckerAnimation = () => {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0',
            background: 'transparent',
            margin: '0 auto',
            width: '100%'
        }}>
            <style>
                {`
                .premium-loader-svg {
                    width: 140px;
                    height: 140px;
                    margin-bottom: 1.5rem;
                    display: block;
                }
                
                .doc-outline {
                    stroke-dasharray: 200;
                    stroke-dashoffset: 200;
                    animation: draw-outline 3s ease-in-out infinite alternate;
                }
                
                .scan-line {
                    animation: scanning 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
                }
                
                .data-bar {
                    transform-origin: left;
                    animation: bar-scale 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
                }
                
                .data-bar-2 { animation-delay: 0.1s; }
                .data-bar-3 { animation-delay: 0.2s; }
                .data-bar-4 { animation-delay: 0.3s; }
                .data-bar-5 { animation-delay: 0.4s; }

                .crosshair {
                    animation: crosshair-spin 10s linear infinite;
                    transform-origin: 50px 50px;
                }
                
                .pulse-box {
                    animation: pulse-op 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
                }

                @keyframes draw-outline {
                    0% { stroke-dashoffset: 200; }
                    40%, 100% { stroke-dashoffset: 0; }
                }

                @keyframes scanning {
                    0% { transform: translateY(-10px); opacity: 0; }
                    10% { opacity: 1; }
                    80% { opacity: 1; transform: translateY(80px); }
                    100% { transform: translateY(80px); opacity: 0; }
                }

                @keyframes bar-scale {
                    0%, 15% { transform: scaleX(0); opacity: 0; }
                    25% { opacity: 1; }
                    60% { transform: scaleX(1); opacity: 1; }
                    85% { opacity: 0; }
                    100% { transform: scaleX(0); opacity: 0; }
                }

                @keyframes crosshair-spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                @keyframes pulse-op {
                    0%, 100% { opacity: 0.2; }
                    50%, 60% { opacity: 1; }
                }
                
                .pulse-text {
                    animation: pulse-text 2s infinite ease-in-out;
                }
                
                @keyframes pulse-text {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.4; }
                }
                `}
            </style>

            <svg viewBox="0 0 100 100" className="premium-loader-svg" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="scanGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent-primary, #FF3B30)" stopOpacity="0" />
                        <stop offset="30%" stopColor="var(--accent-primary, #FF3B30)" stopOpacity="0.05" />
                        <stop offset="100%" stopColor="var(--accent-primary, #FF3B30)" stopOpacity="0.4" />
                    </linearGradient>
                </defs>

                {/* Outer Frame Grid */}
                <rect x="5" y="5" width="90" height="90" fill="none" stroke="#E5E7EB" strokeWidth="0.5" />
                <rect x="10" y="10" width="80" height="80" fill="none" stroke="#F3F4F6" strokeWidth="0.5" />

                {/* Crosshairs at corners */}
                <path d="M 0 10 L 10 10 M 10 0 L 10 10" stroke="#9CA3AF" strokeWidth="1" fill="none" />
                <path d="M 90 0 L 90 10 L 100 10" stroke="#9CA3AF" strokeWidth="1" fill="none" />
                <path d="M 0 90 L 10 90 L 10 100" stroke="#9CA3AF" strokeWidth="1" fill="none" />
                <path d="M 100 90 L 90 90 L 90 100" stroke="#9CA3AF" strokeWidth="1" fill="none" />

                {/* Rotating geometric target */}
                <g className="crosshair">
                    <circle cx="50" cy="50" r="35" fill="none" stroke="#E5E7EB" strokeWidth="1" strokeDasharray="2 4" />
                    <circle cx="50" cy="50" r="25" fill="none" stroke="#E5E7EB" strokeWidth="0.5" />
                    {/* Tick marks */}
                    <line x1="50" y1="12" x2="50" y2="18" stroke="#D1D5DB" strokeWidth="1" />
                    <line x1="50" y1="82" x2="50" y2="88" stroke="#D1D5DB" strokeWidth="1" />
                    <line x1="12" y1="50" x2="18" y2="50" stroke="#D1D5DB" strokeWidth="1" />
                    <line x1="82" y1="50" x2="88" y2="50" stroke="#D1D5DB" strokeWidth="1" />
                </g>

                {/* Document Icon inside */}
                <rect x="32" y="24" width="36" height="52" fill="#ffffff" stroke="#111827" strokeWidth="1.5" className="doc-outline" />

                {/* Document Data Lines */}
                <rect x="38" y="32" width="24" height="2" fill="#111827" className="data-bar" />
                <rect x="38" y="38" width="18" height="2" fill="#111827" className="data-bar data-bar-2" />
                <rect x="38" y="44" width="22" height="2" fill="#111827" className="data-bar data-bar-3" />
                <rect x="38" y="50" width="14" height="2" fill="#111827" className="data-bar data-bar-4" />
                <rect x="38" y="56" width="20" height="2" fill="#111827" className="data-bar data-bar-5" />
                <rect x="38" y="62" width="16" height="2" fill="#111827" className="data-bar data-bar-2" />

                {/* Red Checking Block (Signature/Approval marker) */}
                <rect x="60" y="66" width="4" height="4" fill="var(--accent-primary, #FF3B30)" className="pulse-box" />

                {/* Scanner Laser */}
                <g className="scan-line">
                    <rect x="25" y="0" width="50" height="20" fill="url(#scanGrad)" />
                    <line x1="22" y1="20" x2="78" y2="20" stroke="var(--accent-primary, #FF3B30)" strokeWidth="1.5" />
                    <circle cx="22" cy="20" r="1.5" fill="var(--accent-primary, #FF3B30)" />
                    <circle cx="78" cy="20" r="1.5" fill="var(--accent-primary, #FF3B30)" />
                </g>
            </svg>

            <h3 style={{
                margin: '0 0 0.5rem',
                fontWeight: 800,
                fontSize: '1rem',
                color: '#111827',
                letterSpacing: '0.05em',
                textTransform: 'uppercase'
            }} className="pulse-text">
                АНАЛИЗ СТРУКТУРЫ
            </h3>
            <p style={{
                margin: 0,
                fontSize: '0.8rem',
                color: '#6b7280',
                textAlign: 'center',
                lineHeight: 1.5,
                maxWidth: '280px',
                fontWeight: 500
            }}>
                Распознавание блоков текста и<br />сверка с нормативами...
            </p>
        </div>
    );
};

export default CheckerAnimation;
