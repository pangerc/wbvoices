import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { Voice } from "@/types";
import { getLanguageName } from "@/utils/language";
import {
  PromptStrategyFactory,
  type PromptContext,
} from "@/lib/prompt-strategies";

// Initialize OpenAI client with server-side key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // No NEXT_PUBLIC_ prefix
});

// Initialize Moonshot KIMI client with OpenAI-compatible interface
const moonshot = new OpenAI({
  apiKey: process.env.MOONSHOT_API_KEY,
  baseURL: "https://api.moonshot.ai/v1",
});

// Initialize Qwen-Max client with OpenAI-compatible interface
const qwen = new OpenAI({
  apiKey: process.env.QWEN_API_KEY,
  baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      aiModel,
      language,
      clientDescription,
      creativeBrief,
      campaignFormat,
      filteredVoices,
      duration = 60,
      provider,
      region,
      accent,
      cta,
      pacing,
    } = body;

    // Validate required fields
    if (
      !language ||
      !clientDescription ||
      !creativeBrief ||
      !campaignFormat ||
      !filteredVoices
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const aiProvider =
      aiModel === "moonshot"
        ? "Moonshot KIMI"
        : aiModel === "qwen"
        ? "Qwen-Max"
        : "OpenAI";
    console.log(
      `Generating creative copy with ${aiModel} (${aiProvider}) for ${provider}...`
    );
    console.log(
      `🗣️ Received ${filteredVoices.length} voices from SINGLE provider: ${provider}`
    );

    // 🔥 NEW: Use strategy pattern to build prompts (replaces 230+ lines of switch/case chaos)
    const strategy = PromptStrategyFactory.create(provider);

    // Convert language code to readable name for LLM
    const languageName = getLanguageName(language);

    // Build dialect instructions if region/accent specified
    let dialectInstructions = "";
    if (accent && accent !== "neutral") {
      dialectInstructions = ` using ${accent} dialect/accent`;
      if (region) {
        dialectInstructions += ` from ${region}`;
      }
    } else if (region) {
      dialectInstructions = ` using regional expressions and terminology from ${region}`;
    }

    // Build prompt context
    const promptContext: PromptContext = {
      language,
      languageName,
      provider,
      voices: filteredVoices as Voice[],
      campaignFormat,
      duration,
      clientDescription,
      creativeBrief,
      region,
      accent,
      cta,
      dialectInstructions,
      pacing: pacing || undefined, // Convert null to undefined for "normal" pacing
    };

    // Generate prompts using strategy (includes gender fix!)
    const { systemPrompt, userPrompt } = strategy.buildPrompt(promptContext);

    // Select appropriate client and model based on aiModel
    let client: OpenAI;
    let model: string;
    let temperature: number;
    let completionParams: {
      model: string;
      messages: Array<{ role: "system" | "user"; content: string }>;
      temperature: number;
      max_tokens?: number;
      max_completion_tokens?: number;
    };

    if (aiModel === "moonshot") {
      if (!process.env.MOONSHOT_API_KEY) {
        return NextResponse.json(
          { error: "Moonshot API key not configured" },
          { status: 500 }
        );
      }

      console.log(
        "Using Moonshot with API key:",
        process.env.MOONSHOT_API_KEY?.substring(0, 10) + "..."
      );

      client = moonshot;
      model = "kimi-latest"; // Use the latest stable model
      temperature = 0.7;
      completionParams = {
        model,
        messages: [
          { role: "system" as const, content: systemPrompt },
          { role: "user" as const, content: userPrompt },
        ],
        temperature,
        max_tokens: 2000,
      };
    } else if (aiModel === "qwen") {
      if (!process.env.QWEN_API_KEY) {
        return NextResponse.json(
          { error: "Qwen API key not configured" },
          { status: 500 }
        );
      }

      console.log(
        "Using Qwen with API key:",
        process.env.QWEN_API_KEY?.substring(0, 10) + "..."
      );

      client = qwen;
      model = "qwen-max"; // Use Qwen-Max model
      temperature = 0.7;
      completionParams = {
        model,
        messages: [
          { role: "system" as const, content: systemPrompt },
          { role: "user" as const, content: userPrompt },
        ],
        temperature,
        max_tokens: 2000,
      };
    } else {
      // OpenAI GPT-5 models - use Responses API
      client = openai;

      // Determine model and reasoning effort
      let reasoningEffort: "minimal" | "low" | "medium" | "high";
      if (aiModel === "gpt5-premium") {
        model = "gpt-5";
        reasoningEffort = "high";
      } else if (aiModel === "gpt5-fast") {
        model = "gpt-5";
        reasoningEffort = "minimal";
      } else {
        // gpt5-balanced
        model = "gpt-5-mini";
        reasoningEffort = "medium";
      }

      // Higher token budget for reasoning models - reasoning tokens count against this limit
      const maxTokens = reasoningEffort === "high" ? 25000 : 16000;

      console.log(
        `Attempting ${aiProvider} Responses API call with model: ${model}, reasoning: ${reasoningEffort}, maxTokens: ${maxTokens}`
      );

      // Use Responses API for GPT-5
      const response = await client.responses.create({
        model,
        input: `${systemPrompt}\n\n${userPrompt}`,
        reasoning: { effort: reasoningEffort },
        max_output_tokens: maxTokens,
      });

      console.log(`${aiProvider} response:`, response);

      const content = response.output_text || "";
      console.log(
        `Raw ${aiProvider} response content:`,
        JSON.stringify(content)
      );
      console.log("Content length:", content.length);

      if (!content || content.trim() === "") {
        console.error(`Empty response from ${aiProvider}`);
        throw new Error("AI returned empty response");
      }

      // Clean up the response if it contains markdown
      let cleanedContent = content.trim();
      if (cleanedContent.startsWith("```")) {
        cleanedContent = cleanedContent
          .replace(/^```(?:json)?\s*\n/, "")
          .replace(/\n```\s*$/, "");
      }

      console.log("Cleaned content:", JSON.stringify(cleanedContent));

      // Validate it's valid JSON
      try {
        const parsed = JSON.parse(cleanedContent);
        console.log("Successfully parsed JSON:", parsed);
      } catch (jsonError) {
        console.error("Invalid JSON response:", cleanedContent);
        console.error("JSON parse error:", jsonError);
        throw new Error(
          `AI returned invalid JSON format: ${
            jsonError instanceof Error
              ? jsonError.message
              : "Unknown parsing error"
          }`
        );
      }

      return NextResponse.json({ content: cleanedContent });
    }

    console.log(`Attempting ${aiProvider} API call with model: ${model}`);

    const response = await client.chat.completions.create(completionParams);

    console.log(`${aiProvider} response status:`, response);
    console.log("Response choices:", response.choices?.length);

    const content = response.choices[0]?.message?.content || "";
    console.log(`Raw ${aiProvider} response content:`, JSON.stringify(content));
    console.log("Content length:", content.length);

    if (!content || content.trim() === "") {
      console.error(`Empty response from ${aiProvider}`);
      throw new Error("AI returned empty response");
    }

    // Clean up the response if it contains markdown
    let cleanedContent = content.trim();
    if (cleanedContent.startsWith("```")) {
      cleanedContent = cleanedContent
        .replace(/^```(?:json)?\s*\n/, "")
        .replace(/\n```\s*$/, "");
    }

    console.log("Cleaned content:", JSON.stringify(cleanedContent));

    // Validate it's valid JSON
    try {
      const parsed = JSON.parse(cleanedContent);
      console.log("Successfully parsed JSON:", parsed);
    } catch (jsonError) {
      console.error("Invalid JSON response:", cleanedContent);
      console.error("JSON parse error:", jsonError);
      throw new Error(
        `AI returned invalid JSON format: ${
          jsonError instanceof Error
            ? jsonError.message
            : "Unknown parsing error"
        }`
      );
    }

    return NextResponse.json({ content: cleanedContent });
  } catch (error) {
    console.error("Error in AI generation:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate creative copy",
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
