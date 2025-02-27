export type ParsedCreative = {
  segments: Array<{
    voiceId: string;
    text: string;
  }>;
  musicPrompt: string;
};

export function parseCreativeXML(xmlString: string): ParsedCreative {
  console.log("Parsing XML:", xmlString);

  // Check if the input is valid XML
  if (!xmlString || typeof xmlString !== "string") {
    console.error("Invalid XML input:", xmlString);
    return { segments: [], musicPrompt: "" };
  }

  // Clean up the XML string - remove any potential issues
  const cleanXml = xmlString
    .replace(/\\"/g, '"') // Replace escaped quotes
    .replace(/&(?!(amp;|lt;|gt;|quot;|apos;|#\d+;))/g, "&amp;"); // Fix unescaped ampersands

  console.log("Cleaned XML:", cleanXml);

  try {
    // Create a temporary DOM parser
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(cleanXml, "text/xml");

    // Check for parsing errors
    const parseError = xmlDoc.querySelector("parsererror");
    if (parseError) {
      console.error("XML parsing error:", parseError.textContent);

      // Try to extract content with regex as fallback
      return extractWithRegex(cleanXml);
    }

    // Extract voice segments
    const voiceElements = xmlDoc.getElementsByTagName("voice");
    console.log(`Found ${voiceElements.length} voice elements`);

    if (voiceElements.length === 0) {
      console.warn(
        "No voice elements found in the XML, trying regex extraction"
      );
      return extractWithRegex(cleanXml);
    }

    const segments = Array.from(voiceElements).map((voiceElement) => {
      const voiceId = voiceElement.getAttribute("id") || "";
      const text = voiceElement.textContent || "";
      console.log(
        `Extracted voice segment - ID: ${voiceId}, Text: ${text.substring(
          0,
          50
        )}...`
      );
      return { voiceId, text };
    });

    // Extract music prompt
    const promptElement = xmlDoc.getElementsByTagName("prompt")[0];
    const musicPrompt = promptElement?.textContent || "";
    console.log(`Extracted music prompt: ${musicPrompt.substring(0, 50)}...`);

    return {
      segments,
      musicPrompt,
    };
  } catch (error) {
    console.error("Error parsing XML:", error);
    return extractWithRegex(cleanXml);
  }
}

// Fallback method using regex to extract content
function extractWithRegex(content: string): ParsedCreative {
  console.log("Attempting to extract content with regex");
  const segments: Array<{ voiceId: string; text: string }> = [];

  // Try to extract voice segments with regex - handle both quoted and escaped quoted attributes
  const voiceRegex =
    /<voice\s+id=(?:["']|\\")([^"']*)(?:["']|\\")\s*>([\s\S]*?)<\/voice>/g;
  let match;

  while ((match = voiceRegex.exec(content)) !== null) {
    const voiceId = match[1];
    const text = match[2].trim();
    console.log(
      `Regex extracted voice - ID: ${voiceId}, Text: ${text.substring(
        0,
        50
      )}...`
    );
    segments.push({ voiceId, text });
  }

  // If no segments were found, try a more lenient regex
  if (segments.length === 0) {
    console.log(
      "No segments found with strict regex, trying more lenient approach"
    );

    // Look for anything that might be a voice tag
    const lenientVoiceRegex = /<voice[^>]*>([\s\S]*?)<\/voice>/g;
    let lenientMatch;

    while ((lenientMatch = lenientVoiceRegex.exec(content)) !== null) {
      // Try to extract the ID if possible
      const idMatch = lenientMatch[0].match(
        /id=(?:["']|\\")([^"']*)(?:["']|\\")/
      );
      const voiceId = idMatch ? idMatch[1] : "unknown_voice";
      const text = lenientMatch[1].trim();

      console.log(
        `Lenient regex extracted voice - ID: ${voiceId}, Text: ${text.substring(
          0,
          50
        )}...`
      );
      segments.push({ voiceId, text });
    }
  }

  // Try to extract music prompt with regex
  let musicPrompt = "";
  const promptRegex = /<prompt>([\s\S]*?)<\/prompt>/;
  const promptMatch = content.match(promptRegex);

  if (promptMatch && promptMatch[1]) {
    musicPrompt = promptMatch[1].trim();
    console.log(
      `Regex extracted music prompt: ${musicPrompt.substring(0, 50)}...`
    );
  }

  return {
    segments,
    musicPrompt,
  };
}
