"use client";
import { motion, useReducedMotion } from "framer-motion";
import { BookOpen, Sparkles, Target } from "lucide-react";

export default function LearningModel() {
  const reduced = useReducedMotion();
  return (
    <div className="learning-model" aria-hidden="true">
      <div className="model-aura" />
      <div className="model-ground" />
      <motion.div
        className="model-floating"
        animate={reduced ? undefined : { y: [0, -12, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      >
        <div className="model-cube">
          <div className="cube-face front">
            <BookOpen size={46} />
            <span>LEARN</span>
          </div>
          <div className="cube-face back">
            <Sparkles size={46} />
          </div>
          <div className="cube-face right">
            <Target size={46} />
            <span>GROW</span>
          </div>
          <div className="cube-face left">
            <Sparkles size={46} />
          </div>
          <div className="cube-face top" />
          <div className="cube-face bottom" />
        </div>
      </motion.div>
      <span className="model-orbit orbit-one" />
      <span className="model-orbit orbit-two" />
      <span className="model-particle particle-one" />
      <span className="model-particle particle-two" />
      <span className="model-caption">IDEAS INTO MOMENTUM</span>
    </div>
  );
}
