import { useEffect, useRef } from 'react';

/** Calls `callback(time, deltaSeconds)` every frame while mounted. Always uses the latest callback. */
export function useAnimationFrame(callback: (time: number, dt: number) => void, active = true) {
  const saved = useRef(callback);
  saved.current = callback;

  useEffect(() => {
    if (!active) return;
    let frame = 0, last = 0;
    const loop = (time: number) => {
      const dt = last ? Math.min((time - last) / 1000, .25) : 0;
      last = time;
      saved.current(time, dt);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [active]);
}
