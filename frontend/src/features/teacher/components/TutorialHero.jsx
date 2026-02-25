import React, { useState, useEffect, useRef } from 'react';
import gsap from 'gsap-trial';

export default function TutorialHero({ steps, onComplete }) {
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const containerRef = useRef(null);
    const heroRef = useRef(null);
    const bubbleRef = useRef(null);
    const eyeLeftRef = useRef(null);
    const eyeRightRef = useRef(null);
    const highlightRef = useRef(null);
    const faceGroupRef = useRef(null);
    const antennaRef = useRef(null);

    const step = steps[currentStepIndex];
    const isFlipped = step?.placement === 'left';

    useEffect(() => {
        // Initial intro animation
        gsap.set(containerRef.current, { x: window.innerWidth / 2, y: window.innerHeight / 2, opacity: 0, scale: 0 });
        gsap.set(highlightRef.current, { opacity: 0 });

        const tl = gsap.timeline();
        tl.to(containerRef.current, {
            opacity: 1, scale: 1, duration: 0.8, ease: "elastic.out(1, 0.5)"
        });

        // Ambient hovering animation
        gsap.to(heroRef.current, {
            y: -10,
            duration: 1.5,
            yoyo: true,
            repeat: -1,
            ease: "sine.inOut"
        });

        // Blinking eyes
        const blinkTl = gsap.timeline({ repeat: -1, repeatDelay: 3 });
        blinkTl.to([eyeLeftRef.current, eyeRightRef.current], {
            scaleY: 0.1, duration: 0.1, transformOrigin: 'center'
        }).to([eyeLeftRef.current, eyeRightRef.current], {
            scaleY: 1, duration: 0.1, transformOrigin: 'center'
        });

        // Mouse Tracking
        const xTo = gsap.quickTo(faceGroupRef.current, "x", { duration: 0.4, ease: "power3" });
        const yTo = gsap.quickTo(faceGroupRef.current, "y", { duration: 0.4, ease: "power3" });

        const handleMouseMove = (e) => {
            if (!heroRef.current) return;
            const rect = heroRef.current.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            // Calculate distance vector
            const deltaX = (e.clientX - centerX) / (window.innerWidth / 2);
            const deltaY = (e.clientY - centerY) / (window.innerHeight / 2);

            // Constrain movement to 10px radius
            xTo(deltaX * 6);
            yTo(deltaY * 6);
        };

        window.addEventListener('mousemove', handleMouseMove);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            gsap.killTweensOf(containerRef.current);
            gsap.killTweensOf(heroRef.current);
            gsap.killTweensOf([eyeLeftRef.current, eyeRightRef.current]);
            gsap.killTweensOf(highlightRef.current);
            gsap.killTweensOf(faceGroupRef.current);
        };
    }, []);

    useEffect(() => {
        if (!step) return;

        let targetX = window.innerWidth / 2;
        let targetY = window.innerHeight / 2;

        const animateMove = (x, y, hlRect) => {
            const jumpTl = gsap.timeline();

            const startX = gsap.getProperty(containerRef.current, "x");
            const startY = gsap.getProperty(containerRef.current, "y");

            // Calculate a simple, clean arc
            // Instead of moving midX/midY sequentially, we move X linearly and Y with a yoyo effect
            const movingRight = x > startX;
            const targetRotationY = movingRight ? 0 : 180;

            const duration = 0.8;

            jumpTl.to(bubbleRef.current, { scale: 0, opacity: 0, duration: 0.2, ease: "back.in(2)" })
                .to(highlightRef.current, { opacity: 0, duration: 0.2 }, "<")
                // Anticipation Squash
                .to(heroRef.current, { scaleY: 0.7, scaleX: 1.3, duration: 0.15 })
                // Turn mid-squash
                .to(heroRef.current, { rotationY: targetRotationY, duration: 0.1 }, "<0.05");

            // Launch! We run X and Y tweens at the same time but with different eases for the arc.
            // X moves steadily from A to B.
            jumpTl.to(containerRef.current, { x: x, duration: duration, ease: "slow(0.3, 0.4, false)" }, "jump");

            // Y goes UP to a peak, then DOWN to target Y.
            // We use a custom ease rough approximation by splitting it, or we just rely on GSAP's built-in bezier if available.
            // For a pure JS arc without plugins:
            const peakY = Math.min(startY, y) - 200; // Jump high

            jumpTl.to(containerRef.current, {
                y: peakY,
                duration: duration * 0.4, // Go up faster
                ease: "sine.out"
            }, "jump")
                .to(containerRef.current, {
                    y: y,
                    duration: duration * 0.6, // Come down slower
                    ease: "power2.in"
                }, `jump+=${duration * 0.4}`);

            // Stretch in air
            jumpTl.to(heroRef.current, { scaleY: 1.3, scaleX: 0.8, duration: duration * 0.4 }, "jump")
                // Recover stretch while falling
                .to(heroRef.current, { scaleY: 1, scaleX: 1, duration: duration * 0.4 }, `jump+=${duration * 0.4}`);

            // Landing squash
            jumpTl.to(heroRef.current, { scaleY: 0.6, scaleX: 1.4, duration: 0.15 })
                // Recover
                .to(heroRef.current, { scaleY: 1, scaleX: 1, duration: 0.4, ease: "elastic.out(1.5, 0.4)" });

            if (hlRect) {
                jumpTl.set(highlightRef.current, {
                    top: hlRect.top - 10,
                    left: hlRect.left - 10,
                    width: hlRect.width + 20,
                    height: hlRect.height + 20,
                }).to(highlightRef.current, { opacity: 1, duration: 0.4 }, "-=0.2");
            } else {
                jumpTl.to(highlightRef.current, { opacity: 0, duration: 0.1 }, "-=0.2");
            }

            jumpTl.to(bubbleRef.current, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(1.5)" }, hlRect ? "<" : "-=0.2");
        };

        if (step.selector) {
            const el = document.querySelector(step.selector);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

                // Wait briefly for scroll to settle
                setTimeout(() => {
                    const rect = el.getBoundingClientRect();
                    const placement = step.placement || 'right';

                    targetY = rect.top + (rect.height / 2);
                    if (placement === 'right') {
                        targetX = rect.right + 220;
                    } else if (placement === 'left') {
                        targetX = rect.left - 220;
                    }

                    // Strict bounds checking
                    if (targetX < 150) targetX = 150;
                    if (targetX > window.innerWidth - 200) targetX = window.innerWidth - 200;
                    if (targetY < 100) targetY = 100;
                    if (targetY > window.innerHeight - 100) targetY = window.innerHeight - 100;

                    animateMove(targetX, targetY, rect);
                }, 300);
                return; // Wait for timeout
            }
        }

        // Default or center placement
        animateMove(targetX, targetY, null);

    }, [currentStepIndex, step]);

    const handleNext = () => {
        if (currentStepIndex < steps.length - 1) {
            setCurrentStepIndex(currentStepIndex + 1);
        } else {
            // Outro Cinematic Jump
            const outroTl = gsap.timeline({ onComplete: onComplete });

            // 1. Hide bubble and spotlight first
            outroTl.to([bubbleRef.current, highlightRef.current], {
                scale: 0, opacity: 0, duration: 0.3, ease: "back.in(2)"
            })
                // 2. Robot Anticipation (Squash hard)
                .to(heroRef.current, {
                    scaleY: 0.5, scaleX: 1.5, duration: 0.2, ease: "power2.inOut"
                })
                // 3. BLAST OFF (Jump off-screen downwards)
                .to(containerRef.current, {
                    y: window.innerHeight + 200, // way past bottom
                    duration: 0.5,
                    ease: "power2.in"
                }, "jump")
                .to(heroRef.current, {
                    scaleY: 2, scaleX: 0.5, duration: 0.5 // Stretch extremely while falling
                }, "jump");
        }
    };

    if (!steps || steps.length === 0) return null;

    return (
        <>
            {/* Spotlight Highlight Overlay */}
            <div
                ref={highlightRef}
                style={{
                    position: 'fixed',
                    pointerEvents: 'none',
                    border: '4px solid var(--accent-primary)',
                    borderRadius: '8px',
                    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5), 0 0 30px rgba(255, 59, 48, 0.6)',
                    zIndex: 9998,
                    opacity: 0,
                    transition: 'opacity 0.2s ease'
                }}
            />

            {/* Hero Container */}
            <div
                ref={containerRef}
                style={{
                    position: 'fixed',
                    top: 0, left: 0,
                    zIndex: 9999,
                    pointerEvents: 'none',
                    display: 'flex',
                    flexDirection: isFlipped ? 'row-reverse' : 'row',
                    alignItems: 'center',
                    transform: 'translate(-50%, -50%)'
                }}
            >
                {/* SVG Hero */}
                <div
                    ref={heroRef}
                    style={{ pointerEvents: 'auto', position: 'relative', width: 80, height: 80, flexShrink: 0, cursor: 'pointer' }}
                    onMouseEnter={() => {
                        gsap.to(heroRef.current, { scale: 1.1, duration: 0.4, ease: 'back.out(3)' });
                        // Fixed SVG transform origin by using svgOrigin instead of CSS transformOrigin
                        gsap.to(antennaRef.current, { rotation: 35, svgOrigin: "50 20", duration: 0.1, yoyo: true, repeat: 5, ease: 'sine.inOut' });
                    }}
                    onMouseLeave={() => {
                        gsap.to(heroRef.current, { scale: 1, duration: 0.4, ease: 'back.out(2)' });
                    }}
                >
                    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ overflow: 'visible' }}>
                        {/* Antennas */}
                        <g ref={antennaRef}>
                            <path d="M 50 20 L 50 5" stroke="#111827" strokeWidth="3" />
                            <circle cx="50" cy="5" r="4" fill="#FF3B30" />
                        </g>

                        {/* Main Head/Body */}
                        <rect x="15" y="20" width="70" height="60" rx="30" fill="white" stroke="#111827" strokeWidth="4" />

                        {/* Face Group (Tracks Mouse) */}
                        <g ref={faceGroupRef}>
                            <rect x="25" y="30" width="50" height="35" rx="15" fill="#111827" />

                            <rect ref={eyeLeftRef} x="35" y="42" width="8" height="12" rx="4" fill="white" />
                            <rect ref={eyeRightRef} x="57" y="42" width="8" height="12" rx="4" fill="white" />

                            <circle cx="30" cy="55" r="4" fill="#FF3B30" opacity="0.6" />
                            <circle cx="70" cy="55" r="4" fill="#FF3B30" opacity="0.6" />
                        </g>
                    </svg>
                </div>

                {/* Speech Bubble */}
                <div
                    ref={bubbleRef}
                    style={{
                        pointerEvents: 'auto',
                        marginLeft: isFlipped ? 0 : '20px',
                        marginRight: isFlipped ? '20px' : 0,
                        background: 'white',
                        border: '2px solid black',
                        borderRadius: '0px', // SHARP corners
                        padding: '1.5rem',
                        width: '320px',
                        boxShadow: 'none',
                        position: 'relative',
                        opacity: 0,
                        transform: 'scale(0)',
                        transformOrigin: isFlipped ? 'right center' : 'left center'
                    }}
                >
                    {/* Bubble Tail */}
                    <div style={{
                        position: 'absolute',
                        left: isFlipped ? 'auto' : '-10px',
                        right: isFlipped ? '-10px' : 'auto',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: 0,
                        height: 0,
                        borderTop: '10px solid transparent',
                        borderBottom: '10px solid transparent',
                        borderRight: isFlipped ? 'none' : '10px solid black',
                        borderLeft: isFlipped ? '10px solid black' : 'none'
                    }}>
                        <div style={{
                            position: 'absolute',
                            left: isFlipped ? 'auto' : '3px',
                            right: isFlipped ? '3px' : 'auto',
                            top: '-7px',
                            width: 0,
                            height: 0,
                            borderTop: '7px solid transparent',
                            borderBottom: '7px solid transparent',
                            borderRight: isFlipped ? 'none' : '7px solid white',
                            borderLeft: isFlipped ? '7px solid white' : 'none'
                        }} />
                    </div>

                    <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--accent-primary)', fontWeight: 800, marginBottom: '0.5rem', letterSpacing: '0.05em' }}>
                        Шаг {currentStepIndex + 1} из {steps.length}
                    </div>

                    <h4 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.5rem', lineHeight: 1.2, color: 'black' }}>
                        {step.title}
                    </h4>

                    <p style={{ fontSize: '0.95rem', color: '#4B5563', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                        {step.text}
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button
                            className="btn btn-ghost"
                            onClick={onComplete}
                            style={{ fontSize: '0.8rem', padding: '0.5rem 0.5rem' }}
                        >
                            Закрыть
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleNext}
                            style={{ fontSize: '0.9rem', padding: '0.5rem 1rem' }}
                        >
                            {currentStepIndex < steps.length - 1 ? 'ДАЛЬШЕ →' : 'ЗАВЕРШИТЬ ✓'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}
