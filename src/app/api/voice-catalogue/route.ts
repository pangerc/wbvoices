import { NextRequest, NextResponse } from 'next/server';
import { voiceCatalogue } from '@/services/voiceCatalogueService';
import { Language, Provider, CampaignFormat } from '@/types';
import { ProviderSelector } from '@/utils/providerSelection';

// Use Node.js runtime for proper Redis access
// export const runtime = 'edge'; // REMOVED - Edge Runtime causes env var issues

/**
 * API endpoints for voice catalogue operations
 * Client-side hooks will call these instead of Redis directly
 */

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const operation = url.searchParams.get('operation');
    const language = url.searchParams.get('language');
    const accent = url.searchParams.get('accent');
    const provider = url.searchParams.get('provider');
    const region = url.searchParams.get('region');
    
    switch (operation) {
      case 'stats': {
        const stats = await voiceCatalogue.getCacheStats();
        return NextResponse.json(stats);
      }
      
      case 'counts': {
        if (!language) {
          return NextResponse.json({ error: 'Language required' }, { status: 400 });
        }
        const counts = await voiceCatalogue.getVoiceCounts(
          language as Language,
          accent || undefined
        );
        return NextResponse.json(counts);
      }
      
      case 'voices': {
        if (!provider || !language) {
          return NextResponse.json({ error: 'Provider and language required' }, { status: 400 });
        }
        
        // If region is specified, get region-filtered voices for the provider
        if (region) {
          const regionVoices = await voiceCatalogue.getVoicesByRegion(
            language as Language,
            region
          );
          
          // For OpenAI, always include all voices regardless of region
          if (provider === 'openai') {
            const allOpenAIVoices = await voiceCatalogue.getVoicesForProvider(
              'openai',
              language as Language,
              accent || undefined
            );
            return NextResponse.json(allOpenAIVoices);
          }
          
          // For other providers, filter by provider
          const providerVoices = regionVoices.filter(voice => 
            voice.provider === provider || provider === 'any'
          );
          return NextResponse.json(providerVoices);
        }
        
        // Default: get all voices for provider
        const voices = await voiceCatalogue.getVoicesForProvider(
          provider as Provider,
          language as Language,
          accent || undefined
        );
        return NextResponse.json(voices);
      }
      
      case 'by-accent': {
        if (!language || !accent) {
          return NextResponse.json({ error: 'Language and accent required' }, { status: 400 });
        }
        const voices = await voiceCatalogue.getVoicesByAccent(
          language as Language,
          accent
        );
        return NextResponse.json(voices);
      }

      // 🔥 NEW: Region-aware operations for clean architecture
      case 'regions': {
        if (!language) {
          return NextResponse.json({ error: 'Language required' }, { status: 400 });
        }
        const regions = await voiceCatalogue.getRegionsForLanguage(language as Language);
        return NextResponse.json(regions);
      }

      case 'by-region': {
        if (!language || !region) {
          return NextResponse.json({ error: 'Language and region required' }, { status: 400 });
        }
        const voices = await voiceCatalogue.getVoicesByRegion(
          language as Language,
          region
        );
        return NextResponse.json(voices);
      }

      case 'region-counts': {
        if (!language || !region) {
          return NextResponse.json({ error: 'Language and region required' }, { status: 400 });
        }
        const counts = await voiceCatalogue.getVoiceCountsByRegion(
          language as Language,
          region
        );
        return NextResponse.json(counts);
      }

      case 'provider-options': {
        if (!language) {
          return NextResponse.json({ error: 'Language required' }, { status: 400 });
        }
        
        // Parse exclude providers from query parameter
        const excludeParam = url.searchParams.get('exclude');
        const excludeProviders = excludeParam ? excludeParam.split(',') as Provider[] : undefined;
        
        const options = await voiceCatalogue.getProviderOptions({
          language: language as Language,
          region: region || undefined,
          accent: accent || undefined,
          excludeProviders
        });
        return NextResponse.json(options);
      }

      case 'filtered-voices': {
        // 🔥 NEW: Comprehensive server-side filtering to replace client-side getFilteredVoices()
        if (!language) {
          return NextResponse.json({ error: 'Language required' }, { status: 400 });
        }

        // Parse exclude providers from query parameter
        const excludeParam = url.searchParams.get('exclude');
        const excludeProviders = excludeParam ? excludeParam.split(',') as Provider[] : [];
        
        // Parse campaignFormat for dialog validation
        const campaignFormat = url.searchParams.get('campaignFormat');
        console.log(`🔍 [${new Date().toISOString()}] filtered-voices API called:`, {
          language,
          provider,
          campaignFormat,
          region,
          accent,
          exclude: excludeProviders
        });

        try {
          // Get all voices for language with filtering applied
          const allVoices: unknown[] = [];

          // Load from non-excluded providers
          const availableProviders = ['elevenlabs', 'lovo', 'openai', 'qwen', 'bytedance'] as const;
          const providersToLoad = availableProviders.filter(p => !excludeProviders.includes(p));

          for (const providerName of providersToLoad) {
            try {
              let providerVoices: unknown[] = [];
              
              // Apply region filtering if specified
              if (region && region !== 'all') {
                const regionVoices = await voiceCatalogue.getVoicesByRegion(
                  language as Language,
                  region
                );
                
                // For OpenAI, always include all voices regardless of region
                if (providerName === 'openai') {
                  providerVoices = await voiceCatalogue.getVoicesForProvider(
                    providerName,
                    language as Language,
                    accent || undefined
                  );
                } else {
                  // For other providers, filter by provider from region voices
                  providerVoices = regionVoices.filter(voice => voice.provider === providerName);
                }
              } else {
                // No region filtering - get all voices for provider
                console.log(`🔍 Loading ${providerName} voices for language: ${language}, accent: ${accent || 'none'}`);
                providerVoices = await voiceCatalogue.getVoicesForProvider(
                  providerName,
                  language as Language,
                  accent || undefined
                );
                console.log(`🔍 Loaded ${providerVoices.length} ${providerName} voices for ${language}`);
              }
              
              // Tag voices with provider and add to result
              const taggedVoices = providerVoices.map(voice => ({
                ...(voice as Record<string, unknown>),
                provider: providerName
              }));
              
              allVoices.push(...taggedVoices);
            } catch (error) {
              console.error(`Failed to load ${providerName} voices:`, error);
              // Continue with other providers
            }
          }

          // 🔥 FIXED: Server-side provider auto-selection with correct counting  
          let finalVoices = allVoices;
          let selectedProvider: Provider | undefined;

          if (!provider || provider === 'any') {
            // 🔥 FIXED: Count FILTERED voices per provider (not all voices!)
            const voiceCounts = {
              elevenlabs: allVoices.filter(voice => (voice as { provider?: string }).provider === 'elevenlabs').length,
              lovo: allVoices.filter(voice => (voice as { provider?: string }).provider === 'lovo').length,
              openai: allVoices.filter(voice => (voice as { provider?: string }).provider === 'openai').length,
              qwen: allVoices.filter(voice => (voice as { provider?: string }).provider === 'qwen').length,
              bytedance: allVoices.filter(voice => (voice as { provider?: string }).provider === 'bytedance').length,
              any: 0 // Not used in selection
            };

            console.log(`🔍 Provider auto-selection debug (FIXED):`, {
              campaignFormat,
              voiceCounts,
              language,
              region: region || 'all', 
              accent: accent || 'neutral',
              totalVoices: allVoices.length,
              // 🔍 DEBUG: Show sample voices to verify language filtering
              sampleVoices: allVoices.slice(0, 3).map(voice => ({
                provider: (voice as { provider?: string }).provider,
                id: (voice as { id?: string }).id,
                language: (voice as { language?: string }).language
              }))
            });

            // Auto-select provider based on campaign format, language, region, accent, and ACTUAL filtered counts
            selectedProvider = ProviderSelector.selectDefault(
              campaignFormat as CampaignFormat || 'ad_read',
              voiceCounts,
              language, // Pass language for smart Chinese defaults
              region || undefined, // Pass region for context-aware selection
              accent || undefined // Pass accent for context-aware selection
            );

            console.log(`🎯 Auto-selected provider: ${selectedProvider} for ${campaignFormat}`);

            // Filter to only selected provider's voices
            finalVoices = allVoices.filter(voice => 
              (voice as { provider?: string }).provider === selectedProvider
            );

            console.log(`🎯 Server auto-selected ${selectedProvider} for ${campaignFormat} (${finalVoices.length} voices)`);
          } else if (provider && provider !== 'any') {
            // Apply specific provider filtering
            finalVoices = allVoices.filter(voice => (voice as { provider?: string }).provider === provider);
            selectedProvider = provider as Provider;
          }

          // Validation for dialog format based on final filtered voices
          const response: {
            voices: unknown[];
            count: number;
            selectedProvider?: Provider;
            dialogReady?: boolean;
            dialogWarning?: string;
          } = {
            voices: finalVoices,
            count: finalVoices.length,
            ...(selectedProvider && { selectedProvider }) // Include selectedProvider if auto-selected
          };

          // Add dialog validation if campaignFormat is provided
          if (campaignFormat === 'dialog') {
            response.dialogReady = finalVoices.length >= 2;
            if (finalVoices.length < 2) {
              response.dialogWarning = `Only ${finalVoices.length} voice(s) available - dialogue needs 2+ voices`;
            }
          }

          return NextResponse.json(response);
        } catch (error) {
          console.error('Error in filtered-voices operation:', error);
          return NextResponse.json({
            voices: [],
            count: 0,
            error: error instanceof Error ? error.message : 'Failed to load voices'
          });
        }
      }
      
      default:
        return NextResponse.json({ error: 'Invalid operation' }, { status: 400 });
    }
  } catch (error) {
    console.error('Voice catalogue API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 }
    );
  }
}