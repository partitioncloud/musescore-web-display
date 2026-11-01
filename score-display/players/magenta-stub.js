// Replaces @magenta/music in the no-mm bundles, see rolldown.config.mjs.
// MidiPlayer checks that SoundFontPlayer is defined before loading a MIDI track.
export const SoundFontPlayer = undefined;
export const blobToNoteSequence = undefined;
