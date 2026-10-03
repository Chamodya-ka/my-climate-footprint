/** Visual constants for the UI layer (layout and colour, not game balance). */
export const WIDTH = 1280;
export const HEIGHT = 720;
export const MARGIN = 24;

/*
 * Text colours are chosen for WCAG AAA contrast (at least 7:1) on the panels and
 * buttons they sit on; see the contrast table in CLAUDE.md before changing them.
 */
export const colours = {
  bg: 0x0b151c,
  panel: 0x132430,
  panelEdge: 0x3c5a6e,
  button: 0x1b4058,
  buttonDisabled: 0x252d34,
  focus: 0xffd166,
  /** Text in the focus colour, e.g. the player's own choice. */
  focusText: '#ffd166',
  text: '#ffffff',
  textDim: '#d3dde5',
  textDisabled: '#b3bdc6',
  good: '#9ff0b4',
  warn: '#ffd166',
  bad: '#ffa89c',
  /** Button fills for a right / so-so / wrong answer; white text on each is at least 7:1. */
  goodFill: 0x1a6335,
  warnFill: 0x6b4e00,
  badFill: 0x8f2a2a,
  goodEdge: 0x9ff0b4,
  warnEdge: 0xffd166,
  badEdge: 0xffa89c,
  sky: 0x87b5d6,
  grass: 0x5e8c4a,
  water: 0x2f7dbf,
  soil: 0x8a6a46,
} as const;

export const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';

/** Black outlines for white text drawn straight over pictures (no box behind it), so it reads on light and dark areas. */
export const outline = {
  title: { stroke: '#000000', strokeThickness: 12 },
  text: { stroke: '#000000', strokeThickness: 8 },
} as const;

/**
 * The Title screen's Start button: forest green like the map's trees, with a black border and an
 * outlined bold label like the title. White on this green is 7.3:1 (AAA).
 */
export const titleButton = {
  fill: 0x1a6335,
  edge: 0x000000,
  edgeWidth: 3,
  label: { fontStyle: 'bold', stroke: '#000000', strokeThickness: 5 },
} as const;

export const text = {
  title: { fontFamily: FONT, fontSize: '48px', color: colours.text, fontStyle: 'bold' },
  h1: { fontFamily: FONT, fontSize: '32px', color: colours.text, fontStyle: 'bold' },
  h2: { fontFamily: FONT, fontSize: '24px', color: colours.text, fontStyle: 'bold' },
  body: { fontFamily: FONT, fontSize: '20px', color: colours.text, lineSpacing: 6 },
  small: { fontFamily: FONT, fontSize: '18px', color: colours.textDim, lineSpacing: 4 },
} as const;
