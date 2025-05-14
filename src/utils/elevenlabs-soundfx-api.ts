import { SoundFxTrack } from "@/types";

export async function generateSoundFx(
  prompt: string,
  duration: number
): Promise<SoundFxTrack> {
  const url = "https://api.elevenlabs.io/v1/sound-generation";
  const headers = {
    "Content-Type": "application/json",
    "Xi-Api-Key": process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY || "",
  };

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      text: prompt,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      `Failed to generate sound effect: ${
        errorData.detail || response.statusText
      }`
    );
  }

  const soundBlob = await response.blob();
  const soundUrl = URL.createObjectURL(soundBlob);

  return {
    id: Date.now().toString(),
    title: prompt,
    url: soundUrl,
    duration,
  };
}
