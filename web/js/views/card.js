import { h, mount } from '../ui.js';
export async function render(root) {
  mount(root, h('p.muted', 'В разработке.'));
}
