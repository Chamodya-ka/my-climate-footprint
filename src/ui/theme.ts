/** Visual constants for the UI layer (layout and colour, not game balance). */
export const WIDTH = 1280;
export const HEIGHT = 720;
export const MARGIN = 24;

export const colours = {
  bg: 0x0f1b24,
  panel: 0x1b2d3a,
  panelEdge: 0x3c5a6e,
  button: 0x24506b,
  buttonDisabled: 0x2a3138,
  focus: 0xffd166,
  text: '#f2f2f2',
  textDim: '#a9b7c2',
  textDisabled: '#7d8790',
  good: '#8fe3a6',
  warn: '#ffd166',
  bad: '#ff8f80',
  sky: 0x87b5d6,
  grass: 0x5e8c4a,
  water: 0x2f7dbf,
  soil: 0x8a6a46,
} as const;

export const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';

export const text = {
  title: { fontFamily: FONT, fontSize: '48px', color: colours.text, fontStyle: 'bold' },
  h1: { fontFamily: FONT, fontSize: '32px', color: colours.text, fontStyle: 'bold' },
  h2: { fontFamily: FONT, fontSize: '24px', color: colours.text, fontStyle: 'bold' },
  body: { fontFamily: FONT, fontSize: '20px', color: colours.text, lineSpacing: 6 },
  small: { fontFamily: FONT, fontSize: '18px', color: colours.textDim, lineSpacing: 4 },
} as const;
