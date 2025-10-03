import { NextRequest, NextResponse } from "next/server";
import { redis, PROJECT_KEYS } from "@/lib/redis";
import { Project, ProjectMetadata } from "@/types";

// Use Node.js runtime for proper Redis access
// export const runtime = 'edge' // REMOVED - Edge Runtime causes env var issues

// GET /api/projects - Load user's projects
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");

    console.log(
      `📋 GET /api/projects - Loading projects for session: ${sessionId}`
    );

    if (!sessionId) {
      return NextResponse.json(
        { error: "Session ID required" },
        { status: 400 }
      );
    }

    // Get user's project IDs
    const projectIds =
      (await redis.get<string[]>(PROJECT_KEYS.userProjects(sessionId))) || [];
    // console.log(`📋 Found ${projectIds.length} project IDs:`, projectIds);

    // Load project metadata
    const projects: ProjectMetadata[] = [];
    for (const id of projectIds) {
      const metadata = await redis.get<ProjectMetadata>(
        PROJECT_KEYS.projectMeta(id)
      );
      if (metadata) {
        projects.push(metadata);
        // console.log(`✅ Loaded metadata for project: ${metadata.headline}`)
      } else {
        console.log(`⚠️ No metadata found for project ID: ${id}`);
      }
    }

    // Sort by timestamp (newest first)
    projects.sort((a, b) => b.timestamp - a.timestamp);

    // console.log(`📋 Returning ${projects.length} projects`);
    return NextResponse.json({ projects });
  } catch (error) {
    console.error("❌ Failed to load projects:", error);
    return NextResponse.json(
      {
        error: "Failed to load projects",
        projects: [],
      },
      { status: 500 }
    );
  }
}

// POST /api/projects - Create new project
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("📦 POST /api/projects - Request body:", body);

    const { project, sessionId }: { project: Project; sessionId: string } =
      body;

    if (!project || !sessionId) {
      console.error("❌ Missing required fields:", {
        hasProject: !!project,
        hasSessionId: !!sessionId,
      });
      return NextResponse.json(
        { error: "Project and session ID required" },
        { status: 400 }
      );
    }

    console.log(`💾 Saving project ${project.id} for session ${sessionId}`);

    // Save full project data
    await redis.set(PROJECT_KEYS.project(project.id), project);
    console.log(`✅ Saved project data: ${PROJECT_KEYS.project(project.id)}`);

    // Save project metadata for quick listing
    const metadata: ProjectMetadata = {
      id: project.id,
      headline: project.headline,
      timestamp: project.timestamp,
      language: project.brief.selectedLanguage,
      format: project.brief.campaignFormat,
      provider: project.brief.selectedProvider,
    };
    await redis.set(PROJECT_KEYS.projectMeta(project.id), metadata);
    console.log(
      `✅ Saved project metadata: ${PROJECT_KEYS.projectMeta(project.id)}`
    );

    // Update user's project list
    const existingProjectIds =
      (await redis.get<string[]>(PROJECT_KEYS.userProjects(sessionId))) || [];
    const updatedProjectIds = existingProjectIds.includes(project.id)
      ? existingProjectIds
      : [project.id, ...existingProjectIds]; // No limit - multi-region pilot (HK, LATAM, Poland)

    await redis.set(PROJECT_KEYS.userProjects(sessionId), updatedProjectIds);
    console.log(
      `✅ Updated user project list: ${updatedProjectIds.length} projects`
    );

    return NextResponse.json({ success: true, project });
  } catch (error) {
    console.error("❌ Failed to create project:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create project",
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
