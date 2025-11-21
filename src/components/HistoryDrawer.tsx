import React, { useState, useEffect, useRef } from 'react'
import { formatDistanceToNow } from 'date-fns'

type Ad = {
  adId: string
  meta: {
    name: string
    createdAt: number
    lastModified: number
    owner: string
  }
}

type HistoryDrawerProps = {
  isOpen: boolean
  onClose: () => void
  currentAdId?: string
}

export function HistoryDrawer({ isOpen, onClose, currentAdId }: HistoryDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null)
  const [ads, setAds] = useState<Ad[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load ads when drawer opens
  useEffect(() => {
    if (isOpen) {
      loadAds()
    }
  }, [isOpen])

  const loadAds = async () => {
    setIsLoading(true)
    setError(null)
    try {
      // Get session ID from localStorage (matches universal-session pattern)
      const sessionId = typeof window !== 'undefined'
        ? localStorage.getItem('universal-session') || 'default-session'
        : 'default-session'

      console.log('🔍 HistoryDrawer loading ads for session:', sessionId)
      const res = await fetch(`/api/ads?sessionId=${sessionId}`)
      console.log('🔍 HistoryDrawer API response status:', res.status)

      if (res.ok) {
        const data = await res.json()
        console.log('🔍 HistoryDrawer received ads:', data.ads)
        setAds(data.ads || [])
      } else {
        const errorData = await res.json()
        console.error('🔍 HistoryDrawer API error:', errorData)
        setError('Failed to load ads')
      }
    } catch (err) {
      setError('Failed to load ads')
      console.error('Error loading ads:', err)
    } finally {
      setIsLoading(false)
    }
  }

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

  const handleAdClick = (adId: string) => {
    window.location.href = `/ad/${adId}`
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
          flex flex-col
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="sticky top-0 bg-black/90 backdrop-blur-md border-b border-white/10 z-10">
          <div className="flex items-center justify-between p-4">
            <h3 className="text-white font-medium text-lg">Ad History</h3>
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
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Loading state */}
          {isLoading && (
            <div className="p-8 text-center">
              <div className="animate-spin w-6 h-6 border-2 border-white/20 border-t-white rounded-full mx-auto"></div>
              <p className="text-white/60 text-sm mt-2">Loading ads...</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="p-4 text-center">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && ads.length === 0 && (
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
              <p className="text-white/60 text-base mb-1">No ads yet</p>
              <p className="text-white/40 text-sm">
                Create your first ad to see it here
              </p>
            </div>
          )}

          {/* Ad list */}
          {!isLoading && !error && ads.length > 0 && (
            <div>
              {ads.map((ad) => (
                <div
                  key={ad.adId}
                  onClick={() => handleAdClick(ad.adId)}
                  className={`
                    group px-4 py-3 hover:bg-white/5 cursor-pointer transition-all
                    ${currentAdId === ad.adId ? 'bg-blue-500/10 border-l-2 border-l-blue-500' : ''}
                  `}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      {/* Ad name with current indicator */}
                      <h4 className="text-white font-medium truncate pr-2 flex items-center gap-2">
                        {ad.meta.name}
                        {currentAdId === ad.adId && (
                          <span className="flex-shrink-0 w-2 h-2 bg-blue-400 rounded-full"></span>
                        )}
                      </h4>

                      {/* Ad ID and timestamp */}
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-white/50 text-xs font-mono">
                          {ad.adId}
                        </span>
                        <span className="text-white/40 text-xs">
                          {formatDistanceToNow(new Date(ad.meta.lastModified), { addSuffix: true })}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer - outside scrollable area */}
        {!isLoading && !error && ads.length > 0 && (
          <div className="flex-shrink-0 p-4 border-t border-white/10 bg-black/90 backdrop-blur-md">
            <div className="flex items-center justify-between">
              <span className="text-white/60 text-sm">
                {ads.length} ad{ads.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        )}
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