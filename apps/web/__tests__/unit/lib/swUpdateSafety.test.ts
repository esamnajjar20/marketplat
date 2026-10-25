import { describe, it, expect, afterEach } from 'vitest';
import { isUserBusyForServiceWorkerUpdate } from '@/lib/swUpdateSafety';

describe('isUserBusyForServiceWorkerUpdate', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    window.getSelection()?.removeAllRanges();
  });

  it.each(['input', 'textarea', 'select'])('defers SW activation when a %s has focus', (tag) => {
    const element = document.createElement(tag);
    document.body.appendChild(element);
    element.focus();
    expect(isUserBusyForServiceWorkerUpdate()).toBe(true);
  });

  it('defers while an explicitly marked draft is open', () => {
    const draft = document.createElement('div');
    draft.setAttribute('data-draft-open', 'true');
    document.body.appendChild(draft);
    expect(isUserBusyForServiceWorkerUpdate()).toBe(true);
  });

  it('defers while the user has selected text', () => {
    const text = document.createElement('span');
    text.textContent = 'selected text';
    document.body.appendChild(text);
    const range = document.createRange();
    range.selectNodeContents(text);
    window.getSelection()?.addRange(range);
    expect(isUserBusyForServiceWorkerUpdate()).toBe(true);
  });

  it('allows activation when there is no active editing state', () => {
    document.body.innerHTML = '<button>Navigate</button>';
    expect(isUserBusyForServiceWorkerUpdate()).toBe(false);
  });
});
