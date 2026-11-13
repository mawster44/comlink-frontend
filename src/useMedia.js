import { useEffect, useState } from 'react';

// True while a CSS media query matches, e.g. useMedia('(max-width: 768px)') for a phone. Used where the content itself (not just
// its styling) should change, such as dropping the cents from figures so a table fits. Starts out right, so there is no flash.
export function useMedia(query) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export const PHONE = '(max-width: 768px)';
