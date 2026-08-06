import type mapboxgl from "mapbox-gl";

// Screen-space "living pixel" shader pass: film grain + a cursor-reactive sun-glint
// that lags toward the pointer, tinted by the same day/night sun progress driving
// MasterplanLayer's lighting. Additive blend at low intensity — it enriches the real
// aerial imagery/masterplan underneath, never replaces or obscures it.

export interface AtmosphereLayer extends mapboxgl.CustomLayerInterface {
  /** Normalized 0..1 viewport coordinates. */
  setMouse(xNorm: number, yNorm: number): void;
  /** 0 = night, ~0.17 = dawn/dusk gold, 1 = midday — mirror MasterplanLayer's sun progress. */
  setSunT(t: number): void;
  /** 0 = off, 1 = full — fade this in/out per journey stage instead of toggling the layer. */
  setIntensity(v: number): void;
}

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAG = `
precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uMouse;
uniform float uSunT;
uniform float uIntensity;
uniform vec2 uResolution;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 uv = (vUv - 0.5) * vec2(aspect, 1.0);
  vec2 mouse = (uMouse - 0.5) * vec2(aspect, 1.0);

  float grain = (hash(vUv * uResolution.xy + uTime) - 0.5) * 0.035;

  float d = length(uv - mouse);
  float glint = smoothstep(0.55, 0.0, d) * (0.8 + 0.2 * sin(uTime * 1.6));

  vec3 nightTint = vec3(0.10, 0.14, 0.30);
  vec3 dawnTint = vec3(1.0, 0.72, 0.42);
  vec3 dayTint = vec3(1.0, 0.96, 0.88);
  vec3 tint = uSunT < 0.166
    ? mix(nightTint, dawnTint, uSunT / 0.166)
    : mix(dawnTint, dayTint, (uSunT - 0.166) / 0.834);

  vec3 color = tint * glint * 0.6 + vec3(grain);
  float alpha = clamp(glint * 0.5 + abs(grain) * 0.5, 0.0, 1.0) * uIntensity;
  gl_FragColor = vec4(color, alpha);
}
`;

function compile(gl: WebGLRenderingContext | WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("AtmosphereLayer: createShader failed");
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`AtmosphereLayer shader compile failed: ${log}`);
  }
  return shader;
}

function link(gl: WebGLRenderingContext | WebGL2RenderingContext, vert: WebGLShader, frag: WebGLShader): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("AtmosphereLayer: createProgram failed");
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`AtmosphereLayer program link failed: ${log}`);
  }
  return program;
}

export function createAtmosphereLayer(id: string): AtmosphereLayer {
  let program: WebGLProgram | null = null;
  let posBuffer: WebGLBuffer | null = null;
  let posLoc = 0;
  let uTime: WebGLUniformLocation | null = null;
  let uMouse: WebGLUniformLocation | null = null;
  let uSunT: WebGLUniformLocation | null = null;
  let uIntensity: WebGLUniformLocation | null = null;
  let uResolution: WebGLUniformLocation | null = null;
  let mouse: [number, number] = [0.5, 0.5];
  let sunT = 1;
  let intensity = 0;
  const start = performance.now();

  return {
    id,
    type: "custom",
    renderingMode: "2d",

    setMouse(x, y) {
      mouse = [x, y];
    },
    setSunT(t) {
      sunT = t;
    },
    setIntensity(v) {
      intensity = v;
    },

    onAdd(_map, gl) {
      const vs = compile(gl, gl.VERTEX_SHADER, VERT);
      const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
      program = link(gl, vs, fs);
      gl.deleteShader(vs);
      gl.deleteShader(fs);

      posLoc = gl.getAttribLocation(program, "aPos");
      posBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      // fullscreen triangle, overshoots clip space on two sides — cheaper than a quad
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

      uTime = gl.getUniformLocation(program, "uTime");
      uMouse = gl.getUniformLocation(program, "uMouse");
      uSunT = gl.getUniformLocation(program, "uSunT");
      uIntensity = gl.getUniformLocation(program, "uIntensity");
      uResolution = gl.getUniformLocation(program, "uResolution");
    },

    render(gl) {
      if (!program || intensity <= 0.001) return;
      gl.useProgram(program);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

      gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      gl.uniform2f(uMouse, mouse[0], mouse[1]);
      gl.uniform1f(uSunT, sunT);
      gl.uniform1f(uIntensity, intensity);
      gl.uniform2f(uResolution, gl.drawingBufferWidth, gl.drawingBufferHeight);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.disableVertexAttribArray(posLoc);
      gl.disable(gl.BLEND);
    },

    onRemove(_map, gl) {
      if (posBuffer) gl.deleteBuffer(posBuffer);
      if (program) gl.deleteProgram(program);
      program = null;
      posBuffer = null;
    },
  };
}
