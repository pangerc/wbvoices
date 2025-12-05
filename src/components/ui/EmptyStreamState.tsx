"use client";

interface EmptyStreamStateProps {
  onGoToBrief: () => void;
  onCreateBlank: () => void;
}

export function EmptyStreamState({ onGoToBrief, onCreateBlank }: EmptyStreamStateProps) {
  return (
    <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center">
      <p className="text-gray-300 mb-4">Nothing here yet. Get started:</p>
      <div className="space-y-3">
        <button
          onClick={onGoToBrief}
          className="block w-full text-left px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
        >
          <span className="text-wb-blue">1.</span> Share a brief and let AI create everything
        </button>
        <button
          onClick={onCreateBlank}
          className="block w-full text-left px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
        >
          <span className="text-wb-blue">2.</span> Create a blank version for manual entry
        </button>
      </div>
    </div>
  );
}
