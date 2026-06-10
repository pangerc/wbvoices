import { useAudioPlaybackStore } from "@/store/audioPlaybackStore";
import { twMerge } from "tailwind-merge";
import { EditableProjectName } from "../EditableProjectName";
import { Button, GlassTab, GlassTabBar } from "../ui";
import { HeadphonesIcon } from "../ui/icons/Headphones";
import { Header } from "./Header";

// Generation state for icon color: "llm" = white blink, "audio" = blue blink, false = normal
type GeneratingState = "llm" | "audio" | false;

// Get stroke color based on selection and generation state
function getStrokeColor(
  selected: boolean,
  generating: GeneratingState,
): string {
  if (generating === "llm") return "#FFFFFF"; // White during LLM thinking
  if (generating === "audio") return "#2F7DFA"; // Blue during audio generation
  return selected ? "#2F7DFA" : "#FFFFFF"; // Normal state
}

// Tab icons with generation state support
// Tabs 1 (Script), 2 (Music), 3 (FX) support generation animation
const tabItems = [
  {
    name: "Brief",
    icon: (selected: boolean, _generating: GeneratingState) => (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M14 2H2V14H14V2Z"
          stroke={selected ? "#2F7DFA" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.5 5H11.5"
          stroke={selected ? "#2F7DFA" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.5 8H11.5"
          stroke={selected ? "#2F7DFA" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M4.5 11H11.5"
          stroke={selected ? "#2F7DFA" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    name: "Script",
    icon: (selected: boolean, generating: GeneratingState) => {
      const stroke = getStrokeColor(selected, generating);
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={generating ? "animate-pulse" : ""}
        >
          <path
            d="M5 12H3C2.46957 12 1.96086 11.7893 1.58579 11.4142C1.21071 11.0391 1 10.5304 1 10V3C1 2.46957 1.21071 1.96086 1.58579 1.58579C1.96086 1.21071 2.46957 1 3 1H10C10.5304 1 11.0391 1.21071 11.4142 1.58579C11.7893 1.96086 12 2.46957 12 3V5"
            stroke={stroke}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M6 15L8 12H13C13.5304 12 14.0391 11.7893 14.4142 11.4142C14.7893 11.0391 15 10.5304 15 10V7C15 6.46957 14.7893 5.96086 14.4142 5.58579C14.0391 5.21071 13.5304 5 13 5H6C5.46957 5 4.96086 5.21071 4.58579 5.58579C4.21071 5.96086 4 6.46957 4 7V10C4 10.5304 4.21071 11.0391 4.58579 11.4142C4.96086 11.7893 5.46957 12 6 12V15Z"
            stroke={stroke}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    },
  },
  {
    name: "Music",
    icon: (selected: boolean, generating: GeneratingState) => {
      const stroke = getStrokeColor(selected, generating);
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={generating ? "animate-pulse" : ""}
        >
          <path
            d="M6 13.5V3.5L14 2V12"
            stroke={stroke}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4 13.5C5.10457 13.5 6 12.6046 6 11.5C6 10.3954 5.10457 9.5 4 9.5C2.89543 9.5 2 10.3954 2 11.5C2 12.6046 2.89543 13.5 4 13.5Z"
            stroke={stroke}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M12 12C13.1046 12 14 11.1046 14 10C14 8.89543 13.1046 8 12 8C10.8954 8 10 8.89543 10 10C10 11.1046 10.8954 12 12 12Z"
            stroke={stroke}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    },
  },
  {
    name: "FX",
    icon: (selected: boolean, generating: GeneratingState) => {
      const stroke = getStrokeColor(selected, generating);
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={generating ? "animate-pulse" : ""}
        >
          <path
            d="M8 2V14"
            stroke={stroke}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M12.6667 4V12"
            stroke={stroke}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M3.33333 4V12"
            stroke={stroke}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    },
  },
  {
    name: "Mix!",
    icon: (selected: boolean, _generating: GeneratingState) => {
      // For the mixer/done icon, we need to handle both states
      return selected ? (
        // Done icon for selected state
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M13.3333 4L6 11.3333L2.66667 8"
            stroke="#2F7DFA"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        // Mixer icon for unselected state
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2.66667 4.66667L13.3333 4.66667"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4 8L12 8"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M6.66667 11.3333H9.33333"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4 4.66667V6.66667"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M12 8V10"
            stroke="#FFFFFF"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    },
  },
  {
    name: "Preview",
    icon: (selected: boolean, _generating: GeneratingState) => (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M8 3C4.66667 3 2 8 2 8S4.66667 13 8 13C11.3333 13 14 8 14 8S11.3333 3 8 3Z"
          stroke={selected ? "#2F7DFA" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8 10C9.10457 10 10 9.10457 10 8C10 6.89543 9.10457 6 8 6C6.89543 6 6 6.89543 6 8C6 9.10457 6.89543 10 8 10Z"
          stroke={selected ? "#2F7DFA" : "#FFFFFF"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

// Separate component to use hooks properly
function TabBarWithStates({
  selectedTab,
  onTabChange,
}: {
  selectedTab: number;
  onTabChange: (index: number) => void;
}) {
  const {
    generatingCreative,
    generatingVoice,
    generatingMusic,
    generatingSfx,
  } = useAudioPlaybackStore();

  // Compute generation state for each tab
  const getGeneratingState = (index: number): GeneratingState => {
    // Only Script (1), Music (2), FX (3) tabs show generation state
    if (index < 1 || index > 3) return false;

    // LLM thinking affects all three tabs
    if (generatingCreative) return "llm";

    // Audio generation is per-stream
    if (index === 1 && generatingVoice) return "audio";
    if (index === 2 && generatingMusic) return "audio";
    if (index === 3 && generatingSfx) return "audio";

    return false;
  };

  return (
    <GlassTabBar className="py-2">
      {tabItems.map((item, index) => (
        <GlassTab
          key={item.name}
          isActive={selectedTab === index}
          onClick={() => onTabChange(index)}
        >
          {item.icon(selectedTab === index, getGeneratingState(index))}
          <span className="hidden xl:inline">{item.name}</span>
        </GlassTab>
      ))}
    </GlassTabBar>
  );
}

type ProjectHeaderProps = {
  selectedTab: number;
  onTabChange: (index: number) => void;
  onGoToDashboard: () => void;
  projectId: string;
};

export function ProjectHeader({
  selectedTab,
  onTabChange,
  onGoToDashboard,
  projectId,
}: ProjectHeaderProps) {
  return (
    <Header>
      <div className="relative">
        <div
          className={twMerge(
            "absolute z-100",
            "transform-[translate(-50%,-35px)]",
          )}
        >
          <EditableProjectName id={projectId} />
          <TabBarWithStates
            selectedTab={selectedTab}
            onTabChange={onTabChange}
          />
        </div>
      </div>

      <Button
        variant="outline"
        rounded="2xl"
        icon={HeadphonesIcon}
        onClick={onGoToDashboard}
      >
        My Projects
      </Button>
    </Header>
  );
}
