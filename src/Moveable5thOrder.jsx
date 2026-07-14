import React, { useEffect, useRef, useState } from 'react';

const vsSource = `#version 300 es
  in vec2 position;
  void main() {
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

// Fragment shader computes the general 5th-order Newton fractal for dynamic complex roots
const fsSource = `#version 300 es
  precision highp float;
  out vec4 fragColor;

  uniform vec2 u_resolution;
  uniform vec2 u_center;
  uniform float u_zoom;
  
  // Custom complex roots passed dynamically as uniforms
  uniform vec2 u_r1;
  uniform vec2 u_r2;
  uniform vec2 u_r3;
  uniform vec2 u_r4;
  uniform vec2 u_r5;

  // Complex multiplication helper: (a.x + i*a.y) * (b.x + i*b.y)
  vec2 complexMul(vec2 a, vec2 b) {
    return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
  }

  // Complex division helper: a / b
  vec2 complexDiv(vec2 a, vec2 b) {
    float denom = dot(b, b);
    if (denom < 1e-10) return vec2(0.0);
    return vec2(dot(a, b), a.y * b.x - a.x * b.y) / denom;
  }

  void main() {
    // Map screen coordinates to complex plane matching aspect ratio
    vec2 st = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
    vec2 z = u_center + st * u_zoom;

    int maxIterations = 80;
    int rootFound = 0;
    float iterCount = 0.0;
    float tolerance = 0.01; // Tolerance for root convergence

    for (int i = 0; i < maxIterations; i++) {
      // General formulation: P(z) = (z-r1)(z-r2)(z-r3)(z-r4)(z-r5)
      vec2 d1 = z - u_r1;
      vec2 d2 = z - u_r2;
      vec2 d3 = z - u_r3;
      vec2 d4 = z - u_r4;
      vec2 d5 = z - u_r5;

      // P(z)
      vec2 pz = complexMul(complexMul(complexMul(complexMul(d1, d2), d3), d4), d5);

      // Derivative via Product Rule: 
      // P'(z) = (d2*d3*d4*d5) + (d1*d3*d4*d5) + (d1*d2*d4*d5) + (d1*d2*d3*d5) + (d1*d2*d3*d4)
      vec2 term1 = complexMul(complexMul(complexMul(d2, d3), d4), d5);
      vec2 term2 = complexMul(complexMul(complexMul(d1, d3), d4), d5);
      vec2 term3 = complexMul(complexMul(complexMul(d1, d2), d4), d5);
      vec2 term4 = complexMul(complexMul(complexMul(d1, d2), d3), d5);
      vec2 term5 = complexMul(complexMul(complexMul(d1, d2), d3), d4);

      vec2 dpz = term1 + term2 + term3 + term4 + term5;
      
      if (length(dpz) < 1e-6) break; // Avoid division by zero at critical/saddle points

      z = z - complexDiv(pz, dpz);
      iterCount += 1.0;

      // Convergence checks
      if (length(z - u_r1) < tolerance) { rootFound = 1; break; }
      if (length(z - u_r2) < tolerance) { rootFound = 2; break; }
      if (length(z - u_r3) < tolerance) { rootFound = 3; break; }
      if (length(z - u_r4) < tolerance) { rootFound = 4; break; }
      if (length(z - u_r5) < tolerance) { rootFound = 5; break; }
    }

    // --- TOKYO NIGHT SUBDUED DOMAIN PALETTE ---
    vec3 color = vec3(0.094, 0.106, 0.145); // Dark Tokyo Night background (#181b25)

    if (rootFound == 1) {
      color = vec3(0.518, 0.247, 0.627); // Subdued Fuchsia (#bd5ae5)
    } else if (rootFound == 2) {
      color = vec3(0.380, 0.314, 0.639); // Subdued Purple (#8e76f0)
    } else if (rootFound == 3) {
      color = vec3(0.129, 0.525, 0.612); // Subdued Cyan/Blue (#30c3e4)
    } else if (rootFound == 4) {
      color = vec3(0.600, 0.210, 0.290); // Subdued Pink/Red (#f7768e)
    } else if (rootFound == 5) {
      color = vec3(0.340, 0.490, 0.220); // Subdued Olive/Green (#9ece6a)
    }

    // Smooth shading via iteration depth
    float smoothFactor = iterCount / float(maxIterations);
    
    // Mix the color smoothly into the Tokyo Night background
    color = mix(color, vec3(0.094, 0.106, 0.145), pow(smoothFactor, 0.7));

    fragColor = vec4(color, 1.0);
  }
