// how the artwork is sampled
export const SCAN_COLUMNS = 512;
export const SCAN_ROWS = 32;
export const MIN_SCAN_WIDTH = 512;
export const MAX_SCAN_WIDTH = 2048;
export const COLUMNS_PER_BEAT = 8;

// when a column makes sound
export const BRIGHTNESS_THRESHOLD = 0.2;
export const BASS_REGION = 0.25;          // bottom quarter of the image
export const BASS_EVERY = 8;              // columns
export const MELODY_REGION = 0.25;        // everything above the bass region
export const MELODY_EVERY = 4;
export const HARMONY_BRIGHTNESS = 0.1;
export const PITCH_CHANGE = 0.05;
export const PERCUSSION_SPIKE = 0.25;

// silence handling
export const SKIP_SPEED = 10;             // long silences pass this many times faster

// score display range (MIDI)
export const MIN_PITCH = 48;
export const MAX_PITCH = 84;
