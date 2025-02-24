import { NextResponse } from "next/server";

// Suno API has been discontinued (acquired by Discord)
export async function POST() {
  return NextResponse.json(
    {
      error:
        "The Suno API service has been discontinued following their acquisition by Discord. Please use an alternative music generation service.",
    },
    { status: 410 }
  );
}
