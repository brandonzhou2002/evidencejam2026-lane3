import type { CSSProperties } from 'react'
import './FieldWork.css'

type Point = [number, number]

const ground = 168
const walkStart = -20
const walkDistance = 600
const walkDelay = 0.2
const spout = 29
const seedlingScales = [1, .82, 1.12, .9, 1.05, .86, 1.14, .94, 1]
const pollen = [[96, 6.2, 0], [188, 7.4, 1.6], [262, 5.8, .8], [340, 6.8, 2.4], [418, 7.1, 1.1], [150, 6.5, 3.2]]
const tufts = [64, 114, 158, 246, 334, 422, 470, 538]
const ridge: [Point, Point, Point, Point][] = [
  [[0, 116], [80, 100], [140, 110], [210, 100]],
  [[210, 100], [280, 90], [350, 86], [420, 98]],
  [[420, 98], [490, 110], [520, 108], [560, 100]],
]
const farTrees: Point[] = [[22, .7], [38, .55], [52, .8], [146, .6], [162, .85], [178, .65], [292, .7], [308, .9], [324, .6], [340, .75], [356, .55], [468, .8], [484, .6], [532, .7], [546, .5]]
const steps = ['Gathering studies', 'Weighing the findings', 'Mapping what’s still unknown']

const bezier = (a: number, b: number, c: number, d: number, t: number) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * d
const ridgePath = `M${ridge[0][0].join(' ')} ` + ridge.map(([, c1, c2, end]) => `C${c1.join(' ')} ${c2.join(' ')} ${end.join(' ')}`).join(' ')

function ridgeY(x: number) {
  const [p0, p1, p2, p3] = ridge.find((segment) => x <= segment[3][0]) ?? ridge[ridge.length - 1]
  let low = 0
  let high = 1
  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2
    if (bezier(p0[0], p1[0], p2[0], p3[0], mid) < x) low = mid
    else high = mid
  }
  return bezier(p0[1], p1[1], p2[1], p3[1], low)
}

const spruce = 'M0 -30 L2.2 -25.5 L1.2 -25.6 L4.4 -20.6 L2.6 -20.8 L6.4 -15 L4 -15.2 L8.6 -8.6 L5.6 -8.8 L10 -3 L1.2 -3 L1.2 0 L-1.2 0 L-1.2 -3 L-10 -3 L-5.6 -8.8 L-8.6 -8.6 L-4 -15.2 L-6.4 -15 L-2.6 -20.8 L-4.4 -20.6 L-1.2 -25.6 L-2.2 -25.5 Z'
const torso = 'M-4.6 -20 C-5.2 -26 -5.4 -32 -4 -36.6 C-2.2 -38.8 2.6 -38.8 4.4 -36.6 C5.8 -32 5.6 -26 5 -20 Z'
const boot = 'M-1.8 -2.2 H2 C4.4 -2.2 6.4 -1.4 6.8 0 H-1.8 Z'

function Head({ x, y }: { x: number; y: number }) {
  return <g>
    <rect className="fw-skin" x={x - 1.4} y={y + 3} width="2.8" height="3" rx="1" />
    <path className="fw-skin" d={`M${x - 3.6} ${y} C${x - 3.6} ${y - 5.4} ${x + 3.8} ${y - 5.4} ${x + 3.8} ${y - .6} L${x + 4.8} ${y + 1} L${x + 3.6} ${y + 1.6} C${x + 3} ${y + 4.4} ${x - 3.6} ${y + 4.8} ${x - 3.6} ${y} Z`} />
    <ellipse className="fw-hat" cx={x + .2} cy={y - 3.2} rx="7.2" ry="1.3" />
    <path className="fw-hat" d={`M${x - 3.6} ${y - 3.2} C${x - 3.6} ${y - 8} ${x + 4} ${y - 8} ${x + 4} ${y - 3.2} Z`} />
  </g>
}

function Leg({ hip, foot, knee, back }: { hip: [number, number]; foot: [number, number]; knee?: [number, number]; back?: boolean }) {
  const points = [hip, knee, foot].filter(Boolean).map((point) => point!.join(' ')).join(' L')
  return <g className={back ? 'fw-back' : undefined}>
    <path className="fw-limb fw-trouser" d={`M${points}`} />
    <path className="fw-boot" transform={`translate(${foot[0]} ${foot[1] + 2.2})`} d={boot} />
  </g>
}

