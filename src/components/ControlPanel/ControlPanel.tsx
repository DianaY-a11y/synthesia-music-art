import { useMemo } from 'react';
import { BandSlider } from './BandSlider';
import { CurveView } from './CurveView';
import { ChevronIcon, MinusIcon, PauseIcon, PlayIcon, PlusIcon } from '../icons';
import { INSTRUMENT_OPTIONS } from '../../audio/moods';
import type { Player } from '../../audio/Player';
import type { Instruments, Mood, Part, Volumes } from '../../types';

const PARTS: { part: Part; name: string }[] = [
  { part: 'melody', name: 'melody' },
  { part: 'harmony', name: 'harmony' },
  { part: 'bass', name: 'bass' },
  { part: 'percussion', name: 'perc' },
];

const formatTime = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

interface Props {
  player: Player;
  playing: boolean;
  mood: Mood;
  instruments: Instruments;
  volumes: Volumes;
  tempo: number;
  height: number;
  collapsed: boolean;
  onTogglePlay: () => void;
  onMood: (mood: Mood) => void;
  onInstrument: (part: Part, instrument: Instruments[Part]) => void;
  onVolume: (part: Part, value: number) => void;
  onTempo: (bpm: number) => void;
  onHeight: (height: number) => void;
  onCollapse: (collapsed: boolean) => void;
}

/** Transparent, hardware-simple controls: mood, play, the loudness curve and six sliders. */
export function ControlPanel(props: Props) {
  const { player, playing, mood, instruments, volumes, tempo, height, collapsed } = props;

  // time markers under the curve; depend on tempo and on the loaded artwork
  const ticks = useMemo(() => {
    const width = player.width;
    return [0, .25, .5, .75, 1].map(f => ({ f, label: formatTime(player.timeAt(Math.round(f * width))) }));
  }, [player, player.score, tempo]);

  const nextInstrument = (part: Part) => {
    const options = INSTRUMENT_OPTIONS[part];
    props.onInstrument(part, options[(options.indexOf(instruments[part]) + 1) % options.length]);
  };

  return (
    <div className={`dock-wrap pe ${collapsed ? 'collapsed' : ''}`}>
      <div className="dock">
        <div className="d-head">
          <div>
            <span className="d-lbl">mood</span>
            <button className="d-mood" aria-label="change mood" onClick={() => props.onMood(mood === 'meditation' ? 'focus' : 'meditation')}>
              <span>{mood}</span><ChevronIcon />
            </button>
          </div>
          <div className="d-actions">
            <button className="d-play" aria-label={playing ? 'pause' : 'play'} onClick={props.onTogglePlay}>
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button className="d-fold" aria-label={collapsed ? 'expand' : 'collapse'} onClick={() => props.onCollapse(!collapsed)}>
              {collapsed ? <PlusIcon /> : <MinusIcon />}
            </button>
          </div>
        </div>

        {!collapsed && (
          <div className="d-body">
            <CurveView player={player} active={!collapsed} />
            <div className="ticks">
              {ticks.map(t => <span key={t.f} style={{ left: `${t.f * 100}%` }}>{t.label}</span>)}
            </div>
            <div className="bands">
              <div className="side"><span>+</span><span>&nbsp;</span><span>–</span></div>
              {PARTS.map(({ part, name }) => (
                <BandSlider
                  key={part}
                  name={name}
                  value={volumes[part]}
                  onChange={v => props.onVolume(part, v)}
                  label={instruments[part]}
                  onLabelClick={() => nextInstrument(part)}
                />
              ))}
              <BandSlider name="tempo" value={(tempo - 30) / 110} onChange={v => props.onTempo(30 + v * 110)} label={`${tempo} bpm`} />
              <BandSlider name="height" value={height / 5} onChange={v => props.onHeight(Math.round(v * 50) / 10)} label={height.toFixed(1)} />
              <div className="side"><span>+</span><span>&nbsp;</span><span>–</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
