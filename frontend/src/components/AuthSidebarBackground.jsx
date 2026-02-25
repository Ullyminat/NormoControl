import { useEffect, useRef } from 'react';
import gsap from 'gsap-trial';

export default function AuthSidebarBackground() {
    const containerRef = useRef(null);
    const gridRef = useRef(null);
    const nodesRef = useRef(null);
    const circlesRef = useRef(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        // Continuous slow rotation for the abstract elements to keep it alive
        gsap.to(gridRef.current, { rotation: 360, duration: 150, repeat: -1, ease: 'linear', transformOrigin: 'center' });
        gsap.to(nodesRef.current, { rotation: -360, duration: 200, repeat: -1, ease: 'linear', transformOrigin: 'center' });
        gsap.to(circlesRef.current, { rotation: 360, duration: 100, repeat: -1, ease: 'linear', transformOrigin: 'center' });

        // Continuous breathing/scaling (Squash/Stretch inspiration)
        gsap.to([gridRef.current, nodesRef.current, circlesRef.current], {
            scale: 1.05,
            duration: 4,
            yoyo: true,
            repeat: -1,
            ease: "sine.inOut",
            stagger: 1.5
        });

        // Parallax Mouse tracking
        const xToGrid = gsap.quickTo(gridRef.current, "x", { duration: 0.6, ease: "power3" });
        const yToGrid = gsap.quickTo(gridRef.current, "y", { duration: 0.6, ease: "power3" });

        const xToNodes = gsap.quickTo(nodesRef.current, "x", { duration: 0.8, ease: "power3" });
        const yToNodes = gsap.quickTo(nodesRef.current, "y", { duration: 0.8, ease: "power3" });

        const xToCircles = gsap.quickTo(circlesRef.current, "x", { duration: 1, ease: "power3" });
        const yToCircles = gsap.quickTo(circlesRef.current, "y", { duration: 1, ease: "power3" });

        const handleMouseMove = (e) => {
            const rect = container.getBoundingClientRect();
            // Calculate mouse position relative to center of the container (-1 to 1)
            const x = (e.clientX - rect.left - rect.width / 2) / (rect.width / 2);
            const y = (e.clientY - rect.top - rect.height / 2) / (rect.height / 2);

            // Move layers by different amounts for depth (parallax)
            xToGrid(x * -20);
            yToGrid(y * -20);

            xToNodes(x * 30);
            yToNodes(y * 30);

            xToCircles(x * -40);
            yToCircles(y * -40);
        };

        // Reset positions gracefully when mouse leaves
        const handleMouseLeave = () => {
            xToGrid(0); yToGrid(0);
            xToNodes(0); yToNodes(0);
            xToCircles(0); yToCircles(0);
        };

        container.addEventListener('mousemove', handleMouseMove);
        container.addEventListener('mouseleave', handleMouseLeave);

        return () => {
            container.removeEventListener('mousemove', handleMouseMove);
            container.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, []);

    // Create a 20x20 grid of small dots/crosses mimicking an engineering blueprint or norm control grid
    const createGrid = () => {
        let lines = [];
        for (let i = 0; i < 20; i++) {
            lines.push(<line key={`h${i}`} x1="0" y1={i * 50} x2="1000" y2={i * 50} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />);
            lines.push(<line key={`v${i}`} x1={i * 50} y1="0" x2={i * 50} y2="1000" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />);
        }
        return lines;
    };

    return (
        <div ref={containerRef} style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            pointerEvents: 'auto', // Capture mouse events for parallax
            zIndex: 0
        }}>
            {/* The SVG scale is increased slightly so boundaries aren't visible during parallax shifts */}
            <svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%', position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%) scale(1.5)' }}>
                {/* Layer 1: Background Engineering Grid */}
                <g ref={gridRef}>
                    {createGrid()}
                </g>

                {/* Layer 2: Abstract Control Nodes and Paths (NormoControl Check Marks context) */}
                <g ref={nodesRef}>
                    <path d="M 200 300 Q 400 100, 600 400 T 800 200" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
                    <circle cx="200" cy="300" r="4" fill="rgba(255,255,255,0.3)" />
                    <circle cx="600" cy="400" r="4" fill="rgba(255,255,255,0.3)" />
                    <circle cx="800" cy="200" r="4" fill="rgba(255,255,255,0.3)" />

                    <path d="M 100 700 C 300 800, 500 500, 700 700 S 900 600, 950 800" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="5,5" />
                    <rect x="700" y="700" width="6" height="6" fill="rgba(255,255,255,0.4)" transform="translate(-3, -3) rotate(45)" />
                    <rect x="500" y="500" width="6" height="6" fill="rgba(255,255,255,0.4)" transform="translate(-3, -3) rotate(45)" />
                </g>

                {/* Layer 3: Giant Abstract Mathematics Circles (Golden ratio shapes etc, representing norm boundaries) */}
                <g ref={circlesRef}>
                    <circle cx="500" cy="500" r="300" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                    <circle cx="500" cy="500" r="400" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" strokeDasharray="10,20" />
                    <circle cx="500" cy="500" r="150" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
                    {/* Central crosshair / target focal point */}
                    <circle cx="500" cy="500" r="2" fill="rgba(255,255,255,0.5)" />
                    <line x1="485" y1="500" x2="515" y2="500" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
                    <line x1="500" y1="485" x2="500" y2="515" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
                </g>
            </svg>
        </div>
    );
}
