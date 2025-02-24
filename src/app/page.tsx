"use client";

import React, { useState } from "react";
import Image from "next/image";

type Language = "en-US" | "sl-SI" | "hr-HR" | "lt-LT";
type AdStyle = "simple" | "dialogue";
type Voice = {
  id: string;
  name: string;
  gender: "male" | "female";
  sampleUrl?: string;
};

export default function DemoTTS() {
  const [step, setStep] = useState<number>(1);
  const [selectedLanguage, setSelectedLanguage] = useState<Language | null>(
    null
  );
  const [selectedStyle, setSelectedStyle] = useState<AdStyle | null>(null);
  const [selectedVoices, setSelectedVoices] = useState<Voice[]>([]);
  const [text, setText] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [samplePlaying, setSamplePlaying] = useState<string | null>(null);

  // Mock voice data - replace with actual API data
  const voices: Record<Language, Voice[]> = {
    "en-US": [
      {
        id: "en-1",
        name: "James",
        gender: "male",
        sampleUrl: "/samples/en-male.mp3",
      },
      {
        id: "en-2",
        name: "Sarah",
        gender: "female",
        sampleUrl: "/samples/en-female.mp3",
      },
    ],
    "sl-SI": [
      {
        id: "sl-1",
        name: "Luka",
        gender: "male",
        sampleUrl: "/samples/sl-male.mp3",
      },
      {
        id: "sl-2",
        name: "Nina",
        gender: "female",
        sampleUrl: "/samples/sl-female.mp3",
      },
    ],
    "hr-HR": [
      {
        id: "hr-1",
        name: "Ivan",
        gender: "male",
        sampleUrl: "/samples/hr-male.mp3",
      },
      {
        id: "hr-2",
        name: "Ana",
        gender: "female",
        sampleUrl: "/samples/hr-female.mp3",
      },
    ],
    "lt-LT": [
      {
        id: "lt-1",
        name: "Tomas",
        gender: "male",
        sampleUrl: "/samples/lt-male.mp3",
      },
      {
        id: "lt-2",
        name: "Lina",
        gender: "female",
        sampleUrl: "/samples/lt-female.mp3",
      },
    ],
  };

  const languages = [
    { code: "en-US", name: "American English" },
    { code: "sl-SI", name: "Slovenian" },
    { code: "hr-HR", name: "Croatian" },
    { code: "lt-LT", name: "Lithuanian" },
  ];

  const handleBack = () => {
    setStep(step - 1);
    if (step === 3) {
      setSelectedVoices([]);
    } else if (step === 2) {
      setSelectedStyle(null);
    }
  };

  const handleLanguageSelect = (lang: Language) => {
    setSelectedLanguage(lang);
    setStep(2);
  };

  const handleStyleSelect = (style: AdStyle) => {
    setSelectedStyle(style);
    setSelectedVoices([]);
    setStep(3);
  };

  const handleVoiceSelect = (voice: Voice, index: number = 0) => {
    if (selectedStyle === "simple") {
      setSelectedVoices([voice]);
      setStep(4);
    } else {
      const newVoices = [...selectedVoices];
      newVoices[index] = voice;
      setSelectedVoices(newVoices);
      if (newVoices.length === 2) setStep(4);
    }
  };

  const playSample = (voiceId: string, sampleUrl?: string) => {
    if (samplePlaying === voiceId) {
      setSamplePlaying(null);
      return;
    }
    if (sampleUrl) {
      setSamplePlaying(voiceId);
      const audio = new Audio(sampleUrl);
      audio.play();
      audio.onended = () => setSamplePlaying(null);
    }
  };

  const renderVoiceButton = (
    voice: Voice,
    index: number = 0,
    isSelected: boolean = false
  ) => (
    <div key={voice.id} className="flex items-center gap-4 w-full">
      <button
        onClick={() => handleVoiceSelect(voice, index)}
        className={`grow bg-white text-black font-bold uppercase py-4 px-6 hover:bg-black hover:text-white focus:outline-hidden focus:ring-2 focus:ring-wb-blue focus:ring-offset-2 transition-colors text-left ${
          isSelected ? "bg-black text-white" : ""
        }`}
      >
        {voice.name} ({voice.gender})
      </button>
      <button
        onClick={() => playSample(voice.id, voice.sampleUrl)}
        className="p-2 hover:opacity-75 transition-opacity"
        title="Play sample"
      >
        <Image
          src={samplePlaying === voice.id ? "/stop.svg" : "/play.svg"}
          alt={samplePlaying === voice.id ? "Stop" : "Play"}
          width={24}
          height={24}
        />
      </button>
    </div>
  );

  const handleStreamTTS = async () => {
    setStatusMessage("Requesting audio...");
    setAudioUrl(null);

    try {
      const res = await fetch("/api/streamAudio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        const errBody = await res.json();
        setStatusMessage(`Error: ${JSON.stringify(errBody)}`);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setStatusMessage("Audio ready!");
    } catch (error: unknown) {
      console.error(error);
      setStatusMessage(
        error instanceof Error ? error.message : "An error occurred"
      );
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6">
            <h2 className="text-black uppercase font-bold text-xl">
              Pick your language
            </h2>
            <p className="text-black">
              What language do you want to use for the voices in your ad?
            </p>
            <div className="grid grid-cols-1 gap-4">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageSelect(lang.code as Language)}
                  className="w-full bg-white text-black font-bold uppercase py-4 px-6 hover:bg-black hover:text-white focus:outline-hidden focus:ring-2 focus:ring-wb-blue focus:ring-offset-2 transition-colors text-left"
                >
                  {lang.name}
                </button>
              ))}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <h2 className="text-black uppercase font-bold text-xl">
              Pick the ad style
            </h2>
            <p className="text-black">
              What combination of voices will be required?
            </p>
            <div className="grid grid-cols-1 gap-4">
              <button
                onClick={() => handleStyleSelect("simple")}
                className="w-full bg-white text-black font-bold uppercase py-4 px-6 hover:bg-black hover:text-white focus:outline-hidden focus:ring-2 focus:ring-wb-blue focus:ring-offset-2 transition-colors text-left"
              >
                Simple ad read
              </button>
              <button
                onClick={() => handleStyleSelect("dialogue")}
                className="w-full bg-white text-black font-bold uppercase py-4 px-6 hover:bg-black hover:text-white focus:outline-hidden focus:ring-2 focus:ring-wb-blue focus:ring-offset-2 transition-colors text-left"
              >
                Dialogue
              </button>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <h2 className="text-black uppercase font-bold text-xl">
              Choose your voices
            </h2>
            {selectedStyle === "simple" ? (
              <div className="grid grid-cols-1 gap-4">
                {selectedLanguage &&
                  voices[selectedLanguage].map((voice) =>
                    renderVoiceButton(voice)
                  )}
              </div>
            ) : (
              <div className="space-y-6">
                <div>
                  <p className="text-black mb-2">First Voice:</p>
                  <div className="grid grid-cols-1 gap-2">
                    {selectedLanguage &&
                      voices[selectedLanguage].map((voice) =>
                        renderVoiceButton(
                          voice,
                          0,
                          selectedVoices[0]?.id === voice.id
                        )
                      )}
                  </div>
                </div>
                {selectedVoices[0] && (
                  <div>
                    <p className="text-black mb-2">Second Voice:</p>
                    <div className="grid grid-cols-1 gap-2">
                      {selectedLanguage &&
                        voices[selectedLanguage]
                          .filter((v) => v.id !== selectedVoices[0].id)
                          .map((voice) =>
                            renderVoiceButton(
                              voice,
                              1,
                              selectedVoices[1]?.id === voice.id
                            )
                          )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="text-input"
                className="block font-medium text-black uppercase mb-2"
              >
                Enter Text
              </label>
              <textarea
                id="text-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                className="w-full px-3 text-black py-2 focus:ring-2 focus:ring-wb-blue bg-white"
                placeholder="Type your text here..."
              />
            </div>

            <button
              onClick={handleStreamTTS}
              className="w-full bg-white text-black font-bold uppercase py-2 px-4 hover:bg-black hover:text-white focus:outline-hidden focus:ring-2 focus:ring-wb-blue focus:ring-offset-2 transition-colors"
            >
              Convert to Speech
            </button>

            <div className="mt-4">
              <div className="flex items-center space-x-2">
                <span className="font-medium text-black uppercase">
                  Status:
                </span>
                <span className="text-black">{statusMessage}</span>
              </div>
            </div>

            {audioUrl && (
              <div className="mt-6">
                <audio controls src={audioUrl} className="w-full">
                  Your browser does not support the <code>audio</code> element.
                </audio>
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Video Background */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute top-0 left-0 w-full h-full object-cover z-0"
      >
        <source src="/bg-animated.mp4" type="video/mp4" />
      </video>

      {/* Content Overlay */}
      <div className="relative z-10 min-h-screen py-12 px-4 sm:px-6 lg:px-8 flex flex-col items-center justify-center">
        <div className="max-w-3xl mx-auto w-full relative">
          {/* Back Button */}
          {step > 1 && (
            <button
              onClick={handleBack}
              className="absolute -left-8 -translate-x-full top-8 hover:opacity-75 transition-opacity"
            >
              <Image src="/back.svg" alt="Go back" width={48} height={48} />
            </button>
          )}

          <div className="bg-wb-blue/20 backdrop-blur-xs p-6 space-y-6 border-l-2 border-white">
            <div className="text-center">
              <Image
                src="/logo.svg"
                alt="Logo"
                width={400}
                height={100}
                className="w-1/2 mx-auto"
              />
            </div>

            {renderStep()}
          </div>
        </div>
      </div>
    </div>
  );
}
