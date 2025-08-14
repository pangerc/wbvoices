import React, { useState, useEffect, useRef } from 'react'
import { useProjectHistoryStore } from '@/store/projectHistoryStore'
import { ProjectMetadata } from '@/types'
import { formatDistanceToNow } from 'date-fns'

type HistoryDropdownProps = {
  isOpen: boolean
  onClose: () => void
  onProjectSelect: (project: ProjectMetadata) => void
  currentProjectId?: string
}

export function HistoryDropdown({ isOpen, onClose, onProjectSelect, currentProjectId }: HistoryDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const { 
    recentProjects, 
    isLoading, 
    error,
    loadProjects,
    deleteProject 
  } = useProjectHistoryStore()

  // Load projects when dropdown opens
  useEffect(() => {
    if (isOpen) {
      loadProjects()
    }
  }, [isOpen, loadProjects])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  const handleProjectClick = (project: ProjectMetadata) => {
    onProjectSelect(project)
    onClose()
  }

  const handleDeleteProject = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation() // Prevent project selection
    if (confirm('Are you sure you want to delete this project?')) {
      await deleteProject(projectId)
    }
  }

  if (!isOpen) return null

  return (
    <div 
      ref={dropdownRef}
      className="absolute top-full right-0 mt-2 w-96 bg-black/90 backdrop-blur-md border border-white/20 rounded-lg shadow-xl z-50"
    >
      {/* Header */}
      <div className="p-4 border-b border-white/10">
        <h3 className="text-white font-medium">Project History</h3>
        {recentProjects.length > 0 && (
          <p className="text-white/60 text-sm mt-1">
            {recentProjects.length} recent project{recentProjects.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

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
        <div className="p-8 text-center">
          <svg
            className="w-12 h-12 text-white/20 mx-auto mb-3"
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
          <p className="text-white/60 text-sm">No projects yet</p>
          <p className="text-white/40 text-xs mt-1">
            Generate your first ad to see it here
          </p>
        </div>
      )}

      {/* Project list */}
      {!isLoading && !error && recentProjects.length > 0 && (
        <div className="max-h-80 overflow-y-auto">
          {recentProjects.map((project, index) => (
            <div
              key={project.id}
              onClick={() => handleProjectClick(project)}
              className={`
                p-4 border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors
                ${currentProjectId === project.id ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : ''}
                ${index === recentProjects.length - 1 ? 'border-b-0' : ''}
              `}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  {/* Project headline */}
                  <h4 className="text-white font-medium truncate flex items-center gap-2">
                    {project.headline}
                    {currentProjectId === project.id && (
                      <span className="text-blue-400 text-xs">•</span>
                    )}
                  </h4>
                  
                  {/* Timestamp */}
                  <p className="text-white/40 text-xs mt-1">
                    {formatDistanceToNow(new Date(project.timestamp), { addSuffix: true })}
                  </p>
                  
                  {/* Badges */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs px-2 py-1 bg-white/10 text-white/70 rounded">
                      {project.language}
                    </span>
                    <span className="text-xs px-2 py-1 bg-white/10 text-white/70 rounded">
                      {project.format.replace('_', ' ')}
                    </span>
                    <span className="text-xs px-2 py-1 bg-white/10 text-white/70 rounded">
                      {project.provider}
                    </span>
                  </div>
                </div>

                {/* Delete button */}
                <button
                  onClick={(e) => handleDeleteProject(e, project.id)}
                  className="ml-2 p-1 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                  title="Delete project"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer with actions */}
      {!isLoading && !error && recentProjects.length > 0 && (
        <div className="p-3 border-t border-white/10 bg-black/50">
          <button
            onClick={async () => {
              if (confirm('Clear all project history?')) {
                await useProjectHistoryStore.getState().clearHistory()
                onClose()
              }
            }}
            className="text-white/40 text-xs hover:text-red-400 transition-colors"
          >
            Clear all history
          </button>
        </div>
      )}
    </div>
  )
}

// Hook for managing dropdown state
export function useHistoryDropdown() {
  const [isOpen, setIsOpen] = useState(false)
  
  const toggle = () => setIsOpen(prev => !prev)
  const close = () => setIsOpen(false)
  const open = () => setIsOpen(true)
  
  return { isOpen, toggle, close, open }
}