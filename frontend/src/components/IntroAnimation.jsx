import { useEffect, useRef } from 'react';
import gsap from 'gsap-trial';

export default function IntroAnimation({ onComplete }) {
    const containerRef = useRef(null);
    const lettersRef = useRef([]);

    const targetWord = "NormoControl.";

    useEffect(() => {
        document.body.style.overflow = 'hidden';

        const tl = gsap.timeline({
            onComplete: () => {
                document.body.style.overflow = '';
                onComplete();
            }
        });

        // Disney Principles: Faster, Punchier, Snappier!

        // 1. Setup Initial "Squashed" state below the baseline
        gsap.set(lettersRef.current, {
            y: 150,
            scaleY: 0.2,
            scaleX: 1.8,
            rotation: () => gsap.utils.random(-25, 25),
            opacity: 0
        });

        // 2. The Leap (Fast and explosive)
        tl.to(lettersRef.current, {
            y: -40,
            scaleY: 1.5,
            scaleX: 0.6,
            opacity: 1,
            rotation: 0,
            duration: 0.25, // Much faster jump
            ease: "power2.out",
            stagger: 0.03 // Tighter overlapping action for a fluid "wave"
        });

        // 3. The Follow Through (Snappy elastic settle)
        tl.to(lettersRef.current, {
            y: 0,
            scaleY: 1,
            scaleX: 1,
            duration: 0.6, // Quicker settle
            ease: "elastic.out(1.2, 0.4)", // More springy resistance
            stagger: 0.03
        }, "-=0.2"); // Overlap slightly more

        // Add a concise pause to read
        tl.to({}, { duration: 0.4 }); // Reduced pause

        // 4. Disappearance Anticipation (Quick squat)
        tl.to(lettersRef.current, {
            y: 30,
            scaleY: 0.5,  // Squishy!
            scaleX: 1.4,
            duration: 0.2, // Super fast crouch
            ease: "sine.inOut",
            stagger: {
                each: 0.015, // Extremely tight wave
                from: "center"
            }
        });

        // 5. The Exit (Shoot off instantly)
        tl.to(lettersRef.current, {
            y: "-120vh",
            scaleY: 2.5, // Extreme speed illusion
            scaleX: 0.3,
            opacity: 0,
            duration: 0.3, // Lightning fast exit
            ease: "power4.in",
            stagger: {
                each: 0.015,
                from: "edges"
            }
        });

        // 6. Background panel fades away briskly
        tl.to(containerRef.current, {
            scale: 1.15,
            opacity: 0,
            duration: 0.4,
            ease: "power2.inOut"
        }, "-=0.15");

        return () => {
            tl.kill();
            document.body.style.overflow = '';
        };
    }, [onComplete]);

    return (
        <div
            ref={containerRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                backgroundColor: 'var(--bg-app, #F4F4F4)',
                borderBottom: '8px solid var(--border-main, #000000)',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
            }}
        >
            <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                <h1
                    style={{
                        fontSize: 'clamp(3rem, 8vw, 6rem)',
                        fontWeight: 800,
                        margin: 0,
                        display: 'flex',
                        letterSpacing: '-0.03em',
                        color: 'var(--text-main, #000000)',
                        whiteSpace: 'nowrap'
                    }}
                >
                    {targetWord.split('').map((char, index) => (
                        <span
                            key={index}
                            ref={el => lettersRef.current[index] = el}
                            style={{
                                display: 'inline-block',
                                minWidth: char === ' ' ? '0.5em' : 'auto',
                                transformOrigin: 'bottom center'
                            }}
                        >
                            {char}
                        </span>
                    ))}
                </h1>
            </div>

            <div
                style={{
                    position: 'absolute',
                    bottom: '2rem',
                    color: 'var(--text-dim, #555)',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '0.85rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em'
                }}
            >
                Loading System //
            </div>
        </div>
    );
}
