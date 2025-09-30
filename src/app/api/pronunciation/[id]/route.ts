/**
 * Individual Pronunciation Dictionary API
 *
 * Endpoints:
 * - GET: Get a specific dictionary by ID
 * - DELETE: Delete a dictionary by ID
 */

import { NextRequest, NextResponse } from 'next/server';
import { getDictionary, deleteDictionary } from '@/utils/elevenlabs-pronunciation';

export const runtime = 'edge';

type RouteParams = {
  params: Promise<{
    id: string;
  }>;
};

/**
 * Get a specific pronunciation dictionary
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Dictionary ID is required' },
        { status: 400 }
      );
    }

    console.log('📖 Fetching dictionary:', id);
    const dictionary = await getDictionary(id);

    return NextResponse.json({
      success: true,
      dictionary: {
        id: dictionary.id,
        versionId: dictionary.version_id,
        name: dictionary.name,
        description: dictionary.description,
        createdAt: dictionary.creation_time_unix
          ? new Date(dictionary.creation_time_unix * 1000).toISOString()
          : new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('❌ Failed to get dictionary:', error);

    // Handle 404 specifically
    const errorMessage = error instanceof Error ? error.message : 'Failed to get dictionary';
    const status = errorMessage.includes('404') ? 404 : 500;

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status }
    );
  }
}

/**
 * Delete a pronunciation dictionary
 */
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Dictionary ID is required' },
        { status: 400 }
      );
    }

    console.log('📖 Deleting dictionary:', id);
    await deleteDictionary(id);

    return NextResponse.json({
      success: true,
      message: 'Dictionary deleted successfully',
      dictionaryId: id,
    });
  } catch (error) {
    console.error('❌ Failed to delete dictionary:', error);

    // Handle 404 specifically
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete dictionary';
    const status = errorMessage.includes('404') ? 404 : 500;

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status }
    );
  }
}

/**
 * Update a pronunciation dictionary
 * Note: ElevenLabs API doesn't support updating existing dictionaries
 * To update, you must delete and recreate
 */
export async function PUT() {
  return NextResponse.json(
    {
      success: false,
      error: 'Dictionary updates not supported by ElevenLabs API. Delete and recreate instead.',
      hint: 'Use DELETE /api/pronunciation/[id] then POST /api/pronunciation to recreate',
    },
    { status: 501 }
  );
}