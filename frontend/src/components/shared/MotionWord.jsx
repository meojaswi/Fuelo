import { motion } from "motion/react";

export default function MotionWord({ text = "Motion", className = "" }) {
  return (
    <motion.span
      className={className}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.08 } },
      }}
      initial="hidden"
      animate="show"
      style={{ display: "inline-block" }}
    >
      {text.split("").map((char, index) => {
        const isSpace = char === " ";
        return (
          <motion.span
            key={`${char}-${index}`}
            variants={{
              hidden: { opacity: 0, y: 20 },
              show: {
                opacity: 1,
                y: 0,
                transition: { type: "spring", stiffness: 300, damping: 20 },
              },
            }}
            style={{ display: "inline-block", whiteSpace: isSpace ? "pre" : "normal" }}
          >
            {isSpace ? " " : char}
          </motion.span>
        );
      })}
    </motion.span>
  );
}
