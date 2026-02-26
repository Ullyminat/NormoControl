import React, { useEffect, useRef } from 'react';
import gsap from 'gsap-trial';

const DigitColumn = ({ targetDigit, index }) => {
    const columnRef = useRef(null);

    // Create an array that repeats 0-9 three times to give a long, physical spin effect
    const baseNumbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const numbers = [...baseNumbers, ...baseNumbers, ...baseNumbers];

    useEffect(() => {
        if (!columnRef.current) return;

        const digit = parseInt(targetDigit, 10);
        // We target the digit in the LAST set of numbers (index 20 to 29)
        const targetIndex = 20 + digit;

        // Calculate percentage shift. Each item takes up (100 / 30)% of the container's height
        const targetY = -(targetIndex / numbers.length) * 100;

        gsap.fromTo(columnRef.current,
            { y: '0%' }, // Start at the very first 0
            {
                y: `${targetY}%`,
                // Make the right-most digits spin longer for a mechanical slowing effect
                duration: 1.5 + (index * 0.4),
                ease: "expo.out",
                delay: 0.1
            }
        );
    }, [targetDigit, index, numbers.length]);

    return (
        <span style={{
            display: 'inline-block',
            overflow: 'hidden',
            position: 'relative',
            verticalAlign: 'bottom',
            fontVariantNumeric: 'tabular-nums' // Ensures numbers are monospaced
        }}>
            {/* Hidden dummy element to give the parent exact natural width and height! */}
            <span style={{ visibility: 'hidden', height: '1em', lineHeight: 1, display: 'inline-block' }}>
                {targetDigit}
            </span>

            {/* The absolute spinning column */}
            <span ref={columnRef} style={{
                display: 'flex',
                flexDirection: 'column',
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%'
            }}>
                {numbers.map((num, i) => (
                    <span key={i} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '1em',
                        lineHeight: 1
                    }}>
                        {num}
                    </span>
                ))}
            </span>
        </span>
    );
};

export default function SlotCounter({ value }) {
    if (value === undefined || value === null) return null;

    // Convert to string and split into digits to render a spinning column for each
    const valStr = String(Math.round(value));

    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            fontWeight: 'inherit',
            color: 'inherit',
            lineHeight: 1 // Keep strict line-height so slots don't bleed
        }}>
            {valStr.split('').map((digit, i) => (
                <DigitColumn key={`${i}-${digit}`} targetDigit={digit} index={i} />
            ))}
        </span>
    );
}
