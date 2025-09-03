import { create } from 'zustand'
import { Project, ProjectBrief, ProjectMetadata } from '@/types'

// Universal session ID - everyone shares the same project history for testing
function getUserSessionId(): string {
  return 'universal-session'
}

export type ProjectHistoryState = {
  // History management
  projects: ProjectMetadata[]
  recentProjects: ProjectMetadata[] // All projects (no limit)
  
  // UI state
  isGeneratingHeadline: boolean
  isLoading: boolean
  error: string | null
  
  // Actions
  createProject: (projectId: string, brief: ProjectBrief) => Promise<void>
  updateProject: (projectId: string, updates: Partial<Project>) => Promise<void>
  deleteProject: (id: string) => Promise<void>
  loadProjects: () => Promise<void>
  clearHistory: () => Promise<void>
  
  // Internal helpers
  generateHeadline: (brief: ProjectBrief) => Promise<string>
  saveProjectToRedis: (project: Project) => Promise<void>
  loadProjectFromRedis: (id: string) => Promise<Project | null>
}

export const useProjectHistoryStore = create<ProjectHistoryState>((set, get) => ({
  // Initial state
  projects: [],
  recentProjects: [],
  isGeneratingHeadline: false,
  isLoading: false,
  error: null,

  // Generate project headline using OpenAI
  generateHeadline: async (brief: ProjectBrief): Promise<string> => {
    try {
      set({ isGeneratingHeadline: true, error: null })
      
      const response = await fetch('/api/generate-headline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief })
      })

      if (!response.ok) {
        throw new Error('Failed to generate headline')
      }

      const { headline } = await response.json()
      return headline || 'Untitled Project'
    } catch (error) {
      console.error('Headline generation failed:', error)
      
      // Fallback: use first few words of creative brief
      const fallback = brief.creativeBrief
        ? brief.creativeBrief.split(' ').slice(0, 4).join(' ')
        : `Untitled Project ${new Date().toLocaleDateString()}`
        
      return fallback
    } finally {
      set({ isGeneratingHeadline: false })
    }
  },

  // Save project via API
  saveProjectToRedis: async (project: Project) => {
    try {
      const sessionId = getUserSessionId()
      
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project, sessionId })
      })

      if (!response.ok) {
        throw new Error('Failed to save project')
      }
      
      console.log(`✅ Project saved: ${project.headline}`)
    } catch (error) {
      console.error('Failed to save project:', error)
      throw error
    }
  },

  // Load project via API
  loadProjectFromRedis: async (id: string): Promise<Project | null> => {
    try {
      const response = await fetch(`/api/projects/${id}`)
      
      if (!response.ok) {
        if (response.status === 404) {
          // This is expected for new projects - no logging needed
          return null;
        }
        const errorText = await response.text();
        console.error('❌ Failed to load project:', errorText);
        throw new Error(`API error: ${response.status} ${errorText}`)
      }

      const responseData = await response.json()
      console.log('✅ Project data received:', responseData.project ? 'Project found' : 'No project in response');
      return responseData.project
    } catch (error) {
      console.error('❌ Failed to load project via API:', error)
      return null
    }
  },

  // Create new project with specific ID
  createProject: async (projectId: string, brief: ProjectBrief) => {
    try {
      set({ isLoading: true, error: null })
      
      console.log('📝 Creating new project with ID:', projectId)
      
      // Generate headline
      const headline = await get().generateHeadline(brief)
      console.log('📝 Generated headline:', headline)
      
      // Create project
      const project: Project = {
        id: projectId,
        headline,
        timestamp: Date.now(),
        lastModified: Date.now(),
        brief,
        voiceTracks: [],
        musicPrompt: '',
        soundFxPrompt: null,
      }
      
      console.log('📝 Saving project to Redis:', project.id)
      
      // Save to Redis
      await get().saveProjectToRedis(project)
      
      console.log('📝 Reloading project list...')
      
      // Reload project list
      await get().loadProjects()
      
      console.log('✅ Project created successfully:', project.headline)
      
    } catch (error) {
      console.error('❌ Failed to create project:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to create project'
      set({ error: errorMessage })
      throw error
    } finally {
      set({ isLoading: false })
    }
  },

  // Update project by ID
  updateProject: async (projectId: string, updates: Partial<Project>) => {
    try {
      const sessionId = getUserSessionId()
      
      const response = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates, sessionId })
      })

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Project update failed:', response.status, errorText);
        throw new Error(`Project update failed: ${response.status}`)
      }

      const { project: updatedProject } = await response.json()
      console.log('✅ Project update successful for:', updatedProject.headline);
      
    } catch (error) {
      console.error('❌ Project update error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update project'
      set({ error: errorMessage })
      throw error;
    }
  },

  // Delete project
  deleteProject: async (id: string) => {
    try {
      set({ isLoading: true, error: null })
      const sessionId = getUserSessionId()
      
      const response = await fetch(`/api/projects/${id}?sessionId=${encodeURIComponent(sessionId)}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        throw new Error('Failed to delete project')
      }
      
      // Reload project list
      await get().loadProjects()
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete project'
      set({ error: errorMessage })
    } finally {
      set({ isLoading: false })
    }
  },

  // Load project list
  loadProjects: async () => {
    try {
      set({ isLoading: true, error: null })
      const sessionId = getUserSessionId()
      
      const response = await fetch(`/api/projects?sessionId=${encodeURIComponent(sessionId)}`)
      
      if (!response.ok) {
        throw new Error('Failed to load projects')
      }

      const { projects } = await response.json()
      
      set({ 
        projects: projects || [],
        recentProjects: projects || []
      })
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load projects'
      set({ error: errorMessage })
    } finally {
      set({ isLoading: false })
    }
  },

  // Clear all history
  clearHistory: async () => {
    try {
      set({ isLoading: true, error: null })
      const sessionId = getUserSessionId()
      
      // Load projects to get IDs
      const response = await fetch(`/api/projects?sessionId=${encodeURIComponent(sessionId)}`)
      if (response.ok) {
        const { projects } = await response.json()
        
        // Delete each project
        for (const project of projects || []) {
          await fetch(`/api/projects/${project.id}?sessionId=${encodeURIComponent(sessionId)}`, {
            method: 'DELETE'
          })
        }
      }
      
      // Reset local state
      set({
        projects: [],
        recentProjects: []
      })
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to clear history'
      set({ error: errorMessage })
    } finally {
      set({ isLoading: false })
    }
  },
}))