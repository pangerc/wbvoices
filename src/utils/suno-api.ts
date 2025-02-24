const SUNO_API_KEY = process.env.NEXT_PUBLIC_SUNO_API_KEY;
const SUNO_API_URL = "https://api.suno.ai/v1";

export type SunoTaskResponse = {
  task_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  result?: {
    audio_url: string;
  };
  error?: string;
};

export async function createMusicGenerationTask(
  prompt: string,
  style: string
): Promise<string> {
  const response = await fetch(`${SUNO_API_URL}/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUNO_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      style,
      instrumental: true,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create music generation task");
  }

  const data = await response.json();
  return data.task_id;
}

export async function checkTaskStatus(
  taskId: string
): Promise<SunoTaskResponse> {
  const response = await fetch(`${SUNO_API_URL}/tasks/${taskId}`, {
    headers: {
      Authorization: `Bearer ${SUNO_API_KEY}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to check task status");
  }

  return response.json();
}

export async function generateMusic(
  prompt: string,
  style: string
): Promise<string> {
  const response = await fetch("/api/suno", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      style,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to generate music");
  }

  const data = await response.json();
  return data.audio_url;
}
