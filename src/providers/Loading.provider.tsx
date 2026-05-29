import { Loading } from "@/components/ui/Loading";
import { useAuth } from "@/hooks/auth";
import { PropsWithChildren } from "react";

export function LoadingProvider({ children }: PropsWithChildren) {
  const { isLoading } = useAuth();

  if (isLoading) {
    // Show loading state while creating new project
    return (
      <div className="flex flex-col h-screen bg-black text-white">
        <div className="flex items-center justify-center h-full gap-2">
          <Loading />
          <p className="text-lg">Setting up your creative workspace...</p>
        </div>
      </div>
    );
  }

  return children;
}
