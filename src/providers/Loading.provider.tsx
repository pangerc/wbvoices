import { useAuth } from "@/hooks/auth";
import { PropsWithChildren } from "react";

export function LoadingProvider({ children }: PropsWithChildren) {
  const { isLoading } = useAuth();

  if (isLoading) {
    // Show loading state while creating new project
    return (
      <div className="flex flex-col h-screen bg-black text-white">
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full mx-auto mb-4"></div>
            <p className="text-lg">Setting up your creative workspace...</p>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
