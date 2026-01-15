import { BasePromptStrategy, PromptContext } from "./BasePromptStrategy";
import { Voice, CampaignFormat } from "@/types";

/**
 * Lahajati Strategy - Arabic TTS specialist with dialect and performance style control
 *
 * Lahajati supports two modes:
 * - Mode 0 (Structured): Uses dialect_id and performance_id for precise control
 * - Mode 1 (Custom): Uses free-text persona instructions
 *
 * This strategy enables LLM-aware dialect and performance selection based on the brief.
 * The LLM will select appropriate dialect (e.g., Cairo slang for Egyptian youth ads)
 * and performance style (e.g., Automotive ad for car commercials).
 */
export class LahajatiPromptStrategy extends BasePromptStrategy {
  readonly provider = "lahajati" as const;

  buildStyleInstructions(context: PromptContext): string {
    const { accent, region } = context;

    return `LAHAJATI ARABIC TTS - DIALECT AND PERFORMANCE STYLE SELECTION:

Lahajati is a specialized Arabic TTS provider with fine-grained dialect and performance style control.
You MUST select the most appropriate dialect and performance style based on the target audience and ad type.

## ARABIC DIALECT SELECTION

Select the dialect that best matches your target audience. Consider:
- Geographic location of the target market
- Audience demographics (youth prefer colloquial dialects, formal audiences prefer MSA)
- Brand positioning (premium brands may prefer formal dialects, consumer brands may prefer colloquial)

AVAILABLE DIALECT REGIONS (select specific sub-dialects):

**Egyptian Dialects** (most popular for ads targeting Egypt):
- dialectId: 7 = المصرية (القاهرية) - Egyptian Cairo (standard Cairo dialect)
- dialectId: 8 = المصرية (عامية القاهرة) - Egyptian Cairo Slang (casual, youth-oriented)
- dialectId: 9 = المصرية (إسكندرية) - Egyptian Alexandria
- dialectId: 10 = المصرية (صعيدي) - Egyptian Upper Egypt

**Gulf Dialects** (UAE, Saudi, Kuwait, Qatar, Bahrain, Oman):
- dialectId: 2 = السعودية (نجدية) - Saudi Najdi (Central Saudi)
- dialectId: 3 = السعودية (حجازية) - Saudi Hijazi (Western Saudi/Jeddah)
- dialectId: 60 = العمانية - Omani
- dialectId: 64 = الكويتية - Kuwaiti
- dialectId: 67 = البحرينية - Bahraini
- dialectId: 69 = القطرية - Qatari
- dialectId: 70 = الإماراتية - Emirati (UAE)

**Levantine Dialects** (Syria, Lebanon, Jordan, Palestine):
- dialectId: 12 = السورية (دمشق) - Syrian Damascus
- dialectId: 17 = اللبنانية (بيروت) - Lebanese Beirut
- dialectId: 22 = الأردنية - Jordanian
- dialectId: 26 = الفلسطينية - Palestinian

**North African/Maghreb Dialects**:
- dialectId: 30 = الجزائرية - Algerian
- dialectId: 35 = المغربية - Moroccan
- dialectId: 40 = التونسية - Tunisian
- dialectId: 57 = الليبية - Libyan

**Other Arabic Dialects**:
- dialectId: 1 = الفصحى - Modern Standard Arabic (MSA - formal contexts)
- dialectId: 44 = العراقية - Iraqi
- dialectId: 48 = اليمنية - Yemeni
- dialectId: 53 = السودانية - Sudanese

${accent || region ? `
CONTEXT: The user has specified "${accent || ''}" accent${region ? ` from ${region}` : ''}.
Select the most specific dialect that matches this context.
For example, if accent is "egyptian" and the ad targets youth, prefer Cairo Slang (8) over standard Cairo (7).` : ''}

## PERFORMANCE STYLE SELECTION (REQUIRED)

You MUST select a performanceId for each voice track. Match the style to the ad type.

AVAILABLE PERFORMANCE STYLES:
- performanceId: 1542 = إعلان سيارة - Automotive Ad (USE FOR CAR/VEHICLE ADS - energetic, exciting)
- performanceId: 1280 = تكنولوجي متقدم - Tech/Advanced (modern products, enthusiasm)
- performanceId: 1308 = درامي ومثير - Dramatic/Documentary (impactful, cinematic)
- performanceId: 1309 = بهدوء ودفء - Calm and Warm (food, lifestyle, soothing)
- performanceId: 1565 = ثقة هادئة - Calm Confidence (banking, insurance, professional)
- performanceId: 1306 = محايد ومعلوماتي - Neutral/Informative (DEFAULT - use when unsure)

SELECTION RULES (FOLLOW THESE):
- Car/automotive/vehicle ads → performanceId: 1542 (ALWAYS use for car ads)
- Tech/gadget/app ads → performanceId: 1280
- Banking/insurance/finance ads → performanceId: 1565
- Food/beverage/lifestyle ads → performanceId: 1309
- Documentary/dramatic ads → performanceId: 1308
- General/unsure → performanceId: 1306

## OUTPUT REQUIREMENTS

For each voice track, include:
- "dialectId": number - The Lahajati dialect ID to use
- "performanceId": number - The Lahajati performance style ID to use
- "text": string - The Arabic script (no emotional tags - Lahajati handles prosody via performance)

IMPORTANT: Lahajati uses dialect/performance IDs for prosody control, NOT inline emotional tags.
Do NOT include [tags] in the text - keep the script clean Arabic text.`;
  }

  formatVoiceMetadata(voice: Voice, context: PromptContext): string {
    // Use base implementation which includes gender fix
    let desc = super.formatVoiceMetadata(voice, context);

    // Add style field if present
    if (voice.style && voice.style !== "Default") {
      desc += `\n  Style: ${voice.style}`;
    }

    return desc;
  }

  buildOutputFormat(campaignFormat: CampaignFormat): string {
    const dialogExample =
      campaignFormat === "dialog"
        ? `,
    {
      "type": "voice",
      "speaker": "Different Voice Name (id: different_voice_id)",
      "text": "النص العربي للمتحدث الثاني",
      "dialectId": 7,
      "performanceId": 1309
    }`
        : "";

    return `IMPORTANT OUTPUT FORMAT INSTRUCTIONS:
You MUST respond with a valid JSON object with this structure:
{
  "script": [
    {
      "type": "voice",
      "speaker": "Voice Name (id: exact_voice_id)",
      "text": "النص العربي هنا - كتابة طبيعية بدون علامات",
      "dialectId": 8,
      "performanceId": 1306
    }${dialogExample}
  ],
  "music": {
    "description": "Base music concept (in English)",
    "loudly": "Full description with band/artist references (in English)",
    "mubert": "Condensed version under 250 chars (in English)",
    "elevenlabs": "Instrumental descriptions only, no artist names (in English)",
    "playAt": "start",
    "fadeIn": 1,
    "fadeOut": 2
  },
  "soundFxPrompts": [
    {
      "description": "Sound effect description (in English)",
      "playAfter": "start",
      "overlap": 0
    }
  ]
}

REMEMBER FOR LAHAJATI:
- "dialectId" field selects the Arabic sub-dialect (e.g., 8 for Cairo slang)
- "performanceId" field selects the delivery style (e.g., 1542 for automotive ad style)
- "text" field should be clean Arabic text WITHOUT emotional tags
- Lahajati handles prosody/emotion through the performance style, not inline tags
- Music object MUST include all four fields: description, loudly, mubert, elevenlabs`;
  }
}
