import { NextRequest, NextResponse } from "next/server";
import { redis, PROJECT_KEYS } from "@/lib/redis";
import { Project, LibraryMusicTrack } from "@/types";

// GET /api/music-library - Load all music tracks from user's projects
export async function GET(request: NextRequest) {
  try {
    // Legacy V2 data is all indexed under "universal-session"
    const legacySessionId = "universal-session";

    // Get user's project IDs from V2 Redis
    const projectIds =
      (await redis.get<string[]>(PROJECT_KEYS.userProjects(legacySessionId))) || [];
    console.log(`🎵 Found ${projectIds.length} total projects`);

    // Load projects and extract music tracks
    const libraryTracks: LibraryMusicTrack[] = [];

    for (const id of projectIds) {
      const project = await redis.get<Project>(PROJECT_KEYS.project(id));

      if (project?.generatedTracks?.musicUrl) {
        // Find duration from mixer state if available
        const musicTrack = project.mixerState?.tracks.find(
          (t) => t.type === "music"
        );

        libraryTracks.push({
          projectId: project.id,
          projectTitle: project.headline,
          musicPrompt: project.musicPrompt || "No prompt available",
          musicProvider: project.brief.musicProvider || "loudly",
          musicUrl: project.generatedTracks.musicUrl,
          createdAt: project.timestamp,
          duration: musicTrack?.duration,
        });
      }
    }

    // Sort by creation date (newest first)
    libraryTracks.sort((a, b) => b.createdAt - a.createdAt);

    console.log(`🎵 Returning ${libraryTracks.length} music tracks from library`);
    return NextResponse.json({ tracks: libraryTracks });
  } catch (error) {
    console.error("❌ Failed to load music library:", error);
    return NextResponse.json(
      {
        error: "Failed to load music library",
        tracks: [],
      },
      { status: 500 }
    );
  }
}
