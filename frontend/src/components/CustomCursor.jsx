import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap-trial';

export default function CustomCursor() {
    const cursorRef = useRef(null);
    const [hidden, setHidden] = useState(false);

    useEffect(() => {
        const cursor = cursorRef.current;
        if (!cursor) return;

        // Set initial state
        gsap.set(cursor, { xPercent: -50, yPercent: -50 });

        // gsap.quickTo is specifically designed for high-performance mouse tracking
        // It avoids all the math feedback loops of a manual ticker
        const xTo = gsap.quickTo(cursor, "x", { duration: 0.15, ease: "power3" });
        const yTo = gsap.quickTo(cursor, "y", { duration: 0.15, ease: "power3" });

        const onMouseMove = (e) => {
            xTo(e.clientX);
            yTo(e.clientY);
            if (hidden) setHidden(false);
        };

        const onMouseLeave = () => setHidden(true);
        const onMouseEnter = () => setHidden(false);

        // Hover animations
        const onHoverEnter = () => gsap.to(cursor, { scale: 3.5, duration: 0.3, ease: 'back.out(1.5)' });
        const onHoverLeave = () => gsap.to(cursor, { scale: 1, duration: 0.3, ease: 'power2.out' });

        const addListeners = () => {
            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseout', onMouseLeave);
            window.addEventListener('mouseenter', onMouseEnter);

            const interactables = document.querySelectorAll('a, button, input, select, textarea, .interactive, [role="button"], [class*="btn-"], label');
            interactables.forEach(el => {
                el.addEventListener('mouseenter', onHoverEnter);
                el.addEventListener('mouseleave', onHoverLeave);
            });
            return interactables;
        };

        let interactables = addListeners();

        const observer = new MutationObserver(() => {
            interactables.forEach(el => {
                el.removeEventListener('mouseenter', onHoverEnter);
                el.removeEventListener('mouseleave', onHoverLeave);
            });
            interactables = addListeners();
        });

        observer.observe(document.body, { childList: true, subtree: true });

        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseout', onMouseLeave);
            window.removeEventListener('mouseenter', onMouseEnter);
            interactables.forEach(el => {
                el.removeEventListener('mouseenter', onHoverEnter);
                el.removeEventListener('mouseleave', onHoverLeave);
            });
            observer.disconnect();
        };
    }, [hidden]);

    return (
        <div
            ref={cursorRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '16px',
                height: '16px',
                backgroundColor: 'white', // With mix-blend-mode: difference, white turns into the exact inverse color of whatever it's over
                borderRadius: '50%',
                pointerEvents: 'none',
                zIndex: 999999, // Max z-index to sit above TutorialHero and Modals
                mixBlendMode: 'difference',
                opacity: hidden ? 0 : 1,
                transition: 'opacity 0.2s ease',
            }}
        />
    );
}
