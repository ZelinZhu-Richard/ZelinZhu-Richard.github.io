import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../hooks';

const GLYPHS = '!<>-_\\/[]{}—=+*^?#01☄★·';

// Scrambles from random glyphs into `text`. Re-runs whenever `text` or `run` changes.
const ScrambleText = ({ text, run = true, speed = 28, as: Tag = 'span', className = '', onDone }) => {
  const [out, setOut] = useState(text);
  const frame = useRef(null);
  const reduced = useReducedMotion();
  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);

  useEffect(() => {
    if (!run) return;
    if (reduced) { setOut(text); onDoneRef.current?.(); return; }
    let i = 0;
    const total = text.length;
    const iv = setInterval(() => {
      i += 1;
      const settled = text.slice(0, i);
      let noise = '';
      for (let k = i; k < total; k++) {
        noise += text[k] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      setOut(settled + noise);
      if (i >= total) {
        clearInterval(iv);
        onDoneRef.current?.();
      }
    }, speed);
    frame.current = iv;
    return () => clearInterval(iv);
  }, [text, run, speed, reduced]);

  return <Tag className={className} aria-label={text}>{out}</Tag>;
};

export default ScrambleText;
