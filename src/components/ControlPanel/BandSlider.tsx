import { useRef } from 'react';
import { clamp } from '../../lib/math';

const TRACK = 150, KNOB = 24;

interface Props {
  name: string;
  /** 0–1 */
  value: number;
  onChange: (value: number) => void;
  /** text under the name; clickable when `onLabelClick` is given */
  label: string;
  onLabelClick?: () => void;
}

/** A vertical pill slider: dotted track, grain-textured fill, glowing knob. */
export function BandSlider({ name, value, onChange, label, onLabelClick }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const v = clamp(value, 0, 1);
  const knobY = KNOB / 2 + (1 - v) * (TRACK - KNOB);

  const setFromPointer = (clientY: number) => {
    const r = track.current!.getBoundingClientRect();
    onChange(clamp(1 - (clientY - r.top - KNOB / 2) / (r.height - KNOB), 0, 1));
  };

  return (
    <div className="band">
      <div
        ref={track}
        className="track"
        role="slider"
        aria-label={name}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(v * 100)}
        tabIndex={0}
        onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setFromPointer(e.clientY); }}
        onPointerMove={e => { if (e.currentTarget.hasPointerCapture(e.pointerId)) setFromPointer(e.clientY); }}
        onKeyDown={e => {
          if (e.key === 'ArrowUp') { e.preventDefault(); onChange(clamp(v + .05, 0, 1)); }
          if (e.key === 'ArrowDown') { e.preventDefault(); onChange(clamp(v - .05, 0, 1)); }
        }}
      >
        {[0, 1, 2, 3, 4].map(i => <i key={i} className="dt" style={{ top: `${12 + i * 19}%` }} />)}
        <span className="fill" style={{ height: Math.max(0, TRACK - 5 - knobY), opacity: v > .02 ? 1 : 0 }} />
        <span className="knob" style={{ top: knobY }} />
      </div>
      <div className="bname">{name}</div>
      {onLabelClick
        ? <button className="binst" onClick={onLabelClick}>{label}</button>
        : <span className="binst static">{label}</span>}
    </div>
  );
}
