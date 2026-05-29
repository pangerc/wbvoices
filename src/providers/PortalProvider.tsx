import {
  createContext,
  PropsWithChildren,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

type PortalCtx = {
  element: HTMLDivElement | null;
};

const Context = createContext<PortalCtx>({
  element: null,
});

/** @wip */
export function usePortal() {
  const ctx = useContext(Context);

  return ctx;
}

/** @wip */
export function PortalProvider({ children }: PropsWithChildren) {
  const ref = useRef<HTMLDivElement>(null);

  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Context.Provider value={{ element: ref.current }}>
      {children}
      <div
        ref={ref}
        className="fixed top-[220px] inset-0 z-50 pointer-events-none"
      />
    </Context.Provider>
  );
}
