import Image from "next/image";
import Link from "next/link";
import { PropsWithChildren } from "react";

export function Header({ children }: PropsWithChildren) {
  return (
    <header className="py-10 bg-black">
      <div className="container mx-auto px-4 flex justify-between items-center">
        <div className="shrink-0 py-[11px]">
          <Link href="/">
            <Image
              loading="eager"
              src="/aca.svg"
              alt="Aleph Creative Audio"
              width={114}
              height={32}
              className="h-11 w-auto"
            />
          </Link>
        </div>
        {children}
      </div>
    </header>
  );
}
