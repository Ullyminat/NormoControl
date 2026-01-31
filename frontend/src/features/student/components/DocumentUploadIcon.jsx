
export default function DocumentUploadIcon({ size = 48, strokeWidth = 1.5, className = "" }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            <path
                d="M14 2H6C4.89543 2 4 2.89543 4 4V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V8M14 2L20 8M14 2V8H20"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                strokeLinecap="square"
                strokeLinejoin="round"
            />
            <path
                d="M12 18V12M12 12L9 15M12 12L15 15"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                strokeLinecap="square"
                strokeLinejoin="round"
            />
        </svg>
    );
}
