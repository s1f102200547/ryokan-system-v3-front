export const INLINE_ITEM_SIZE = { xs: 12, sm: 4, lg: 3.4 };
export const INLINE_ITEM_SX = { maxWidth: 220 };
export const OTHER_NOTE_SX = {
  width: '100%',
  maxWidth: 470,
  alignSelf: 'flex-start',
};
export const SECTION_SPACING = 1.5;
export const AGE_SECTION_SPACING = 1.25;
export const TAX_SYNC_WINDOW_MS = 30_000;

export const findOptionLabel = (options, value) =>
  options.find(opt => opt.value === value)?.label;

export const createOptionLabelRenderer = (options, emptyLabel) => value =>
  value === ''
    ? emptyLabel
    : (findOptionLabel(options, value) ?? emptyLabel);
