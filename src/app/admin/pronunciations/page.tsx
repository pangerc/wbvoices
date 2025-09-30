'use client';

import React, { useState, useEffect } from 'react';
import { PronunciationRule } from '@/types';

const DICTIONARY_NAME = 'Global Brand Pronunciations';
const STORAGE_KEY = 'pronunciation_rules';

/**
 * Admin page for managing global pronunciation dictionary
 * Single dictionary with all brand pronunciation rules
 */
export default function PronunciationsAdminPage() {
  const [rules, setRules] = useState<PronunciationRule[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dictionaryId, setDictionaryId] = useState<string | null>(null);

  // Load rules from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        setRules(data.rules || []);
        setDictionaryId(data.dictionaryId || null);
      } catch (err) {
        console.error('Failed to parse stored rules:', err);
      }
    }
  }, []);

  const addRule = () => {
    setRules([...rules, { stringToReplace: '', type: 'alias', alias: '' }]);
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const updateRule = (index: number, updates: Partial<PronunciationRule>) => {
    const updated = [...rules];
    updated[index] = { ...updated[index], ...updates };
    setRules(updated);
  };

  const handleSave = async () => {
    // Filter out empty rules
    const validRules = rules.filter((r) => r.stringToReplace.trim() && r.alias?.trim());

    if (validRules.length === 0) {
      setError('At least one rule is required');
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Delete old dictionary if exists
      if (dictionaryId) {
        console.log('🗑️ Deleting old dictionary:', dictionaryId);
        await fetch(`/api/pronunciation/${dictionaryId}`, {
          method: 'DELETE',
        });
      }

      // Create new dictionary
      console.log('📖 Creating global dictionary with', validRules.length, 'rules');
      const response = await fetch('/api/pronunciation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: DICTIONARY_NAME,
          language: 'en', // Dummy value, not used
          rules: validRules,
        }),
      });

      const data = await response.json();

      if (data.success) {
        const newId = data.dictionary.id;
        setDictionaryId(newId);

        // Save to localStorage
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            rules: validRules,
            dictionaryId: newId,
            timestamp: Date.now(),
          })
        );

        setRules(validRules);
        setSuccess(`Saved ${validRules.length} pronunciation rules`);
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to save dictionary');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save dictionary');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm('Delete all pronunciation rules? This will remove custom pronunciations from voice generation.')) {
      return;
    }

    if (!dictionaryId) {
      // Just clear local state
      setRules([]);
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/pronunciation/${dictionaryId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        setRules([]);
        setDictionaryId(null);
        localStorage.removeItem(STORAGE_KEY);
        setSuccess('All rules deleted');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to delete dictionary');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete dictionary');
    } finally {
      setIsDeleting(false);
    }
  };

  const hasChanges = () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return rules.some(r => r.stringToReplace.trim() || r.alias?.trim());

    try {
      const data = JSON.parse(stored);
      return JSON.stringify(rules) !== JSON.stringify(data.rules);
    } catch {
      return true;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Brand Pronunciations</h1>
          <p className="text-gray-400">
            Global dictionary for brand names, acronyms, and foreign words
          </p>
        </div>

        {/* Messages */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-green-500/10 border border-green-500/50 rounded-lg p-4 mb-6">
            <p className="text-green-400">{success}</p>
          </div>
        )}

        {/* Rules List */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-white">
              Pronunciation Rules
              {rules.length > 0 && (
                <span className="text-gray-500 text-base ml-2">
                  ({rules.filter(r => r.stringToReplace.trim()).length})
                </span>
              )}
            </h3>
            <button
              onClick={addRule}
              className="text-purple-400 hover:text-purple-300 text-sm transition-colors"
            >
              + Add Rule
            </button>
          </div>

          {rules.length === 0 ? (
            <div className="bg-white/5 border border-white/10 rounded-lg p-12 text-center">
              <p className="text-gray-400 text-lg mb-4">
                No pronunciation rules yet
              </p>
              <p className="text-gray-500 mb-6">
                Add rules to customize how brand names and words are pronounced
              </p>
              <button
                onClick={addRule}
                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg transition-colors"
              >
                Add First Rule
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule, index) => (
                <div
                  key={index}
                  className="bg-white/5 border border-white/10 rounded-lg p-4 hover:border-purple-500/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={rule.stringToReplace}
                      onChange={(e) =>
                        updateRule(index, { stringToReplace: e.target.value })
                      }
                      placeholder="Brand name (e.g., YSL)"
                      className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder:text-gray-500"
                    />
                    <span className="text-gray-500 text-xl">→</span>
                    <input
                      type="text"
                      value={rule.alias || ''}
                      onChange={(e) => updateRule(index, { alias: e.target.value })}
                      placeholder="Pronunciation (e.g., igrek es el)"
                      className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white placeholder:text-gray-500"
                    />
                    <button
                      onClick={() => removeRule(index)}
                      className="text-red-400 hover:text-red-300 transition-colors p-2"
                    >
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        {rules.length > 0 && (
          <div className="flex items-center justify-between pt-6 border-t border-white/10">
            <div>
              {dictionaryId && (
                <button
                  onClick={handleDeleteAll}
                  disabled={isDeleting}
                  className="text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors px-4 py-2"
                >
                  {isDeleting ? 'Deleting...' : 'Delete All Rules'}
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              {hasChanges() && (
                <span className="text-sm text-yellow-400">Unsaved changes</span>
              )}
              <button
                onClick={handleSave}
                disabled={isSaving || !hasChanges()}
                className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg transition-colors"
              >
                {isSaving ? 'Saving...' : 'Save Rules'}
              </button>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="mt-8 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <p className="text-blue-300 text-sm">
            <strong>💡 Tip:</strong> These pronunciation rules are automatically applied to all ElevenLabs voice generation.
            Perfect for brand names like &ldquo;YSL&rdquo; or &ldquo;L&apos;Oréal&rdquo; that need consistent pronunciation across languages.
          </p>
        </div>
      </div>
    </div>
  );
}