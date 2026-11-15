const vertexSource = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`
const fragmentSource = `
  #extension GL_OES_standard_derivatives : enable
  precision highp float;
  varying vec2 v_uv;
  uniform vec2 u_resolution;
  uniform vec2 u_pointer;
  uniform float u_time;
  uniform float u_scale;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 s = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), s.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), s.x), s.y);
  }

  float fbm(vec2 p) {
    float n = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      n += noise(p) * a;
      p = mat2(1.6, -1.2, 1.2, 1.6) * p + 4.1;
      a *= 0.5;
    }
    return n;
  }

  float terrain(vec2 p, float t) {
    vec2 q = vec2(fbm(p + vec2(0.0, t * 0.012)), fbm(p + vec2(5.2, 1.3) - t * 0.009));
    return fbm(p + q * 1.1);
  }

  // Width is in CSS pixels; antialiasing spans one device pixel so lines stay crisp at any density.
  float isoline(float v, float width) {
    float d = abs(fract(v + 0.5) - 0.5);
    float fw = max(fwidth(v), 1e-4);
    float core = width * u_scale * 0.5;
    return 1.0 - smoothstep(core - 0.5, core + 0.5, d / fw);
  }

  void main() {
    float aspect = u_resolution.x / u_resolution.y;
    vec2 p = v_uv - 0.5;
    p.x *= aspect;
    float t = u_time;
    float px = 1.0 / u_resolution.y;

    vec2 mapPos = p * 1.7 + vec2(t * 0.006, t * 0.002);
    float h = terrain(mapPos, t);

    vec2 pointer = (u_pointer - 0.5) * vec2(aspect, 1.0);
    float lens = exp(-dot(p - pointer, p - pointer) * 18.0);

    vec3 base = vec3(0.047, 0.067, 0.067);
    vec3 mint = vec3(0.64, 0.93, 0.78);
    vec3 color = base;

    float water = 0.36;
    float shore = smoothstep(water - 0.004, water + 0.004, h);

    // Land: faint elevation tint, minor contours, and brighter index contours every fifth level.
    float elevation = smoothstep(water, 0.75, h);
    color += mix(vec3(0.0, 0.025, 0.02), vec3(0.03, 0.045, 0.03), elevation);
    float v = (h - water) * 26.0;
    float minor = isoline(v, 0.9);
    float major = isoline(v / 5.0, 1.5);
    float lineAlpha = minor * 0.06 + major * 0.16;
    color += mint * lineAlpha * (1.0 + lens * 2.5) * shore;

    // Lakes: deep water with faint bathymetry rings and a lit shoreline.
    vec3 lake = vec3(0.022, 0.058, 0.07) + vec3(0.0, 0.02, 0.03) * smoothstep(water - 0.12, water, h);
    lake += vec3(0.25, 0.6, 0.65) * isoline((water - h) * 60.0, 0.9) * 0.035;
    color = mix(lake, color, shore);
    color += mint * isoline((h - water) * 26.0, 1.5) * 0.2 * smoothstep(water - 0.02, water, h) * (1.0 + lens);

    // Study sites scattered across land, each pulsing on its own cycle.
    vec2 g = (p + vec2(t * 0.006, t * 0.002) / 1.7) * 7.0;
    vec2 id = floor(g);
    float r = hash(id + 17.0);
    if (r > 0.62) {
      vec2 site = id + 0.2 + 0.6 * vec2(hash(id + 3.1), hash(id + 9.4));
      float siteH = terrain(site / 7.0 * 1.7, t);
      if (siteH > water + 0.02) {
        float d = length(g - site) / 7.0 / px / u_scale;
        float aa = 1.0 / u_scale;
        float phase = fract(t * 0.12 + r * 7.0);
        float marker = 1.0 - smoothstep(2.2 - aa * 0.5, 2.2 + aa * 0.5, d);
        float ring = (1.0 - smoothstep(0.4, 0.4 + aa, abs(d - phase * 34.0))) * (1.0 - phase) * 0.6;
        color += mint * (marker * 0.6 + ring * 0.3) * (1.0 + lens);
      }
    }

    // Keep the center quiet so the question and controls remain the focal point.
    vec2 c = p * vec2(0.9, 1.7);
    color = mix(color, base, exp(-dot(c, c) * 4.0) * 0.7);
    color *= 1.0 - smoothstep(0.35, 0.95, length(p * vec2(0.75, 1.0))) * 0.45;

    color += (hash(gl_FragCoord.xy + fract(t) * 91.0) - 0.5) / 160.0;
    gl_FragColor = vec4(color, 1.0);
  }
