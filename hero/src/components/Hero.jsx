import { motion } from "framer-motion";

import MagicCanvas from "./canvas/Magic";

const Hero = () => {
  return (
    <section className="relative mx-auto h-screen w-full bg-[linear-gradient(to_right,rgb(30,10,85),rgb(77,50,130),rgb(1,0,45))]">
      <MagicCanvas />

      <div className="absolute bottom-32 flex w-full flex-col items-center justify-center xs:bottom-10">
        <div className="mx-auto mt-5 flex w-fit select-none items-center justify-center gap-6 rounded-xl bg-tertiary px-4 py-2 lg:mt-10 lg:px-7 lg:py-3 max-[350px]:hidden">
          <p>Try Clicking Screen!</p>
        </div>

        <a
          href="#top"
          className="mx-auto mt-5 flex w-fit select-none items-center justify-center gap-6 rounded-xl bg-tertiary px-4 py-2 lg:mt-10 lg:px-7 lg:py-3 max-[350px]:hidden"
        >
          <div className="flex h-[64px] w-[35px] items-start justify-center rounded-3xl border-4 border-secondary p-2">
            <motion.div
              animate={{ y: [0, 24, 0] }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                repeatType: "loop",
              }}
              className="mb-1 h-3 w-3 rounded-full bg-secondary"
            />
          </div>
          <p>Scroll Down</p>
        </a>
      </div>
    </section>
  );
};

export default Hero;
