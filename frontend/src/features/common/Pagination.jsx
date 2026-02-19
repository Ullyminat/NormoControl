import React from 'react';

const Pagination = ({ currentPage, totalPages, onPageChange }) => {
    if (totalPages <= 1) return null;

    const getPageNumbers = () => {
        const pages = [];
        const maxVisiblePages = 5;

        let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

        if (endPage - startPage + 1 < maxVisiblePages) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            pages.push(i);
        }
        return pages;
    };

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '2rem 0',
            borderTop: 'none'
        }}>
            <button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="btn"
                style={{
                    background: 'transparent',
                    color: currentPage === 1 ? '#CCC' : 'black',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    padding: '0.5rem 1rem',
                    fontSize: '1.2rem', // Increased font for arrows
                    fontWeight: 'bold',
                    lineHeight: 1
                }}
            >
                &lt;
            </button>

            {getPageNumbers().map(page => (
                <button
                    key={page}
                    onClick={() => onPageChange(page)}
                    style={{
                        width: '40px',
                        height: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: currentPage === page ? 'black' : 'transparent',
                        color: currentPage === page ? 'white' : 'black',
                        border: currentPage === page ? '1px solid black' : '1px solid transparent', // Keep layout stable
                        cursor: 'pointer',
                        fontWeight: 700,
                        fontFamily: 'JetBrains Mono',
                        fontSize: '0.9rem',
                        transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                        if (currentPage !== page) {
                            e.target.style.background = '#F4F4F4';
                        }
                    }}
                    onMouseLeave={(e) => {
                        if (currentPage !== page) {
                            e.target.style.background = 'transparent';
                        }
                    }}
                >
                    {page}
                </button>
            ))}

            <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="btn"
                style={{
                    background: 'transparent',
                    color: currentPage === totalPages ? '#CCC' : 'black',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    padding: '0.5rem 1rem',
                    fontSize: '1.2rem', // Increased font for arrows
                    fontWeight: 'bold',
                    lineHeight: 1
                }}
            >
                &gt;
            </button>
        </div>
    );
};

export default Pagination;
