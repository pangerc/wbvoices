export type BeatovenTaskResponse = {
  status: "composing" | "running" | "composed";
  meta?: {
    project_id: string;
    track_id: string;
    prompt: {
      text: string;
    };
    version: number;
    track_url: string;
    stems_url: {
      bass: string;
      chords: string;
      melody: string;
      percussion: string;
    };
  };
};

export async function generateMusic(prompt: string): Promise<string> {
  const response = await fetch("/api/v1/tracks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to generate music");
  }

  const data = await response.json();
  return data.track_url;
}
