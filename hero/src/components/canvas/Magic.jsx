import { useEffect, useRef } from "react";

import "./magic_logic";

const MagicCanvas = () => {
  const magicRef = useRef(null);

  useEffect(() => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const magic = document.querySelector("#magic");
          if (!magic) {
            return;
          }

          if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
            magic.removeAttribute("disabled");
          } else if (!entry.isIntersecting && entry.intersectionRatio <= 0.3) {
            magic.setAttribute("disabled", true);
          }
        });
      },
      { threshold: 0.3 }
    );

    if (magicRef.current) {
      observer.observe(magicRef.current);
    }

    return () => {
      if (magicRef.current) {
        observer.unobserve(magicRef.current);
      }
    };
  }, []);

  return (
    <div id="magicCover" ref={magicRef}>
      <div id="magic" />
    </div>
  );
};

export default MagicCanvas;