function Planter() {
  return <g className="fw-bob">
      <g transform="translate(0 -21)">
        <g className="fw-leg fw-leg-back"><Leg hip={[0, 0]} foot={[0, 19]} back /></g>
      </g>
      <g transform="translate(-.5 -35.5)">
        <g className="fw-arm fw-back">
          <path className="fw-limb fw-sleeve" d="M0 0 L-.4 12" />
          <circle className="fw-skin" cx="-.4" cy="13.6" r="1.7" />
        </g>
      </g>
      <path className="fw-body" d={torso} />
      <g transform="translate(0 -21)">
        <g className="fw-leg"><Leg hip={[0, 0]} foot={[0, 19]} /></g>
      </g>
      <Head x={1} y={-43.5} />
      <path className="fw-can" d="M8.6 -27.6 H18.6 L17.6 -18.6 H9.6 Z" />
      <path className="fw-tool" d="M10 -27.6 Q13.6 -33.4 17.2 -27.6 M17.8 -22.4 L25.4 -28.4" />
      <path className="fw-can" d="M24.6 -30 L27.8 -31.4 L28.8 -28.6 L25.6 -27.2 Z" />
      <path className="fw-limb fw-sleeve" d="M.6 -35.5 L3.4 -29.4 L9 -28" />
      <circle className="fw-skin" cx="10" cy="-27.8" r="1.8" />
      {[0, 1, 2].map((index) => <circle key={index} className={`fw-drop fw-drop-${index}`} cx={28 + index * 1.4} cy="-28" r="1" />)}
  </g>
}

function Digger() {
  return <>
    <Leg hip={[0, -21]} foot={[-5.5, -2.2]} back />
    <Leg hip={[0, -21]} knee={[5, -11.5]} foot={[5.5, -2.2]} />
    <g transform="translate(0 -21)">
      <g className="fw-dig">
        <path className="fw-limb fw-sleeve fw-back" d="M3.6 -14 L8 -9.4 L10.6 -7.4" />
        <path className="fw-body" d="M-4.4 1 C-4.8 -5 -2.8 -12 .8 -16.2 C2.8 -17.8 6.6 -17 7.4 -14.4 C6.4 -8.4 5.2 -3 4.8 1 Z" />
        <Head x={6.4} y={-21.6} />
        <path className="fw-tool" d="M6.6 -12.6 L9.8 -11.4 M8.2 -12 L16.6 12.6" />
        <path className="fw-can" d="M13.8 11.4 L19.4 13 L18.6 19.4 Q16.4 21.4 13.4 18.6 Z" />
        <path className="fw-limb fw-sleeve" d="M4.6 -14 L8.4 -8 L12.4 -1.4" />
        <circle className="fw-skin" cx="12.8" cy="-.6" r="1.8" />
      </g>
    </g>
  </>
}

function Surveyor() {
  return <>
    <Leg hip={[-.6, -21]} foot={[-2, -2.2]} back />
    <path className="fw-limb fw-sleeve fw-back" d="M-.8 -35.5 L1.6 -29.2 L7 -29.6" />
    <path className="fw-body" d={torso} />
    <Leg hip={[.8, -21]} foot={[2.2, -2.2]} />
    <g transform="translate(1 -40)">
      <g className="fw-nod"><Head x={0} y={-3.5} /></g>
    </g>
    <path className="fw-can fw-board" d="M6 -37 L13.6 -35.8 L12.6 -24.6 L5 -25.8 Z" />
    <path className="fw-tool" d="M8 -36.8 L11.6 -36.2" />
    <path className="fw-limb fw-sleeve" d="M1 -35.5 L3 -29" />
    <g transform="translate(3 -29)">
      <g className="fw-write">
        <path className="fw-limb fw-sleeve" d="M0 0 L5.4 -1.6" />
        <circle className="fw-skin" cx="6.2" cy="-1.8" r="1.7" />
        <path className="fw-tool" d="M6.6 -2.4 L9.6 -6.2" />
      </g>
    </g>
  </>
}

