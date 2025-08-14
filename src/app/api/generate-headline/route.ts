import { NextRequest, NextResponse } from 'next/server'
import { ProjectBrief } from '@/types'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  try {
    const { brief }: { brief: ProjectBrief } = await request.json()
    
    if (!brief) {
      return NextResponse.json(
        { error: 'Project brief is required' },
        { status: 400 }
      )
    }

    // Generate headline using OpenAI
    const prompt = `Based on this creative brief, generate a short 3-5 word headline that captures the essence of this ad campaign:

Client: ${brief.clientDescription}
Brief: ${brief.creativeBrief}
Format: ${brief.campaignFormat}
Language: ${brief.selectedLanguage}

Examples:
- "BMW Summer Sales Push"
- "Nike Marathon Motivational"
- "Spotify Student Discount Fun"
- "Mercedes Luxury Dialogue"

Return only the headline, no quotes or explanations.`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 50,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const headline = data.choices?.[0]?.message?.content?.trim()

    if (!headline) {
      throw new Error('No headline generated from OpenAI')
    }

    return NextResponse.json({ 
      headline: headline.replace(/"/g, ''), // Remove any quotes
      success: true 
    })

  } catch (error) {
    console.error('Headline generation error:', error)
    
    // Return fallback headline on error
    const fallback = 'Generated Project'
    return NextResponse.json({ 
      headline: fallback,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}