`;

export default function Moveable5thOrder() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  
  // Default viewpoint parameters
  const [center, setCenter] = useState([0, 0]);
  const [zoom, setZoom] = useState(3.0);

  // Symmetry layout values on the Unit Circle (Pentagram structure)
  // Theta_k = 2 * PI * k / 5 for k = 0.4
  const defaultRoots = [
    [1.0, 0.0],                        // Root 1 (Fuchsia)
    [0.309017, 0.9510565],             // Root 2 (Purple)
    [-0.809017, 0.587785],             // Root 3 (Cyan)
    [-0.809017, -0.587785],            // Root 4 (Red)
    [0.309017, -0.9510565]             // Root 5 (Green)
  ];

  const [roots, setRoots] = useState(defaultRoots);
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const [activeRootIdx, setActiveRootIdx] = useState(null);

  const isZoomingRef = useRef(false);
  const pointerPosRef = useRef({ x: 0, y: 0 });
  const viewStateRef = useRef({ center: [0, 0], zoom: 3.0 });
  const rootsRef = useRef(defaultRoots);

  // Sync state data with animation loop refs to keep rendering decoupled from heavy React renders
  useEffect(() => {
    viewStateRef.current = { center, zoom };
  }, [center, zoom]);

  useEffect(() => {
    rootsRef.current = roots;
  }, [roots]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl2', { antialias: false });
    if (!gl) { console.error('WebGL 2 not supported.'); return; }

    const createShader = (gl, type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      return;
    }

    const vertices = new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const positionLoc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    gl.useProgram(program);

    // Track WebGL uniform references
    const resLoc = gl.getUniformLocation(program, 'u_resolution');
    const centerLoc = gl.getUniformLocation(program, 'u_center');
    const zoomLoc = gl.getUniformLocation(program, 'u_zoom');
    const r1Loc = gl.getUniformLocation(program, 'u_r1');
    const r2Loc = gl.getUniformLocation(program, 'u_r2');
    const r3Loc = gl.getUniformLocation(program, 'u_r3');
    const r4Loc = gl.getUniformLocation(program, 'u_r4');
    const r5Loc = gl.getUniformLocation(program, 'u_r5');

    let animationFrameId;

    const render = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        setDimensions({ width, height });
        gl.viewport(0, 0, canvas.width, canvas.height);
      }

      // Handle zooming viewport logic if backdrop is clicked
      if (isZoomingRef.current) {
        const { center: curCenter, zoom: curZoom } = viewStateRef.current;
        const p = pointerPosRef.current;
        const minDim = Math.min(canvas.width, canvas.height);
        const stX = (p.x - 0.5 * canvas.width) / minDim;
        const stY = ((canvas.height - p.y) - 0.5 * canvas.height) / minDim; 
        
        const tx = curCenter[0] + stX * curZoom;
        const ty = curCenter[1] + stY * curZoom;

        const zoomFac = 0.965; // High responsiveness zoom scaling
        const nextZoom = curZoom * zoomFac;
        const nextCenterX = curCenter[0] + (tx - curCenter[0]) * (1.0 - zoomFac);
        const nextCenterY = curCenter[1] + (ty - curCenter[1]) * (1.0 - zoomFac);

        setCenter([nextCenterX, nextCenterY]);
        setZoom(nextZoom);
      }

      // Upload view coordinates to shader
      gl.uniform2f(resLoc, canvas.width, canvas.height);
      gl.uniform2f(centerLoc, viewStateRef.current.center[0], viewStateRef.current.center[1]);
      gl.uniform1f(zoomLoc, viewStateRef.current.zoom);

      // Upload the five dynamic roots coordinates
      const currentRoots = rootsRef.current;
      gl.uniform2f(r1Loc, currentRoots[0][0], currentRoots[0][1]);
      gl.uniform2f(r2Loc, currentRoots[1][0], currentRoots[1][1]);
      gl.uniform2f(r3Loc, currentRoots[2][0], currentRoots[2][1]);
      gl.uniform2f(r4Loc, currentRoots[3][0], currentRoots[3][1]);
      gl.uniform2f(r5Loc, currentRoots[4][0], currentRoots[4][1]);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    };
  }, []);

  // Convert coordinate from Complex Plane -> Screen Viewport Pixels
  const complexToScreen = (re, im) => {
    const { width, height } = dimensions;
    const minDim = Math.min(width, height);
    const x = (re - center[0]) * minDim / zoom + 0.5 * width;
    const y = height - ((im - center[1]) * minDim / zoom + 0.5 * height);
    return { x, y };
  };

  // Convert coordinate from Screen Viewport Pixels -> Complex Plane
  const screenToComplex = (x, y) => {
    const { width, height } = dimensions;
    const minDim = Math.min(width, height);
    const stX = (x - 0.5 * width) / minDim;
    const stY = ((height - y) - 0.5 * height) / minDim;
    return {
      re: center[0] + stX * zoom,
      im: center[1] + stY * zoom
    };
  };

  const handlePointerDown = (e, index = null) => {
    const rect = containerRef.current.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    const x = cx - rect.left;
    const y = cy - rect.top;

    if (index !== null) {
      // Start dragging root handle
      e.stopPropagation();
      setActiveRootIdx(index);
    } else {
      // Background click: Trigger continuous smooth zooming
      isZoomingRef.current = true;
      pointerPosRef.current = { x, y };
    }
  };

  const handlePointerMove = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const cx = e.touches ? e.touches[0].clientX : e.clientX;
    const cy = e.touches ? e.touches[0].clientY : e.clientY;
    const x = cx - rect.left;
    const y = cy - rect.top;

    if (activeRootIdx !== null) {
      // Update dragged root value dynamically
      const { re, im } = screenToComplex(x, y);
      const updatedRoots = [...roots];
      updatedRoots[activeRootIdx] = [re, im];
      setRoots(updatedRoots);
    } else if (isZoomingRef.current) {
      // Update camera center reference targeting cursor
      pointerPosRef.current = { x, y };
    }
  };

  const handlePointerUp = () => {
    setActiveRootIdx(null);
    isZoomingRef.current = false;
  };

  const handleReset = () => {
    isZoomingRef.current = false;
    setActiveRootIdx(null);
    setCenter([0, 0]);
    setZoom(3.0);
    setRoots(defaultRoots);
  };

  // Pre-calculate current coordinates of all roots to position SVG overlays
  const rootHandles = roots.map((root, i) => {
    const pos = complexToScreen(root[0], root[1]);
    return { ...pos, id: i };
  });

  // Tokyo Night design system aesthetics
  const tokyoDark = '#181b25';
  const tokyoText = '#a9b1d6';
  const tokyoSubtleText = '#565f89';
  const tokyoAccents = '#3d59a1';
  
  // Custom vibrant matching handles indicating domain root hues
  const rootColors = [
    '#bd5ae5', // Root 1 (Fuchsia)
    '#8e76f0', // Root 2 (Purple)
    '#30c3e4', // Root 3 (Cyan)
    '#f7768e', // Root 4 (Red/Pink)
    '#9ece6a'  // Root 5 (Green)
  ];

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '1rem', 
      width: '100%', 
      maxWidth: '900px', 
      margin: '0 auto',
      backgroundColor: tokyoDark, 
      padding: '1.2rem',
      borderRadius: '8px',
      color: tokyoText, 
      fontFamily: 'SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace',
      userSelect: 'none'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 500, color: '#f7768e' }}>Dynamic 5th-Order Newton's Fractal</h2>
          <small style={{ color: tokyoSubtleText }}>
            Zoom Depth: {(3.0 / zoom).toFixed(1)}x | Roots: 5 Drag-enabled Handles
          </small>
        </div>
        <button 
          onClick={handleReset}
          style={{ 
            padding: '0.6rem 1.2rem', 
            cursor: 'pointer', 
            borderRadius: '4px', 
            border: `1px solid ${tokyoAccents}`, 
            backgroundColor: 'transparent',
            color: tokyoText,
            transition: 'background 0.2s, border-color 0.2s',
          }}
          onMouseEnter={(e) => { e.target.style.background = '#202a3f'; e.target.style.borderColor = '#7aa2f7'; }} 
          onMouseLeave={(e) => { e.target.style.background = 'transparent'; e.target.style.borderColor = tokyoAccents; }}
        >
          Reset View
        </button>
      </div>

      <div 
        ref={containerRef}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerUp}
        style={{
          position: 'relative',
          width: '100%',
          height: '560px',
          borderRadius: '4px',
          overflow: 'hidden'
        }}
      >
        {/* WebGL Canvas */}
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: '#000',
            zIndex: 1
          }}
        />

        {/* SVG Interactive Overlay Handle Deck */}
        <svg
          onMouseDown={(e) => handlePointerDown(e)}
          onTouchStart={(e) => handlePointerDown(e)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 2,
            cursor: activeRootIdx !== null ? 'grabbing' : 'crosshair',
            touchAction: 'none'
          }}
        >
          {rootHandles.map((handle) => (
            <g key={handle.id}>
              {/* Invisible large touch boundary circle to make grabbing easy */}
              <circle
                cx={handle.x}
                cy={handle.y}
                r={24}
                fill="transparent"
                style={{ cursor: 'grab' }}
                onMouseDown={(e) => handlePointerDown(e, handle.id)}
                onTouchStart={(e) => handlePointerDown(e, handle.id)}
              />
              {/* Outer stroke showing the root target color with subtle glow filter */}
              <circle
                cx={handle.x}
                cy={handle.y}
                r={13}
                fill="#16161e"
                stroke={rootColors[handle.id]}
                strokeWidth={3}
                style={{ pointerEvents: 'none', filter: 'drop-shadow(0px 0px 4px rgba(0,0,0,0.5))' }}
              />
              {/* Center point indicator */}
              <circle
                cx={handle.x}
                cy={handle.y}
                r={4}
                fill="#ffffff"
                style={{ pointerEvents: 'none' }}
              />
              {/* Root labels */}
              <text
                x={handle.x}
                y={handle.y - 20}
                textAnchor="middle"
                fill="#ffffff"
                fontSize="11px"
                fontWeight="bold"
                style={{ pointerEvents: 'none', paintOrder: 'stroke', stroke: '#181b25', strokeWidth: '4px' }}
              >
                r{handle.id + 1}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div style={{ textAlign: 'center', color: tokyoSubtleText, fontSize: '0.85rem', lineHeight: '1.4' }}>
        • Drag the <strong>r1 through r5</strong> target handles to modify the root positions dynamically.<br />
        • Click and hold on any region of the fractal structure to smoothly zoom in on that area.
      </div>
    </div>
  );
}