export default function FieldWork({ duration }: { duration: number }) {
  const walkDuration = duration - .6
  const stride = .52 * walkDuration / 2.8
  const step = (duration - .1) / steps.length
  const seedlings = seedlingScales.map((scale, index) => {
    const x = 92 + index * 44
    const at = walkDelay + ((x - spout - walkStart) / walkDistance) * walkDuration
    return { x, scale, at, grow: Math.max(at + .35, duration - 1.1 + index * .05) }
  })
  return (
    <div className="field-work" role="status">
      <span className="sr-only">Gathering the evidence…</span>
      <svg viewBox="0 40 560 180" aria-hidden="true">
        <defs>
          <clipPath id="fw-sky"><path d={`${ridgePath} L560 0 L0 0 Z`} /></clipPath>
        </defs>

        <g clipPath="url(#fw-sky)">
          <g transform="translate(280 360)">
            <g className="fw-orbit" style={{ animationDuration: `${duration}s` }}>
              <g transform="translate(0 -290)">
                <circle className="fw-glow" r="30" />
                <circle className="fw-glow" r="20" />
                <circle className="fw-sun" r="11" />
              </g>
            </g>
          </g>
        </g>

        <g transform="translate(0 56)">
          <g className="fw-fly" style={{ animationDuration: `${duration}s` }}>
            {[[0, 0, 0], [18, 9, .12]].map(([x, y, delay]) => (
              <g key={x} transform={`translate(${x} ${y})`}>
                <path className="fw-bird" style={{ animationDelay: `${delay}s` }} d="M-6 -1 Q-3 -4 0 0 Q3 -4 6 -1" />
              </g>
            ))}
          </g>
        </g>

        <path className="fw-hill fw-hill-far" d={ridgePath} />
        {farTrees.map(([x, scale], index) => (
          <g key={x} transform={`translate(${x} ${ridgeY(x) + 1}) scale(${scale * .66})`}>
            <path className="fw-far-tree" style={{ animationDelay: `${.3 + index * .05}s` }} d={spruce} />
          </g>
        ))}
        <path className="fw-hill" d="M0 138 C96 126 160 134 252 125 S420 118 560 130" />
        <path className="fw-ground" d={`M0 ${ground} L560 ${ground}`} />
        <path className="fw-furrow" d="M-10 186 L570 186" />
        <path className="fw-furrow fw-furrow-near" d="M-20 206 L580 206" />
        {tufts.map((x) => <path key={x} className="fw-tuft" d={`M${x - 3} ${ground} L${x - 1.5} ${ground - 4} M${x} ${ground} L${x} ${ground - 5.5} M${x + 3} ${ground} L${x + 1.5} ${ground - 4}`} />)}

        {pollen.map(([x, duration, delay]) => <circle key={x} className="fw-pollen" cx={x} cy={ground - 6} r="1.3" style={{ animationDuration: `${duration}s`, animationDelay: `${delay}s` }} />)}

        {seedlings.map(({ x, scale, at, grow }) => (
          <g key={x} transform={`translate(${x} ${ground})`}>
            <path className="fw-mound" d="M-7 0 Q0 -3.5 7 0" />
            <g transform={`scale(${scale})`}>
              <g className="fw-fade" style={{ animationDelay: `${grow}s` }}>
                <g className="fw-sprout" style={{ animationDelay: `${at}s` }}>
                  <path className="fw-line" d="M0 0 C0 -6 1.2 -10 0 -17" />
                  <path className="fw-leaf" d="M0 -10 C-5 -11 -9 -15 -9 -20 C-4 -19.5 -1 -16 0 -11 Z" />
                  <path className="fw-leaf" d="M0 -13.5 C4 -15 8.5 -19 9.5 -24 C4.5 -23.5 1.2 -19.5 0 -14.5 Z" />
                </g>
              </g>
              <g className="fw-tree" style={{ animationDelay: `${grow}s` }}>
                <path className="fw-leaf" d={spruce} />
              </g>
            </g>
          </g>
        ))}

        <g transform={`translate(40 ${ground})`}>
          <Digger />
          {[0, 1, 2].map((index) => <circle key={index} className={`fw-dirt fw-dirt-${index}`} cx="17" cy="-1" r="1.4" />)}
        </g>

        <g transform={`translate(${walkStart} ${ground + 9}) scale(1.06)`}>
          <g className="fw-walk" style={{ '--walk': `${walkDistance / 1.06}px`, '--stride': `${stride}s`, animationDelay: `${walkDelay}s`, animationDuration: `${walkDuration}s` } as CSSProperties}>
            <Planter />
          </g>
        </g>

        <g transform={`translate(522 ${ground}) scale(-1 1)`}>
          <Surveyor />
        </g>
      </svg>
      <p className="field-work-steps" aria-hidden="true">
        {steps.map((label, index) => <span key={label} style={{ animationDelay: `${index * step}s`, animationDuration: `${step}s` }} className={index === steps.length - 1 ? 'is-last' : undefined}>{label}</span>)}
      </p>
    </div>
  )
}
