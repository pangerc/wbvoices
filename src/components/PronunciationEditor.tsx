import React, { useState, useEffect } from 'react';
import { TrashIcon } from '@heroicons/react/24/outline';
import { PronunciationRule } from '@/types';

const DICTIONARY_NAME = 'Global Brand Pronunciations';
const STORAGE_KEY = 'pronunciation_rules';

type PronunciationEditorProps = {
  className?: string;
  renderSaveButton?: (props: {
    onClick: () => void;
    disabled: boolean;
    isSaving: boolean;
    hasChanges: boolean;
  }) => React.ReactNode;
};

/**
 * Pronunciation dictionary editor for ElevenLabs
 * Manages global brand pronunciation rules
 */
export function PronunciationEditor({ className = '', renderSaveButton }: PronunciationEditorProps) {
  const [rules, setRules] = useState<PronunciationRule[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dictionaryId, setDictionaryId] = useState<string | null>(null);

  // Load rules from API (Redis) on mount, with localStorage fallback
  useEffect(() => {
    const loadRules = async () => {
      try {
        // Try to fetch from API (Redis-backed)
        console.log('📖 Fetching pronunciation rules from API...');
        const response = await fetch('/api/pronunciation');

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.rules && data.rules.length > 0) {
            console.log(`✅ Loaded ${data.rules.length} rules from API`);
            setRules(data.rules);
            setDictionaryId(data.dictionaryId || null);

            // Update localStorage cache
            localStorage.setItem(
              STORAGE_KEY,
              JSON.stringify({
                rules: data.rules,
                dictionaryId: data.dictionaryId,
                timestamp: Date.now(),
              })
            );
            return;
          }
        }

        // Fallback to localStorage if API fails or returns no rules
        console.log('📖 Falling back to localStorage...');
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          try {
            const data = JSON.parse(stored);
            setRules(data.rules || []);
            setDictionaryId(data.dictionaryId || null);
            console.log(`✅ Loaded ${data.rules?.length || 0} rules from localStorage`);
          } catch (err) {
            console.error('Failed to parse stored rules:', err);
          }
        }
      } catch (error) {
        console.error('Failed to load rules from API:', error);

        // Fallback to localStorage on error
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
      }
    };

    loadRules();
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
      if (dictionaryId) {
        // Update existing dictionary
        console.log('📖 Updating existing dictionary:', dictionaryId, 'with', validRules.length, 'rules');
        const response = await fetch(`/api/pronunciation/${dictionaryId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rules: validRules }),
        });

        const data = await response.json();

        if (data.success) {
          // Save to localStorage
          localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
              rules: validRules,
              dictionaryId: dictionaryId,
              timestamp: Date.now(),
            })
          );

          setRules(validRules);
          setSuccess(`Updated ${validRules.length} pronunciation rules`);
          setTimeout(() => setSuccess(null), 3000);
        } else {
          setError(data.error || 'Failed to update dictionary');
        }
      } else {
        // Create new dictionary (first time)
        console.log('📖 Creating new global dictionary with', validRules.length, 'rules');
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
          setSuccess(`Created dictionary with ${validRules.length} pronunciation rules`);
          setTimeout(() => setSuccess(null), 3000);
        } else {
          setError(data.error || 'Failed to create dictionary');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save dictionary');
    } finally {
      setIsSaving(false);
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
    <div className={`text-white ${className}`}>
      {/* Messages */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-500/10 border border-green-500/50 rounded-xl p-4 mb-6">
          <p className="text-green-400">{success}</p>
        </div>
      )}

      {/* Save button render prop */}
      {renderSaveButton && renderSaveButton({
        onClick: handleSave,
        disabled: !hasChanges(),
        isSaving: isSaving,
        hasChanges: hasChanges()
      })}

      {/* Rules List */}
      <div className="mb-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-white">
            Pronunciation Rules
            {rules.length > 0 && (
              <span className="text-gray-500 text-sm ml-2">
                ({rules.filter(r => r.stringToReplace.trim()).length})
              </span>
            )}
          </h3>
        </div>

        {rules.length === 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-xl p-12 text-center backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
            <p className="text-gray-400 text-lg mb-4">
              No pronunciation rules yet
            </p>
            <p className="text-gray-500 mb-6">
              Add rules to customize how brand names and words are pronounced
            </p>
            <button
              onClick={addRule}
              className="bg-sky-600 hover:bg-sky-700 text-white px-6 py-2 rounded-xl transition-colors"
            >
              Add First Rule
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule, index) => (
              <div
                key={index}
                className="bg-[#161822]/90 border border-white/10 rounded-xl p-4 hover:border-sky-500/30 transition-colors backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    value={rule.stringToReplace}
                    onChange={(e) =>
                      updateRule(index, { stringToReplace: e.target.value })
                    }
                    placeholder="Brand name (e.g., YSL)"
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-white/30"
                  />
                  <span className="text-gray-500 text-xl">→</span>
                  <input
                    type="text"
                    value={rule.alias || ''}
                    onChange={(e) => updateRule(index, { alias: e.target.value })}
                    placeholder="Pronunciation (e.g., igrek es el)"
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-white/30"
                  />
                  <button
                    onClick={() => removeRule(index)}
                    className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
                    title="Remove this rule"
                  >
                    <TrashIcon className="w-4 h-4" strokeWidth={2} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Rule Button - below the list */}
        {rules.length > 0 && (
          <button
            onClick={addRule}
            className="mt-8 px-2.5 py-1.5 text-sm border-b border-sky-800 bg-gradient-to-t from-sky-900/50 to-transparent w-full text-sky-700 hover:bg-gradient-to-t hover:text-white"
          >
            + Add Rule
          </button>
        )}
      </div>
    </div>
  );
}