`
export function startTerrain(canvas) {
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: 'low-power',
  })
  if (!gl || !gl.getExtension('OES_standard_derivatives')) return
  function compile(type, source) {
    const shader = gl.createShader(type)
    if (!shader) return null
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader)
      return null
    }
    return shader
  }
  const vertex = compile(gl.VERTEX_SHADER, vertexSource)
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource)
  const program = gl.createProgram()
  if (!vertex || !fragment || !program) {
    if (vertex) gl.deleteShader(vertex)
    if (fragment) gl.deleteShader(fragment)
    if (program) gl.deleteProgram(program)
    return
  }
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return
  }
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  )
  gl.useProgram(program)
  const position = gl.getAttribLocation(program, 'a_position')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
  const time = gl.getUniformLocation(program, 'u_time')
  const resolution = gl.getUniformLocation(program, 'u_resolution')
  const pointerUniform = gl.getUniformLocation(program, 'u_pointer')
  const scaleUniform = gl.getUniformLocation(program, 'u_scale')
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const pointer = { x: -2, y: -2, targetX: -2, targetY: -2 }
  let frame = 0
  let elapsed = 40
  let previous = 0
  let modalPaused = false
  let contextLost = false
  function draw() {
    gl.uniform1f(time, elapsed)
    gl.uniform2f(pointerUniform, pointer.x, pointer.y)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }
  function resize() {
    // Match the display density for crisp contours, but cap the pixel count to keep the GPU cost low.
    const width = window.innerWidth
    const height = window.innerHeight
    const scale = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(5_000_000 / (width * height)))
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.uniform2f(resolution, canvas.width, canvas.height)
    gl.uniform1f(scaleUniform, canvas.width / width)
    if (!contextLost) draw()
  }
  function tick(now) {
    // Render at 30fps; stop requesting frames when hidden, paused, or reduced-motion.
    if (!previous || now - previous >= 1000 / 30) {
      const delta = previous ? Math.min((now - previous) / 1000, 0.1) : 0
      elapsed += delta
      pointer.x += (pointer.targetX - pointer.x) * Math.min(1, delta * 3)
      pointer.y += (pointer.targetY - pointer.y) * Math.min(1, delta * 3)
      previous = now
      draw()
    }
    frame = requestAnimationFrame(tick)
  }
  function sync() {
    cancelAnimationFrame(frame)
    previous = 0
    if (!document.hidden && !motion.matches && !modalPaused && !contextLost)
      frame = requestAnimationFrame(tick)
  }
  function onPointerMove(event) {
    if (modalPaused) return
    pointer.targetX = event.clientX / window.innerWidth
    pointer.targetY = 1 - event.clientY / window.innerHeight
    if (pointer.x < -1) {
      pointer.x = pointer.targetX
      pointer.y = pointer.targetY
    }
  }
  function onContextLost(event) {
    event.preventDefault()
    contextLost = true
    canvas.style.opacity = '0'
    sync()
  }
  const setPaused = (value) => {
    if (modalPaused === value) return
    modalPaused = value
    sync()
  }
  resize()
  canvas.style.opacity = '1'
  sync()
  window.addEventListener('resize', resize)
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  document.addEventListener('visibilitychange', sync)
  motion.addEventListener('change', sync)
  canvas.addEventListener('webglcontextlost', onContextLost)
  return {
    setPaused,
    destroy: () => {
      cancelAnimationFrame(frame)
      canvas.style.opacity = '0'
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('visibilitychange', sync)
      motion.removeEventListener('change', sync)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      gl.deleteBuffer(buffer)
      gl.deleteProgram(program)
    },
  }
}
