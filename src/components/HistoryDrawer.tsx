import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useProjectHistoryStore } from '@/store/projectHistoryStore'
import { ProjectMetadata } from '@/types'
import { formatDistanceToNow } from 'date-fns'

type HistoryDrawerProps = {
  isOpen: boolean
  onClose: () => void
  onProjectSelect: (project: ProjectMetadata) => void
  currentProjectId?: string
}

const formatTypeIcon = (format: string) => {
  if (format === 'dialog' || format === 'dialogue') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 10H3C2.46957 10 1.96086 9.78929 1.58579 9.41421C1.21071 9.03914 1 8.53043 1 8V3C1 2.46957 1.21071 1.96086 1.58579 1.58579C1.96086 1.21071 2.46957 1 3 1H10C10.5304 1 11.0391 1.21071 11.4142 1.58579C11.7893 1.96086 12 2.46957 12 3V4"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M6 15L8 12H13C13.5304 12 14.0391 11.7893 14.4142 11.4142C14.7893 11.0391 15 10.5304 15 10V7C15 6.46957 14.7893 5.96086 14.4142 5.58579C14.0391 5.21071 13.5304 5 13 5H6C5.46957 5 4.96086 5.21071 4.58579 5.58579C4.21071 5.96086 4 6.46957 4 7V10C4 10.5304 4.21071 11.0391 4.58579 11.4142C4.96086 11.7893 5.46957 12 6 12V15Z"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  }
  
  // Ad read icon (speaker/megaphone)
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 3L4 6H2C1.44772 6 1 6.44772 1 7V9C1 9.55228 1.44772 10 2 10H4L7 13V3Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M11 5C11.6319 5.85038 12 6.88562 12 8C12 9.11438 11.6319 10.1496 11 11"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

export function HistoryDrawer({ isOpen, onClose, onProjectSelect, currentProjectId }: HistoryDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const { 
    recentProjects, 
    isLoading, 
    error,
    loadProjects,
    deleteProject 
  } = useProjectHistoryStore()

  // Filter projects based on search query
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) return recentProjects
    
    const query = searchQuery.toLowerCase()
    return recentProjects.filter(project => {
      const headline = project.headline?.toLowerCase() || ''
      const language = project.language?.toLowerCase() || ''
      const format = project.format?.toLowerCase() || ''
      const provider = project.provider?.toLowerCase() || ''
      
      return headline.includes(query) || 
             language.includes(query) || 
             format.includes(query) || 
             provider.includes(query)
    })
  }, [recentProjects, searchQuery])

  // Load projects when drawer opens
  useEffect(() => {
    if (isOpen) {
      loadProjects()
    }
  }, [isOpen, loadProjects])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  const handleProjectClick = (project: ProjectMetadata) => {
    onProjectSelect(project)
    onClose()
  }

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation()
    if (confirm('Are you sure you want to delete this project?')) {
      await deleteProject(projectId)
    }
  }

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300"
          onClick={onClose}
        />
      )}
      
      {/* Drawer */}
      <div 
        ref={drawerRef}
        className={`
          fixed top-0 right-0 h-full w-full sm:w-96 bg-black/95 backdrop-blur-md 
          border-l border-white/20 shadow-2xl z-50 transform transition-transform duration-300
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="sticky top-0 bg-black/90 backdrop-blur-md border-b border-white/10 z-10">
          <div className="flex items-center justify-between p-4">
            <h3 className="text-white font-medium text-lg">Project History</h3>
            <button
              onClick={onClose}
              className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              aria-label="Close drawer"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
                  d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Search Bar */}
          {recentProjects.length > 0 && (
            <div className="px-4 pb-3">
              <div className="relative">
                <svg 
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search projects..."
                  className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg 
                           text-white placeholder-white/40 text-sm
                           focus:outline-none focus:border-wb-blue/50 focus:bg-white/10
                           transition-all"
                />
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="h-full overflow-y-auto pb-20">
          {/* Loading state */}
          {isLoading && (
            <div className="p-8 text-center">
              <div className="animate-spin w-6 h-6 border-2 border-white/20 border-t-white rounded-full mx-auto"></div>
              <p className="text-white/60 text-sm mt-2">Loading projects...</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="p-4 text-center">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && recentProjects.length === 0 && (
            <div className="p-12 text-center">
              <svg
                className="w-16 h-16 text-white/20 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-white/60 text-base mb-1">No projects yet</p>
              <p className="text-white/40 text-sm">
                Generate your first ad to see it here
              </p>
            </div>
          )}

          {/* Search results empty state */}
          {!isLoading && !error && recentProjects.length > 0 && filteredProjects.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-white/60 text-sm">No projects match your search</p>
            </div>
          )}

          {/* Project list */}
          {!isLoading && !error && filteredProjects.length > 0 && (
            <div>
              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => handleProjectClick(project)}
                  className={`
                    group px-4 py-3 hover:bg-white/5 cursor-pointer transition-all
                    ${currentProjectId === project.id ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : ''}
                  `}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      {/* Project headline with current indicator */}
                      <h4 className="text-white font-medium truncate pr-2 flex items-center gap-2">
                        {project.headline}
                        {currentProjectId === project.id && (
                          <span className="flex-shrink-0 w-2 h-2 bg-blue-400 rounded-full"></span>
                        )}
                      </h4>
                      
                      {/* Compact metadata line */}
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-white/40 text-xs">
                          {formatDistanceToNow(new Date(project.timestamp), { addSuffix: true })}
                        </span>
                        
                        {/* Tags with icons - right aligned */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-1.5 py-0.5 bg-white/10 text-white/60 rounded flex items-center gap-1">
                            {project.language}
                          </span>
                          <span className="text-white/40" title={project.format.replace('_', ' ')}>
                            {formatTypeIcon(project.format)}
                          </span>
                          <span className="text-xs text-white/50">
                            {project.provider}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={(e) => handleDeleteProject(e, project.id)}
                      className="ml-2 p-1.5 text-white/20 hover:text-red-400 hover:bg-red-500/10 
                               rounded opacity-0 group-hover:opacity-100 transition-all"
                      title="Delete project"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} 
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer with actions */}
          {!isLoading && !error && recentProjects.length > 0 && (
            <div className="sticky bottom-0 p-4 border-t border-white/10 bg-black/90 backdrop-blur-md">
              <div className="flex items-center justify-between">
                <span className="text-white/60 text-sm">
                  {recentProjects.length} project{recentProjects.length !== 1 ? 's' : ''}
                </span>
                <button
                  onClick={async () => {
                    if (confirm('Clear all project history?')) {
                      await useProjectHistoryStore.getState().clearHistory()
                      onClose()
                    }
                  }}
                  className="text-white/40 text-sm hover:text-red-400 transition-colors"
                >
                  Clear all history
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// Hook for managing drawer state
export function useHistoryDrawer() {
  const [isOpen, setIsOpen] = useState(false)
  
  const toggle = () => setIsOpen(prev => !prev)
  const close = () => setIsOpen(false)
  const open = () => setIsOpen(true)
  
  return { isOpen, toggle, close, open }
}