import React, { useState, useEffect, useRef } from 'react'
import { formatDistanceToNow } from 'date-fns'
import {
  XMarkIcon,
  ClockIcon,
  TrashIcon,
  ChatBubbleOvalLeftEllipsisIcon,
} from '@heroicons/react/24/outline'

type Ad = {
  adId: string
  meta: {
    name: string
    createdAt: number
    lastModified: number
    owner: string
    brief?: {
      selectedLanguage?: string
      campaignFormat?: 'ad_read' | 'dialog'
      selectedProvider?: string
    }
  }
}

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type TabType = 'ads' | 'chat'

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
  const [deletingAdId, setDeletingAdId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabType>('ads')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)

  // Load ads when drawer opens
  useEffect(() => {
    if (isOpen) {
      loadAds()
    }
  }, [isOpen])

  // Load chat messages when switching to chat tab
  useEffect(() => {
    if (activeTab === 'chat' && currentAdId) {
      loadChatHistory()
    }
  }, [activeTab, currentAdId])

  const loadChatHistory = async () => {
    if (!currentAdId) return

    setIsChatLoading(true)
    setChatError(null)
    try {
      const res = await fetch(`/api/ads/${currentAdId}/conversation`)
      if (res.ok) {
        const data = await res.json()
        setChatMessages(data.messages || [])
      } else {
        setChatError('Failed to load chat history')
      }
    } catch (err) {
      setChatError('Failed to load chat history')
      console.error('Error loading chat history:', err)
    } finally {
      setIsChatLoading(false)
    }
  }

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

  const handleDeleteAd = async (e: React.MouseEvent, adId: string) => {
    e.stopPropagation() // Prevent navigation
    if (!confirm('Delete this ad? This cannot be undone.')) return

    setDeletingAdId(adId)
    try {
      const sessionId = typeof window !== 'undefined'
        ? localStorage.getItem('universal-session') || 'default-session'
        : 'default-session'

      const res = await fetch(`/api/ads/${adId}`, {
        method: 'DELETE',
        headers: { 'x-session-id': sessionId }
      })

      if (res.ok) {
        // If deleting current ad, redirect to home
        if (currentAdId === adId) {
          window.location.href = '/'
        } else {
          loadAds() // Refresh list
        }
      } else {
        console.error('Failed to delete ad')
      }
    } catch (err) {
      console.error('Error deleting ad:', err)
    } finally {
      setDeletingAdId(null)
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
          flex flex-col
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* Header */}
        <div className="sticky top-0 bg-black/90 backdrop-blur-md border-b border-white/10 z-10">
          <div className="flex items-center justify-between p-4 pb-2">
            <h3 className="text-white font-medium text-lg">History</h3>
            <button
              onClick={onClose}
              className="p-2 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-all"
              aria-label="Close drawer"
            >
              <XMarkIcon className="w-5 h-5" strokeWidth={1.5} />
            </button>
          </div>
          {/* Tab bar */}
          <div className="flex px-4 pb-2 gap-1">
            <button
              onClick={() => setActiveTab('ads')}
              className={`flex-1 py-1.5 px-3 text-sm font-medium rounded-lg transition-all ${
                activeTab === 'ads'
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/5'
              }`}
            >
              Ads
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              disabled={!currentAdId}
              className={`flex-1 py-1.5 px-3 text-sm font-medium rounded-lg transition-all ${
                activeTab === 'chat'
                  ? 'bg-white/10 text-white'
                  : 'text-white/50 hover:text-white/70 hover:bg-white/5'
              } ${!currentAdId ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              Chat
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Ads Tab */}
          {activeTab === 'ads' && (
            <>
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
                  <ClockIcon className="w-16 h-16 text-white/20 mx-auto mb-4" strokeWidth={1.5} />
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
                        ${deletingAdId === ad.adId ? 'opacity-50 pointer-events-none' : ''}
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

                          {/* Tags: language, format, provider */}
                          <div className="flex items-center gap-1.5 mt-1.5">
                            {ad.meta.brief?.selectedLanguage && (
                              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-white/10 text-white/70 rounded">
                                {ad.meta.brief.selectedLanguage}
                              </span>
                            )}
                            {ad.meta.brief?.campaignFormat && (
                              <span className="text-white/50" title={ad.meta.brief.campaignFormat === 'dialog' ? 'Dialog' : 'Ad Read'}>
                                {ad.meta.brief.campaignFormat === 'dialog' ? '💬' : '🔊'}
                              </span>
                            )}
                            {ad.meta.brief?.selectedProvider && (
                              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-white/5 text-white/50 rounded">
                                {ad.meta.brief.selectedProvider}
                              </span>
                            )}
                          </div>

                          {/* Timestamp */}
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-white/40 text-xs">
                              {formatDistanceToNow(new Date(ad.meta.lastModified), { addSuffix: true })}
                            </span>
                          </div>
                        </div>

                        {/* Delete button */}
                        <button
                          onClick={(e) => handleDeleteAd(e, ad.adId)}
                          disabled={deletingAdId === ad.adId}
                          className="flex-shrink-0 ml-2 p-1.5 opacity-0 group-hover:opacity-100 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded transition-all disabled:opacity-50"
                          aria-label="Delete ad"
                        >
                          {deletingAdId === ad.adId ? (
                            <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                          ) : (
                            <TrashIcon className="w-4 h-4" strokeWidth={1.5} />
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Chat Tab */}
          {activeTab === 'chat' && (
            <>
              {/* Loading state */}
              {isChatLoading && (
                <div className="p-8 text-center">
                  <div className="animate-spin w-6 h-6 border-2 border-white/20 border-t-white rounded-full mx-auto"></div>
                  <p className="text-white/60 text-sm mt-2">Loading chat...</p>
                </div>
              )}

              {/* Error state */}
              {chatError && (
                <div className="p-4 text-center">
                  <p className="text-red-400 text-sm">{chatError}</p>
                </div>
              )}

              {/* No ad selected */}
              {!currentAdId && (
                <div className="p-12 text-center">
                  <ChatBubbleOvalLeftEllipsisIcon className="w-16 h-16 text-white/20 mx-auto mb-4" strokeWidth={1.5} />
                  <p className="text-white/60 text-base mb-1">Select an ad</p>
                  <p className="text-white/40 text-sm">
                    Choose an ad to view its chat history
                  </p>
                </div>
              )}

              {/* Empty state */}
              {!isChatLoading && !chatError && currentAdId && chatMessages.length === 0 && (
                <div className="p-12 text-center">
                  <ChatBubbleOvalLeftEllipsisIcon className="w-16 h-16 text-white/20 mx-auto mb-4" strokeWidth={1.5} />
                  <p className="text-white/60 text-base mb-1">No chat history</p>
                  <p className="text-white/40 text-sm">
                    Conversations will appear here
                  </p>
                </div>
              )}

              {/* Chat messages */}
              {!isChatLoading && !chatError && chatMessages.length > 0 && (
                <div className="p-4 space-y-3">
                  {chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
                          msg.role === 'user'
                            ? 'bg-blue-600 text-white rounded-br-sm'
                            : 'bg-white/10 text-white/90 rounded-bl-sm'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer - outside scrollable area */}
        {activeTab === 'ads' && !isLoading && !error && ads.length > 0 && (
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