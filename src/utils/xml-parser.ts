export type ParsedCreative = {
  segments: Array<{
    voiceId: string;
    text: string;
  }>;
  musicPrompt: string;
};

export function parseCreativeXML(xmlString: string): ParsedCreative {
  // Create a temporary DOM parser
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, "text/xml");

  // Extract voice segments
  const segments = Array.from(xmlDoc.getElementsByTagName("voice")).map(
    (voiceElement) => ({
      voiceId: voiceElement.getAttribute("id") || "",
      text: voiceElement.textContent || "",
    })
  );

  // Extract music prompt
  const musicPrompt =
    xmlDoc.getElementsByTagName("prompt")[0]?.textContent || "";

  return {
    segments,
    musicPrompt,
  };
}
