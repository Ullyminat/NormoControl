import React, { useRef, useEffect } from 'react';
import gsap from 'gsap-trial';

export default function AnimatedLogo() {
    const containerRef = useRef(null);
    const lettersRef = useRef([]);

    useEffect(() => {
        const ctx = gsap.context(() => { }, containerRef);
        return () => ctx.revert();
    }, []);

    const handleMouseEnter = () => {
        // High-end Apple/Disney Squash & Stretch Wave
        gsap.to(lettersRef.current, {
            y: -8,
            scaleY: 1.15,
            scaleX: 0.9,
            stagger: {
                each: 0.03,
                from: "start",
                yoyo: true,
                repeat: 1
            },
            ease: "sine.inOut",
            duration: 0.25
        });

        // Shape swap animation for 'o's
        lettersRef.current.forEach((el, i) => {
            const isO = [1, 4, 6, 10].includes(i);
            if (isO && el) {
                const textSpan = el.querySelector('.char-text');
                const shapeSpan = el.querySelector('.char-shape');

                // Shrink and spin the 'o' letter
                gsap.to(textSpan, {
                    scale: 0,
                    rotation: -90,
                    opacity: 0,
                    duration: 0.3,
                    ease: "back.in(1.5)"
                });

                // Pop the geometric shape in
                gsap.fromTo(shapeSpan,
                    { scale: 0, rotation: 180, opacity: 0 },
                    {
                        scale: 1,
                        rotation: 0,
                        opacity: 1,
                        duration: 0.6,
                        ease: "elastic.out(1.2, 0.4)",
                        delay: 0.1
                    }
                );
            }
        });

        // The dot acts like a bouncing rubber ball
        const dot = lettersRef.current[12];
        if (dot) {
            gsap.to(dot, {
                y: -15,
                scale: 1.5,
                duration: 0.3,
                ease: "power2.out",
                yoyo: true,
                repeat: 1,
                delay: 0.35
            });
            gsap.to(dot, {
                color: '#FF3B30',
                duration: 0.3,
                delay: 0.35,
                yoyo: true,
                repeat: 1
            });
        }
    };

    const handleMouseLeave = () => {
        // Stop all animations instantly to prevent weird overlaps
        gsap.killTweensOf(lettersRef.current);

        // Restore all letters position and scale
        gsap.to(lettersRef.current, {
            y: 0,
            scaleX: 1,
            scaleY: 1,
            stagger: 0.02,
            ease: "back.out(2)",
            duration: 0.4
        });

        // Restore 'o's specifically
        lettersRef.current.forEach((el, i) => {
            const isO = [1, 4, 6, 10].includes(i);
            if (isO && el) {
                const textSpan = el.querySelector('.char-text');
                const shapeSpan = el.querySelector('.char-shape');

                gsap.killTweensOf([textSpan, shapeSpan]);

                // Hide shape
                gsap.to(shapeSpan, {
                    scale: 0,
                    rotation: 90,
                    opacity: 0,
                    duration: 0.3,
                    ease: "back.in(1.5)"
                });

                // Show original letter
                gsap.to(textSpan, {
                    scale: 1,
                    rotation: 0,
                    opacity: 1,
                    duration: 0.5,
                    ease: "elastic.out(1, 0.5)",
                    delay: 0.1
                });
            }
        });

        const dot = lettersRef.current[12];
        if (dot) {
            gsap.killTweensOf(dot);
            gsap.to(dot, {
                y: 0,
                scale: 1,
                color: '#000000',
                duration: 0.4,
                ease: "bounce.out"
            });
        }
    };

    const text = "NormoControl.";

    // Abstract geometry SVGs inspired by Apple/Swiss design
    const getShapeForIndex = (index) => {
        const size = "0.75em"; // Relative to font size
        if (index === 1) { // Circle - Soft red
            return <svg width={size} height={size} viewBox="0 0 20 20"><circle cx="10" cy="10" r="10" fill="#FF3B30" /></svg>;
        }
        if (index === 4) { // Square - Deep blue
            return <svg width={size} height={size} viewBox="0 0 20 20"><rect x="1" y="1" width="18" height="18" rx="2" fill="#FF3B30" /></svg>;
        }
        if (index === 6) { // Triangle - Vivid green
            return <svg width={size} height={size} viewBox="0 0 20 20"><polygon points="10,0 20,18 0,18" fill="#FF3B30" strokeLinejoin="round" /></svg>;
        }
        if (index === 10) { // Diamond/Rhombus - Warm orange
            return <svg width={size} height={size} viewBox="0 0 20 20"><polygon points="10,0 20,10 10,20 0,10" fill="#FF3B30" /></svg>;
        }
        return null;
    };

    return (
        <div
            ref={containerRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            style={{
                display: 'inline-flex',
                fontSize: '2rem',
                fontWeight: 800,
                lineHeight: 1,
                cursor: 'pointer',
                letterSpacing: '-0.03em',
                padding: '0.2em 0' // Area buffer so hover doesn't break when letters jump
            }}
        >
            {text.split('').map((char, index) => {
                const isDot = char === '.';
                const isO = char === 'o';

                return (
                    <span
                        key={index}
                        ref={el => lettersRef.current[index] = el}
                        style={{
                            display: 'inline-block',
                            color: 'black',
                            transformOrigin: 'center bottom',
                            marginLeft: isDot ? '2px' : '0',
                            position: 'relative'
                        }}
                    >
                        {!isO ? (
                            char
                        ) : (
                            <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                position: 'relative'
                                // Sized naturally by the .char-text
                            }}>
                                <span className="char-text" style={{
                                    display: 'inline-block'
                                }}>
                                    {char}
                                </span>
                                <span className="char-shape" style={{
                                    position: 'absolute',
                                    inset: 0,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    opacity: 0,
                                    transform: 'scale(0)',
                                    marginTop: '0.15em' // Optical alignment to text baseline
                                }}>
                                    {getShapeForIndex(index)}
                                </span>
                            </span>
                        )}
                    </span>
                );
            })}
        </div>
    );
}
