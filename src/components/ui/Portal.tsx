import { usePortal } from "@/providers/PortalProvider";
import { PropsWithChildren } from "react";
import { createPortal } from "react-dom";

type PortalProps = PropsWithChildren &
  (
    | {
        backdrop?: false;
      }
    | {
        backdrop: true;
        onBackdropClick: () => void;
      }
  );

export default function Portal({ children, ...rest }: PortalProps) {
  const { element } = usePortal();

  return element
    ? createPortal(
        <>
          {rest.backdrop ? (
            <PortalBackdrop onClick={rest.onBackdropClick} />
          ) : null}
          <PortalModal>{children}</PortalModal>
        </>,
        element,
      )
    : null;
}

type PortalBackdropProps = {
  onClick: () => void;
};

function PortalBackdrop({ onClick }: PortalBackdropProps) {
  return (
    <div
      className="absolute inset-0 bg-wb-almost-black opacity-80 transition-opacity duration-300 pointer-events-auto"
      onClick={onClick}
    ></div>
  );
}

function PortalModal({ children }: PropsWithChildren) {
  return (
    <div className="absolute inset-0 p-2 full-w full-h">
      <div className="pointer-events-auto">{children}</div>
    </div>
  );
}
