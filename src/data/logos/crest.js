import { crestMarkup } from '../crest.js';

export const crest = {
  id: 'crest',
  name: 'Crest',
  viewBox: '20 20 216 216',
  ground: { inner: '#3f3a9e', outer: '#11122a' },
  markup: ({ id = 'wk', text = true, inner, outer } = {}) => crestMarkup({ id, text, ...(inner ? { inner } : {}), ...(outer ? { outer } : {}) })
};
