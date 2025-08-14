import { NextRequest, NextResponse } from 'next/server'
import { redis, PROJECT_KEYS } from '@/lib/redis'
import { Project } from '@/types'

export const runtime = 'edge'

type ProjectMetadata = {
  headline: string;
  timestamp: number;
  lastModified: number;
}

// GET /api/projects/[id] - Load specific project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const project = await redis.get<Project>(PROJECT_KEYS.project(id))
    
    if (!project) {
      // This is normal for new projects - no logging needed
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    
    console.log('✅ API: Loaded existing project:', project.headline);
    return NextResponse.json({ project })
    
  } catch (error) {
    console.error('❌ API: Failed to load project:', error)
    return NextResponse.json({ 
      error: 'Failed to load project' 
    }, { status: 500 })
  }
}

// PUT /api/projects/[id] - Update project
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    console.log('🔄 API: Updating project:', id);
    
    const { updates, sessionId }: { updates: Partial<Project>, sessionId: string } = await request.json()
    
    if (!updates || !sessionId) {
      console.error('❌ API: Missing required fields');
      return NextResponse.json({ error: 'Updates and session ID required' }, { status: 400 })
    }

    console.log('📝 API: Update fields:', Object.keys(updates));

    // Load existing project
    const existingProject = await redis.get<Project>(PROJECT_KEYS.project(id))
    if (!existingProject) {
      console.error('❌ API: Project not found for update');
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    console.log('✅ API: Existing project found:', existingProject.headline);

    // Merge updates
    const updatedProject = { ...existingProject, ...updates }
    
    // Save updated project
    console.log('💾 API: Saving updated project to Redis');
    await redis.set(PROJECT_KEYS.project(id), updatedProject)
    
    // Update metadata if headline changed
    if (updates.headline) {
      console.log('🏷️ API: Updating metadata headline');
      const metadata = await redis.get<ProjectMetadata>(PROJECT_KEYS.projectMeta(id))
      if (metadata) {
        metadata.headline = updates.headline
        await redis.set(PROJECT_KEYS.projectMeta(id), metadata)
      }
    }
    
    console.log('✅ API: Project update complete');
    return NextResponse.json({ success: true, project: updatedProject })
    
  } catch (error) {
    console.error('❌ API: Failed to update project:', error)
    return NextResponse.json({ 
      error: 'Failed to update project' 
    }, { status: 500 })
  }
}

// DELETE /api/projects/[id] - Delete project
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const url = new URL(request.url)
    const sessionId = url.searchParams.get('sessionId')
    
    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
    }

    // Remove from Redis
    await redis.del(PROJECT_KEYS.project(id))
    await redis.del(PROJECT_KEYS.projectMeta(id))
    
    // Update user's project list
    const existingProjectIds = await redis.get<string[]>(PROJECT_KEYS.userProjects(sessionId)) || []
    const updatedProjectIds = existingProjectIds.filter(pid => pid !== id)
    await redis.set(PROJECT_KEYS.userProjects(sessionId), updatedProjectIds)
    
    return NextResponse.json({ success: true })
    
  } catch (error) {
    console.error('Failed to delete project:', error)
    return NextResponse.json({ 
      error: 'Failed to delete project' 
    }, { status: 500 })
  }
}