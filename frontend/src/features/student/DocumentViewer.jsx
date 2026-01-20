import { useState, useMemo } from 'react';

export default function DocumentViewer({ contentJSON, violations }) {
    const paragraphs = useMemo(() => {
        if (!contentJSON) return [];
        try {
            return JSON.parse(contentJSON);
        } catch (e) {
            console.error("Failed to parse document content:", e);
            return [];
        }
    }, [contentJSON]);

    const [hoveredViolation, setHoveredViolation] = useState(null);

    // Map Paragraph ID -> Violations
    // We need to map violations to paragraphs. 
    // Currently violations store "Page X, Para Y". We need to match this.
    // Or we should have updated CheckService to store ParagraphID in Violation?
    // Let's deduce it for now: "Para Y" means index Y-1 (if 1-based)

    const violationMap = useMemo(() => {
        const map = {};
        violations.forEach(v => {
            // Parse "Para (\d+)" from PositionInDoc
            const match = v.position_in_doc.match(/Para (\d+)/);
            if (match) {
                const idx = parseInt(match[1]) - 1; // Para 1 is index 0
                const pID = `p-${idx}`;
                if (!map[pID]) map[pID] = [];
                map[pID].push(v);
            }
        });
        return map;
    }, [violations]);

    return (
        <div style={{ display: 'flex', height: '85vh', gap: '2rem', background: '#F0F0F0', padding: '2rem', borderRadius: '4px', border: '1px solid #CCC' }}>

            {/* Document Render (A4 Scrollable) */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center', background: '#525659', padding: '2rem' }}>
                <div
                    className="document-page"
                    style={{
                        width: '210mm', // A4 Width
                        minHeight: '297mm', // A4 Height
                        background: 'white',
                        color: 'black',
                        padding: '25mm 20mm', // Standard Margins
                        boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
                        position: 'relative'
                    }}
                >
                    {paragraphs.map(p => {
                        const pViolations = violationMap[p.ID];
                        const hasError = pViolations?.length > 0;
                        const isHoveringViolation = hoveredViolation && pViolations?.includes(hoveredViolation);

                        return (
                            <div
                                key={p.ID}
                                onMouseEnter={() => setHoveredViolation(pViolations ? pViolations[0] : null)}
                                onMouseLeave={() => setHoveredViolation(null)}
                                style={{
                                    marginBottom: '0', // Let line height handle flow usually, or small margin
                                    borderBottom: hasError ? '2px solid #FF3B30' : 'none', // Swiss Red
                                    backgroundColor: isHoveringViolation ? 'rgba(255, 59, 48, 0.1)' : (hasError ? 'rgba(255, 59, 48, 0.05)' : 'transparent'),
                                    cursor: hasError ? 'pointer' : 'default',
                                    position: 'relative',
                                    transition: 'background 0.2s',

                                    // Applied Styles
                                    textAlign: p.Alignment === 'both' ? 'justify' : (p.Alignment === 'center' ? 'center' : (p.Alignment === 'right' ? 'right' : 'left')),
                                    fontSize: `${p.FontSizePt}pt`,
                                    fontFamily: p.FontName,
                                    fontWeight: p.IsBold ? 'bold' : 'normal',
                                    fontStyle: p.IsItalic ? 'italic' : 'normal',
                                    textDecoration: p.IsUnderline ? 'underline' : 'none',
                                    textTransform: p.IsAllCaps ? 'uppercase' : 'none',
                                    textIndent: `${p.FirstLineIndentMm}mm`,
                                    marginLeft: `${p.LeftIndentMm || 0}mm`,
                                    lineHeight: p.LineSpacing
                                }}
                            >
                                {p.Text}
                                {p.StartsPageBreak && (
                                    <div style={{
                                        borderTop: '2px dashed #DDD',
                                        margin: '2rem 0',
                                        height: '1px',
                                        position: 'relative'
                                    }}>
                                        <span style={{ position: 'absolute', top: '-10px', right: '0', fontSize: '10px', color: '#999', background: 'white', paddingLeft: '4px' }}>
                                            РАЗРЫВ СТРАНИЦЫ
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Sidebar Errors */}
            <div style={{ width: '400px', display: 'flex', flexDirection: 'column', background: 'white', border: '2px solid black', height: '100%' }}>
                <div style={{ padding: '1.5rem', borderBottom: '2px solid black', background: 'black', color: 'white' }}>
                    <h3 style={{ fontSize: '1.2rem', marginBottom: '0.2rem', color: 'white' }}>ОТЧЕТ</h3>
                    <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>Найдено ошибок: {violations.length}</div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                    {violations.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#008000', fontWeight: 600 }}>
                            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>✓</div>
                            Документ соответствует стандарту.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {violations.map((v, i) => {
                                const isHovered = hoveredViolation === v;
                                return (
                                    <div
                                        key={i}
                                        onMouseEnter={() => setHoveredViolation(v)}
                                        onMouseLeave={() => setHoveredViolation(null)}
                                        style={{
                                            borderLeft: isHovered ? '6px solid black' : '6px solid #FF3B30',
                                            border: '1px solid #E5E5E5',
                                            borderLeftWidth: '6px',
                                            padding: '1rem',
                                            cursor: 'pointer',
                                            background: isHovered ? '#F4F4F4' : 'white',
                                            transition: 'all 0.1s'
                                        }}
                                    >
                                        <div style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.5rem', lineHeight: 1.2 }}>
                                            {v.description}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.8rem', fontFamily: 'monospace' }}>
                                            {v.position_in_doc}
                                        </div>

                                        <div style={{ background: '#FAFAFA', padding: '0.5rem', fontSize: '0.85rem' }}>
                                            <div style={{ marginBottom: '4px', color: '#555' }}>Ожидалось: <b style={{ color: 'black' }}>{v.expected_value}</b></div>
                                            <div style={{ color: '#555' }}>Найдено: <b style={{ color: '#FF3B30' }}>{v.actual_value}</b></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
