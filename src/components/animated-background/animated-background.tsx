"use client";

import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useState,
} from "react";
import { MatrixBackground } from "./MatrixBackground";

const Context = createContext({
  show: false,
  setShow: () => {},
  isAnimating: false,
  startAnimation: () => {},
  stopAnimation: () => {},
});

export function useBackgroundAnimator(animate: boolean) {
  const state = useContext(Context);

  useEffect(() => {
    if (animate) {
      state.startAnimation();
    } else {
      state.stopAnimation();
    }
  }, [animate]);

  useEffect(() => {
    state.setShow();
  }, []);
}

export function useIsBackgroundAnimated() {
  const state = useContext(Context);

  return state.isAnimating;
}

export function AnimatedBackground({ children }: PropsWithChildren) {
  const [show, setShow] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  return (
    <Context.Provider
      value={{
        show,
        setShow: () => setShow(true),
        isAnimating,
        startAnimation: () => setIsAnimating(true),
        stopAnimation: () => setIsAnimating(false),
      }}
    >
      {children}
      {show ? <MatrixBackground /> : null}
    </Context.Provider>
  );
}
